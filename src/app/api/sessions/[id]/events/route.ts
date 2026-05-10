import { NextResponse } from "next/server";
import { db } from "@/db";
import { vmSessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAllowlistedUser } from "@/lib/auth-guard";
import { subscribe, type SSEEvent } from "@/lib/sse";

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
  });

  if (!session || session.userId !== authResult.userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const send = (event: SSEEvent | { type: string; state: string; sessionId: number }) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      // Send initial state
      send({ type: "state_change", state: session.state, sessionId });

      // Close if already terminated
      if (session.state === "terminated" || session.state === "errored") {
        controller.close();
        return;
      }

      const unsubscribe = subscribe(sessionId, (event) => {
        send(event);
        if (event.type === "terminated" || event.type === "errored") {
          unsubscribe();
          controller.close();
        }
      });

      // Cleanup on client disconnect
      const interval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: keepalive\n\n`));
        } catch {
          unsubscribe();
          clearInterval(interval);
        }
      }, 15_000);

      // We rely on the AbortSignal to clean up
      _request.signal.addEventListener("abort", () => {
        unsubscribe();
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}