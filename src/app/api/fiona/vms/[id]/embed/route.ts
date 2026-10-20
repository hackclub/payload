import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { vmSessions } from "@/db/schema";
import { fionaCaller, fionaError, fionaWorkspace, issueTicket, LIVE_STATES, payloadUserId } from "@/lib/fiona";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const slackId = fionaCaller(request);
  if (typeof slackId !== "string") return slackId;

  if (!(await fionaWorkspace(slackId))) return fionaError(403, "no_access", "They can't use Payload VMs");

  const { id } = await params;
  const sessionId = Number(id);
  const userId = await payloadUserId(slackId);
  const session = Number.isFinite(sessionId) && userId
    ? await db.query.vmSessions.findFirst({ where: eq(vmSessions.id, sessionId) })
    : undefined;
  if (!session || !userId || session.userId !== userId) return fionaError(404, "not_found", "No such VM");

  const live: readonly string[] = LIVE_STATES;
  if (!live.includes(session.state)) return fionaError(409, "ended", "That VM has ended");

  const ticket = await issueTicket(sessionId, userId);
  return NextResponse.json({ path: `/embed/${sessionId}/start?ticket=${ticket}` });
}
