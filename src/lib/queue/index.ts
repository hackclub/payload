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

export const vmQueue = new Queue("vm", { connection: redis });

export type ProvisionVmJobData = {
  sessionId: number;
};

export type TerminateVmJobData = {
  sessionId: number;
  reason: "ttl" | "idle" | "user" | "error" | "admin" | "stuck";
};

export async function enqueueProvisionVm(data: ProvisionVmJobData) {
  return vmQueue.add("provision-vm", data, {
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
  });
}

export async function enqueueTerminateVm(data: TerminateVmJobData) {
  return vmQueue.add("terminate-vm", data, {
    attempts: 3,
    backoff: { type: "exponential", delay: 3_000 },
  });
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