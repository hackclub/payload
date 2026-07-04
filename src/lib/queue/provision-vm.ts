import { db } from "@/db";
import { vmSessions, vmSessionEvents, vmTypes, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createProxmoxClient, getProxmoxConfig } from "@/lib/proxmox/config";
import { discoverIpFromProxmoxNeighborTable } from "@/lib/proxmox/ip-discovery";
import { createGuacamoleClient, getGuacamoleConfig } from "@/lib/guacamole/config";
import { encrypt } from "@/lib/crypto";
import { publish } from "@/lib/sse";
import {
  IP_DISCOVERY_TIMEOUT_MS,
  SESSION_LIFETIME_MS,
  WARM_CPU_UNITS,
  ACTIVE_CPU_UNITS,
} from "@/lib/queue";
import { ownedVmName, warmVmName } from "@/lib/vm-naming";
import { randomBytes } from "node:crypto";

type ProvisionJobData = { sessionId: number };
type WarmJobData = { sessionId: number };
type BindJobData = { sessionId: number };

/** Thrown by runBindPhase when a warm VM is dead/unreachable and must be recycled. */
export class WarmVmUnhealthyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WarmVmUnhealthyError";
  }
}

// ---------------------------------------------------------------------------
// Job processors (ADR-0033: provisioning splits into a warm phase and a bind
// phase — see vm-lifecycle.md).
// ---------------------------------------------------------------------------

/**
 * Cold path: owned session with no VM yet. Runs warm phase then bind phase
 * back-to-back — identical end result to the pre-pool provisioning flow, used
 * as the fallback when no warm VM is available.
 */
export async function processProvisionVm(jobData: ProvisionJobData) {
  const { sessionId } = jobData;

  const session = await db.query.vmSessions.findFirst({
    where: eq(vmSessions.id, sessionId),
  });
  if (!session) throw new Error(`Session ${sessionId} not found`);
  if (session.state !== "pending") return;

  try {
    await runWarmPhase(sessionId);
    await runBindPhase(sessionId);
  } catch (error) {
    await markErrored(sessionId, error, "provisioning");
    throw error;
  }
}

/**
 * Pool path: boot the (already-created, ownerless) row into a warm VM. No
 * Guacamole footprint until it is claimed. The reconciler creates the row so
 * it counts toward the pool the instant it is enqueued.
 */
export async function processWarmVm(jobData: WarmJobData) {
  const { sessionId } = jobData;

  const session = await db.query.vmSessions.findFirst({
    where: eq(vmSessions.id, sessionId),
  });
  if (!session) throw new Error(`Session ${sessionId} not found`);
  // Only boot ownerless rows that haven't started yet.
  if (session.userId !== null || session.state !== "pending") return;

  try {
    await runWarmPhase(sessionId);
    await db
      .update(vmSessions)
      .set({ state: "warm", updatedAt: new Date() })
      .where(eq(vmSessions.id, sessionId));
    await db.insert(vmSessionEvents).values({ vmSessionId: sessionId, kind: "warm_ready" });
  } catch (error) {
    await markErrored(sessionId, error, "warm");
    throw error;
  }
}

/**
 * Claim path: a warm VM was assigned to a user (state flipped to
 * `provisioning`, user_id/expires_at set). Bind it. If the warm VM turns out
 * to be dead, discard it and cold-provision a fresh one on the same row so the
 * user still gets a working session.
 */
