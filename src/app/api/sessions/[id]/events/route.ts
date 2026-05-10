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

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let initialSent = false;

      const send = (event: SSEEvent | { type: string; state: string; sessionId: number }) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // stream closed
        }
      };

      // Subscribe FIRST via Redis pub/sub to avoid losing events
      // published between the DB read and subscribe (race condition).
      const unsubscribe = subscribe(sessionId, (event) => {
        if (initialSent) {
          send(event);
          if (event.type === "terminated" || event.type === "errored") {
            unsubscribe();
            clearInterval(interval);
            try { controller.close(); } catch { /* ignore */ }
          }
        }
      });

      const interval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          unsubscribe();
          clearInterval(interval);
        }
      }, 15_000);

      const teardown = () => {
        unsubscribe();
        clearInterval(interval);
        try { controller.close(); } catch { /* ignore */ }
      };

      _request.signal.addEventListener("abort", teardown);

      // Now read the DB — any event published between subscribe and this
      // read arrives via Redis and is buffered until initialSent is true.
      const session = await db.query.vmSessions.findFirst({
        where: eq(vmSessions.id, sessionId),
      });

      if (!session || session.userId !== authResult.userId) {
        teardown();
        return;
      }

      send({ type: "state_change", state: session.state, sessionId });
      initialSent = true;

      if (session.state === "terminated" || session.state === "errored") {
        teardown();
        return;
      }
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
