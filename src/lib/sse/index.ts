import { redis } from "@/lib/redis";

type SSESubscriber = (event: SSEEvent) => void;

type SSEEvent = {
  type: "ready" | "errored" | "terminating" | "terminated" | "state_change";
  state?: string;
  sessionId: number;
  data?: Record<string, unknown>;
};

const CHANNEL_PREFIX = "sse:session:";

const subscribers = new Map<number, Set<SSESubscriber>>();

const sub = redis.duplicate();
let messageHandlerRegistered = false;

function ensureMessageHandler() {
  if (messageHandlerRegistered) return;
  messageHandlerRegistered = true;

  sub.on("message", (channel: string, message: string) => {
    const sessionId = Number(channel.slice(CHANNEL_PREFIX.length));
    const set = subscribers.get(sessionId);
    if (!set) return;
    let event: SSEEvent;
    try {
      event = JSON.parse(message);
    } catch {
      return;
    }
    for (const cb of set) {
      try {
        cb(event);
      } catch {
        // subscriber may have disconnected
      }
    }
  });
}

export function subscribe(sessionId: number, cb: SSESubscriber): () => void {
  ensureMessageHandler();

  let set = subscribers.get(sessionId);
  if (!set) {
    set = new Set();
    subscribers.set(sessionId, set);
    sub.subscribe(`${CHANNEL_PREFIX}${sessionId}`).catch(() => {});
  }
  set.add(cb);

  return () => {
    set!.delete(cb);
    if (set!.size === 0) {
      subscribers.delete(sessionId);
      sub.unsubscribe(`${CHANNEL_PREFIX}${sessionId}`).catch(() => {});
    }
  };
}

export function publish(event: SSEEvent): void {
  redis
    .publish(`${CHANNEL_PREFIX}${event.sessionId}`, JSON.stringify(event))
    .catch(() => {});
}

export type { SSEEvent, SSESubscriber };
