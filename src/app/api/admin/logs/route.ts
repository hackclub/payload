import { NextResponse } from "next/server";
import { db } from "@/db";
import { vmSessionEvents, vmSessions, users } from "@/db/schema";
import { desc, eq, inArray } from "drizzle-orm";
import { getAdminUser } from "@/lib/admin-guard";
import { getCachetProfile, cachetAvatarUrl } from "@/lib/cachet";

export async function GET(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? "100"), 1), 500);
  const sessionId = url.searchParams.get("sessionId");

  let events;
  if (sessionId) {
    events = await db.query.vmSessionEvents.findMany({
      where: eq(vmSessionEvents.vmSessionId, Number(sessionId)),
      orderBy: desc(vmSessionEvents.createdAt),
      limit,
    });
  } else {
    events = await db.query.vmSessionEvents.findMany({
      orderBy: desc(vmSessionEvents.createdAt),
      limit,
    });
  }

  const sessionIds = [...new Set(events.map((e) => e.vmSessionId))];
  const relatedSessions = sessionIds.length > 0
    ? await db.query.vmSessions.findMany({
        where: inArray(vmSessions.id, sessionIds),
        columns: { id: true, userId: true, vmTypeId: true, state: true },
        with: { vmType: { columns: { slug: true, displayName: true } } },
      })
    : [];

  const sessionMap = new Map(relatedSessions.map((s) => [s.id, s]));

  // Warm-pool sessions are ownerless (null userId); drop those before lookup.
  const userIds = [...new Set(relatedSessions.map((s) => s.userId).filter((id): id is string => id !== null))];
  const sessionUsers = userIds.length > 0
    ? await db.query.users.findMany({ where: inArray(users.id, userIds) })
    : [];
  const userMap = new Map(sessionUsers.map((u) => [u.id, u]));

  const slackIds = [...new Set(sessionUsers.map((u) => u.slackId).filter(Boolean) as string[])];
  const cachetProfiles = new Map<string, { displayName?: string; imageUrl?: string }>();
  await Promise.all(slackIds.map(async (sid) => {
    cachetProfiles.set(sid, await getCachetProfile(sid));
  }));

  const enriched = events.map((e) => {
    const session = sessionMap.get(e.vmSessionId);
    const user = session?.userId ? userMap.get(session.userId) : undefined;
    const slackId = user?.slackId ?? null;
    const cachet = slackId ? cachetProfiles.get(slackId) : undefined;

    return {
      id: e.id,
      vmSessionId: e.vmSessionId,
      kind: e.kind,
      payload: e.payload,
      createdAt: e.createdAt,
      sessionState: session?.state ?? null,
      vmType: session?.vmType?.displayName ?? null,
      userName: user?.name ?? cachet?.displayName ?? null,
      userImage: user?.image ?? cachet?.imageUrl ?? (slackId ? cachetAvatarUrl(slackId) : null),
    };
  });

  return NextResponse.json(enriched);
}
