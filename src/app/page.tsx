import { auth, signIn, signOut } from "@/auth";
import { db } from "@/db";
import { reviewerAllowlistEntries } from "@/db/schema";
import { eq } from "drizzle-orm";

export default async function Dashboard() {
  const session = await auth();

  if (!session?.user) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <h1 className="text-3xl font-bold mb-6 text-steel">Sign in to Payload</h1>
        <form
          action={async () => {
            "use server";
            await signIn("hackclub");
          }}
        >
          <button type="submit" className="btn btn-primary px-8">
            Sign in with Hack Club
          </button>
        </form>
      </div>
    );
  }

  const slackId = (session.user as any).slackId;
  if (!slackId) {
     return (
      <div className="alert alert-error max-w-xl mx-auto mt-10">
        <h3 className="text-lg font-bold">Access Denied</h3>
        <p>No Slack ID associated with your Hack Club Auth profile.</p>
        <form action={async () => {
            "use server";
            await signOut();
          }}>
          <button className="btn btn-sm btn-outline mt-4">Sign out</button>
        </form>
      </div>
     );
  }

  const allowlistEntry = await db.query.reviewerAllowlistEntries.findFirst({
    where: eq(reviewerAllowlistEntries.slackId, slackId),
  });

  if (!allowlistEntry) {
    return (
      <div className="alert alert-error max-w-xl mx-auto mt-10">
        <div className="flex flex-col gap-2">
          <h3 className="text-lg font-bold">Access Denied</h3>
          <p>Your account is valid but your Slack ID ({slackId}) is not allowlisted to access sandboxes.</p>
          <p className="text-sm opacity-80">Ask an admin to add your Slack ID to the allowlist.</p>
          <form action={async () => {
            "use server";
            await signOut();
          }}>
            <button className="btn btn-sm mt-4">Sign out</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-2xl font-bold mb-4">Active Sessions</h2>
        <div className="bg-base-200 border border-base-300 rounded-hc p-6 text-center text-muted">
          No active sessions found.
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold mb-4">Spawn VM</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="card bg-base-200 border border-base-300 p-6 flex flex-col justify-between">
             <div>
               <h3 className="text-xl font-bold flex items-center gap-2">
                 Ubuntu 24.04 Linux
               </h3>
               <p className="text-slate mt-2">VNC connection with XFCE desktop environment.</p>
             </div>
             <button className="btn btn-primary mt-6 w-full">Spawn Linux</button>
          </div>

          <div className="card bg-base-300 border border-base-300 p-6 flex flex-col justify-between opacity-50 cursor-not-allowed">
             <div>
               <h3 className="text-xl font-bold text-muted flex items-center gap-2">
                 Windows 11 Pro
               </h3>
               <p className="text-slate mt-2">Coming later.</p>
             </div>
             <button className="btn btn-secondary mt-6 w-full" disabled>Spawn Windows</button>
          </div>
        </div>
      </section>
    </div>
  );
}

