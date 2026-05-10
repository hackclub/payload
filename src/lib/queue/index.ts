import { Queue } from "bullmq";
import { redis } from "../redis";

export const SESSION_LIFETIME_MS = 6 * 60 * 60 * 1000;
export const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
export const STUCK_TIMEOUT_MS = 10 * 60 * 1000;
export const REAPER_INTERVAL_MS = 60 * 1000;
export const HEARTBEAT_INTERVAL_MS = 30_000;
export const MAX_SESSIONS_PER_USER = 2;
export const IP_DISCOVERY_TIMEOUT_MS = 120_000;

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
  const repeatableJobs = await vmQueue.getRepeatableJobs();
  const existing = repeatableJobs.find((j) => j.key === "reap-vm-sessions");
  if (!existing) {
    await vmQueue.add(
      "reap-vm-sessions",
      {},
      {
        repeat: { every: REAPER_INTERVAL_MS },
      },
    );
  }
}