export async function processBindVm(jobData: BindJobData) {
  const { sessionId } = jobData;

  const session = await db.query.vmSessions.findFirst({
    where: eq(vmSessions.id, sessionId),
  });
  if (!session) throw new Error(`Session ${sessionId} not found`);

  try {
    try {
      await runBindPhase(sessionId);
    } catch (error) {
      if (error instanceof WarmVmUnhealthyError) {
        // Warm VM was stale/dead: throw it away and boot a fresh one.
        await discardVm(sessionId, "warm_vm_unhealthy");
        await runWarmPhase(sessionId);
        await runBindPhase(sessionId);
      } else {
        throw error;
      }
    }
  } catch (error) {
    await markErrored(sessionId, error, "bind");
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

/**
 * Warm phase: clone a template, boot it, and discover its IP. Persists
 * proxmox_vmid / proxmox_node / vm_ip. The clone is named `payload-warm-<type>`;
 * bind renames it to the claimant. Leaves the row in `provisioning`.
 */
async function runWarmPhase(sessionId: number) {
  const session = await db.query.vmSessions.findFirst({
    where: eq(vmSessions.id, sessionId),
  });
  if (!session) throw new Error(`Session ${sessionId} not found`);

  const vmType = await db.query.vmTypes.findFirst({
    where: eq(vmTypes.id, session.vmTypeId),
  });
  if (!vmType) throw new Error(`VM type ${session.vmTypeId} not found`);

  await db
    .update(vmSessions)
    .set({ state: "provisioning", updatedAt: new Date() })
    .where(eq(vmSessions.id, sessionId));
  publish({ type: "state_change", state: "provisioning", sessionId });
  await db.insert(vmSessionEvents).values({ vmSessionId: sessionId, kind: "clone_started" });

  const proxmoxConfig = getProxmoxConfig();
  const proxmox = createProxmoxClient(proxmoxConfig);

  const newVmid = await allocateVmid();

  await db
    .update(vmSessions)
    .set({ proxmoxVmid: newVmid, proxmoxNode: vmType.proxmoxNode, updatedAt: new Date() })
    .where(eq(vmSessions.id, sessionId));

  const cloneUpid = await proxmox.cloneVm({
    node: vmType.proxmoxNode,
    templateVmid: vmType.proxmoxTemplateVmid,
    newVmid,
    name: warmVmName(vmType.slug),
  });
  await proxmox.waitForTask({ node: vmType.proxmoxNode, upid: cloneUpid });

  const macAddress = await proxmox.getPrimaryMacAddress(vmType.proxmoxNode, newVmid);

  const startUpid = await proxmox.startVm(vmType.proxmoxNode, newVmid);
  await proxmox.waitForTask({ node: vmType.proxmoxNode, upid: startUpid });

  // Run warm VMs at low CPU weight so an idle pool VM's background churn (esp.
  // Windows) can't steal CPU from a VM a reviewer is actively using. Restored
  // to normal at claim (see runBindPhase). Best-effort (ADR-0033).
  try {
    await proxmox.updateVmConfig(vmType.proxmoxNode, newVmid, { cpuunits: WARM_CPU_UNITS });
  } catch {
    // not worth failing a warm boot over
  }

  const vmIp = await discoverIpFromProxmoxNeighborTable({
    macAddress,
    config: proxmoxConfig,
    timeoutMs: IP_DISCOVERY_TIMEOUT_MS,
  });

  await db
    .update(vmSessions)
    .set({ vmIp, updatedAt: new Date() })
    .where(eq(vmSessions.id, sessionId));
  await db.insert(vmSessionEvents).values({
    vmSessionId: sessionId,
    kind: "ip_acquired",
    payload: { ip: vmIp },
  });

  // Some VMs (e.g. Android booting droidVNC-NG) only start their remote display
  // server after the OS finishes booting; wait per-type before Guacamole tries
  // the handshake.
  if (vmType.bootDelayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, vmType.bootDelayMs));
  }
}

/**
 * Bind phase: health-check the (already booted) VM, rename it to its owner,
 * register the one-shot Guacamole user + connection, and mark the session
 * ready with a fresh 6h TTL. Self-cleans its Guacamole resources on failure.
 */
