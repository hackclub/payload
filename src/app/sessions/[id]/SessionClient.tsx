"use client";

import { useEffect, useState, useRef } from "react";
import { Clock, ArrowLeft, AlertTriangle } from "lucide-react";
import Link from "next/link";

type SessionClientProps = {
  sessionId: number;
  initialState: string;
  vmTypeName: string;
  expiresAt: string;
  terminationReason?: string;
};

const STATE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: "Starting...", color: "text-hc-yellow", bg: "bg-hc-yellow/10 border-hc-yellow/20" },
  provisioning: { label: "Provisioning...", color: "text-hc-yellow", bg: "bg-hc-yellow/10 border-hc-yellow/20" },
  ready: { label: "Ready", color: "text-hc-green", bg: "bg-hc-green/10 border-hc-green/20" },
  active: { label: "Running", color: "text-hc-green", bg: "bg-hc-green/10 border-hc-green/20" },
  terminating: { label: "Terminating...", color: "text-hc-orange", bg: "bg-hc-orange/10 border-hc-orange/20" },
  terminated: { label: "Ended", color: "text-hc-muted", bg: "bg-hc-darker border-hc-darkless" },
  errored: { label: "Error", color: "text-hc-red", bg: "bg-hc-red/10 border-hc-red/20" },
};

