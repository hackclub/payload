import { NextResponse } from "next/server";
import { db } from "@/db";
import { vmSessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAllowlistedUser } from "@/lib/auth-guard";
import { decrypt } from "@/lib/crypto";
import { createGuacamoleClient, getGuacamoleConfig } from "@/lib/guacamole/config";

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

  if (!["ready", "active"].includes(session.state)) {
    return NextResponse.json({ error: "Session not ready" }, { status: 400 });
  }

  if (!session.guacamoleUsername || !session.guacamolePasswordCiphertext || !session.guacamoleConnectionId) {
    return NextResponse.json({ error: "Session missing Guacamole data" }, { status: 400 });
  }

  const guacamolePassword = decrypt(session.guacamolePasswordCiphertext);
  const guacConfig = getGuacamoleConfig();
  const guac = createGuacamoleClient(guacConfig);

  const auth = await guac.issueToken(session.guacamoleUsername, guacamolePassword);

  const iframeUrl = guac.buildIframeUrl({
    publicBaseUrl: guacConfig.publicBaseUrl,
    connectionIdentifier: session.guacamoleConnectionId,
    token: auth.authToken,
  });

  return NextResponse.json({ token: auth.authToken, iframeUrl });
}