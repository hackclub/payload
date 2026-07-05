import { db } from "@/db";
import { repoSetups, vmSessions, vmSessionEvents } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { createProxmoxClient, getProxmoxConfig } from "@/lib/proxmox/config";
import type { ProxmoxClient } from "@/lib/proxmox/client";
import { writeGuestFile } from "@/lib/guest/transfer";
import { ensureSpool, notify, writeSpoolPayload, dropTask } from "@/lib/guest/spool";
import {
  buildLaunchScript,
  buildRunnerScript,
  buildSetupScript,
  EXIT_CODE_PATH,
  GUIDE_PATH,
  RUNNER_PATH,
  SETUP_SCRIPT_PATH,
} from "@/lib/repo-setup/vm-scripts";

export type RunSetupJobData = { setupId: number };

const SETUP_TIMEOUT_MS = 20 * 60 * 1000;
const POLL_INTERVAL_MS = 5_000;

/**
 * Execution phase of "Review a Repo": deliver the AI-generated artifacts to
 * the ready Linux VM and run the setup VISIBLY — the guide opens in mousepad
 * and the script runs in a maximized terminal (cloning the repo first), while
 * this job polls an exit-code sentinel to record the outcome. Mirrors the
 * customize-vm step model: completed steps are logged as vm_session_events so
 * a retry never opens a second terminal.
 */
export async function processRunSetup(jobData: RunSetupJobData) {
  const { setupId } = jobData;

  const setup = await db.query.repoSetups.findFirst({ where: eq(repoSetups.id, setupId) });
  if (!setup?.vmSessionId || !setup.setupScript || !setup.reviewerGuide) return;
  // `failed` is retryable here: a delivery failure marks the row failed and
  // throws so BullMQ retries — the step event log skips whatever already
  // succeeded, and a recovering retry flips the row back to running.
  if (!["analyzed", "running", "failed"].includes(setup.status)) return;

  const session = await db.query.vmSessions.findFirst({
    where: eq(vmSessions.id, setup.vmSessionId),
    with: { vmType: true },
  });
  if (!session?.proxmoxVmid || !session.proxmoxNode) return;
  if (!["ready", "active"].includes(session.state)) return;
  if (session.vmType?.slug !== "linux") return;

  const sessionId = session.id;
  const node = session.proxmoxNode;
  const vmid = session.proxmoxVmid;
  const proxmox = createProxmoxClient(getProxmoxConfig());

  await db
    .update(repoSetups)
    .set({ status: "running", updatedAt: new Date() })
    .where(eq(repoSetups.id, setupId));

  const filesOk = await step(sessionId, "setup_files_written", "setup_files_failed", async () => {
    // The AI script uses `sudo` freely; make it non-interactive. Guest exec
    // runs as root, so this is the natural place to grant it.
    await proxmox.waitForGuestExec({
      node,
      vmid,
      command: [
        "/bin/bash",
        "-lc",
        "echo 'shipwrights ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/payload-setup && chmod 440 /etc/sudoers.d/payload-setup",
      ],
      intervalMs: 500,
    });

    await writeGuestFile({
      proxmox, node, vmid, os: "linux",
      destPath: GUIDE_PATH,
      data: Buffer.from(setup.reviewerGuide!, "utf8"),
    });
    await writeGuestFile({
      proxmox, node, vmid, os: "linux",
      destPath: SETUP_SCRIPT_PATH,
      data: Buffer.from(buildSetupScript(setup.setupScript!), "utf8"),
    });
    await writeGuestFile({
      proxmox, node, vmid, os: "linux",
      destPath: RUNNER_PATH,
      data: Buffer.from(buildRunnerScript(setup.repoUrl), "utf8"),
    });

    // Everything under $HOME was written by root; hand it to the desktop user.
    await proxmox.waitForGuestExec({
      node,
      vmid,
      command: [
        "/bin/bash",
        "-lc",
        `chown shipwrights:shipwrights '${GUIDE_PATH}' '${SETUP_SCRIPT_PATH}' '${RUNNER_PATH}' && chown -R shipwrights:shipwrights /home/shipwrights/.payload`,
      ],
      intervalMs: 500,
    });
  });

  const launchedOk =
    filesOk &&
    (await step(sessionId, "setup_launched", "setup_launch_failed", async () => {
      await ensureSpool(proxmox, node, vmid, "linux");
      const name = `repo-setup-${setupId}.sh`;
      await writeSpoolPayload(proxmox, node, vmid, "linux", name, Buffer.from(buildLaunchScript(), "utf8"));
      await dropTask(proxmox, node, vmid, "linux", {
        v: 1,
        id: `repo-setup-${setupId}`,
        type: "run-script",
        payload_file: name,
        interpreter: "bash",
      });
    }));

  if (!filesOk || !launchedOk) {
    await markFailed(setupId, "Could not deliver the setup to the VM");
    throw new Error("repo setup delivery failed"); // surface a BullMQ retry
  }

  // Watch for the runner's exit-code sentinel. `setup_done`/`setup_failed`
  // events make this leg idempotent too — a retried job re-polls harmlessly.
  const exitCode = await pollExitCode(proxmox, node, vmid);

  if (exitCode === 0) {
    await db
      .update(repoSetups)
      .set({ status: "done", updatedAt: new Date() })
      .where(eq(repoSetups.id, setupId));
    await logEvent(sessionId, "setup_done", {});
    await notify(
      proxmox, node, vmid, "linux",
      `repo-setup-done-${setupId}`,
      "Project setup complete",
      "The setup script finished. The reviewer guide in the browser explains how to run the project.",
    ).catch(() => {});
  } else {
    const reason =
      exitCode === null
        ? "The setup script did not finish within the time limit"
        : `The setup script exited with code ${exitCode}`;
    await markFailed(setupId, reason);
    await logEvent(sessionId, "setup_failed", { exitCode });
    await notify(
      proxmox, node, vmid, "linux",
      `repo-setup-failed-${setupId}`,
      "Project setup failed",
      "The setup script did not finish cleanly — check the terminal output. The VM is still usable.",
    ).catch(() => {});
  }
}

