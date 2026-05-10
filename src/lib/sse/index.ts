type SSESubscriber = (event: SSEEvent) => void;

type SSEEvent = {
  type: "ready" | "errored" | "terminating" | "terminated" | "state_change";
  sessionId: number;
  data?: Record<string, unknown>;
};

const subscribers = new Map<number, Set<SSESubscriber>>();

export function subscribe(sessionId: number, cb: SSESubscriber): () => void {
  let set = subscribers.get(sessionId);
  if (!set) {
    set = new Set();
    subscribers.set(sessionId, set);
  }
  set.add(cb);
  return () => {
    set!.delete(cb);
    if (set!.size === 0) {
      subscribers.delete(sessionId);
    }
  };
}

export function publish(event: SSEEvent): void {
  const set = subscribers.get(event.sessionId);
  if (!set) return;
  for (const cb of set) {
    try {
      cb(event);
    } catch {
      // subscriber may have disconnected
    }
  }
}

export type { SSEEvent, SSESubscriber };