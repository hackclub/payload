import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { vmSessions } from "@/db/schema";
import { embedUserId } from "@/lib/fiona";
import { fionaOrigins } from "@/lib/fiona-origins";
import SessionClient from "@/app/sessions/[id]/SessionClient";
import EmbedGone from "./EmbedGone";

export const metadata: Metadata = { robots: { index: false } };

// only the cookie from /start gets in, a signed-in Payload session has /sessions/[id]
export default async function EmbedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sessionId = Number(id);
  const userId = Number.isFinite(sessionId) ? await embedUserId(sessionId) : null;
  const vmSession = userId
    ? await db.query.vmSessions.findFirst({ where: eq(vmSessions.id, sessionId), with: { vmType: true } })
    : undefined;

  if (!vmSession || vmSession.userId !== userId) {
    return <EmbedGone sessionId={Number.isFinite(sessionId) ? sessionId : 0} origins={fionaOrigins} />;
  }

  return (
    <SessionClient
      sessionId={sessionId}
      initialState={vmSession.state}
      vmTypeName={vmSession.vmType?.displayName ?? "VM"}
      vmIcon={vmSession.vmType?.iconUrl ?? null}
      expiresAt={vmSession.expiresAt?.toISOString() ?? null}
      terminationReason={vmSession.terminationReason ?? undefined}
      embedOrigins={fionaOrigins}
    />
  );
}
