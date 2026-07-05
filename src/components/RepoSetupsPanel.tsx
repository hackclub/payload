"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { dismissRepoSetup } from "@/app/page-actions";

export type RepoSetupView = {
  id: number;
  repoUrl: string;
  status: "pending" | "analyzing" | "analyzed" | "running" | "done" | "failed";
  error: string | null;
  vmSessionId: number | null;
};

const STATUS_INFO: Record<RepoSetupView["status"], { label: string; color: string; active: boolean }> = {
  pending: { label: "Queued", color: "text-hc-yellow", active: true },
  analyzing: { label: "AI is analyzing the repo…", color: "text-hc-purple", active: true },
  analyzed: { label: "Launching VM…", color: "text-hc-yellow", active: true },
  running: { label: "Running setup on the VM…", color: "text-hc-cyan", active: true },
  done: { label: "Setup complete", color: "text-hc-green", active: false },
  failed: { label: "Setup failed", color: "text-hc-red", active: false },
};

const POLL_INTERVAL_MS = 5_000;

/**
 * In-flight "Review a Repo" requests. The AI phase has no session (and thus no
 * SSE channel) to subscribe to, so while any setup is non-terminal this simply
 * refreshes the dashboard every few seconds.
 */
export default function RepoSetupsPanel({ setups }: { setups: RepoSetupView[] }) {
  const router = useRouter();
  const hasActive = setups.some((s) => STATUS_INFO[s.status].active);

  useEffect(() => {
    if (!hasActive) return;
    const timer = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [hasActive, router]);

  if (setups.length === 0) return null;

  return (
    <div className="space-y-3">
      {setups.map((setup) => {
        const info = STATUS_INFO[setup.status];
        return (
          <div
            key={setup.id}
            className="bg-hc-dark rounded-hc border border-hc-darkless p-4 shadow-sm flex flex-col sm:flex-row sm:items-center gap-3"
          >
            <div className="flex-1 min-w-0">
              <p className="text-hc-snow font-semibold truncate">{shortRepoName(setup.repoUrl)}</p>
              <p className={`text-sm font-medium ${info.color} flex items-center gap-2`}>
                {info.active && (
                  <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse shrink-0"></span>
                )}
                {info.label}
              </p>
              {setup.status === "failed" && setup.error && (
                <p className="text-hc-muted text-xs mt-1 break-words">{setup.error}</p>
              )}
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {setup.vmSessionId !== null && setup.status !== "failed" && (
                <Link
                  href={`/sessions/${setup.vmSessionId}`}
                  className="bg-hc-cyan/10 hover:bg-hc-cyan/20 text-hc-cyan border border-hc-cyan/30 font-bold text-sm py-2 px-4 rounded-hc transition-colors"
                >
                  Open session
                </Link>
              )}
              {!info.active && (
                <button
                  onClick={() => dismissRepoSetup(setup.id)}
                  className="text-hc-muted hover:text-hc-smoke text-sm font-bold py-2 px-2"
                  title="Dismiss"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function shortRepoName(url: string): string {
  try {
    const path = new URL(url).pathname.replace(/\.git$/, "").replace(/^\/+|\/+$/g, "");
    return path || url;
  } catch {
    return url;
  }
}