/** Poll the sentinel file until it appears; null = timed out. */
async function pollExitCode(proxmox: ProxmoxClient, node: string, vmid: number): Promise<number | null> {
  const deadline = Date.now() + SETUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const result = await proxmox
      .waitForGuestExec({
        node,
        vmid,
        // Always exits 0: prints the code once the runner wrote it, else PENDING.
        command: ["/bin/bash", "-lc", `cat '${EXIT_CODE_PATH}' 2>/dev/null || echo PENDING`],
        intervalMs: 500,
        timeoutMs: 30_000,
      })
      .catch(() => null);

    const out = result?.out?.trim();
    if (out && out !== "PENDING") {
      const code = Number(out);
      return Number.isFinite(code) ? code : 1;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  return null;
}

async function markFailed(setupId: number, error: string) {
  await db
    .update(repoSetups)
    .set({ status: "failed", error, updatedAt: new Date() })
    .where(eq(repoSetups.id, setupId));
}

async function logEvent(sessionId: number, kind: string, payload: Record<string, unknown>) {
  await db.insert(vmSessionEvents).values({ vmSessionId: sessionId, kind, payload });
}

/** Run a step unless already completed; log its outcome. Returns success. */
async function step(
  sessionId: number,
  doneKind: string,
  failKind: string,
  fn: () => Promise<void>,
): Promise<boolean> {
  const already = await db.query.vmSessionEvents.findFirst({
    where: and(eq(vmSessionEvents.vmSessionId, sessionId), eq(vmSessionEvents.kind, doneKind)),
  });
  if (already) return true;

  try {
    await fn();
    await db.insert(vmSessionEvents).values({ vmSessionId: sessionId, kind: doneKind });
    return true;
  } catch (error) {
    await db.insert(vmSessionEvents).values({
      vmSessionId: sessionId,
      kind: failKind,
      payload: { error: error instanceof Error ? error.message : String(error) },
    });
    return false;
  }
}
