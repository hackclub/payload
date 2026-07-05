import { db } from "@/db";
import { vmSessions, vmSessionEvents, vmTypes, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { createProxmoxClient, getProxmoxConfig } from "@/lib/proxmox/config";
import { guestOs } from "@/lib/guest/transfer";
import { ensureSpool, notify } from "@/lib/guest/spool";
import { applyWallpaper } from "@/lib/wallpaper";
import { getDefaultWallpaper } from "@/lib/wallpaper/default";
import { installPackages, sanitizePackages } from "@/lib/installs";
import { runStartupScript } from "@/lib/scripts";

type CustomizeJobData = { sessionId: number };

/**
 * Background customization pass (ADR-0035). Runs after a session is `ready` and
 * the reviewer can already connect. Applies the owner's saved customizations —
 * wallpaper (user session, via the companion agent + spool), package installs
 * and startup scripts (SYSTEM/root via the guest agent). Never touches session
 * state. Each step is independent and best-effort; completed steps are recorded
 * so a job retry skips them and only re-runs what failed.
 */
export async function processCustomizeVm(jobData: CustomizeJobData) {
  const { sessionId } = jobData;

  const session = await db.query.vmSessions.findFirst({ where: eq(vmSessions.id, sessionId) });
  if (!session) return;
  if (!session.userId || !session.proxmoxVmid || !session.proxmoxNode) return;
  if (!["ready", "active"].includes(session.state)) return;

  const [vmType, user] = await Promise.all([
    db.query.vmTypes.findFirst({ where: eq(vmTypes.id, session.vmTypeId) }),
    db.query.users.findFirst({ where: eq(users.id, session.userId) }),
  ]);
  if (!vmType || !user) return;

  const os = guestOs(vmType.slug);
  if (!os) return; // customization unsupported for this OS (android/macos)

  const packages = sanitizePackages(os === "windows" ? user.installPackagesWindows : user.installPackagesLinux);
  const script = os === "windows" ? user.startupScriptWindows : user.startupScriptLinux;
  const runAsAdmin = os === "windows" ? user.startupScriptWindowsRunAsAdmin : user.startupScriptLinuxRunAsAdmin;
  const wallpaper = user.wallpaperImage;

  const node = session.proxmoxNode;
  const vmid = session.proxmoxVmid;
  const proxmox = createProxmoxClient(getProxmoxConfig());

  const results: boolean[] = [];

  // Wallpaper first — it just drops a spool task (fast) and repaints promptly.
  // Reviewers who haven't uploaded one still get the branded Hack Club default,
  // so every VM looks like Payload out of the box.
  results.push(
    await step(sessionId, "wallpaper_applied", "wallpaper_failed", async () =>
      applyWallpaper({
        proxmox,
        node,
        vmid,
        os,
        sessionId,
        image: wallpaper ? Buffer.from(wallpaper) : await getDefaultWallpaper(),
      }),
    ),
  );

  if (packages.length > 0) {
    results.push(
      await step(sessionId, "packages_installed", "packages_failed", async () => {
        // Best-effort in-session progress via the companion (installs
        // themselves run as SYSTEM/root and are invisible to the reviewer).
        let canNotify = false;
        try {
          await ensureSpool(proxmox, node, vmid, os);
          canNotify = true;
        } catch {
          /* notifications are optional; installs proceed regardless */
        }
        if (canNotify) {
          await notify(
            proxmox, node, vmid, os,
            `notify-${sessionId}-install-start`,
            "Installing programs",
            `Payload is installing ${packages.length} program(s) in the background.`,
          ).catch(() => {});
        }
        await installPackages(proxmox, node, vmid, os, packages);
        if (canNotify) {
          await notify(
            proxmox, node, vmid, os,
            `notify-${sessionId}-install-done`,
            "Programs installed",
            "Your requested programs are ready to use.",
          ).catch(() => {});
        }
      }),
    );
  }

  if (script && script.trim().length > 0) {
    results.push(
      await step(sessionId, "startup_script_done", "startup_script_failed", () =>
        runStartupScript({ proxmox, node, vmid, os, sessionId, script, runAsAdmin }),
      ),
    );
  }

  // Surface a retry if anything failed; done steps are skipped next attempt.
  if (results.some((ok) => !ok)) {
    throw new Error("one or more customization steps failed");
  }
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
