import { auth, signIn, signOut } from "@/auth";
import { db } from "@/db";
import { reviewerAllowlistEntries } from "@/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { Play, AlertCircle, Laptop, Clock, TerminalSquare } from "lucide-react";

export default async function Dashboard() {
  const session = await auth();

  if (!session?.user) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4">
        <div className="bg-base-200 border border-base-300 rounded-hc p-10 max-w-md w-full shadow-lg text-center">
          <TerminalSquare className="w-16 h-16 mx-auto text-primary mb-6" />
          <h1 className="text-3xl font-bold mb-4 text-base-content">Payload</h1>
          <p className="text-slate mb-8">Sandboxed desktop environments for reviewing Hack Club projects.</p>
          <form
            action={async () => {
              "use server";
              await signIn("hackclub", { redirectTo: "/" });
            }}
          >
            <button type="submit" className="btn btn-primary w-full text-lg">
              Sign in with Hack Club
            </button>
          </form>
        </div>
      </div>
    );
  }

  const slackId = (session.user as any).slackId;
  if (!slackId) {
     return (
      <div className="alert alert-error max-w-xl mx-auto mt-10 rounded-hc shadow">
        <AlertCircle className="w-6 h-6" />
        <div className="flex-1">
          <h3 className="text-lg font-bold">Configuration Error</h3>
          <p>No Slack ID associated with your Hack Club Auth profile.</p>
        </div>
        <form action={async () => {
            "use server";
            await signOut();
          }}>
          <button className="btn btn-sm btn-ghost">Sign out</button>
        </form>
      </div>
     );
  }

  const allowlistEntry = await db.query.reviewerAllowlistEntries.findFirst({
    where: eq(reviewerAllowlistEntries.slackId, slackId),
  });

  if (!allowlistEntry) {
    return (
      <div className="alert alert-warning max-w-xl mx-auto mt-10 rounded-hc shadow">
        <AlertCircle className="w-6 h-6" />
        <div className="flex flex-col gap-2 flex-1">
          <h3 className="text-lg font-bold">Access Denied</h3>
          <p>Your account is valid but your Slack ID (<code className="bg-base-300 px-1 rounded">{slackId}</code>) is not allowlisted to access sandboxes.</p>
          <p className="text-sm opacity-80 mt-1">Ask an admin to add your Slack ID to the allowlist.</p>
          <div className="mt-2">
            <form action={async () => {
              "use server";
              await signOut();
            }}>
              <button className="btn btn-sm">Sign out</button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-12 animate-in fade-in duration-500">
      <section>
        <div className="mb-6 flex justify-between items-end">
          <h2 className="text-2xl font-bold flex items-center gap-2"><Laptop className="w-6 h-6 text-secondary" /> Active Sessions</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {/* Example of an active session, since we do not have real db hooked yet for sessions we will map a placeholder or show empty */}
          <div className="card bg-base-200 border border-base-300 shadow-sm hover:border-secondary transition-colors">
            <div className="card-body p-5">
              <div className="flex justify-between items-start mb-2">
                <h3 className="card-title text-lg">Ubuntu 24.04 Linux</h3>
                <span className="badge badge-success badge-sm font-semibold">Running</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate mb-6">
                <Clock className="w-4 h-4" />
                <span>Expires in 5h 59m</span>
              </div>
              <div className="card-actions justify-end">
                <Link href="/sessions/demo-uuid-1234" className="btn btn-primary btn-sm w-full">Open Session</Link>
              </div>
            </div>
          </div>

          <div className="card bg-base-200 border border-base-300 border-dashed text-center flex items-center justify-center p-8 text-slate">
            <p>You can spawn 1 more session.</p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2"><Play className="w-6 h-6 text-primary" /> Spawn VM</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="card bg-base-200 border border-base-300 hover:border-primary transition-all shadow-sm group">
             <div className="card-body">
               <div className="flex items-center gap-3 mb-2">
                 <div className="w-10 h-10 rounded bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                   <TerminalSquare className="w-6 h-6" />
                 </div>
                 <h3 className="card-title">Ubuntu 24.04</h3>
               </div>
               <p className="text-slate text-sm">VNC connection with XFCE desktop environment. Full root access for review tools.</p>
               <div className="card-actions mt-4">
                 <button className="btn btn-primary w-full">Spawn Linux</button>
               </div>
             </div>
          </div>

          <div className="card bg-base-300/50 border border-base-300 p-6 flex flex-col justify-between opacity-60 grayscale cursor-not-allowed">
             <div>
               <div className="flex items-center gap-3 mb-2">
                 <div className="w-10 h-10 rounded bg-base-300 flex items-center justify-center">
                   <Laptop className="w-6 h-6 text-muted" />
                 </div>
                 <h3 className="card-title text-muted">Windows 11 Pro</h3>
               </div>
               <p className="text-slate text-sm mt-2">Coming later. RDP with cloudbase-init configurations.</p>
             </div>
             <button className="btn btn-secondary mt-6 w-full opacity-50" disabled>Spawn Windows</button>
          </div>
          
          <div className="card bg-base-300/50 border border-base-300 p-6 flex flex-col justify-between opacity-60 grayscale cursor-not-allowed">
             <div>
               <div className="flex items-center gap-3 mb-2">
                 <div className="w-10 h-10 rounded bg-base-300 flex items-center justify-center">
                   <Laptop className="w-6 h-6 text-muted" />
                 </div>
                 <h3 className="card-title text-muted">macOS Sonoma</h3>
               </div>
               <p className="text-slate text-sm mt-2">Coming later. OpenCore accelerated configuration.</p>
             </div>
             <button className="btn btn-secondary mt-6 w-full opacity-50" disabled>Spawn macOS</button>
          </div>

        </div>
      </section>
    </div>
  );
}

