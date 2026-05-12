"use client";

import { Shield } from "lucide-react";

export default function AdminError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center h-full flex-1 mt-10">
      <Shield className="w-16 h-16 text-hc-red mb-6 mx-auto" />
      <h1 className="text-4xl font-extrabold mb-4 text-white tracking-tight">
        Dashboard Error
      </h1>
      <p className="text-hc-muted mb-8 text-lg">
        Something went wrong in the admin panel.
      </p>
      <button
        className="bg-hc-red hover:bg-[#d82a41] text-white font-bold py-3 px-6 rounded-hc transition-colors shadow-sm"
        onClick={() => reset()}
      >
        Try Again
      </button>
    </div>
  );
}