export default function SessionClient({
  sessionId,
  initialState,
  vmTypeName,
  expiresAt,
  terminationReason,
}: SessionClientProps) {
  const [state, setState] = useState(initialState);
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState("");
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // SSE listener
  useEffect(() => {
    const eventSource = new EventSource(`/api/sessions/${sessionId}/events`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.state) {
          setState(data.state);
        }
        if (data.type === "terminated" || data.type === "errored" || data.state === "terminated" || data.state === "errored") {
          eventSource.close();
        }
      } catch {
        // keepalive or malformed, ignore
      }
    };

    eventSource.onerror = () => {
      // Do NOT call close() here — the browser auto-reconnects on transient errors.
      // Terminal states (terminated/errored) are handled in onmessage above.
      // If the server intentionally closed the stream, onmessage already called close().
    };

    return () => {
      eventSource.close();
    };
  }, [sessionId]);

  // Iframe token fetch - triggered by SSE state changes
  const iframeFetchedRef = useRef(false);

  useEffect(() => {
    if ((state === "ready" || state === "active") && !iframeFetchedRef.current) {
      iframeFetchedRef.current = true;
      fetch(`/api/sessions/${sessionId}/guac-token`, { method: "POST" })
        .then((res) => res.ok ? res.json() : null)
        .then((data) => {
          if (data?.iframeUrl) setIframeUrl(data.iframeUrl);
        })
        .catch(() => {});
    }
  }, [state, sessionId]);

  // Heartbeat
  useEffect(() => {
    if (state !== "ready" && state !== "active") {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      return;
    }

    const sendHeartbeat = async () => {
      try {
        await fetch(`/api/sessions/${sessionId}/heartbeat`, { method: "POST" });
      } catch {
        // network error, try again
      }
    };

    sendHeartbeat();
    heartbeatRef.current = setInterval(sendHeartbeat, 30_000);

    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    };
  }, [state, sessionId]);

  // Countdown timer
  useEffect(() => {
    const update = () => {
      const ms = new Date(expiresAt).getTime() - Date.now();
      if (ms <= 0) {
        setTimeRemaining("Expired");
        return;
      }
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      const s = Math.floor((ms % 60_000) / 1000);
      setTimeRemaining(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const info = STATE_LABELS[state] ?? { label: state, color: "text-hc-muted", bg: "bg-hc-darker border-hc-darkless" };
  const isActive = ["ready", "active"].includes(state);
  const isPending = ["pending", "provisioning"].includes(state);
  const isEnded = ["terminated", "errored"].includes(state);

  if (isEnded) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4">
        <div className="bg-hc-dark border border-hc-darkless rounded-hc p-10 max-w-md w-full shadow-lg text-center">
          <AlertTriangle className="w-12 h-12 text-hc-red mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-hc-snow mb-2">Session Ended</h2>
          <p className="text-hc-muted mb-2">
            {state === "errored"
              ? "This session encountered an error and could not continue."
              : terminationReason
                ? `This session was ended: ${terminationReason}`
                : "This session has ended."}
          </p>
          <Link href="/" className="inline-block mt-6 bg-hc-darkless hover:bg-hc-slate text-hc-smoke border border-hc-slate/30 font-bold py-2.5 px-6 rounded transition-colors">
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] space-y-4 animate-in fade-in duration-300">
      <div className="bg-hc-dark border border-hc-darkless rounded-hc p-3 flex flex-col sm:flex-row sm:items-center justify-between shadow-sm gap-4">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-hc-muted hover:text-hc-smoke hover:bg-hc-darkless px-3 py-1.5 rounded transition-colors text-sm font-bold">
            <ArrowLeft className="w-4 h-4 inline mr-1" /> Back
          </Link>
          <div className="w-px h-5 bg-hc-darkless"></div>
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-hc-blue" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
              <line x1="8" y1="21" x2="16" y2="21"></line>
              <line x1="12" y1="17" x2="12" y2="21"></line>
            </svg>
            <span className="font-bold text-sm text-hc-smoke">{vmTypeName}</span>
          </div>
          <span className={`${info.bg} ${info.color} font-bold text-xs px-2.5 py-1 rounded-full border flex items-center gap-1.5 ml-2`}>
            {isActive && <span className="w-1.5 h-1.5 rounded-full bg-hc-green animate-pulse"></span>}
            {info.label}
          </span>
        </div>

        <div className="flex items-center gap-6 self-end sm:self-auto">
          <div className="flex items-center gap-2 text-hc-yellow text-sm font-mono tracking-tight bg-hc-darker px-3 py-1 rounded border border-hc-darkless">
            <Clock className="w-4 h-4" />
            <span>{timeRemaining}</span>
          </div>
          <button
            onClick={async () => {
              if (confirm("Are you sure? All data in this VM will be permanently deleted.")) {
                await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
                // Wait for the SSE "terminated" event before navigating away
                // so the dashboard sees the session as already terminated.
                const terminatedPromise = new Promise<void>((resolve) => {
                  const es = new EventSource(`/api/sessions/${sessionId}/events`);
                  es.onmessage = (evt) => {
                    try {
                      const d = JSON.parse(evt.data);
                      if (d.state === "terminated" || d.type === "terminated") {
                        es.close();
                        resolve();
                      }
                    } catch {}
                  };
                  es.onerror = () => {
                    // Fallback: if SSE fails, navigate after a short delay
                    es.close();
                    setTimeout(resolve, 2000);
                  };
                });
                await terminatedPromise;
                window.location.href = "/";
              }
            }}
            className="bg-transparent border border-transparent hover:border-hc-red/50 text-hc-muted hover:text-hc-red transition-colors flex items-center px-4 py-1.5 rounded text-sm font-bold"
          >
            Destroy
          </button>
        </div>
      </div>

      {/* Iframe / Provisioning area */}
      <div className="flex-1 bg-black rounded-hc overflow-hidden border border-hc-darkless relative shadow-inner">
        {isActive && iframeUrl ? (
          <iframe
            src={iframeUrl}
            className="w-full h-full border-0"
            allow="clipboard-read; clipboard-write"
            title="Remote Desktop"
          />
        ) : isPending ? (
          <div className="absolute inset-0 flex items-center justify-center text-hc-muted">
            <div className="text-center">
              <div className="w-6 h-6 border-2 border-hc-cyan border-t-transparent rounded-full animate-spin mb-3 mx-auto"></div>
              <p className="font-mono text-sm">
                <span className="text-hc-blue">$ </span>
                provisioning your VM...
              </p>
            </div>
          </div>
        ) : state === "terminating" ? (
          <div className="absolute inset-0 flex items-center justify-center text-hc-orange">
            <div className="text-center">
              <div className="w-6 h-6 border-2 border-hc-orange border-t-transparent rounded-full animate-spin mb-3 mx-auto"></div>
              <p className="font-mono text-sm">Terminating session...</p>
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-hc-muted">
            <p className="font-mono text-sm max-w-sm text-center">
              <span className="text-hc-blue">$ </span>
              connecting to session {sessionId}...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}