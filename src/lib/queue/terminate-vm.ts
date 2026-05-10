import { db } from "@/db";
import { vmSessions, vmSessionEvents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createProxmoxClient, getProxmoxConfig } from "@/lib/proxmox/config";
import { createGuacamoleClient, getGuacamoleConfig } from "@/lib/guacamole/config";
import { publish } from "@/lib/sse";

type TerminateJobData = { sessionId: number; reason: string };

export async function processTerminateVm(jobData: TerminateJobData) {
  const { sessionId, reason } = jobData;

  const session = await db.query.vmSessions.findFirst({
    where: eq(vmSessions.id, sessionId),
  });

  if (!session) {
    throw new Error(`Session ${sessionId} not found`);
  }

  if (session.state === "terminated") {
    return;
  }

  if (session.state !== "terminating") {
    await db
      .update(vmSessions)
      .set({ state: "terminating", updatedAt: new Date() })
      .where(eq(vmSessions.id, sessionId));

    publish({ type: "terminating", sessionId });
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
      updatedAt: new Date(),
    })
    .where(eq(vmSessions.id, sessionId));

  await db.insert(vmSessionEvents).values({
    vmSessionId: sessionId,
    kind: "terminated",
    payload: { reason },
  });

  publish({ type: "terminated", sessionId, data: { reason } });
}