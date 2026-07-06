"use server";

import { getAllowlistedUser } from "@/lib/auth-guard";
import { createUserSession, UserCapError, CapacityError, YswsCapError } from "@/lib/sessions";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { enqueueTerminateVm, enqueueAnalyzeRepo, MAX_SESSIONS_PER_USER } from "@/lib/queue";
import { db } from "@/db";
import { repoSetups, vmSessions } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { aiEnabled } from "@/lib/ai/client";
import { validateRepoUrl, RepoCloneError } from "@/lib/repo-setup/clone";
import { pruneTerminalRepoSetups } from "@/lib/repo-setup/history";

export async function launchVm(
  vmTypeSlug: string,
): Promise<{ error: string } | { sessionId: number }> {
  const authResult = await getAllowlistedUser();
  if (!authResult) return { error: "Unauthorized" };

  try {
    const session = await createUserSession(authResult.userId, vmTypeSlug, authResult.activeYswsId);
    // Navigation happens client-side: a server redirect() here rejects the
    // action promise with NEXT_REDIRECT, which the form's catch shows as an
    // error toast before the router navigates.
    return { sessionId: session.id };
  } catch (error) {
    // Return known errors (per-user cap, workspace cap, server at capacity) so
    // the UI can show them. Thrown server-action messages are redacted in prod.
    if (error instanceof UserCapError || error instanceof YswsCapError || error instanceof CapacityError) {
      return { error: error.message };
    }
    return { error: error instanceof Error ? error.message : "Failed to launch VM" };
  }
}

// Session states that hold (or will hold) a VM slot — mirrors COMMITTED_STATES
// in src/lib/sessions.ts.
const COMMITTED_STATES = ["pending", "provisioning", "ready", "active"] as const;

/**
 * "Review a Repo": store the request and kick the AI analysis. Sequential
 * flow — NO VM or session is created here; the analyze-repo job launches the
 * VM only after the setup script + guide have been generated.
 */
export async function launchRepoReview(repoUrl: string): Promise<{ error: string } | void> {
  const authResult = await getAllowlistedUser();
  if (!authResult) return { error: "Unauthorized" };
  if (!aiEnabled()) return { error: "AI project setup is not enabled on this server" };

  let validated: string;
  try {
    validated = validateRepoUrl(repoUrl);
  } catch (error) {
    return { error: error instanceof RepoCloneError ? error.message : "Invalid repository URL" };
  }

  // Every request here will become a VM, so gate on the user's VM cap up
  // front: current sessions + in-flight analyses (each of which will claim a
  // slot when its analysis finishes) must leave room for one more. The hard
  // check still happens in createUserSession at launch time; this one exists
  // so users don't wait minutes for an analysis only to hit the cap.
  const [committedSessions, activeSetups] = await Promise.all([
    db
      .select({ id: vmSessions.id })
      .from(vmSessions)
      .where(
        and(eq(vmSessions.userId, authResult.userId), inArray(vmSessions.state, [...COMMITTED_STATES])),
      ),
    db
      .select({ id: repoSetups.id })
      .from(repoSetups)
      .where(
        and(
          eq(repoSetups.userId, authResult.userId),
          inArray(repoSetups.status, ["pending", "analyzing", "analyzed"]),
        ),
      ),
  ]);
  if (committedSessions.length + activeSetups.length >= MAX_SESSIONS_PER_USER) {
    return {
      error: `You're at your limit of ${MAX_SESSIONS_PER_USER} active VMs — terminate a session first`,
    };
  }

  const [row] = await db
    .insert(repoSetups)
    .values({ userId: authResult.userId, yswsId: authResult.activeYswsId, repoUrl: validated })
    .returning();

  // Prune stale terminal rows so the dashboard never shows more than the cap.
  await pruneTerminalRepoSetups(authResult.userId);

  await enqueueAnalyzeRepo({ setupId: row.id });
  revalidatePath("/");
}

export async function dismissRepoSetup(setupId: number): Promise<void> {
  const authResult = await getAllowlistedUser();
  if (!authResult) return;

  // Only terminal rows can be dismissed, and only by their owner. Deleting the
  // row just hides the card — any linked session lives on independently.
  await db
    .delete(repoSetups)
    .where(
      and(
        eq(repoSetups.id, setupId),
        eq(repoSetups.userId, authResult.userId),
        inArray(repoSetups.status, ["done", "failed"]),
      ),
    );
  revalidatePath("/");
}

export async function destroySession(sessionId: number) {
  const authResult = await getAllowlistedUser();
  if (!authResult) throw new Error("Unauthorized");

  await enqueueTerminateVm({ sessionId, reason: "user" });
  redirect("/");
}
