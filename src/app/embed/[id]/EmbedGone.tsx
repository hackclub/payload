"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { postToFiona } from "@/lib/embed-messages";

export default function EmbedGone({ sessionId, origins }: { sessionId: number; origins: string[] }) {
  useEffect(() => {
    postToFiona(origins, { sessionId, state: "gone", expiresAt: null });
  }, [sessionId, origins]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black px-4">
      <div className="max-w-sm text-center">
        <AlertTriangle className="w-10 h-10 text-hc-red mx-auto mb-4" />
        <p className="text-lg font-bold text-hc-snow mb-2">This window can&apos;t show the VM anymore</p>
        <p className="text-hc-muted">Close it and open the VM again from the Payload menu in fiona.</p>
      </div>
    </div>
  );
}
