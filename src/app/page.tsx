import { auth, signIn, signOut } from "@/auth";
import { db } from "@/db";
import { vmSessions, vmTypes, reviewerAllowlistEntries } from "@/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { createUserSession } from "@/lib/sessions";
import { redirect } from "next/navigation";
import { vmTypeSeeds } from "@/config/vm-types";
import DashboardLive from "./DashboardLive";

type UserWithSlackId = {
  slackId?: string | null;
};

const STATE_LABELS: Record<string, { label: string; color: string; bg: string; animate?: boolean }> = {
  pending: { label: "Starting", color: "text-hc-yellow", bg: "bg-hc-yellow/10 border-hc-yellow/20" },
  provisioning: { label: "Provisioning", color: "text-hc-yellow", bg: "bg-hc-yellow/10 border-hc-yellow/20" },
  ready: { label: "Ready", color: "text-hc-green", bg: "bg-hc-green/10 border-hc-green/20", animate: true },
  active: { label: "Running", color: "text-hc-green", bg: "bg-hc-green/10 border-hc-green/20", animate: true },
  terminating: { label: "Terminating", color: "text-hc-orange/80", bg: "bg-hc-orange/10 border-hc-orange/20" },
  terminated: { label: "Ended", color: "text-hc-muted", bg: "bg-hc-darker border-hc-darkless" },
  errored: { label: "Error", color: "text-hc-red/80", bg: "bg-hc-red/10 border-hc-red/20" },
};

