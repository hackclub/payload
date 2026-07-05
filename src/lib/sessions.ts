import { db } from "@/db";
import { vmSessions, vmSessionEvents, vmTypes, ysws } from "@/db/schema";
import { eq, inArray, and, sql, isNotNull } from "drizzle-orm";
import {
  enqueueBindVm,
  enqueueReconcilePool,
  MAX_SESSIONS_PER_USER,
  PAYLOAD_VM_MEMORY_BUDGET_MB,
  SESSION_LIFETIME_MS,
} from "@/lib/queue";
import { createHash } from "node:crypto";

/** The user already holds the maximum number of concurrent sessions. */
export class UserCapError extends Error {}
/** The server has no room for another VM even after sacrificing the warm pool. */
export class CapacityError extends Error {}
/** The user's workspace has reached its per-YSWS concurrent-VM ceiling (ADR-0036). */
export class YswsCapError extends Error {}

// States that hold (or have promised) RAM and are NOT sacrificeable warm VMs.
// Used for both the per-user cap and the global capacity check.
const COMMITTED_STATES = ["pending", "provisioning", "ready", "active"] as const;

export async function createUserSession(userId: string, vmTypeSlug: string, yswsId: string) {
  const vmType = await db.query.vmTypes.findFirst({
    where: and(eq(vmTypes.slug, vmTypeSlug), eq(vmTypes.enabled, true)),
  });

  if (!vmType) {
    throw new Error("VM type not found or not enabled");
  }

  const userLockKey = advisoryLockKey(`user:${userId}`);
  const yswsLockKey = advisoryLockKey(`ysws:${yswsId}`);

  const result = await db.transaction(async (tx) => {
    // pg_advisory_xact_lock requires being inside a transaction; the lock is
    // auto-released when the transaction commits/rolls back. Always take the
    // user lock before the workspace lock so concurrent launches never deadlock.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${userLockKey})`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${yswsLockKey})`);

    // Per-user cap. Counts the user's queued demands too (pending + owned), so
    // a user cannot flood the queue past their cap (ADR-0006 + ADR-0033).
    const owned = await tx
      .select({ id: vmSessions.id })
      .from(vmSessions)
      .where(and(eq(vmSessions.userId, userId), inArray(vmSessions.state, [...COMMITTED_STATES])));

    if (owned.length >= MAX_SESSIONS_PER_USER) {
      throw new UserCapError(`You already have ${MAX_SESSIONS_PER_USER} active sessions`);
    }

    // Per-workspace concurrent-VM ceiling (ADR-0036). Counts committed VMs
    // across every member of the workspace; queued (pending) demands count too,
    // matching the per-user cap, so members can't flood past the ceiling. The
    // workspace advisory lock above makes this count-then-insert race-free even
    // when two different members launch at once. Null cap = unlimited.
    const [yswsRow] = await tx
      .select({ cap: ysws.maxConcurrentVms })
      .from(ysws)
      .where(eq(ysws.id, yswsId))
      .limit(1);

    if (yswsRow?.cap != null) {
      const inWorkspace = await tx
        .select({ id: vmSessions.id })
        .from(vmSessions)
        .where(and(eq(vmSessions.yswsId, yswsId), inArray(vmSessions.state, [...COMMITTED_STATES])));

      if (inWorkspace.length >= yswsRow.cap) {
        throw new YswsCapError(
          "No more VM capacity available in your workspace. Please try again later, or contact your organizer.",
        );
      }
    }

    // Fairness: if someone is already waiting for this type, don't let a fresh
    // request jump ahead and claim a warm VM; join the queue instead.
    const queuedAhead = await tx
      .select({ id: vmSessions.id })
      .from(vmSessions)
      .where(
        and(
          eq(vmSessions.vmTypeId, vmType.id),
          eq(vmSessions.state, "pending"),
          isNotNull(vmSessions.userId),
        ),
      );

    if (queuedAhead.length === 0) {
      // Try to claim a warm VM atomically. SKIP LOCKED prevents two concurrent
      // claims from grabbing the same row.
      const claim = (await tx.execute(sql`
        SELECT id FROM vm_sessions
         WHERE state = 'warm' AND vm_type_id = ${vmType.id}
         ORDER BY created_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED
      `)) as unknown as Array<{ id: number }>;

      const warmId = claim[0]?.id;
      if (warmId !== undefined) {
        const now = new Date();
        const [row] = await tx
          .update(vmSessions)
          .set({
            userId,
            yswsId,
            state: "provisioning",
            claimedAt: now,
            expiresAt: new Date(now.getTime() + SESSION_LIFETIME_MS),
            updatedAt: now,
          })
          .where(eq(vmSessions.id, warmId))
          .returning();

        await tx.insert(vmSessionEvents).values({
          vmSessionId: row.id,
          kind: "claimed_warm",
          payload: { vmTypeSlug },
        });

        return { row, claimed: true as const };
      }
    }

    // No warm VM available (or we must queue): create a demand row. First a
    // capacity check, rejecting only if the request cannot fit even after
    // sacrificing every warm VM, i.e. non-warm commitments already fill the
    // budget (ADR-0033, hard-error policy).
    const committed = await tx
      .select({ memoryMb: vmTypes.memoryMb })
      .from(vmSessions)
      .innerJoin(vmTypes, eq(vmSessions.vmTypeId, vmTypes.id))
      .where(inArray(vmSessions.state, [...COMMITTED_STATES]));

    const committedMb = committed.reduce((sum, r) => sum + r.memoryMb, 0);
    if (committedMb + vmType.memoryMb > PAYLOAD_VM_MEMORY_BUDGET_MB) {
      throw new CapacityError(
        "All VMs are currently in use and there is no free capacity. Please try again in a few minutes.",
      );
    }

    const [row] = await tx
      .insert(vmSessions)
      .values({ userId, yswsId, vmTypeId: vmType.id, state: "pending", expiresAt: null })
      .returning();

    await tx.insert(vmSessionEvents).values({
      vmSessionId: row.id,
      kind: "created",
      payload: { vmTypeSlug, queued: true },
    });

    return { row, claimed: false as const };
  });

  // Side effects happen after commit so a Redis hiccup can't roll back the row.
  if (result.claimed) {
    await enqueueBindVm({ sessionId: result.row.id });
  } else {
    // The reconciler owns all booting decisions; kick it to serve this demand.
    await enqueueReconcilePool();
  }

  return result.row;
}

function advisoryLockKey(seed: string): bigint {
  const hash = createHash("md5").update(seed).digest("hex");
  return BigInt("0x" + hash.slice(0, 15));
}
