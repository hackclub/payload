"use client";

import { XCircle } from "lucide-react";

export function DestroyButton({ modalId }: { modalId: string }) {
  return (
    <button 
      className="bg-transparent border border-transparent hover:border-hc-red/50 text-hc-muted hover:text-hc-red transition-colors flex items-center px-4 py-1.5 rounded text-sm font-bold"
      onClick={() => {
        const dialog = document.getElementById(modalId) as HTMLDialogElement;
        if (dialog) dialog.showModal();
      }}
    >
      <XCircle className="w-4 h-4 mr-1.5" /> Destroy
    </button>
  );
}
