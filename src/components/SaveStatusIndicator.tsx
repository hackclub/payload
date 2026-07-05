"use client";

import { Check, Loader2, AlertCircle } from "lucide-react";
import type { SaveStatus } from "@/lib/useAutosave";

/** Small inline autosave status shown where a Save button used to be. */
export default function SaveStatusIndicator({
  status,
  onRetry,
}: {
  status: SaveStatus;
  onRetry?: () => void;
}) {
  if (status === "idle") return null;

  if (status === "pending" || status === "saving") {
    return (
      <span className="inline-flex items-center gap-1.5 text-hc-muted text-sm">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Saving…
      </span>
    );
  }

  if (status === "saved") {
    return (
      <span className="inline-flex items-center gap-1.5 text-hc-green text-sm">
        <Check className="w-3.5 h-3.5" />
        Saved
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-hc-red text-sm">
      <AlertCircle className="w-3.5 h-3.5" />
      Couldn&apos;t save
      {onRetry && (
        <button type="button" onClick={onRetry} className="underline hover:text-hc-snow">
          Retry
        </button>
      )}
    </span>
  );
}
