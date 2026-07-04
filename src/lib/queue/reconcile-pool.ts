import { db } from "@/db";
import { vmSessions, vmSessionEvents, vmTypes } from "@/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import {
  enqueueProvisionVm,
  enqueueWarmVm,
  enqueueTerminateVm,
  PAYLOAD_VM_MEMORY_BUDGET_MB,
  WARM_MAX_AGE_MS,
  MAX_CONCURRENT_WARM_BOOTS,
  type TerminateVmJobData,
} from "@/lib/queue";
import { publish } from "@/lib/sse";

// Fixed key so only one reconcile pass mutates pool state at a time.
const RECONCILE_LOCK_KEY = BigInt(770077);
// Don't sacrifice a warm VM younger than this (anti-thrash).
const SACRIFICE_MIN_AGE_MS = 30_000;

// VMs that physically exist or are booting (hold real RAM). `pending` is a
// promise with no VM yet, so it is excluded from RAM accounting.
const PHYSICAL_STATES = ["warm", "provisioning", "ready", "active"] as const;
const LIVE_STATES = ["warm", "pending", "provisioning", "ready", "active"] as const;

type LiveRow = {
  id: number;
  vmTypeId: number;
  userId: string | null;
  state: string;
  createdAt: Date;
};

/**
 * Warm-pool reconciler (ADR-0033). Converges actual VM state toward desired
 * (per-type warm_pool_size + one VM per waiting demand), bounded by a RAM
 * budget. Single-writer via a transaction-scoped advisory lock; DB mutations
 * are atomic and Redis enqueues happen after commit.
 */
