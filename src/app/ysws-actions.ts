"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getAccessContext, ACTIVE_YSWS_COOKIE } from "@/lib/access";

/**
 * Pin the caller's active workspace. Validates that they actually belong to the
 * target (superadmins may pick any enabled one) before writing the cookie, so a
 * forged id can never grant access to a workspace they are not in (ADR-0036).
 */
export async function switchYsws(yswsId: string): Promise<{ error: string } | void> {
  const ctx = await getAccessContext();
  if (!ctx) return { error: "Unauthorized" };

  const target = ctx.workspaces.find((w) => w.id === yswsId);
  if (!target) return { error: "You are not a member of that workspace" };

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_YSWS_COOKIE, yswsId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/", "layout");
}
