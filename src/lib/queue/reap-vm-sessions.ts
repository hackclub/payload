import { db } from "@/db";
import { vmSessions } from "@/db/schema";
import { and, eq, lte, inArray, isNotNull } from "drizzle-orm";
import { enqueueTerminateVm } from "@/lib/queue";
import { createProxmoxClient, getProxmoxConfig } from "@/lib/proxmox/config";

type VmSessionState = (typeof vmSessions.state.enumValues)[number];

const ACTIVE_STATES: VmSessionState[] = ["pending", "provisioning", "ready", "active"];
// A Proxmox VM is NOT an orphan while any session row referencing it is still
// in one of these states (terminating included so we don't race the terminate job).
const VM_BACKED_STATES: VmSessionState[] = [
  "warm",
  "pending",
  "provisioning",
  "ready",
  "active",
  "terminating",
];

export async function processReapVmSessions() {
  // TTL reaper: sessions past their expires_at
  const expired = await db
    .select({ id: vmSessions.id })
    .from(vmSessions)
    .where(
      and(
        inArray(vmSessions.state, ACTIVE_STATES),
        lte(vmSessions.expiresAt, new Date()),
      ),
    );

  for (const row of expired) {
    await enqueueTerminateVm({ sessionId: row.id, reason: "ttl" });
  }

  // Idle reaper: active sessions with no heartbeat for 30 minutes
  const idleThreshold = new Date(Date.now() - 30 * 60 * 1000);
  const idle = await db
    .select({ id: vmSessions.id })
    .from(vmSessions)
    .where(
      and(
        eq(vmSessions.state, "active"),
        lte(vmSessions.lastHeartbeatAt, idleThreshold),
      ),
    );

  for (const row of idle) {
    await enqueueTerminateVm({ sessionId: row.id, reason: "idle" });
  }

  // Stuck provisioning reaper: pending or provisioning for more than 10 minutes
  const stuckThreshold = new Date(Date.now() - 10 * 60 * 1000);
  const stuck = await db
    .select({ id: vmSessions.id })
    .from(vmSessions)
    .where(
      and(
        inArray(vmSessions.state, ["pending", "provisioning"]),
        lte(vmSessions.createdAt, stuckThreshold),
      ),
    );

  for (const row of stuck) {
    await enqueueTerminateVm({ sessionId: row.id, reason: "stuck" });
  }

  // Proxmox sweep: orphan cleanup + in-guest shutdown detection, both driven
  // off a single VM listing (which includes power status).
  await sweepProxmoxVms();
}

// A running session in one of these states means the VM is expected to be
// powered on. If Proxmox reports it "stopped", the guest was shut down from
// inside the OS (or crashed) — we treat that exactly like a user destroy.
const RUNNING_STATES: VmSessionState[] = ["ready", "active"];

async function sweepProxmoxVms() {
  const config = getProxmoxConfig();
  const proxmox = createProxmoxClient(config);

  let vms: Awaited<ReturnType<typeof proxmox.listVms>>;
  try {
    vms = await proxmox.listVms(config.defaultNode);
  } catch {
    return; // Proxmox unreachable — best-effort, try again next tick.
  }

  const payloadVms = vms.filter(
    (v) => typeof v.name === "string" && v.name.startsWith("payload-") && v.template !== 1,
  );
  if (payloadVms.length === 0) return;

  const backed = await db
    .select({ id: vmSessions.id, vmid: vmSessions.proxmoxVmid, state: vmSessions.state })
    .from(vmSessions)
    .where(
      and(
        isNotNull(vmSessions.proxmoxVmid),
        inArray(vmSessions.proxmoxVmid, payloadVms.map((v) => v.vmid)),
        inArray(vmSessions.state, VM_BACKED_STATES),
      ),
    );
  const backedByVmid = new Map(backed.map((r) => [r.vmid, r]));

  for (const vm of payloadVms) {
    const session = backedByVmid.get(vm.vmid);

    // Orphan: no live session row backs this VM — stop + purge it.
    if (!session) {
      try {
        await proxmox.stopVm(config.defaultNode, vm.vmid);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch {
        // may already be stopped
      }
      try {
        await proxmox.deleteVm(config.defaultNode, vm.vmid);
        console.log(`Reaped orphan VM ${vm.vmid} (${vm.name})`);
      } catch {
        // may already be gone
      }
      continue;
    }

    // In-guest shutdown: a session that should be running but whose VM is
    // powered off. Terminate it like a destroy (the terminate job is a no-op
    // if it's already terminating/terminated, so re-enqueueing is safe).
    if (RUNNING_STATES.includes(session.state) && vm.status === "stopped") {
      console.log(`Session ${session.id} VM ${vm.vmid} powered off in-guest; terminating`);
      await enqueueTerminateVm({ sessionId: session.id, reason: "shutdown" });
    }
  }
}