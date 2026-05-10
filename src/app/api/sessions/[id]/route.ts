import { NextResponse } from "next/server";
import { db } from "@/db";
import { vmSessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAllowlistedUser } from "@/lib/auth-guard";
import { enqueueTerminateVm } from "@/lib/queue";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await getAllowlistedUser();
  if (!authResult) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const sessionId = Number(id);
  if (!Number.isFinite(sessionId)) {
    return NextResponse.json({ error: "Invalid session ID" }, { status: 400 });
  }

  const session = await db.query.vmSessions.findFirst({
    where: eq(vmSessions.id, sessionId),
    with: { vmType: true },
  });

  if (!session || session.userId !== authResult.userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(session);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await getAllowlistedUser();
  if (!authResult) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const sessionId = Number(id);
  if (!Number.isFinite(sessionId)) {
    return NextResponse.json({ error: "Invalid session ID" }, { status: 400 });
  }

  const session = await db.query.vmSessions.findFirst({
    where: eq(vmSessions.id, sessionId),
  });

  if (!session || session.userId !== authResult.userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (["terminating", "terminated"].includes(session.state)) {
    return NextResponse.json({ error: "Session already terminating or terminated" }, { status: 409 });
  }

  await enqueueTerminateVm({ sessionId, reason: "user" });

  return NextResponse.json({ id: sessionId, state: "terminating" });
}