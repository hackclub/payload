import { db } from "@/db";
import { vmSessions, vmSessionEvents } from "@/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { createProxmoxClient, getProxmoxConfig } from "@/lib/proxmox/config";
import { createGuacamoleClient, getGuacamoleConfig } from "@/lib/guacamole/config";
import { publish } from "@/lib/sse";

type TerminateJobData = { sessionId: number; reason: string };

export async function processTerminateVm(jobData: TerminateJobData) {
  const { sessionId, reason } = jobData;

  const existing = await db.query.vmSessions.findFirst({
    where: eq(vmSessions.id, sessionId),
    columns: { state: true },
  });

  if (!existing) {
    throw new Error(`Session ${sessionId} not found`);
  }

  if (existing.state === "terminated") {
    return;
  }

  // one statement, so a bind finishing alongside sees terminating and cleans up after itself
  const [session] = await db
    .update(vmSessions)
    .set({ state: "terminating", updatedAt: new Date() })
    .where(and(eq(vmSessions.id, sessionId), ne(vmSessions.state, "terminated")))
    .returning();
  if (!session) return;

  if (existing.state !== "terminating") {
    publish({ type: "terminating", state: "terminating", sessionId });
  }

  const guacConfig = getGuacamoleConfig();
  const guac = createGuacamoleClient(guacConfig);
  const proxmoxConfig = getProxmoxConfig();
  const proxmox = createProxmoxClient(proxmoxConfig);

  // Clean up Guacamole resources
  if (session.guacamoleConnectionId) {
    try {
      await guac.deleteConnection(session.guacamoleConnectionId);
    } catch {
      // 404 is success
    }
  }

  if (session.guacamoleUsername) {
    try {
      await guac.deleteUser(session.guacamoleUsername);
    } catch {
      // 404 is success
    }
  }

  // Clean up Proxmox VM
  if (session.proxmoxVmid && session.proxmoxNode) {
    try {
      await proxmox.stopVm(session.proxmoxNode, session.proxmoxVmid);
      // Wait a moment for stop to complete before deleting
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch {
      // VM may already be stopped
    }

    try {
      await proxmox.deleteVm(session.proxmoxNode, session.proxmoxVmid);
    } catch {
      // VM may already be deleted
    }
  }

  await db
    .update(vmSessions)
    .set({
      state: "terminated",
      terminatedAt: new Date(),
      terminationReason: reason,
      // Release the VMID so it can be reallocated. The Proxmox VM has been
      // deleted above, so the DB row must not keep squatting on a 69xxx slot
      // (the allocatable namespace is only 1000 wide).
      proxmoxVmid: null,
      proxmoxNode: null,
      updatedAt: new Date(),
    })
    .where(eq(vmSessions.id, sessionId));

  await db.insert(vmSessionEvents).values({
    vmSessionId: sessionId,
    kind: "terminated",
    payload: { reason },
  });

  publish({ type: "terminated", state: "terminated", sessionId, data: { reason } });
}