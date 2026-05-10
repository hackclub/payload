import { db } from "@/db";
import { vmSessions } from "@/db/schema";
import { and, eq, lte, inArray } from "drizzle-orm";
import { enqueueTerminateVm } from "@/lib/queue";

type VmSessionState = (typeof vmSessions.state.enumValues)[number];

const ACTIVE_STATES: VmSessionState[] = ["pending", "provisioning", "ready", "active"];

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
}