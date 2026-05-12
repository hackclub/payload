import { NextResponse } from "next/server";
import { db } from "@/db";
import { vmSessions, users } from "@/db/schema";
import { desc, inArray } from "drizzle-orm";
import { getAdminUser } from "@/lib/admin-guard";
import { getCachetProfile, cachetAvatarUrl } from "@/lib/cachet";

export async function GET() {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const allSessions = await db.query.vmSessions.findMany({
    orderBy: desc(vmSessions.createdAt),
    with: { vmType: true },
    limit: 100,
  });

  const allAdmins = await db.query.adminEntries.findMany();
  const adminSlackIds = new Set(allAdmins.map((a) => a.slackId));

  const userIds = [...new Set(allSessions.map((s) => s.userId))];
  const sessionUsers = userIds.length > 0
    ? await db.query.users.findMany({ where: inArray(users.id, userIds) })
    : [];

  const userMap = new Map(sessionUsers.map((u) => [u.id, u]));

  const slackIds = [...new Set(sessionUsers.map((u) => u.slackId).filter(Boolean) as string[])];
  const cachetProfiles = new Map<string, { displayName?: string; imageUrl?: string }>();
  await Promise.all(
    slackIds.map(async (sid) => {
      cachetProfiles.set(sid, await getCachetProfile(sid));
    }),
  );

  const enriched = allSessions.map((s) => {
    const user = userMap.get(s.userId);
    const slackId = user?.slackId ?? null;
    const cachet = slackId ? cachetProfiles.get(slackId) : undefined;

    return {
      id: s.id,
      state: s.state,
      vmType: s.vmType?.slug ?? null,
      vmTypeDisplayName: s.vmType?.displayName ?? null,
      userId: s.userId,
      userName: user?.name ?? cachet?.displayName ?? null,
      userImage: user?.image ?? cachet?.imageUrl ?? (slackId ? cachetAvatarUrl(slackId) : null),
      userSlackId: slackId,
      userIsAdmin: slackId ? adminSlackIds.has(slackId) : false,
      proxmoxVmid: s.proxmoxVmid,
      expiresAt: s.expiresAt,
      lastHeartbeatAt: s.lastHeartbeatAt,
      terminatedAt: s.terminatedAt,
      terminationReason: s.terminationReason,
      createdAt: s.createdAt,
    };
  });

  return NextResponse.json(enriched);
}
