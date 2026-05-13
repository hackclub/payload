"use client";

import { useEffect, useState } from "react";
import { Shield } from 'lucide-react';

const STORAGE_KEY = "payload-onboarding-shown";

export default function OnboardingModal() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const hasSeen = localStorage.getItem(STORAGE_KEY);
    if (!hasSeen) {
      setIsOpen(true);
    }
  }, []);

  const handleClose = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    setIsOpen(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 m-0">
      <div className="bg-hc-dark border border-hc-darkless rounded-hc shadow-2xl max-w-lg w-full p-8 space-y-6 animate-in fade-in zoom-in-95 duration-200 m-0">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-hc-snow">Hello!!</h2>
          <p className="text-hc-muted">
            Stuff you should know before using Payload
          </p>
        </div>

        <div className="space-y-4">
          <div className="flex gap-2">
            <span className="text-hc-red font-bold shrink-0">1.</span>
            <p className="text-hc-smoke leading-relaxed">VMs will automatically expire and get terminated after 6 hours</p>
          </div>

          <div className="flex gap-2">
            <span className="text-hc-red font-bold shrink-0">2.</span>
            <p className="text-hc-smoke leading-relaxed">VMs will also auto terminate after 30 min of idle time. Keep the Session page open to stay active</p>
          </div>

          <div className="flex gap-2">
            <span className="text-hc-red font-bold shrink-0">3.</span>
            <p className="text-hc-smoke leading-relaxed">You can have 2 VMs running concurrently</p>
          </div>

          <div className="flex gap-2">
            <span className="text-hc-red font-bold shrink-0">4.</span>
            <p className="text-hc-smoke leading-relaxed">The VMs are ephemeral and any data saved on them will be deleted once terminated</p>
          </div>
        </div>

        <button
          onClick={handleClose}
          className="w-full bg-hc-red hover:bg-[#d82a41] text-white font-bold py-3 px-6 rounded-hc transition-colors shadow-sm"
        >
          Awesome
        </button>
      </div>
    </div>
  );
}
