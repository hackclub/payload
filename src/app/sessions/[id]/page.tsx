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
    <div className="flex flex-col h-full space-y-4">
      {/* Slim Top Bar specific to session */}
      <div className="bg-base-200 border border-base-300 rounded-hc p-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <Link href="/" className="btn btn-sm btn-ghost">← Back</Link>
          <div className="flex items-center gap-2">
            <MonitorPlay className="w-5 h-5 text-secondary" />
            <span className="font-mono text-sm">Ubuntu 24.04</span>
          </div>
          <span className="badge badge-success badge-sm font-semibold">Running</span>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-warning text-sm font-mono tracking-tight">
            <Clock className="w-4 h-4" />
            <span>05:59:42</span>
          </div>
          <DestroyButton modalId="destroy-modal" />
        </div>
      </div>

      {/* Full Bleed Iframe Area for Guacamole */}
      <div className="flex-1 bg-black rounded-hc overflow-hidden border border-base-300 relative shadow-inner">
        <div className="absolute inset-0 flex items-center justify-center text-slate">
           {/* Fallback visual since actual iframe implementation comes later */}
           <p className="font-mono">console connecting to session {resolvedParams.id}...</p>
        </div>
      </div>

      {/* Destroy Modal */}
      <dialog id="destroy-modal" className="modal">
        <div className="modal-box bg-base-100 border border-base-300">
          <h3 className="font-bold text-lg text-error flex items-center gap-2">
            <XCircle className="w-5 h-5" /> Destroy Session?
          </h3>
          <p className="py-4 text-base-content">
            Are you sure you want to definitively end this session? 
            All data stored in this VM will be irrevocably deleted, and you will not be able to reconnect.
          </p>
          <div className="modal-action">
            <form method="dialog" className="flex gap-2">
              <button className="btn btn-ghost">Cancel</button>
              <Link href="/" className="btn btn-error">Confirm & Destroy</Link>
            </form>
          </div>
        </div>
      </dialog>
    </div>
  );
}
