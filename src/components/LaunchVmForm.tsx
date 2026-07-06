"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { launchVm } from "@/app/page-actions";

interface LaunchVmFormProps {
  vmTypeSlug: string;
  isExpensive: boolean;
  vmDisplayName: string;
  children: React.ReactNode;
}

export default function LaunchVmForm({ vmTypeSlug, isExpensive, vmDisplayName, children }: LaunchVmFormProps) {
  const router = useRouter();
  const [showWarning, setShowWarning] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = (e: React.MouseEvent) => {
    if (isExpensive && !showWarning) {
      e.preventDefault();
      setShowWarning(true);
      return;
    }
    // If not expensive, proceed with launch
    handleLaunch();
  };

  const handleLaunch = async () => {
    setIsPending(true);
    setError(null);
    try {
      const result = await launchVm(vmTypeSlug);
      if ("error" in result) {
        setError(result.error);
        setIsPending(false);
      } else {
        // Keep the button disabled while the router navigates.
        router.push(`/sessions/${result.sessionId}`);
      }
    } catch (error) {
      console.error("Failed to launch VM:", error);
      setError("VM brokey. Please try again.");
      setIsPending(false);
    }
  };

  const handleConfirm = () => {
    setShowWarning(false);
    handleLaunch();
  };

  const handleCancel = () => {
    setShowWarning(false);
  };

  return (
    <>
      <button
        onClick={handleClick}
        disabled={isPending}
        className="text-left w-full bg-hc-dark hover:bg-[#1a1c23] border border-hc-darkless hover:border-hc-cyan/50 p-6 rounded-hc transition-all duration-200 group h-full flex flex-col shadow-sm disabled:opacity-50"
      >
        {children}
      </button>

      {error && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-md w-[calc(100%-2rem)] bg-hc-dark border border-hc-red/40 rounded-hc shadow-2xl p-4 flex items-start gap-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <svg className="w-5 h-5 text-hc-red shrink-0 mt-0.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <p className="text-hc-smoke text-sm leading-relaxed flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-hc-muted hover:text-hc-smoke text-sm font-bold shrink-0">✕</button>
        </div>
      )}

      {showWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 m-0">
          <div className="bg-hc-dark border border-hc-orange/50 rounded-hc shadow-2xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-hc-orange/10 border border-hc-orange/20 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-hc-orange" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                  <line x1="12" y1="9" x2="12" y2="13"></line>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
              </div>
              <h3 className="text-xl font-bold text-hc-orange">Expensive VM</h3>
            </div>

            <p className="text-hc-smoke leading-relaxed">
              <strong>{vmDisplayName}</strong> is expensive to run and will decrease the available resources for other users. Make sure to terminate it as soon as you&apos;re done using it!
            </p>

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleCancel}
                className="flex-1 bg-hc-darkless hover:bg-hc-slate text-hc-smoke border border-hc-slate/30 font-bold py-2.5 px-4 rounded-hc transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                className="flex-1 bg-hc-red hover:bg-[#d82a41] text-white font-bold py-2.5 px-4 rounded-hc transition-colors shadow-sm"
              >
                Yea idc
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
