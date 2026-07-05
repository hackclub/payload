import { cookies } from "next/headers";
import { auth } from "@/auth";
import { db } from "@/db";
import { ysws, yswsMemberships, platformSuperadmins } from "@/db/schema";
import { eq } from "drizzle-orm";

// Name of the cookie that pins a user's active workspace. Set by the switch
// server action; read on every request to resolve which YSWS a member is
// currently acting in (ADR-0036). Validated against live membership each time,
// so a stale value (workspace left or deleted) harmlessly falls back.
export const ACTIVE_YSWS_COOKIE = "payload_active_ysws";

export type YswsRole = "member" | "admin";

// A workspace the current user may act in, with their effective role. For a
// superadmin every enabled workspace appears here with role "admin".
export type YswsAccess = {
  id: string;
  slug: string;
  name: string;
  role: YswsRole;
};

export type AccessContext = {
  userId: string;
  slackId: string;
  name: string | null;
  image: string | null;
  isSuperadmin: boolean;
  workspaces: YswsAccess[];
  activeYsws: YswsAccess | null;
};

type SessionSlackId = { slackId?: string | null };

/**
 * Resolve everything authorization needs for the current request: who the user
 * is, whether they are a platform superadmin, which workspaces they can act in,
 * and which one is active. Returns null when there is no usable session (not
 * logged in, or no Slack ID on the profile).
 */
export async function getAccessContext(): Promise<AccessContext | null> {
  const session = await auth();
  if (!session?.user) return null;

  const slackId = (session.user as SessionSlackId).slackId ?? null;
  const userId = session.user.id ?? null;
  if (!slackId || !userId) return null;

  const [superRow, memberRows] = await Promise.all([
    db.query.platformSuperadmins.findFirst({
      where: eq(platformSuperadmins.slackId, slackId),
    }),
    db
      .select({
        id: ysws.id,
        slug: ysws.slug,
        name: ysws.name,
        enabled: ysws.enabled,
        role: yswsMemberships.role,
      })
      .from(yswsMemberships)
      .innerJoin(ysws, eq(yswsMemberships.yswsId, ysws.id))
      .where(eq(yswsMemberships.slackId, slackId)),
  ]);

  const isSuperadmin = !!superRow;

  let workspaces: YswsAccess[];
  if (isSuperadmin) {
    // Superadmins act in any enabled workspace regardless of explicit
    // membership, so the switcher shows them everything.
    const all = await db
      .select({ id: ysws.id, slug: ysws.slug, name: ysws.name })
      .from(ysws)
      .where(eq(ysws.enabled, true));
    workspaces = all.map((w) => ({ ...w, role: "admin" as const }));
  } else {
    workspaces = memberRows
      .filter((m) => m.enabled)
      .map((m) => ({ id: m.id, slug: m.slug, name: m.name, role: m.role }));
  }

  workspaces.sort((a, b) => a.name.localeCompare(b.name));

  const cookieStore = await cookies();
  const activeId = cookieStore.get(ACTIVE_YSWS_COOKIE)?.value;
  const activeYsws =
    workspaces.find((w) => w.id === activeId) ?? workspaces[0] ?? null;

  return {
    userId,
    slackId,
    name: session.user.name ?? null,
    image: session.user.image ?? null,
    isSuperadmin,
    workspaces,
    activeYsws,
  };
}

/** True if the user may administer the given workspace (its admin, or a superadmin). */
export function canAdminYsws(ctx: AccessContext, yswsId: string): boolean {
  if (ctx.isSuperadmin) return true;
  return ctx.workspaces.some((w) => w.id === yswsId && w.role === "admin");
}

/** The workspace ids this user administers (all enabled ones for a superadmin). */
export function adminYswsIds(ctx: AccessContext): string[] {
  return ctx.workspaces.filter((w) => w.role === "admin").map((w) => w.id);
}
