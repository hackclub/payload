import { DestroyButton } from "@/components/DestroyButton";
import { auth } from "@/auth";
import { Clock, MonitorPlay, XCircle } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/");

  const resolvedParams = await params;

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] space-y-4 animate-in fade-in duration-300">
      {/* Slim Top Bar specific to session */}
      <div className="bg-hc-dark border border-hc-darkless rounded-hc p-3 flex flex-col sm:flex-row sm:items-center justify-between shadow-sm gap-4">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-hc-muted hover:text-hc-smoke hover:bg-hc-darkless px-3 py-1.5 rounded transition-colors text-sm font-bold">← Back</Link>
          <div className="w-px h-5 bg-hc-darkless"></div>
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-hc-blue" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
              <line x1="8" y1="21" x2="16" y2="21"></line>
              <line x1="12" y1="17" x2="12" y2="21"></line>
            </svg>
            <span className="font-bold text-sm text-hc-smoke">Ubuntu 24.04</span>
          </div>
          <span className="bg-hc-green/10 text-hc-green font-bold text-xs px-2.5 py-1 rounded-full border border-hc-green/20 flex items-center gap-1.5 ml-2">
              <span className="w-1.5 h-1.5 rounded-full bg-hc-green animate-pulse"></span>
              Running
          </span>
        </div>
        
        <div className="flex items-center gap-6 self-end sm:self-auto">
          <div className="flex items-center gap-2 text-hc-yellow text-sm font-mono tracking-tight bg-hc-darker px-3 py-1 rounded border border-hc-darkless">
            <Clock className="w-4 h-4" />
            <span>05:59:42</span>
          </div>
          <DestroyButton modalId="destroy-modal" />
        </div>
      </div>

      {/* Full Bleed Iframe Area for Guacamole */}
      <div className="flex-1 bg-black rounded-hc overflow-hidden border border-hc-darkless relative shadow-inner">
        <div className="absolute inset-0 flex items-center justify-center text-hc-muted">
            {/* Fallback visual since actual iframe implementation comes later */}
            <p className="font-mono text-sm max-w-sm text-center">
               <span className="text-hc-blue">$ </span>
               connecting to session {resolvedParams.id} via secure websocket...
            </p>
        </div>
      </div>

      {/* Destroy Modal */}
      <dialog id="destroy-modal" className="modal bg-black/80">
        <div className="modal-box bg-hc-dark border border-hc-darkless shadow-2xl p-6 rounded-hc max-w-md w-full mx-auto mt-20">
          <h3 className="font-bold text-xl text-hc-red flex items-center gap-2 mb-2">
            <svg className="w-6 h-6" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
            Destroy Session?
          </h3>
          <p className="py-4 text-hc-smoke text-sm">
            Are you sure you want to definitively end this session? 
            All data stored in this VM will be <strong className="text-hc-red">irrevocably deleted</strong>, and you will not be able to reconnect.
          </p>
          <div className="mt-6">
            <form method="dialog" className="flex gap-3 justify-end">
              <button className="bg-hc-darkless hover:bg-hc-slate text-hc-smoke border border-hc-slate/30 font-bold py-2.5 px-5 rounded transition-colors text-sm">Cancel</button>
              <Link href="/" className="bg-[#a6182c] hover:bg-hc-red text-white font-bold py-2.5 px-5 rounded transition-colors text-sm shadow-sm">Confirm & Destroy</Link>
            </form>
          </div>
        </div>
      </dialog>
    </div>
  );
}
