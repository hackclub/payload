"use server";

import { getAllowlistedUser } from "@/lib/auth-guard";
import { createUserSession } from "@/lib/sessions";
import { redirect } from "next/navigation";
import { enqueueTerminateVm } from "@/lib/queue";

export async function launchVm(vmTypeSlug: string) {
  const authResult = await getAllowlistedUser();
  if (!authResult) throw new Error("Unauthorized");

  const session = await createUserSession(authResult.userId, vmTypeSlug);
  redirect(`/sessions/${session.id}`);
}

export async function destroySession(sessionId: number) {
  const authResult = await getAllowlistedUser();
  if (!authResult) throw new Error("Unauthorized");

  await enqueueTerminateVm({ sessionId, reason: "user" });
  redirect("/");
}
