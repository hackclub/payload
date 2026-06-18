import { db } from "@/db";
import { vmSessions, vmSessionEvents, vmTypes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createProxmoxClient, getProxmoxConfig } from "@/lib/proxmox/config";
import { discoverIpFromProxmoxNeighborTable } from "@/lib/proxmox/ip-discovery";
import { createGuacamoleClient, getGuacamoleConfig } from "@/lib/guacamole/config";
import { encrypt } from "@/lib/crypto";
import { publish } from "@/lib/sse";
import { IP_DISCOVERY_TIMEOUT_MS } from "@/lib/queue";
import { randomBytes } from "node:crypto";

type ProvisionJobData = { sessionId: number };

export async function processProvisionVm(jobData: ProvisionJobData) {
  const { sessionId } = jobData;

  const session = await db.query.vmSessions.findFirst({
    where: eq(vmSessions.id, sessionId),
  });

  if (!session) {
    throw new Error(`Session ${sessionId} not found`);
  }

  if (session.state !== "pending") {
    return;
  }

  await db
    .update(vmSessions)
    .set({ state: "provisioning", updatedAt: new Date() })
    .where(eq(vmSessions.id, sessionId));

  publish({ type: "state_change", state: "provisioning", sessionId });

  await db.insert(vmSessionEvents).values({
    vmSessionId: sessionId,
    kind: "clone_started",
  });

  const vmType = await db.query.vmTypes.findFirst({
    where: eq(vmTypes.id, session.vmTypeId),
  });

  if (!vmType) {
    throw new Error(`VM type ${session.vmTypeId} not found`);
  }

  const proxmoxConfig = getProxmoxConfig();
  const proxmox = createProxmoxClient(proxmoxConfig);
  const guacConfig = getGuacamoleConfig();
  const guac = createGuacamoleClient(guacConfig);

  let vmIp: string | undefined;
  let guacamoleConnectionId: string | undefined;
  let guacamoleUsername: string | undefined;
  let guacamolePasswordCiphertext: string | undefined;

  try {
    const newVmid = await allocateVmid();
    const vmName = `payload-vm-${vmType.slug}`;

    await db
      .update(vmSessions)
      .set({ proxmoxVmid: newVmid, proxmoxNode: vmType.proxmoxNode, updatedAt: new Date() })
      .where(eq(vmSessions.id, sessionId));

    const cloneUpid = await proxmox.cloneVm({
      node: vmType.proxmoxNode,
      templateVmid: vmType.proxmoxTemplateVmid,
      newVmid,
      name: vmName,
    });

    await proxmox.waitForTask({ node: vmType.proxmoxNode, upid: cloneUpid });

    const macAddress = await proxmox.getPrimaryMacAddress(vmType.proxmoxNode, newVmid);

    const startUpid = await proxmox.startVm(vmType.proxmoxNode, newVmid);
    await proxmox.waitForTask({ node: vmType.proxmoxNode, upid: startUpid });

    vmIp = await discoverIpFromProxmoxNeighborTable({
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

    // Some VMs (e.g. Android booting droidVNC-NG) only start their remote
    // display server *after* the OS finishes booting and an IP appears.
    // `bootDelayMs` is configured per VM type so the Guacamole handshake
    // doesn't race the display server's startup.
    if (vmType.bootDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, vmType.bootDelayMs));
    }

    guacamoleUsername = `payload-${sessionId}`;
    const guacamolePassword = randomBytes(18).toString("base64url");

    await guac.createUser({
      username: guacamoleUsername,
      password: guacamolePassword,
    });

    const vmUsername = vmType.username ?? undefined;
    const vmPassword = vmType.password ?? "";

    // Clipboard policy: host -> VM paste is allowed, VM -> host copy is blocked.
    // Guacamole's flags are written from the reviewer's perspective in the
    // browser: "copy" = copy *out of* the remote, "paste" = paste *into* the
    // remote. Setting disable-copy=true and disable-paste=false therefore
    // gives a one-way host -> VM clipboard. Works natively on Linux (xrdp),
    // Windows (RDP CLIPRDR), and Android (VNC ClientCutText). macOS is
    // intentionally not on this path; see AI/integrations/guacamole.md.
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

    guacamolePasswordCiphertext = encrypt(guacamolePassword);

    const vmCredentialCiphertext = encrypt(vmPassword);

    await db
      .update(vmSessions)
      .set({
        state: "ready",
        vmIp,
        vmCredentialCiphertext: vmCredentialCiphertext,
        guacamoleConnectionId,
        guacamoleUsername,
        guacamolePasswordCiphertext,
        updatedAt: new Date(),
      })
      .where(eq(vmSessions.id, sessionId));

    await db.insert(vmSessionEvents).values({
      vmSessionId: sessionId,
      kind: "ready",
      payload: { ip: vmIp, guacamoleConnectionId },
    });

    publish({ type: "ready", state: "ready", sessionId, data: { ip: vmIp } });
  } catch (error) {
    await db
      .update(vmSessions)
      .set({ state: "errored", updatedAt: new Date() })
      .where(eq(vmSessions.id, sessionId));

    await db.insert(vmSessionEvents).values({
      vmSessionId: sessionId,
      kind: "errored",
      payload: {
        error: error instanceof Error ? error.message : String(error),
        phase: "provisioning",
      },
    });

    publish({ type: "errored", state: "errored", sessionId });

    if (guacamoleConnectionId || guacamoleUsername) {
      if (guacamoleConnectionId) {
        try { await guac.deleteConnection(guacamoleConnectionId!); } catch { /* idempotent */ }
      }
      if (guacamoleUsername) {
        try { await guac.deleteUser(guacamoleUsername!); } catch { /* idempotent */ }
      }
    }

    throw error;
  }
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