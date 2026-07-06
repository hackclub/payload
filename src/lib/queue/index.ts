import { Queue } from "bullmq";
import { redis } from "../redis";
import { env } from "../../env";

export const SESSION_LIFETIME_MS = env.SESSION_LIFETIME_MS;
export const IDLE_TIMEOUT_MS = env.IDLE_TIMEOUT_MS;
export const STUCK_TIMEOUT_MS = env.STUCK_TIMEOUT_MS;
export const REAPER_INTERVAL_MS = env.REAPER_INTERVAL_MS;
export const HEARTBEAT_INTERVAL_MS = env.HEARTBEAT_INTERVAL_MS;
export const MAX_SESSIONS_PER_USER = env.MAX_SESSIONS_PER_USER;
export const IP_DISCOVERY_TIMEOUT_MS = env.IP_DISCOVERY_TIMEOUT_MS;

// Warm pool (ADR-0033)
export const WARM_POOL_ENABLED = env.WARM_POOL_ENABLED;
export const PAYLOAD_VM_MEMORY_BUDGET_MB = env.PAYLOAD_VM_MEMORY_BUDGET_MB;
export const WARM_MAX_AGE_MS = env.WARM_MAX_AGE_MS;
export const MAX_CONCURRENT_WARM_BOOTS = env.MAX_CONCURRENT_WARM_BOOTS;
export const RECONCILE_INTERVAL_MS = env.RECONCILE_INTERVAL_MS;
export const WARM_CPU_UNITS = env.WARM_CPU_UNITS;
export const ACTIVE_CPU_UNITS = env.ACTIVE_CPU_UNITS;

export const vmQueue = new Queue("vm", { connection: redis });

export type ProvisionVmJobData = {
  sessionId: number;
};

export type WarmVmJobData = {
  // The reconciler pre-creates the ownerless row (so it counts toward the pool
  // immediately) and passes its id here.
  sessionId: number;
};

export type BindVmJobData = {
  sessionId: number;
};

export type CustomizeVmJobData = {
  sessionId: number;
};

export type TerminateVmJobData = {
  sessionId: number;
  reason: "ttl" | "idle" | "user" | "error" | "admin" | "stuck" | "warm_recycle" | "orphan" | "shutdown";
};

export async function enqueueProvisionVm(data: ProvisionVmJobData) {
  return vmQueue.add("provision-vm", data, {
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
    // One provision per session; dedup so a reconcile burst can't double-boot.
    jobId: `provision-${data.sessionId}`,
    removeOnComplete: true,
    removeOnFail: 1000,
  });
}

/** Boot a pre-created ownerless VM row into the warm pool. */
export async function enqueueWarmVm(data: WarmVmJobData) {
  return vmQueue.add("warm-vm", data, {
    attempts: 2,
    backoff: { type: "exponential", delay: 5_000 },
    jobId: `warm-${data.sessionId}`,
    removeOnComplete: true,
    removeOnFail: 1000,
  });
}

/** Bind a claimed warm VM to its user (Guacamole registration). */
export async function enqueueBindVm(data: BindVmJobData) {
  return vmQueue.add("bind-vm", data, {
    attempts: 2,
    backoff: { type: "exponential", delay: 3_000 },
    jobId: `bind-${data.sessionId}`,
    removeOnComplete: true,
    removeOnFail: 1000,
  });
}

/**
 * Apply the owner's saved customization (wallpaper) to a bound VM. Enqueued
 * after the session is already `ready` — it runs in the background and never
 * gates the reviewer's connection. Best-effort: a few retries, then give up.
 */
export async function enqueueCustomizeVm(data: CustomizeVmJobData) {
  return vmQueue.add("customize-vm", data, {
    attempts: 3,
    backoff: { type: "exponential", delay: 4_000 },
    jobId: `customize-${data.sessionId}`,
    removeOnComplete: true,
    removeOnFail: 1000,
  });
}

export type AnalyzeRepoJobData = { setupId: number };
export type RunSetupJobData = { setupId: number };

/**
 * AI phase of "Review a Repo": analyze the repo and, on success, launch the
 * VM (sequential — the VM boots only after the AI is done). No retries: LLM
 * runs are expensive and the user can resubmit the URL.
 */
export async function enqueueAnalyzeRepo(data: AnalyzeRepoJobData) {
  return vmQueue.add("analyze-repo", data, {
    attempts: 1,
    jobId: `analyze-repo-${data.setupId}`,
    removeOnComplete: true,
    removeOnFail: 1000,
  });
}

/**
 * Execution phase of "Review a Repo": deliver + visibly run the generated
 * setup on the ready VM. Enqueued from bind completion AND from the analyze
 * job's tail (whichever observes both halves ready) — the jobId dedups.
 */
export async function enqueueRunSetup(data: RunSetupJobData) {
  return vmQueue.add("run-setup", data, {
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
    jobId: `run-setup-${data.setupId}`,
    removeOnComplete: true,
    removeOnFail: 1000,
  });
}

export async function enqueueTerminateVm(data: TerminateVmJobData) {
  return vmQueue.add("terminate-vm", data, {
    attempts: 3,
    backoff: { type: "exponential", delay: 3_000 },
  });
}

/** Kick an immediate pool-reconcile pass (e.g. when a new demand is created). */
export async function enqueueReconcilePool() {
  return vmQueue.add(
    "reconcile-pool",
    {},
    // Coalesce bursts of kicks into a single pending run.
    { jobId: "reconcile-pool-kick", removeOnComplete: true, removeOnFail: true },
  );
}

export async function scheduleReaper() {
  // Use BullMQ's Job Scheduler (replaces the deprecated repeatable-job API).
  // upsert is idempotent: same scheduler id replaces any prior schedule.
  await vmQueue.upsertJobScheduler(
    "reap-vm-sessions",
    { every: REAPER_INTERVAL_MS },
    { name: "reap-vm-sessions", data: {} },
  );
}

export async function scheduleReconciler() {
  // Periodic safety tick for the warm-pool reconciler (ADR-0033). It is also
  // kicked on-demand via enqueueReconcilePool().
  await vmQueue.upsertJobScheduler(
    "reconcile-pool",
    { every: RECONCILE_INTERVAL_MS },
    { name: "reconcile-pool", data: {} },
  );
}