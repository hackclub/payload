import { NextResponse } from "next/server";
import { db } from "@/db";
import { vmSessionEvents, vmSessions, users, repoSetups } from "@/db/schema";
import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { getAdminUser } from "@/lib/admin-guard";
import { getCachetProfile, cachetAvatarUrl } from "@/lib/cachet";

export async function GET(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? "100"), 1), 500);
  const sessionId = url.searchParams.get("sessionId");
  const filterYsws = url.searchParams.get("yswsId");
  // Warm-pool churn (reconciler warm/claim/terminate events) would drown out —
  // and, via the row limit, crowd out — user session events, so pool events
  // are a separate view: default excludes them, ?pool=1 shows only them.
  const poolOnly = url.searchParams.get("pool") === "1";

  // Resolve which workspaces this admin may read events from. null = all
  // (superadmin, unfiltered). Workspace admins are always restricted, and the
  // warm pool (null ysws_id) is superadmin-only (ADR-0036).
  let scope: string[] | null;
  if (admin.isSuperadmin) {
    scope = filterYsws ? [filterYsws] : null;
  } else {
    scope = filterYsws && admin.adminYswsIds.includes(filterYsws) ? [filterYsws] : admin.adminYswsIds;
    if (scope.length === 0) return NextResponse.json([]);
  }

  // Collect the session ids the admin may see, so events are filtered by
  // workspace. Skipped when scope is null (superadmin, all sessions).
  let scopedSessionIds: number[] | null = null;
  if (scope) {
    const scoped = await db
      .select({ id: vmSessions.id })
      .from(vmSessions)
      .where(inArray(vmSessions.yswsId, scope));
    scopedSessionIds = scoped.map((s) => s.id);
    if (scopedSessionIds.length === 0) return NextResponse.json([]);
  }

  let events;
  if (sessionId) {
    const sid = Number(sessionId);
    if (scopedSessionIds && !scopedSessionIds.includes(sid)) return NextResponse.json([]);
    events = await db.query.vmSessionEvents.findMany({
      where: eq(vmSessionEvents.vmSessionId, sid),
      orderBy: desc(vmSessionEvents.createdAt),
      limit,
    });
  } else {
    // Join to the owning session so events can be split into user vs. pool
    // (pool sessions have null user_id).
    const poolCondition = poolOnly ? isNull(vmSessions.userId) : isNotNull(vmSessions.userId);
    const rows = await db
      .select({ event: vmSessionEvents })
      .from(vmSessionEvents)
      .innerJoin(vmSessions, eq(vmSessionEvents.vmSessionId, vmSessions.id))
      .where(
        scopedSessionIds
          ? and(inArray(vmSessionEvents.vmSessionId, scopedSessionIds), poolCondition)
          : poolCondition,
      )
      .orderBy(desc(vmSessionEvents.createdAt))
      .limit(limit);
    events = rows.map((r) => r.event);
  }

  // AI repo setups ride along in the same feed (one row per setup, stamped
  // with its latest status change). They live in their own table because the
  // analysis phase runs before any VM session exists, so they can't be
  // vm_session_events. Scoped by their own ysws_id; rows whose workspace was
  // deleted (null ysws_id) are superadmin-only, mirroring the pool rule.
  // Excluded from the pool view — setups are user activity.
  let setups: (typeof repoSetups.$inferSelect)[] = [];
  if (!poolOnly) {
    const sid = sessionId ? Number(sessionId) : null;
    const scopeCondition = scope ? inArray(repoSetups.yswsId, scope) : undefined;
    setups = await db.query.repoSetups.findMany({
      where: sid !== null ? and(eq(repoSetups.vmSessionId, sid), scopeCondition) : scopeCondition,
      orderBy: desc(repoSetups.updatedAt),
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

  const userIds = [...new Set([
    ...relatedSessions.map((s) => s.userId).filter((id): id is string => id !== null),
    ...setups.map((s) => s.userId),
  ])];
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
    const isPool = !!session && session.userId === null;

    return {
      id: `e-${e.id}`,
      vmSessionId: e.vmSessionId as number | null,
      kind: e.kind,
      payload: e.payload,
      createdAt: e.createdAt,
      sessionState: session?.state ?? null,
      vmType: session?.vmType?.displayName ?? null,
      userName: isPool ? "Payload" : (user?.name ?? cachet?.displayName ?? null),
      userImage: isPool ? "/payload-avatar.svg" : (user?.image ?? cachet?.imageUrl ?? (slackId ? cachetAvatarUrl(slackId) : null)),
    };
  });

  const setupRows = setups.map((s) => {
    const user = userMap.get(s.userId);
    const slackId = user?.slackId ?? null;
    const cachet = slackId ? cachetProfiles.get(slackId) : undefined;

    return {
      id: `s-${s.id}`,
      vmSessionId: s.vmSessionId,
      kind: "ai_repo_setup",
      payload: { repo: s.repoUrl, ...(s.error ? { error: s.error } : {}) } as Record<string, unknown>,
      createdAt: s.updatedAt,
      // The setup status renders in the same colored slot as a session state.
      sessionState: s.status,
      vmType: "AI Setup",
      userName: user?.name ?? cachet?.displayName ?? null,
      userImage: user?.image ?? cachet?.imageUrl ?? (slackId ? cachetAvatarUrl(slackId) : null),
    };
  });

  const merged = [...enriched, ...setupRows]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);

  return NextResponse.json(merged);
}
