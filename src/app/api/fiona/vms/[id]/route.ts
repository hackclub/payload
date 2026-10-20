import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { vmSessions } from "@/db/schema";
import { fionaCaller, fionaError, payloadUserId } from "@/lib/fiona";
import { enqueueTerminateVm } from "@/lib/queue";

// your own VM, even after losing access
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const slackId = fionaCaller(request);
  if (typeof slackId !== "string") return slackId;

  const { id } = await params;
  const sessionId = Number(id);
  const userId = await payloadUserId(slackId);
  const session = Number.isFinite(sessionId) && userId
    ? await db.query.vmSessions.findFirst({ where: eq(vmSessions.id, sessionId) })
    : undefined;
  if (!session || session.userId !== userId) return fionaError(404, "not_found", "No such VM");

  if (["terminating", "terminated", "errored"].includes(session.state)) {
    return NextResponse.json({ id: sessionId, state: session.state });
  }
  await enqueueTerminateVm({ sessionId, reason: "user" });
  return NextResponse.json({ id: sessionId, state: "terminating" });
}
