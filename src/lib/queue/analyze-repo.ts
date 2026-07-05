import { db } from "@/db";
import { repoSetups, vmSessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { cloneRepo, cleanupClone } from "@/lib/repo-setup/clone";
import { buildRepoDigest } from "@/lib/repo-setup/digest";
import { analyzeRepo } from "@/lib/repo-setup/agent";
import { pruneTerminalRepoSetups } from "@/lib/repo-setup/history";
import { createUserSession } from "@/lib/sessions";
import { enqueueRunSetup } from "@/lib/queue";

export type AnalyzeRepoJobData = { setupId: number };

/**
 * AI phase of "Review a Repo" (strictly sequential: AI first, VM after).
 * Clones the repo server-side, runs the LLM analysis to produce a setup
 * script + reviewer guide, and only on success launches the Linux VM through
 * the normal warm-pool path. Any failure parks the row at `failed` — no VM
 * is ever booted for a failed analysis. Runs once (no BullMQ retries): LLM
 * calls are expensive and the user can simply resubmit the URL.
 */
export async function processAnalyzeRepo(jobData: AnalyzeRepoJobData) {
  const { setupId } = jobData;

  const setup = await db.query.repoSetups.findFirst({ where: eq(repoSetups.id, setupId) });
  if (!setup) return;
  // Only pick up fresh rows (plus `analyzing` in case a worker died mid-run).
  if (!["pending", "analyzing"].includes(setup.status) || setup.vmSessionId) return;

  try {
    await setStatus(setupId, "analyzing");

    const repoDir = await cloneRepo(setup.repoUrl);
    let analysis;
    try {
      const digest = await buildRepoDigest(repoDir);
      analysis = await analyzeRepo({ repoUrl: setup.repoUrl, repoDir, digest });
    } finally {
      await cleanupClone(repoDir);
    }

    await db
      .update(repoSetups)
      .set({
        setupScript: analysis.setupScript,
        reviewerGuide: analysis.reviewerGuide,
        status: "analyzed",
        updatedAt: new Date(),
      })
      .where(eq(repoSetups.id, setupId));

    // Artifacts are safe in the DB — now (and only now) launch the VM. The
    // bind phase notices the analyzed setup linked to this session and
    // enqueues run-setup once the VM is ready.
    if (!setup.yswsId) throw new Error("The workspace this request was made in no longer exists");
    const session = await createUserSession(setup.userId, "linux", setup.yswsId);

    await db
      .update(repoSetups)
      .set({ vmSessionId: session.id, updatedAt: new Date() })
      .where(eq(repoSetups.id, setupId));

    // A claimed warm VM can bind before vmSessionId is stamped above, in which
    // case the bind-side hook found no setup row. Cover that window from this
    // side too — the run-setup jobId dedups when both fire.
    const current = await db.query.vmSessions.findFirst({ where: eq(vmSessions.id, session.id) });
    if (current && ["ready", "active"].includes(current.state)) {
      await enqueueRunSetup({ setupId });
    }
  } catch (error) {
    await db
      .update(repoSetups)
      .set({
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        updatedAt: new Date(),
      })
      .where(eq(repoSetups.id, setupId));
    // The row just went terminal — prune older history beyond the cap.
    await pruneTerminalRepoSetups(setup.userId).catch(() => {});
  }
}

async function setStatus(setupId: number, status: "analyzing") {
  await db
    .update(repoSetups)
    .set({ status, updatedAt: new Date() })
    .where(eq(repoSetups.id, setupId));
}
