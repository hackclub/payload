import { NextResponse } from "next/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { platformSuperadmins, users, vmSessions, yswsMemberships } from "@/db/schema";
import { env } from "@/env";
import { fionaCaller, fionaError, fionaWorkspace, fionaWorkspaceId, LIVE_STATES } from "@/lib/fiona";
import { enqueueTerminateVm } from "@/lib/queue";

const noWorkspace = () => fionaError(503, "no_workspace", `Payload has no ${env.FIONA_WORKSPACE} workspace`);

async function roleIn(workspaceId: string, slackId: string) {
  const row = await db.query.yswsMemberships.findFirst({
    where: and(eq(yswsMemberships.yswsId, workspaceId), eq(yswsMemberships.slackId, slackId)),
    columns: { role: true },
  });
  return row?.role ?? null;
}

// X-Slack-Id here is the person being added or removed
export async function PUT(request: Request) {
  const slackId = fionaCaller(request);
  if (typeof slackId !== "string") return slackId;

  const workspaceId = await fionaWorkspaceId();
  if (!workspaceId) return noWorkspace();

  const [added] = await db
    .insert(yswsMemberships)
    .values({ yswsId: workspaceId, slackId, role: "member" })
    .onConflictDoNothing()
    .returning({ role: yswsMemberships.role });

  return NextResponse.json({
    access: !!(await fionaWorkspace(slackId)),
    role: added?.role ?? (await roleIn(workspaceId, slackId)),
    added: !!added,
  });
}

export async function DELETE(request: Request) {
  const slackId = fionaCaller(request);
  if (typeof slackId !== "string") return slackId;

  const workspaceId = await fionaWorkspaceId();
  if (!workspaceId) return noWorkspace();

  const removed = await db
    .delete(yswsMemberships)
    .where(
      and(
        eq(yswsMemberships.yswsId, workspaceId),
        eq(yswsMemberships.slackId, slackId),
        eq(yswsMemberships.role, "member"),
      ),
    )
    .returning({ slackId: yswsMemberships.slackId });
  if (removed.length === 0 && (await roleIn(workspaceId, slackId)) === "admin") {
    return fionaError(409, "admin", "They're an admin of the Payload workspace, remove them in Payload");
  }

  const superadmin = await db.query.platformSuperadmins.findFirst({ where: eq(platformSuperadmins.slackId, slackId) });
  // after the delete, so a VM started meanwhile is caught here or by the start route's re-check
  const live = superadmin
    ? []
    : await db
        .select({ id: vmSessions.id })
        .from(vmSessions)
        .innerJoin(users, eq(users.id, vmSessions.userId))
        .where(
          and(
            eq(users.slackId, slackId),
            eq(vmSessions.yswsId, workspaceId),
            inArray(vmSessions.state, [...LIVE_STATES]),
          ),
        )
        .orderBy(asc(vmSessions.id));
  for (const vm of live) await enqueueTerminateVm({ sessionId: vm.id, reason: "revoked" });

  return NextResponse.json({
    access: !!(await fionaWorkspace(slackId)),
    removed: removed.length > 0,
    ended: live.map((vm) => vm.id),
  });
}
