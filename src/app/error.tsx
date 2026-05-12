"use client";

import { AlertTriangle } from "lucide-react";

export default function CustomError() {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center h-full flex-1 mt-10">
      <AlertTriangle className="w-16 h-16 text-hc-red mb-6 mx-auto" />
      <h1 className="text-4xl font-extrabold mb-4 text-white tracking-tight">Something broke</h1>
      <p className="text-hc-muted mb-8 text-lg">
        A random error that is totally caused by you occurred.
      </p>
      <button
        className="bg-hc-darker border border-hc-darkless hover:bg-hc-dark text-white font-bold py-3 px-6 rounded-hc transition-colors shadow-sm"
        onClick={() => window.location.href = "/"}
      >
        Return to Dashboard
      </button>
    </div>
  );
}


