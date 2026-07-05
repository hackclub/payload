import { db } from "@/db";
import { repoSetups } from "@/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";

/** Maximum number of terminal (done/failed) repo setups shown per user. */
export const MAX_REPO_SETUP_HISTORY = 4;

/**
 * Delete terminal (done/failed) repo setups beyond the
 * {@link MAX_REPO_SETUP_HISTORY} most recent for this user, so the dashboard
 * never accumulates stale review cards. Called when a setup reaches a
 * terminal state and when a new review is submitted.
 */
export async function pruneTerminalRepoSetups(userId: string): Promise<void> {
  const rows = await db
    .select({ id: repoSetups.id })
    .from(repoSetups)
    .where(and(eq(repoSetups.userId, userId), inArray(repoSetups.status, ["done", "failed"])))
    .orderBy(desc(repoSetups.createdAt), desc(repoSetups.id));

  const toDelete = rows.slice(MAX_REPO_SETUP_HISTORY).map((r) => r.id);
  if (toDelete.length > 0) {
    await db.delete(repoSetups).where(inArray(repoSetups.id, toDelete));
  }
}
