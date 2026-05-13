"use client";

import { useState } from "react";
import { launchVm } from "@/app/page-actions";

interface LaunchVmFormProps {
  vmTypeSlug: string;
  isExpensive: boolean;
  vmDisplayName: string;
  children: React.ReactNode;
}

export default function LaunchVmForm({ vmTypeSlug, isExpensive, vmDisplayName, children }: LaunchVmFormProps) {
  const [showWarning, setShowWarning] = useState(false);
  const [isPending, setIsPending] = useState(false);

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
    try {
      await launchVm(vmTypeSlug);
    } catch (error) {
      console.error("Failed to launch VM:", error);
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

      {showWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
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
              <strong>{vmDisplayName}</strong> is expensive to run and will decrease the available resources for other users. Make sure to terminate it as soon as you're done using it!
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
