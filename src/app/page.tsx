import { auth, signIn, signOut } from "@/auth";
import { db } from "@/db";
import { reviewerAllowlistEntries } from "@/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";

export default async function Dashboard() {
  const session = await auth();

  if (!session?.user) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4">
        <div className="bg-hc-dark border border-hc-darkless rounded-hc p-10 max-w-md w-full shadow-lg text-center">
          <h1 className="text-4xl font-black mb-4 text-hc-snow uppercase tracking-tight text-hc-red">Payload</h1>
          <p className="text-hc-muted mb-8 text-lg">Sandboxed desktop environments for reviewing Hack Club projects.</p>
          <form
            action={async () => {
              "use server";
              await signIn("hackclub", { redirectTo: "/" });
            }}
          >
            <button type="submit" className="bg-hc-red hover:bg-[#d82a41] text-white font-bold py-3 px-6 rounded-hc w-full text-lg transition-colors shadow-sm">
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
      <div className="bg-hc-dark border border-hc-red/50 rounded-hc p-6 max-w-xl mx-auto mt-10 shadow-lg">
        <div className="flex flex-col gap-2">
          <h3 className="text-xl font-bold text-hc-red mb-1">Configuration Error</h3>
          <p className="text-hc-smoke">No Slack ID associated with your Hack Club Auth profile.</p>
          <div className="mt-4 pt-4 border-t border-hc-darkless">
            <form action={async () => {
                "use server";
                await signOut();
              }}>
              <button className="bg-hc-darkless hover:bg-hc-slate text-hc-smoke border border-hc-slate/30 font-bold py-2 px-4 rounded transition-colors text-sm">Sign out</button>
            </form>
          </div>
        </div>
      </div>
     );
  }

  const allowlistEntry = await db.query.reviewerAllowlistEntries.findFirst({
    where: eq(reviewerAllowlistEntries.slackId, slackId),
  });

  if (!allowlistEntry) {
    return (
      <div className="bg-hc-dark border border-hc-orange/50 rounded-hc p-6 max-w-xl mx-auto mt-10 shadow-lg">
        <div className="flex flex-col gap-2">
          <h3 className="text-xl font-bold text-hc-orange mb-1">Access Denied</h3>
          <p className="text-hc-smoke">Your account is valid but your Slack ID (<code className="bg-hc-darker px-1.5 py-0.5 rounded border border-hc-darkless text-hc-cyan">{slackId}</code>) is not allowlisted to access sandboxes.</p>
          <p className="text-sm text-hc-muted mt-1">Ask an admin to add your Slack ID to the allowlist.</p>
          <div className="mt-4 pt-4 border-t border-hc-darkless">
            <form action={async () => {
              "use server";
              await signOut();
            }}>
              <button className="bg-hc-darkless hover:bg-hc-slate text-hc-smoke border border-hc-slate/30 font-bold py-2 px-4 rounded transition-colors text-sm">Sign out</button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-12 animate-in fade-in duration-500">
      <div className="mb-10">
          <h1 className="text-4xl font-bold mb-2 text-hc-snow">My Sessions</h1>
          <p className="text-hc-muted text-lg">Your active sandboxes for reviewing Hack Club projects.</p>
      </div>

      <section>
        {/* Active Session Card Dashboard Format */}
        <div className="bg-hc-dark rounded-hc border border-hc-darkless p-6 mb-8 shadow-lg hover:border-hc-slate transition-all duration-200 group">
          <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4 mb-6">
              <div>
                  <h3 className="text-xl font-bold bg-hc-cyan text-hc-darker px-3 py-1 rounded inline-block mb-3">Ubuntu 24.04</h3>
                  <div className="flex items-center gap-2 text-hc-muted font-medium">
                      <svg className="w-5 h-5 text-hc-yellow" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"></circle>
                          <polyline points="12 6 12 12 16 14"></polyline>
                      </svg>
                      <span>Expires in 5h 59m</span>
                  </div>
              </div>
              {/* Status Badge */}
              <span className="self-start bg-hc-green/10 text-hc-green font-bold text-sm px-3 py-1.5 rounded-full border border-hc-green/20 flex items-center gap-2 w-fit">
                  <span className="w-2 h-2 rounded-full bg-hc-green animate-pulse"></span>
                  Running
              </span>
          </div>
          
          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-4 mt-6 pt-6 border-t border-hc-darkless">
              <Link href="/sessions/demo-uuid-1234" className="bg-hc-red hover:bg-[#d82a41] text-white font-bold py-3 px-6 rounded-hc flex-1 text-center text-base transition-colors shadow-sm">
                  Open Session
              </Link>
              <button className="bg-hc-darkless hover:bg-hc-slate text-hc-smoke border border-hc-slate/30 font-bold py-3 px-6 rounded-hc transition-colors">
                  Destroy
              </button>
          </div>
        </div>

        {/* Action to launch a new one */}
        <div className="bg-hc-dark rounded-hc border border-dashed border-hc-slate/50 p-10 text-center text-hc-muted">
            <h3 className="text-xl font-bold mb-2 text-hc-smoke">No other sessions</h3>
            <p className="mb-6 text-sm">You can spin up a new sandboxed environment to review a project.</p>
            <button className="bg-hc-darkless text-hc-cyan border border-hc-cyan/30 hover:border-hc-cyan font-bold py-2.5 px-6 rounded-hc transition-colors">
                + Launch Ubuntu 24.04 Sandbox
            </button>
        </div>
      </section>
    </div>
  );
}
