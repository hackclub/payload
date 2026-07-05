import { Worker, type Job } from "bullmq";
import { redis } from "@/lib/redis";
import { vmQueue } from "@/lib/queue";
import { processProvisionVm, processWarmVm, processBindVm } from "@/lib/queue/provision-vm";
import { processCustomizeVm } from "@/lib/queue/customize-vm";
import { processAnalyzeRepo } from "@/lib/queue/analyze-repo";
import { processRunSetup } from "@/lib/queue/run-setup";
import { processTerminateVm } from "@/lib/queue/terminate-vm";
import { processReapVmSessions } from "@/lib/queue/reap-vm-sessions";
import { processReconcilePool } from "@/lib/queue/reconcile-pool";

let worker: Worker | null = null;

export function startWorker() {
  if (worker) return;

  worker = new Worker(
    vmQueue.name,
    async (job: Job) => {
      switch (job.name) {
        case "provision-vm":
          await processProvisionVm(job.data);
          break;
        case "warm-vm":
          await processWarmVm(job.data);
          break;
        case "bind-vm":
          await processBindVm(job.data);
          break;
        case "customize-vm":
          await processCustomizeVm(job.data);
          break;
        case "analyze-repo":
          await processAnalyzeRepo(job.data);
          break;
        case "run-setup":
          await processRunSetup(job.data);
          break;
        case "terminate-vm":
          await processTerminateVm(job.data);
          break;
        case "reap-vm-sessions":
          await processReapVmSessions();
          break;
        case "reconcile-pool":
          await processReconcilePool();
          break;
        default:
          console.warn(`Unknown job name: ${job.name}`);
      }
    },
    {
      connection: redis,
      concurrency: 5,
    },
  );

  worker.on("completed", (job) => {
    console.log(`Job ${job.id} (${job.name}) completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`Job ${job?.id} (${job?.name}) failed:`, err.message);
  });

  console.log("BullMQ worker started");
}