export async function processReconcilePool() {
  const provisionIds: number[] = [];
  const warmSessionIds: number[] = [];
  const terminateActions: TerminateVmJobData[] = [];

  const ran = await db.transaction(async (tx) => {
    const lock = (await tx.execute(
      sql`SELECT pg_try_advisory_xact_lock(${RECONCILE_LOCK_KEY}) AS locked`,
    )) as unknown as Array<{ locked: boolean }>;
    if (!lock[0]?.locked) return false; // another pass is running

    const types = await tx.select().from(vmTypes);
    const memByType = new Map(types.map((t) => [t.id, t.memoryMb]));

    const live = (await tx
      .select({
        id: vmSessions.id,
        vmTypeId: vmSessions.vmTypeId,
        userId: vmSessions.userId,
        state: vmSessions.state,
        createdAt: vmSessions.createdAt,
      })
      .from(vmSessions)
      .where(inArray(vmSessions.state, [...LIVE_STATES]))) as LiveRow[];

    const now = Date.now();
    const memOf = (typeId: number) => memByType.get(typeId) ?? 0;

    // Rows leaving this tick (recycled/sacrificed) — excluded from all counts.
    const leaving = new Set<number>();

    const retire = async (row: LiveRow, reason: TerminateVmJobData["reason"]) => {
      leaving.add(row.id);
      await tx
        .update(vmSessions)
        .set({ state: "terminating", updatedAt: new Date() })
        .where(eq(vmSessions.id, row.id));
      terminateActions.push({ sessionId: row.id, reason });
    };

    // --- 1. Recycle warm VMs older than WARM_MAX_AGE ---
    for (const row of live) {
      if (row.state !== "warm") continue;
      if (now - row.createdAt.getTime() > WARM_MAX_AGE_MS) {
        await retire(row, "warm_recycle");
      }
    }

    const physicalMb = () =>
      live
        .filter((r) => !leaving.has(r.id) && PHYSICAL_STATES.includes(r.state as never))
        .reduce((sum, r) => sum + memOf(r.vmTypeId), 0);

    const nonWarmPhysicalMb = () =>
      live
        .filter(
          (r) =>
            !leaving.has(r.id) &&
            (r.state === "provisioning" || r.state === "ready" || r.state === "active"),
        )
        .reduce((sum, r) => sum + memOf(r.vmTypeId), 0);

    // Running physical-RAM commitment; grows as we decide to boot VMs this tick.
    let usedMb = physicalMb();
    let bootedWarmThisTick = 0;

    const sacrificeCandidates = () =>
      live
        .filter(
          (r) =>
            r.state === "warm" &&
            !leaving.has(r.id) &&
            now - r.createdAt.getTime() > SACRIFICE_MIN_AGE_MS,
        )
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    // --- 2. Serve waiting demands (FIFO) ---
    const demands = live
      .filter((r) => r.state === "pending" && r.userId !== null)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    for (const d of demands) {
      const need = memOf(d.vmTypeId);

      // Impossible even after sacrificing every warm VM → hard error (ADR-0033).
      if (nonWarmPhysicalMb() + need > PAYLOAD_VM_MEMORY_BUDGET_MB) {
        leaving.add(d.id);
        await tx
          .update(vmSessions)
          .set({ state: "errored", updatedAt: new Date() })
          .where(eq(vmSessions.id, d.id));
        await tx.insert(vmSessionEvents).values({
          vmSessionId: d.id,
          kind: "errored",
          payload: { phase: "capacity", reason: "no_capacity" },
        });
        publish({ type: "errored", state: "errored", sessionId: d.id });
        continue;
      }

      // Free room by sacrificing warm VMs of other types if there's no headroom.
      let available = PAYLOAD_VM_MEMORY_BUDGET_MB - usedMb;
      if (need > available) {
        const deficit = need - available;
        const toKill: LiveRow[] = [];
        let freed = 0;
        for (const w of sacrificeCandidates()) {
          if (w.vmTypeId === d.vmTypeId) continue; // same-type warm would've been claimed
          toKill.push(w);
          freed += memOf(w.vmTypeId);
          if (freed >= deficit) break;
        }
        if (freed < deficit) {
          // Fits in principle but not right now (warm too young / other demands
          // ahead). Leave pending; a later tick will serve it.
          continue;
        }
        for (const w of toKill) {
          await retire(w, "warm_recycle");
          usedMb -= memOf(w.vmTypeId);
        }
        available = PAYLOAD_VM_MEMORY_BUDGET_MB - usedMb;
      }

      // Room exists — cold-boot in place on the demand row.
      provisionIds.push(d.id);
      usedMb += need;
    }

    // --- 3. Refill pools toward warm_pool_size with leftover budget ---
    for (const t of types) {
      if (t.warmPoolSize <= 0) continue;
      const poolCount = live.filter(
        (r) =>
          r.vmTypeId === t.id &&
          r.userId === null &&
          !leaving.has(r.id) &&
          (r.state === "warm" || r.state === "pending" || r.state === "provisioning"),
      ).length;

      let deficit = t.warmPoolSize - poolCount;
      while (deficit > 0) {
        if (bootedWarmThisTick >= MAX_CONCURRENT_WARM_BOOTS) break;
        // Only use genuinely free headroom for speculative pool VMs.
        if (t.memoryMb > PAYLOAD_VM_MEMORY_BUDGET_MB - usedMb) break;

        const [row] = await tx
          .insert(vmSessions)
          .values({ vmTypeId: t.id, state: "pending", userId: null, expiresAt: null })
          .returning({ id: vmSessions.id });
        await tx.insert(vmSessionEvents).values({
          vmSessionId: row.id,
          kind: "warm_started",
          payload: { vmTypeId: t.id },
        });
        warmSessionIds.push(row.id);
        usedMb += t.memoryMb;
        bootedWarmThisTick += 1;
        deficit -= 1;
      }
      if (bootedWarmThisTick >= MAX_CONCURRENT_WARM_BOOTS) break;
    }

    return true;
  });

  if (!ran) return;

  // Post-commit side effects (Redis). Keyed job ids make these idempotent.
  for (const id of provisionIds) await enqueueProvisionVm({ sessionId: id });
  for (const id of warmSessionIds) await enqueueWarmVm({ sessionId: id });
  for (const action of terminateActions) await enqueueTerminateVm(action);
}