function formatTimeRemaining(expiresAt: Date): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "Expired";
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export default async function Dashboard() {
  const session = await auth();

  if (!session?.user) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4">
        <div className="bg-hc-dark border border-hc-darkless rounded-hc p-10 max-w-md w-full shadow-lg text-center">
          <h1 className="text-4xl font-black mb-4 text-hc-red uppercase tracking-tight">Payload</h1>
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

  const slackId = (session.user as typeof session.user & UserWithSlackId).slackId;
  if (!slackId) {
    return (
      <div className="bg-hc-dark border border-hc-red/50 rounded-hc p-6 max-w-xl mx-auto mt-10 shadow-lg">
        <div className="flex flex-col gap-2">
          <h3 className="text-xl font-bold text-hc-red mb-1">Configuration Error</h3>
          <p className="text-hc-smoke">No Slack ID associated with your Hack Club Auth profile.</p>
          <div className="mt-4 pt-4 border-t border-hc-darkless">
            <form action={async () => { "use server"; await signOut(); }}>
              <button className="bg-hc-darkless hover:bg-hc-slate text-hc-smoke border border-hc-slate/30 font-bold py-2 px-4 rounded transition-colors text-sm">Sign out</button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  const isAllowlisted = await db.query.reviewerAllowlistEntries.findFirst({
    where: eq(reviewerAllowlistEntries.slackId, slackId),
  });

  if (!isAllowlisted) {
    return (
      <div className="bg-hc-dark border border-hc-orange/50 rounded-hc p-6 max-w-xl mx-auto mt-10 shadow-lg">
        <div className="flex flex-col gap-2">
          <h3 className="text-xl font-bold text-hc-orange mb-1">Access Denied</h3>
          <p className="text-hc-smoke">Your account is valid but your Slack ID (<code className="bg-hc-darker px-1.5 py-0.5 rounded border border-hc-darkless text-hc-cyan">{slackId}</code>) is not allowlisted to access sandboxes.</p>
          <p className="text-sm text-hc-muted mt-1">Ask an admin to add your Slack ID to the allowlist.</p>
          <div className="mt-4 pt-4 border-t border-hc-darkless">
            <form action={async () => { "use server"; await signOut(); }}>
              <button className="bg-hc-darkless hover:bg-hc-slate text-hc-smoke border border-hc-slate/30 font-bold py-2 px-4 rounded transition-colors text-sm">Sign out</button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  const userSessions = await db.query.vmSessions.findMany({
    where: eq(vmSessions.userId, session.user.id!),
    orderBy: (vmSessions, { desc }) => [desc(vmSessions.createdAt)],
    with: { vmType: true },
  });

  const activeStates = ["pending", "provisioning", "ready", "active"];
  const activeSessions = userSessions.filter((s) => activeStates.includes(s.state));
  const pastSessions = userSessions.filter((s) => !activeStates.includes(s.state));

  const enabledVmTypes = await db.query.vmTypes.findMany({
    where: eq(vmTypes.enabled, true),
  });

  const watchedSessions = userSessions
    .filter((s) => s.state !== "terminated" && s.state !== "errored")
    .map((s) => ({ id: s.id, state: s.state }));

  return (
    <div className="space-y-12 animate-in fade-in duration-500">
      <DashboardLive sessions={watchedSessions} />
      <div className="mb-10">
        <h1 className="text-4xl font-bold mb-2 text-hc-snow">My Sessions</h1>
        <p className="text-hc-muted text-lg">Your VMs for reviewing Hack Club projects.</p>
      </div>

      <section>
        {activeSessions.length > 0 && (
          <div className="space-y-4 mb-8">
            {activeSessions.map((s) => {
              const info = STATE_LABELS[s.state] ?? { label: s.state, color: "text-hc-muted", bg: "bg-hc-darker border-hc-darkless" };
              const seedConfig = vmTypeSeeds.find(v => v.slug === s.vmType?.slug);
              return (
                <div key={s.id} className="bg-hc-dark rounded-hc border border-hc-darkless p-6 shadow-lg hover:border-hc-slate transition-all duration-200">
                  <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4 mb-6">
                    <div>
                      <div className="flex flex-wrap items-center gap-3 mb-2">
                        {seedConfig?.iconUrl && (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={seedConfig.iconUrl} alt={s.vmType?.displayName ?? "VM"} className="w-8 h-8 object-contain" />
                        )}
                        <h3 className="text-2xl font-bold text-hc-snow tracking-tight">
                          {s.vmType?.displayName ?? "VM"}
                        </h3>
                        <span className={`self-start ${info.bg} ${info.color} font-bold text-xs px-2.5 py-1 rounded-full border flex items-center gap-1.5 shadow-sm`}>
                          {info.animate && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse"></span>}
                          {info.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-hc-muted font-medium text-sm">
                        <svg className="w-4 h-4 text-hc-slate" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"></circle>
                          <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                        <span>Expires in {formatTimeRemaining(s.expiresAt)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-4 mt-6 pt-6 border-t border-hc-darkless">
                    {["ready", "active"].includes(s.state) && (
                      <Link href={`/sessions/${s.id}`} className="bg-hc-red hover:bg-[#d82a41] text-white font-bold py-3 px-6 rounded-hc flex-1 text-center text-base transition-colors shadow-sm">
                        Open Session
                      </Link>
                    )}
                    {["pending", "provisioning"].includes(s.state) && (
                      <Link href={`/sessions/${s.id}`} className="bg-hc-darkless text-hc-yellow border border-hc-yellow/30 hover:border-hc-yellow font-bold py-3 px-6 rounded-hc flex-1 text-center text-base transition-colors cursor-wait">
                        Connecting...
                      </Link>
                    )}
                    <form action={async () => { "use server"; await destroySession(s.id); }}>
                      <button type="submit" className="bg-hc-darkless hover:bg-hc-slate text-hc-smoke border border-hc-slate/30 font-bold py-3 px-6 rounded-hc transition-colors">
                        Destroy
                      </button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeSessions.length < 2 && enabledVmTypes.length > 0 && (
          <div className="space-y-4 pt-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-hc-darkless pb-4 mb-6 gap-4">
              <h2 className="text-2xl font-bold text-hc-smoke">Launch a VM</h2>
              <span className="text-sm text-hc-muted font-medium bg-hc-darker px-3 py-1 rounded-full border border-hc-darkless whitespace-nowrap w-fit">
                {2 - activeSessions.length} of 2 active VMs available
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {enabledVmTypes.map((vt) => {
                const seedConfig = vmTypeSeeds.find(v => v.slug === vt.slug);
                return (
                <form key={vt.slug} action={async () => { "use server"; await launchVm(vt.slug); }} className="block h-full">
                  <button type="submit" className="text-left w-full bg-hc-dark hover:bg-[#1a1c23] border border-hc-darkless hover:border-hc-cyan/50 p-6 rounded-hc transition-all duration-200 group h-full flex flex-col shadow-sm">
                    <div className="flex justify-between items-start mb-4 w-full">
                      <div className="flex items-center gap-3">
                        {seedConfig?.iconUrl && (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={seedConfig.iconUrl} alt={vt.displayName} className="w-8 h-8 object-contain" />
                        )}
                        <h3 className="text-lg font-bold text-hc-smoke group-hover:text-hc-cyan transition-colors">{vt.displayName}</h3>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-hc-darkless flex shrink-0 items-center justify-center text-hc-cyan group-hover:bg-hc-cyan group-hover:text-hc-darker transition-colors ml-4">
                        <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                      </div>
                    </div>
                    <p className="text-sm text-hc-muted mt-auto leading-relaxed">{seedConfig?.description ?? "Click to provision a new instance of this environment."}</p>
                  </button>
                </form>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {pastSessions.length > 0 && (
        <section>
          <h2 className="text-xl font-bold text-hc-smoke mb-4">Past Sessions</h2>
          <div className="space-y-2">
            {pastSessions.slice(0, 5).map((s) => {
              const info = STATE_LABELS[s.state] ?? { label: s.state, color: "text-hc-muted", bg: "" };
              const seedConfig = vmTypeSeeds.find(v => v.slug === s.vmType?.slug);
              return (
                <div key={s.id} className="bg-hc-darker rounded-hc border border-hc-darkless/50 p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {seedConfig?.iconUrl && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={seedConfig.iconUrl} alt={s.vmType?.displayName ?? "VM"} className="w-6 h-6 object-contain" />
                    )}
                    <span className="font-medium text-hc-smoke">{s.vmType?.displayName ?? "VM"}</span>
                    <span className="text-hc-muted text-sm ml-3">
                      {new Date(s.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <span className={`${info.color} text-xs font-bold`}>{info.label}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

async function launchVm(vmTypeSlug: string) {
  "use server";
  const { getAllowlistedUser } = await import("@/lib/auth-guard");
  const authResult = await getAllowlistedUser();
  if (!authResult) throw new Error("Unauthorized");

  const session = await createUserSession(authResult.userId, vmTypeSlug);
  redirect(`/sessions/${session.id}`);
}

async function destroySession(sessionId: number) {
  "use server";
  const { getAllowlistedUser } = await import("@/lib/auth-guard");
  const authResult = await getAllowlistedUser();
  if (!authResult) throw new Error("Unauthorized");

  const { enqueueTerminateVm } = await import("@/lib/queue");
  await enqueueTerminateVm({ sessionId, reason: "user" });
  redirect("/");
}