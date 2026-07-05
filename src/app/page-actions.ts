"use server";

import { getAllowlistedUser } from "@/lib/auth-guard";
import { createUserSession, UserCapError, CapacityError, YswsCapError } from "@/lib/sessions";
import { redirect } from "next/navigation";
import { enqueueTerminateVm } from "@/lib/queue";

export async function launchVm(vmTypeSlug: string): Promise<{ error: string } | void> {
  const authResult = await getAllowlistedUser();
  if (!authResult) return { error: "Unauthorized" };

  let session;
  try {
    session = await createUserSession(authResult.userId, vmTypeSlug, authResult.activeYswsId);
  } catch (error) {
    // Return known errors (per-user cap, workspace cap, server at capacity) so
    // the UI can show them. Thrown server-action messages are redacted in prod.
    if (error instanceof UserCapError || error instanceof YswsCapError || error instanceof CapacityError) {
      return { error: error.message };
    }
    return { error: error instanceof Error ? error.message : "Failed to launch VM" };
  }

  // redirect() throws NEXT_REDIRECT and must stay outside the try above.
  redirect(`/sessions/${session.id}`);
}

export async function destroySession(sessionId: number) {
  const authResult = await getAllowlistedUser();
  if (!authResult) throw new Error("Unauthorized");

  await enqueueTerminateVm({ sessionId, reason: "user" });
  redirect("/");
}
