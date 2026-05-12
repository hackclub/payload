import { NextResponse } from "next/server";
import { db } from "@/db";
import { vmSessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAdminUser } from "@/lib/admin-guard";
import { enqueueTerminateVm } from "@/lib/queue";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const sessionId = Number(id);
  if (!Number.isFinite(sessionId)) {
    return NextResponse.json({ error: "Invalid session ID" }, { status: 400 });
  }

  const session = await db.query.vmSessions.findFirst({
    where: eq(vmSessions.id, sessionId),
  });

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (["terminating", "terminated"].includes(session.state)) {
    return NextResponse.json({ error: "Session already terminated or terminating" }, { status: 409 });
  }

  await enqueueTerminateVm({ sessionId, reason: "admin" });

  return NextResponse.json({ id: sessionId, state: "terminating" });
}