async function runBindPhase(sessionId: number) {
  const session = await db.query.vmSessions.findFirst({
    where: eq(vmSessions.id, sessionId),
  });
  if (!session) throw new Error(`Session ${sessionId} not found`);
  if (!session.proxmoxVmid || !session.proxmoxNode) {
    throw new Error(`Session ${sessionId} has no VM to bind`);
  }

  const vmType = await db.query.vmTypes.findFirst({
    where: eq(vmTypes.id, session.vmTypeId),
  });
  if (!vmType) throw new Error(`VM type ${session.vmTypeId} not found`);

  const node = session.proxmoxNode;
  const vmid = session.proxmoxVmid;

  const proxmoxConfig = getProxmoxConfig();
  const proxmox = createProxmoxClient(proxmoxConfig);

  // --- Health check: confirm the VM is still running. One fast Proxmox API
  // call — no SSH. We trust the IP discovered during the warm phase: DHCP
  // leases are 12h and a warm VM lives < WARM_MAX_AGE (2h), so its IP is
  // stable. Re-polling the SSH neighbor table here added ~10-15s to every
  // claim (an idle VM has no fresh ARP entry) for no real benefit. If the VM
  // died, getVmStatus catches it → discard → cold re-provision. ---
  let status: { status: string };
  try {
    status = await proxmox.getVmStatus(node, vmid);
  } catch (error) {
    throw new WarmVmUnhealthyError(
      `Could not read status of VM ${vmid}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (status.status !== "running") {
    throw new WarmVmUnhealthyError(`VM ${vmid} is ${status.status}, not running`);
  }

  const vmIp = session.vmIp ?? undefined;
  if (!vmIp) {
    // A warm/booted VM should always have a recorded IP; if not, recycle it.
    throw new WarmVmUnhealthyError(`VM ${vmid} has no recorded IP to bind`);
  }

  // --- Restore normal CPU weight (undo the warm de-prioritization) and rename
  // the clone to its owner (payload-<user>-<type>), in a single Proxmox config
  // call. Independent of binding, so run it concurrently with the Guacamole
  // work instead of blocking on it. ---
  const finalizeVmPromise = (async () => {
    try {
      const params: Record<string, string | number> = { cpuunits: ACTIVE_CPU_UNITS };
      if (session.userId) {
        const owner = await db.query.users.findFirst({ where: eq(users.id, session.userId) });
        params.name = ownedVmName(owner?.name ?? owner?.slackId ?? "user", vmType.slug);
      }
      await proxmox.updateVmConfig(node, vmid, params);
    } catch {
      // Best-effort — never fail a bind because a config tweak didn't take.
    }
  })();

  // --- Guacamole registration (one-shot user + connection). ---
  const guac = createGuacamoleClient(getGuacamoleConfig());
  const guacamoleUsername = `payload-${sessionId}`;
  const guacamolePassword = randomBytes(18).toString("base64url");
  let guacamoleConnectionId: string | undefined;

  try {
    await guac.createUser({ username: guacamoleUsername, password: guacamolePassword });

    const vmUsername = vmType.username ?? undefined;
    const vmPassword = vmType.password ?? "";

    // Clipboard policy (ADR-0028): host -> VM paste only. disable-copy blocks
    // VM -> host, disable-paste=false allows host -> VM.
    const parameters: Record<string, string> =
      vmType.protocol === "rdp"
        ? {
            hostname: vmIp,
            port: String(vmType.defaultPort),
            ...(vmUsername ? { username: vmUsername } : {}),
            password: vmPassword,
            "ignore-cert": "true",
            security: "any",
            "disable-auth": "false",
            "resize-method": "display-update",
            "color-depth": "24",
            "enable-wallpaper": "true",
            "enable-theming": "true",
            "enable-font-smoothing": "true",
            "enable-full-window-drag": "true",
            "enable-desktop-composition": "true",
            "enable-menu-animations": "true",
            "enable-audio": "true",
            "disable-copy": "true",
            "disable-paste": "false",
          }
        : {
            hostname: vmIp,
            port: String(vmType.defaultPort),
            ...(vmUsername ? { username: vmUsername } : {}),
            password: vmPassword,
            "color-depth": "24",
            "enable-audio": "true",
            "disable-copy": "true",
            "disable-paste": "false",
          };

    const connection = await guac.createConnection({
      name: `payload-${sessionId}`,
      protocol: vmType.protocol as "rdp" | "vnc",
      parameters,
    });
    guacamoleConnectionId = connection.identifier;

    await guac.grantConnectionPermission({
      username: guacamoleUsername,
      connectionIdentifier: guacamoleConnectionId,
    });

    const now = new Date();
    await db
      .update(vmSessions)
      .set({
        state: "ready",
        vmIp,
        vmCredentialCiphertext: encrypt(vmPassword),
        guacamoleConnectionId,
        guacamoleUsername,
        guacamolePasswordCiphertext: encrypt(guacamolePassword),
        // The 6h TTL clock starts now, at claim — never while warm (ADR-0033).
        expiresAt: new Date(now.getTime() + SESSION_LIFETIME_MS),
        claimedAt: now,
        updatedAt: now,
      })
      .where(eq(vmSessions.id, sessionId));

    await db.insert(vmSessionEvents).values({
      vmSessionId: sessionId,
      kind: "ready",
      payload: { ip: vmIp, guacamoleConnectionId },
    });
    publish({ type: "ready", state: "ready", sessionId, data: { ip: vmIp } });

    // Let the (concurrent) rename + CPU-weight restore finish; it never rejects.
    await finalizeVmPromise;
  } catch (error) {
    // Clean up any Guacamole resources this bind created before rethrowing.
    if (guacamoleConnectionId) {
      try { await guac.deleteConnection(guacamoleConnectionId); } catch { /* idempotent */ }
    }
    try { await guac.deleteUser(guacamoleUsername); } catch { /* idempotent */ }
    throw error;
  }
}

/** Stop + delete the VM attached to a session and clear its VM fields. */
async function discardVm(sessionId: number, reason: string) {
  const session = await db.query.vmSessions.findFirst({
    where: eq(vmSessions.id, sessionId),
  });
  if (!session) return;

  if (session.proxmoxVmid && session.proxmoxNode) {
    const proxmox = createProxmoxClient(getProxmoxConfig());
    try {
      await proxmox.stopVm(session.proxmoxNode, session.proxmoxVmid);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch { /* may already be stopped */ }
    try {
      await proxmox.deleteVm(session.proxmoxNode, session.proxmoxVmid);
    } catch { /* may already be gone */ }
  }

  await db
    .update(vmSessions)
    .set({ proxmoxVmid: null, proxmoxNode: null, vmIp: null, updatedAt: new Date() })
    .where(eq(vmSessions.id, sessionId));
  await db.insert(vmSessionEvents).values({
    vmSessionId: sessionId,
    kind: "warm_vm_discarded",
    payload: { reason },
  });
}

async function markErrored(sessionId: number, error: unknown, phase: string) {
  await db
    .update(vmSessions)
    .set({ state: "errored", updatedAt: new Date() })
    .where(eq(vmSessions.id, sessionId));
  await db.insert(vmSessionEvents).values({
    vmSessionId: sessionId,
    kind: "errored",
    payload: { error: error instanceof Error ? error.message : String(error), phase },
  });
  publish({ type: "errored", state: "errored", sessionId });
}

async function allocateVmid(): Promise<number> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const suffix = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
    const candidate = Number(`69${suffix}`);
    const existing = await db.query.vmSessions.findFirst({
      where: eq(vmSessions.proxmoxVmid, candidate),
      columns: { id: true },
    });
    if (!existing) return candidate;
  }
  throw new Error("Could not generate unique VMID after 10 attempts");
}
