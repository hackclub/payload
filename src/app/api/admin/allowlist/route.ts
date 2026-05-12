import { NextResponse } from "next/server";
import { db } from "@/db";
import { reviewerAllowlistEntries, users } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getAdminUser } from "@/lib/admin-guard";
import { getCachetProfile, cachetAvatarUrl } from "@/lib/cachet";

export async function GET() {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entries = await db.query.reviewerAllowlistEntries.findMany({
    orderBy: desc(reviewerAllowlistEntries.createdAt),
  });

  const allAdmins = await db.query.adminEntries.findMany();
  const adminSlackIds = new Set(allAdmins.map((a) => a.slackId));

  const allUsers = await db.query.users.findMany();

  const usersBySlackId = new Map<string, { name: string | null; image: string | null }>();
  for (const u of allUsers) {
    if (u.slackId) usersBySlackId.set(u.slackId, { name: u.name, image: u.image });
  }

  const enriched = await Promise.all(
    entries.map(async (e) => {
      const dbUser = usersBySlackId.get(e.slackId);
      const cachet = await getCachetProfile(e.slackId);
      return {
        slackId: e.slackId,
        name: dbUser?.name ?? cachet.displayName ?? null,
        image: dbUser?.image ?? cachet.imageUrl ?? cachetAvatarUrl(e.slackId),
        isAdmin: adminSlackIds.has(e.slackId),
        createdAt: e.createdAt,
      };
    }),
  );

  return NextResponse.json(enriched);
}

export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const slackId = body.slackId as string | undefined;
  if (!slackId || !/^U[A-Z0-9]+$/.test(slackId)) {
    return NextResponse.json({ error: "Invalid Slack ID format" }, { status: 400 });
  }

  await db.insert(reviewerAllowlistEntries).values({ slackId }).onConflictDoNothing();

  const cachet = await getCachetProfile(slackId);
  const existingUser = await db.query.users.findFirst({
    where: eq(users.slackId, slackId),
  });

  return NextResponse.json({
    slackId,
    name: existingUser?.name ?? cachet.displayName ?? null,
    image: existingUser?.image ?? cachet.imageUrl ?? cachetAvatarUrl(slackId),
    isAdmin: false,
    createdAt: new Date().toISOString(),
  }, { status: 201 });
}

export async function DELETE(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const slackId = body.slackId as string | undefined;
  if (!slackId) return NextResponse.json({ error: "Slack ID required" }, { status: 400 });

  if (slackId === admin.slackId) {
    return NextResponse.json({ error: "Cannot remove yourself from the allowlist" }, { status: 400 });
  }

  await db.delete(reviewerAllowlistEntries).where(eq(reviewerAllowlistEntries.slackId, slackId));

  return NextResponse.json({ ok: true });
}
