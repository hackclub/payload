import { NextResponse } from "next/server";
import { db } from "@/db";
import { vmSessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAllowlistedUser } from "@/lib/auth-guard";

export async function POST(
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

  if (!["pending", "provisioning", "ready", "active"].includes(session.state)) {
    return NextResponse.json({ error: "Session not active" }, { status: 400 });
  }

  // First heartbeat transitions ready -> active
  const newState = session.state === "ready" ? "active" : session.state;

  await db
    .update(vmSessions)
    .set({
      state: newState,
      lastHeartbeatAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(vmSessions.id, sessionId));

  return NextResponse.json({ id: sessionId, state: newState });
}