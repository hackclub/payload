import { NextResponse } from "next/server";
import { db } from "@/db";
import { yswsMemberships, platformSuperadmins, users } from "@/db/schema";
import { and, eq, desc, inArray } from "drizzle-orm";
import { getAdminUser, type AdminUser } from "@/lib/admin-guard";
import { getCachetProfile, cachetAvatarUrl } from "@/lib/cachet";

const SLACK_RE = /^U[A-Z0-9]+$/;

// Passes when the caller may administer this workspace: a superadmin, or an
// admin of that specific workspace (ADR-0036).
function canManage(admin: AdminUser, yswsId: string): boolean {
  return admin.isSuperadmin || admin.adminYswsIds.includes(yswsId);
}

/** List members of ?yswsId, enriched with profile info and role. */
export async function GET(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const yswsId = new URL(request.url).searchParams.get("yswsId") ?? "";
  if (!yswsId) return NextResponse.json({ error: "yswsId required" }, { status: 400 });
  if (!canManage(admin, yswsId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const entries = await db.query.yswsMemberships.findMany({
    where: eq(yswsMemberships.yswsId, yswsId),
    orderBy: desc(yswsMemberships.createdAt),
  });

  const slackIds = entries.map((e) => e.slackId);
  const [superRows, userRows] = await Promise.all([
    slackIds.length > 0
      ? db.select({ slackId: platformSuperadmins.slackId }).from(platformSuperadmins).where(inArray(platformSuperadmins.slackId, slackIds))
      : Promise.resolve([]),
    slackIds.length > 0 ? db.query.users.findMany({ where: inArray(users.slackId, slackIds) }) : Promise.resolve([]),
  ]);

  const superSet = new Set(superRows.map((s) => s.slackId));
  const usersBySlack = new Map<string, { name: string | null; image: string | null }>();
  for (const u of userRows) if (u.slackId) usersBySlack.set(u.slackId, { name: u.name, image: u.image });

  const enriched = await Promise.all(
    entries.map(async (e) => {
      const dbUser = usersBySlack.get(e.slackId);
      const cachet = await getCachetProfile(e.slackId);
      return {
        slackId: e.slackId,
        name: dbUser?.name ?? cachet.displayName ?? null,
        image: dbUser?.image ?? cachet.imageUrl ?? cachetAvatarUrl(e.slackId),
        role: e.role,
        isSuperadmin: superSet.has(e.slackId),
        createdAt: e.createdAt,
      };
    }),
  );

  return NextResponse.json(enriched);
}

/** Add a member (role defaults to member). */
export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const yswsId = typeof body.yswsId === "string" ? body.yswsId : "";
  const slackId = typeof body.slackId === "string" ? body.slackId.trim() : "";
  const role = body.role === "admin" ? "admin" : "member";

  if (!yswsId) return NextResponse.json({ error: "yswsId required" }, { status: 400 });
  if (!canManage(admin, yswsId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!SLACK_RE.test(slackId)) return NextResponse.json({ error: "Invalid Slack ID format" }, { status: 400 });

  await db
    .insert(yswsMemberships)
    .values({ yswsId, slackId, role })
    .onConflictDoUpdate({ target: [yswsMemberships.yswsId, yswsMemberships.slackId], set: { role } });

  const cachet = await getCachetProfile(slackId);
  const existingUser = await db.query.users.findFirst({ where: eq(users.slackId, slackId) });
  const isSuper = await db.query.platformSuperadmins.findFirst({ where: eq(platformSuperadmins.slackId, slackId) });

  return NextResponse.json(
    {
      slackId,
      name: existingUser?.name ?? cachet.displayName ?? null,
      image: existingUser?.image ?? cachet.imageUrl ?? cachetAvatarUrl(slackId),
      role,
      isSuperadmin: !!isSuper,
      createdAt: new Date().toISOString(),
    },
    { status: 201 },
  );
}

/** Change a member's role. Workspace admins may promote/demote their members. */
export async function PATCH(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const yswsId = typeof body.yswsId === "string" ? body.yswsId : "";
  const slackId = typeof body.slackId === "string" ? body.slackId : "";
  const role = body.role === "admin" ? "admin" : body.role === "member" ? "member" : null;

  if (!yswsId || !slackId) return NextResponse.json({ error: "yswsId and slackId required" }, { status: 400 });
  if (!role) return NextResponse.json({ error: "role must be 'member' or 'admin'" }, { status: 400 });
  if (!canManage(admin, yswsId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  // Don't let a workspace admin demote themselves and lock their team out.
  if (slackId === admin.slackId && role === "member" && !admin.isSuperadmin) {
    return NextResponse.json({ error: "You cannot demote yourself" }, { status: 400 });
  }

  const [row] = await db
    .update(yswsMemberships)
    .set({ role })
    .where(and(eq(yswsMemberships.yswsId, yswsId), eq(yswsMemberships.slackId, slackId)))
    .returning();
  if (!row) return NextResponse.json({ error: "Member not found" }, { status: 404 });
  return NextResponse.json({ ok: true, role });
}

/** Remove a member from the workspace. */
export async function DELETE(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const yswsId = typeof body.yswsId === "string" ? body.yswsId : "";
  const slackId = typeof body.slackId === "string" ? body.slackId : "";

  if (!yswsId || !slackId) return NextResponse.json({ error: "yswsId and slackId required" }, { status: 400 });
  if (!canManage(admin, yswsId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (slackId === admin.slackId && !admin.isSuperadmin) {
    return NextResponse.json({ error: "You cannot remove yourself from a workspace you administer" }, { status: 400 });
  }

  await db
    .delete(yswsMemberships)
    .where(and(eq(yswsMemberships.yswsId, yswsId), eq(yswsMemberships.slackId, slackId)));
  return NextResponse.json({ ok: true });
}
