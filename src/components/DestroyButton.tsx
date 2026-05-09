"use client";

import { XCircle } from "lucide-react";

export function DestroyButton({ modalId }: { modalId: string }) {
  return (
    <button 
      className="btn btn-sm btn-error text-error-content"
      onClick={() => {
        const dialog = document.getElementById(modalId) as HTMLDialogElement;
        if (dialog) dialog.showModal();
      }}
    >
      <XCircle className="w-4 h-4 mr-1" /> Destroy
    </button>
  );
}
