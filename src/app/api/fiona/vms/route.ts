import { NextResponse } from "next/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { vmSessions, vmTypes } from "@/db/schema";
import { ensurePayloadUser, fionaCaller, fionaError, fionaWorkspace, LIVE_STATES, payloadUserId } from "@/lib/fiona";
import { MAX_SESSIONS_PER_USER } from "@/lib/queue";
import { CapacityError, createUserSession, UserCapError, YswsCapError } from "@/lib/sessions";

export async function GET(request: Request) {
  const slackId = fionaCaller(request);
  if (typeof slackId !== "string") return slackId;

  const workspaceId = await fionaWorkspace(slackId);
  if (!workspaceId) {
    return NextResponse.json({ access: false, limit: MAX_SESSIONS_PER_USER, types: [], vms: [] });
  }

  const types = await db
    .select({
      slug: vmTypes.slug,
      name: vmTypes.displayName,
      description: vmTypes.description,
      iconUrl: vmTypes.iconUrl,
      heavy: vmTypes.expensive,
    })
    .from(vmTypes)
    .where(eq(vmTypes.enabled, true))
    .orderBy(asc(vmTypes.id));

  const userId = await payloadUserId(slackId);
  const vms = userId
    ? await db
        .select({
          id: vmSessions.id,
          type: vmTypes.slug,
          name: vmTypes.displayName,
          state: vmSessions.state,
          expiresAt: vmSessions.expiresAt,
        })
        .from(vmSessions)
        .innerJoin(vmTypes, eq(vmTypes.id, vmSessions.vmTypeId))
        .where(and(eq(vmSessions.userId, userId), inArray(vmSessions.state, [...LIVE_STATES])))
        .orderBy(asc(vmSessions.id))
    : [];

  return NextResponse.json({ access: true, limit: MAX_SESSIONS_PER_USER, types, vms });
}

const startBody = z.object({
  type: z.string().min(1).max(64),
  name: z.string().max(100).nullish(),
  avatar: z.string().url().max(2000).nullish(),
});

export async function POST(request: Request) {
  const slackId = fionaCaller(request);
  if (typeof slackId !== "string") return slackId;

  const body = startBody.safeParse(await request.json().catch(() => null));
  if (!body.success) return fionaError(400, "bad_request", "Expected { type, name?, avatar? }");

  const workspaceId = await fionaWorkspace(slackId);
  if (!workspaceId) return fionaError(403, "no_access", "They can't start Payload VMs");

  const type = await db.query.vmTypes.findFirst({
    where: and(eq(vmTypes.slug, body.data.type), eq(vmTypes.enabled, true)),
  });
  if (!type) return fionaError(400, "bad_type", "That VM type doesn't exist or is turned off");

  const userId = await ensurePayloadUser(slackId, body.data.name ?? null, body.data.avatar ?? null);
  try {
    const vm = await createUserSession(userId, type.slug, workspaceId);
    return NextResponse.json(
      { id: vm.id, type: type.slug, name: type.displayName, state: vm.state, expiresAt: vm.expiresAt },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof UserCapError) return fionaError(409, "user_cap", error.message);
    if (error instanceof YswsCapError) return fionaError(429, "workspace_cap", error.message);
    if (error instanceof CapacityError) return fionaError(503, "full", error.message);
    throw error;
  }
}
