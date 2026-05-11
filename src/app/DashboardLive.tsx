"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

type WatchedSession = {
  id: number;
  state: string;
};

type Props = {
  sessions: WatchedSession[];
};

const TERMINAL_STATES = new Set(["terminated", "errored"]);

/**
 * Subscribes to SSE for each non-terminal session currently shown on the
 * dashboard and calls `router.refresh()` whenever a session's state
 * diverges from what the server rendered, so the dashboard updates
 * without a manual reload.
 */
export default function DashboardLive({ sessions }: Props) {
  const router = useRouter();
  const refreshScheduledRef = useRef(false);

  // Stable key so the effect only re-runs when the watched set actually
  // changes between renders.
  const key = sessions
    .map((s) => `${s.id}:${s.state}`)
    .sort()
    .join(",");

  useEffect(() => {
    const watched = sessions.filter((s) => !TERMINAL_STATES.has(s.state));
    if (watched.length === 0) return;

    const sources: EventSource[] = [];

    const scheduleRefresh = () => {
      if (refreshScheduledRef.current) return;
      refreshScheduledRef.current = true;
      // Small debounce so near-simultaneous events coalesce into one refresh.
      setTimeout(() => {
        refreshScheduledRef.current = false;
        router.refresh();
      }, 200);
    };

    for (const { id, state: renderedState } of watched) {
      const es = new EventSource(`/api/sessions/${id}/events`);

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const nextState: string | undefined = data.state;
          if (!nextState) return;
          if (nextState !== renderedState) {
            scheduleRefresh();
          }
          if (
            data.type === "terminated" ||
            data.type === "errored" ||
            TERMINAL_STATES.has(nextState)
          ) {
            es.close();
          }
        } catch {
          // keepalive or malformed — ignore
        }
      };

      es.onerror = () => {
        // Let the browser auto-reconnect on transient errors.
      };

      sources.push(es);
    }

    return () => {
      for (const es of sources) es.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, router]);

  return null;
}
