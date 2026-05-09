"use client";
export default function CustomError() {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center h-full">
       <h1 className="text-4xl font-bold text-error mb-4">Something went wrong</h1>
       <p className="text-slate mb-8 max-w-md">An unexpected error occurred while provisioning your session. The system failed to boot the virtual machine.</p>
       <button className="btn btn-primary" onClick={() => window.location.href = "/"}>Return to Dashboard</button>
    </div>
  );
}
