import { NextResponse } from "next/server";
import { db } from "@/db";
import { platformSuperadmins, users } from "@/db/schema";
import { eq, desc, inArray } from "drizzle-orm";
import { getAdminUser } from "@/lib/admin-guard";
import { getCachetProfile, cachetAvatarUrl } from "@/lib/cachet";

const SLACK_RE = /^U[A-Z0-9]+$/;

/** List platform superadmins. Superadmin only (ADR-0036). */
export async function GET() {
  const admin = await getAdminUser();
  if (!admin || !admin.isSuperadmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entries = await db.query.platformSuperadmins.findMany({ orderBy: desc(platformSuperadmins.createdAt) });
  const slackIds = entries.map((e) => e.slackId);
  const userRows = slackIds.length > 0 ? await db.query.users.findMany({ where: inArray(users.slackId, slackIds) }) : [];
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
        isSelf: e.slackId === admin.slackId,
        createdAt: e.createdAt,
      };
    }),
  );

  return NextResponse.json(enriched);
}

/** Grant platform superadmin. Superadmin only. */
export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin || !admin.isSuperadmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const slackId = typeof body.slackId === "string" ? body.slackId.trim() : "";
  if (!SLACK_RE.test(slackId)) return NextResponse.json({ error: "Invalid Slack ID format" }, { status: 400 });

  await db.insert(platformSuperadmins).values({ slackId }).onConflictDoNothing();

  const cachet = await getCachetProfile(slackId);
  const existingUser = await db.query.users.findFirst({ where: eq(users.slackId, slackId) });

  return NextResponse.json(
    {
      slackId,
      name: existingUser?.name ?? cachet.displayName ?? null,
      image: existingUser?.image ?? cachet.imageUrl ?? cachetAvatarUrl(slackId),
      isSelf: slackId === admin.slackId,
      createdAt: new Date().toISOString(),
    },
    { status: 201 },
  );
}

/** Revoke platform superadmin. You cannot revoke your own, to avoid lockout. */
export async function DELETE(request: Request) {
  const admin = await getAdminUser();
  if (!admin || !admin.isSuperadmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const slackId = typeof body.slackId === "string" ? body.slackId : "";
  if (!slackId) return NextResponse.json({ error: "Slack ID required" }, { status: 400 });
  if (slackId === admin.slackId) return NextResponse.json({ error: "You cannot remove your own superadmin access" }, { status: 400 });

  await db.delete(platformSuperadmins).where(eq(platformSuperadmins.slackId, slackId));
  return NextResponse.json({ ok: true });
}
