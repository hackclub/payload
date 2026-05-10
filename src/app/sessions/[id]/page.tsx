import { auth } from "@/auth";
import { db } from "@/db";
import { vmSessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import SessionClient from "./SessionClient";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/");

  const { id } = await params;
  const sessionId = Number(id);
  if (!Number.isFinite(sessionId)) redirect("/");

  const vmSession = await db.query.vmSessions.findFirst({
    where: eq(vmSessions.id, sessionId),
    with: { vmType: true },
  });

  if (!vmSession || vmSession.userId !== session.user.id) {
    redirect("/");
  }

  const state = vmSession.state;
  const vmTypeName = vmSession.vmType?.displayName ?? "VM";

  return (
    <SessionClient
      sessionId={sessionId}
      initialState={state}
      vmTypeName={vmTypeName}
      expiresAt={vmSession.expiresAt.toISOString()}
      terminationReason={vmSession.terminationReason ?? undefined}
    />
  );
}