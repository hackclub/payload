import { NextResponse } from "next/server";
import { db } from "@/db";
import { vmSessions, users, platformSuperadmins } from "@/db/schema";
import { desc, inArray, sql } from "drizzle-orm";
import { getAdminUser } from "@/lib/admin-guard";
import { getCachetProfile, cachetAvatarUrl } from "@/lib/cachet";

export async function GET(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Scope: superadmins see everything (optionally filtered to one workspace via
  // ?yswsId); workspace admins see only VMs in the workspaces they administer.
  // The warm pool is ownerless (null ysws_id) and global infra, so only
  // superadmins ever see it (ADR-0036).
  const filterYsws = new URL(request.url).searchParams.get("yswsId");
  let scope: string[] | null;
  if (admin.isSuperadmin) {
    scope = filterYsws ? [filterYsws] : null; // null = no restriction
  } else {
    scope = filterYsws && admin.adminYswsIds.includes(filterYsws) ? [filterYsws] : admin.adminYswsIds;
    if (scope.length === 0) return NextResponse.json([]);
  }

  // Sort by when a session was actually claimed/used, falling back to created_at
  // for still-warm/cold rows (see the warm-pool ordering note in ADR-0033).
  const allSessions = await db.query.vmSessions.findMany({
    where: scope ? inArray(vmSessions.yswsId, scope) : undefined,
    orderBy: desc(sql`coalesce(${vmSessions.claimedAt}, ${vmSessions.createdAt})`),
    with: { vmType: true, ysws: true },
    limit: 100,
  });

  const userIds = [...new Set(allSessions.map((s) => s.userId).filter((id): id is string => id !== null))];
  const sessionUsers = userIds.length > 0
    ? await db.query.users.findMany({ where: inArray(users.id, userIds) })
    : [];
  const userMap = new Map(sessionUsers.map((u) => [u.id, u]));

  const slackIds = [...new Set(sessionUsers.map((u) => u.slackId).filter(Boolean) as string[])];
  const superRows = slackIds.length > 0
    ? await db.select({ slackId: platformSuperadmins.slackId }).from(platformSuperadmins).where(inArray(platformSuperadmins.slackId, slackIds))
    : [];
  const superSet = new Set(superRows.map((s) => s.slackId));

  const cachetProfiles = new Map<string, { displayName?: string; imageUrl?: string }>();
  await Promise.all(slackIds.map(async (sid) => {
    cachetProfiles.set(sid, await getCachetProfile(sid));
  }));

  const enriched = allSessions.map((s) => {
    const user = s.userId ? userMap.get(s.userId) : undefined;
    const slackId = user?.slackId ?? null;
    const cachet = slackId ? cachetProfiles.get(slackId) : undefined;
    const isPool = s.userId === null;

    return {
      id: s.id,
      state: s.state,
      vmType: s.vmType?.slug ?? null,
      vmTypeDisplayName: s.vmType?.displayName ?? null,
      yswsId: s.yswsId,
      yswsName: s.ysws?.name ?? (isPool ? "Warm pool" : null),
      userId: s.userId,
      userName: isPool ? "Payload" : (user?.name ?? cachet?.displayName ?? null),
      userImage: isPool ? "/payload-avatar.svg" : (user?.image ?? cachet?.imageUrl ?? (slackId ? cachetAvatarUrl(slackId) : null)),
      userSlackId: slackId,
      userIsAdmin: slackId ? superSet.has(slackId) : false,
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
