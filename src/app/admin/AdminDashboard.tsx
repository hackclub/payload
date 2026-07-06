"use client";

import { useState, useEffect, useCallback } from "react";
import { Users, Monitor, ScrollText, Building2, Server, ShieldCheck, Trash2, XCircle, RefreshCw, Check, ChevronDown } from "lucide-react";

type Tab = "members" | "sessions" | "logs" | "workspaces" | "system" | "superadmins";

type Workspace = {
  id: string;
  slug: string;
  name: string;
  enabled: boolean;
  maxConcurrentVms: number | null;
  memberCount: number;
  activeVms: number;
  createdAt: string;
};

type Member = {
  slackId: string;
  name: string | null;
  image: string | null;
  role: "member" | "admin";
  isSuperadmin: boolean;
  createdAt: string;
};

type SessionInfo = {
  id: number;
  state: string;
  vmType: string | null;
  vmTypeDisplayName: string | null;
  yswsId: string | null;
  yswsName: string | null;
  userId: string | null;
  userName: string | null;
  userImage: string | null;
  userSlackId: string | null;
  userIsAdmin: boolean;
  proxmoxVmid: number | null;
  expiresAt: string | null;
  lastHeartbeatAt: string | null;
  terminatedAt: string | null;
  terminationReason: string | null;
  createdAt: string;
};

type SystemInfo = {
  node: {
    hostname: string; uptime: string; platform: string; cpus: number; cpuModel: string;
    totalMemory: string; freeMemory: string; memoryUsagePercent: string; loadAvg: string[];
  };
  proxmox: {
    node: string; status: string; uptime: string; cpuPercent: string; cpuCores: number;
    memoryUsed: string; memoryTotal: string; memoryPercent: string;
    diskUsed: string; diskTotal: string; diskPercent: string;
  } | { error: string };
  queues: { waiting: number; active: number; delayed: number; failed: number; completed: number } | { error: string };
  redis: { usedMemory: string; maxMemory: string; connectedClients: number | null } | { error: string };
  pool: {
    budgetMb: number; committedMb: number;
    types: { slug: string; displayName: string; target: number; warm: number; warming: number; active: number; waiting: number; memoryMb: number }[];
  } | { error: string };
};

type LogEntry = {
  id: number; vmSessionId: number; kind: string; payload: Record<string, unknown>;
  createdAt: string; sessionState: string | null; vmType: string | null;
  userName: string | null; userImage: string | null;
};

type SuperadminEntry = {
  slackId: string; name: string | null; image: string | null; isSelf: boolean; createdAt: string;
};

const STATE_COLORS: Record<string, string> = {
  warm: "text-hc-cyan", pending: "text-hc-yellow", provisioning: "text-hc-yellow",
  ready: "text-hc-green", active: "text-hc-green", terminating: "text-hc-orange",
  terminated: "text-hc-muted", errored: "text-hc-red",
};

const STATE_BG: Record<string, string> = {
  warm: "bg-hc-cyan/10 border-hc-cyan/20", pending: "bg-hc-yellow/10 border-hc-yellow/20",
  provisioning: "bg-hc-yellow/10 border-hc-yellow/20", ready: "bg-hc-green/10 border-hc-green/20",
  active: "bg-hc-green/10 border-hc-green/20", terminating: "bg-hc-orange/10 border-hc-orange/20",
  terminated: "bg-hc-darker border-hc-slate/20", errored: "bg-hc-red/10 border-hc-red/20",
};

export default function AdminDashboard({ isSuperadmin }: { isSuperadmin: boolean }) {
  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: "members", label: "Members", icon: Users },
    { key: "sessions", label: "Sessions", icon: Monitor },
    { key: "logs", label: "Logs", icon: ScrollText },
    ...(isSuperadmin
      ? ([
          { key: "workspaces", label: "Workspaces", icon: Building2 },
          { key: "superadmins", label: "Superadmins", icon: ShieldCheck },
          { key: "system", label: "System", icon: Server },
        ] as const)
      : []),
  ];

  const [activeTab, setActiveTab] = useState<Tab>("members");
  // "" means "all workspaces I can see" (used by sessions/logs).
  const [selectedYswsId, setSelectedYswsId] = useState<string>("");
  // Sessions/Logs show user activity by default; superadmins can flip to the
  // warm-pool (Payload) view so reconciler churn doesn't spam the user lists.
  const [showPool, setShowPool] = useState(false);

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [superadmins, setSuperadmins] = useState<SuperadminEntry[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedWorkspace = workspaces.find((w) => w.id === selectedYswsId) ?? null;
  // Pool sessions are workspace-less, so the pool view ignores the scope picker.
  const scopeQuery = showPool ? "?pool=1" : selectedYswsId ? `?yswsId=${encodeURIComponent(selectedYswsId)}` : "";

  const call = useCallback(async (input: RequestInfo, init?: RequestInit) => {
    const res = await fetch(input, init);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "Request failed");
    }
    return res.json();
  }, []);

  // Workspaces power both the selector and the Workspaces tab, so load them up
  // front and keep them fresh after edits.
  const loadWorkspaces = useCallback(async () => {
    const data: Workspace[] = await call("/api/admin/ysws");
    setWorkspaces(data);
    // A non-superadmin with exactly one workspace shouldn't see an "All" default.
    setSelectedYswsId((cur) => (cur === "" && !isSuperadmin && data.length === 1 ? data[0].id : cur));
    return data;
  }, [call, isSuperadmin]);

  useEffect(() => {
    // Fetch-on-mount: the setState happens after the network round-trip. The
    // advisory targets synchronous cascading renders, which this is not.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadWorkspaces().catch((e) => setError(e instanceof Error ? e.message : "Failed to load workspaces"));
  }, [loadWorkspaces]);

  const loadTab = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (activeTab === "members") {
        if (!selectedYswsId) { setMembers([]); return; }
        setMembers(await call(`/api/admin/members?yswsId=${encodeURIComponent(selectedYswsId)}`));
      } else if (activeTab === "sessions") {
        setSessions(await call(`/api/admin/sessions${scopeQuery}`));
      } else if (activeTab === "logs") {
        setLogs(await call(`/api/admin/logs${scopeQuery}`));
      } else if (activeTab === "workspaces") {
        await loadWorkspaces();
      } else if (activeTab === "superadmins") {
        setSuperadmins(await call("/api/admin/superadmins"));
      } else if (activeTab === "system") {
        setSystem(await call("/api/admin/system"));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [activeTab, selectedYswsId, scopeQuery, call, loadWorkspaces]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadTab(); }, [loadTab]);

  const [now, setNow] = useState(() => (typeof window !== "undefined" ? Date.now() : 0));
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);
  const formatTimeRemaining = useCallback((expiresAt: string) => {
    const ms = new Date(expiresAt).getTime() - now;
    if (ms <= 0) return "Expired";
    const hours = Math.floor(ms / 3_600_000);
    const minutes = Math.floor((ms % 3_600_000) / 60_000);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  }, [now]);

  const guard = async (fn: () => Promise<void>) => {
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Action failed"); }
  };

  const isListTab = activeTab === "sessions" || activeTab === "logs";
  const showScopePicker = activeTab === "members" || (isListTab && !showPool);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="mb-2">
        <h1 className="text-4xl font-bold text-hc-snow tracking-tight">Admin Panel</h1>
        <p className="text-hc-muted text-lg mt-2">
          {isSuperadmin
            ? "Manage workspaces, members, and monitor the whole platform."
            : "Manage members and monitor sessions in your workspaces."}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-hc-darkless pb-4">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-hc font-bold text-sm transition-all ${
                isActive
                  ? "bg-hc-red text-white shadow-sm"
                  : "bg-hc-darkless text-hc-muted hover:text-hc-smoke hover:bg-hc-slate/30"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {(showScopePicker || (isSuperadmin && isListTab)) && (
        <div className="flex flex-wrap items-start gap-4">
          {isSuperadmin && isListTab && (
            <div className="flex items-center gap-1 bg-hc-darkless rounded-hc p-1">
              <button
                onClick={() => setShowPool(false)}
                className={`px-3 py-1.5 rounded-hc text-sm font-bold transition-colors ${
                  !showPool ? "bg-hc-dark text-hc-smoke shadow-sm" : "text-hc-muted hover:text-hc-smoke"
                }`}
              >
                Users
              </button>
              <button
                onClick={() => setShowPool(true)}
                className={`px-3 py-1.5 rounded-hc text-sm font-bold transition-colors ${
                  showPool ? "bg-hc-dark text-hc-cyan shadow-sm" : "text-hc-muted hover:text-hc-smoke"
                }`}
              >
                Warm pool
              </button>
            </div>
          )}
          {showScopePicker && (
            <div>
              <WorkspaceScope
                workspaces={workspaces}
                value={selectedYswsId}
                onChange={setSelectedYswsId}
                allowAll={activeTab !== "members"}
              />
              {selectedWorkspace && (
                <p className="text-sm text-hc-muted mt-1.5">
                  {selectedWorkspace.memberCount} member{selectedWorkspace.memberCount === 1 ? "" : "s"} · {selectedWorkspace.activeVms} active VM{selectedWorkspace.activeVms === 1 ? "" : "s"}
                  {selectedWorkspace.maxConcurrentVms != null ? ` / ${selectedWorkspace.maxConcurrentVms} cap` : " · unlimited"}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="bg-hc-red/10 border border-hc-red/30 rounded-hc p-4 flex items-center justify-between">
          <span className="text-hc-red text-sm font-medium">{error}</span>
          <button onClick={() => setError(null)} className="text-hc-red hover:text-hc-smoke"><XCircle className="w-4 h-4" /></button>
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-hc-muted text-sm">
          <RefreshCw className="w-4 h-4 animate-spin" /> Loading...
        </div>
      )}

      {!loading && activeTab === "members" && (
        <MembersTab
          workspace={selectedWorkspace}
          members={members}
          canPromote
          onAdd={(slackId) => guard(async () => {
            await call("/api/admin/members", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ yswsId: selectedYswsId, slackId }) });
            await loadTab(); await loadWorkspaces();
          })}
          onSetRole={(slackId, role) => guard(async () => {
            await call("/api/admin/members", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ yswsId: selectedYswsId, slackId, role }) });
            await loadTab();
          })}
          onRemove={(slackId) => guard(async () => {
            await call("/api/admin/members", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ yswsId: selectedYswsId, slackId }) });
            await loadTab(); await loadWorkspaces();
          })}
        />
      )}

      {!loading && activeTab === "sessions" && (
        <SessionsTab
          sessions={sessions}
          showWorkspace={!selectedYswsId}
          formatTimeRemaining={formatTimeRemaining}
          onRefresh={() => loadTab()}
          onTerminate={(id) => guard(async () => {
            await call(`/api/admin/sessions/${id}/terminate`, { method: "POST" });
            await loadTab();
          })}
        />
      )}

      {!loading && activeTab === "logs" && (
        <LogsTab logs={logs} onRefresh={() => loadTab()} />
      )}

      {!loading && activeTab === "workspaces" && isSuperadmin && (
        <WorkspacesTab
          workspaces={workspaces}
          onCreate={(payload) => guard(async () => {
            await call("/api/admin/ysws", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
            await loadWorkspaces();
          })}
          onUpdate={(payload) => guard(async () => {
            await call("/api/admin/ysws", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
            await loadWorkspaces();
          })}
          onDelete={(id) => guard(async () => {
            await call("/api/admin/ysws", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
            await loadWorkspaces();
            setSelectedYswsId((cur) => (cur === id ? "" : cur));
          })}
        />
      )}

      {!loading && activeTab === "superadmins" && isSuperadmin && (
        <SuperadminsTab
          superadmins={superadmins}
          onAdd={(slackId) => guard(async () => {
            await call("/api/admin/superadmins", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slackId }) });
            await loadTab();
          })}
          onRemove={(slackId) => guard(async () => {
            await call("/api/admin/superadmins", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slackId }) });
            await loadTab();
          })}
        />
      )}

      {!loading && activeTab === "system" && isSuperadmin && system && <SystemTab system={system} />}
    </div>
  );
}

function SuperadminsTab({
  superadmins, onAdd, onRemove,
}: {
  superadmins: SuperadminEntry[];
  onAdd: (slackId: string) => void;
  onRemove: (slackId: string) => void;
}) {
  const [addSlackId, setAddSlackId] = useState("");
  const submit = () => { if (addSlackId.trim()) { onAdd(addSlackId.trim()); setAddSlackId(""); } };

  return (
    <div className="space-y-6">
      <div className="bg-hc-red/5 border border-hc-red/20 rounded-hc p-4 text-sm text-hc-smoke">
        Grant this sparingly
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="Slack ID (e.g. U0123ABC)"
          value={addSlackId}
          onChange={(e) => setAddSlackId(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          className="flex-1 bg-hc-darker border border-hc-darkless rounded-hc px-4 py-2.5 text-hc-smoke placeholder-hc-muted focus:outline-none focus:border-hc-cyan transition-colors font-mono text-sm"
        />
        <button onClick={submit} className="bg-hc-red hover:bg-[#d82a41] text-white font-bold py-2.5 px-5 rounded-hc transition-colors text-sm">
          Add superadmin
        </button>
      </div>

      <div className="bg-hc-dark rounded-hc border border-hc-darkless overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hc-darkless">
                <th className="text-left text-hc-muted font-bold py-3 px-4">User</th>
                <th className="text-left text-hc-muted font-bold py-3 px-4">Slack ID</th>
                <th className="text-right text-hc-muted font-bold py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {superadmins.length === 0 ? (
                <tr><td colSpan={3} className="text-center text-hc-muted py-8">No superadmins</td></tr>
              ) : (
                superadmins.map((s) => (
                  <tr key={s.slackId} className="border-b border-hc-darkless/50 hover:bg-hc-darker/50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        {s.image && (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={s.image} alt={s.name ?? "User"} className="w-8 h-8 rounded-full" />
                        )}
                        <span className="font-medium text-hc-smoke">{s.name ?? "Unknown"}</span>
                        {s.isSelf && <span className="text-hc-muted text-[11px]">(you)</span>}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-hc-cyan text-xs">{s.slackId}</td>
                    <td className="py-3 px-4 text-right">
                      {s.isSelf ? (
                        <span className="text-hc-muted text-xs">locked</span>
                      ) : (
                        <button onClick={() => onRemove(s.slackId)} title="Revoke superadmin" className="text-hc-muted hover:text-hc-red transition-colors p-1.5 rounded hover:bg-hc-red/10">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// The selected workspace, rendered as a large heading that is itself the
// picker: click the name to switch scope. Used above Members/Sessions/Logs.
function WorkspaceScope({
  workspaces, value, onChange, allowAll,
}: {
  workspaces: Workspace[];
  value: string;
  onChange: (id: string) => void;
  allowAll: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = workspaces.find((w) => w.id === value) ?? null;
  const label = selected ? selected.name : allowAll ? "All workspaces" : "Select a workspace…";

  const pick = (id: string) => { setOpen(false); onChange(id); };

  const row = (id: string, title: string, sub: string | null) => {
    const isActive = id === value;
    return (
      <button
        key={id || "__all"}
        onClick={() => pick(id)}
        role="option"
        aria-selected={isActive}
        className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-sm transition-colors ${
          isActive ? "bg-hc-cyan/10 text-hc-snow" : "text-hc-smoke hover:bg-hc-darkless"
        }`}
      >
        <span className="flex-1 min-w-0">
          <span className="block font-bold truncate">{title}</span>
          {sub && <span className="block text-[11px] text-hc-muted truncate">{sub}</span>}
        </span>
        {isActive && <Check className="w-4 h-4 text-hc-cyan shrink-0" />}
      </button>
    );
  };

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="group flex items-center gap-2 -ml-1.5 px-1.5 py-0.5 rounded-lg hover:bg-hc-darkless/60 transition-colors"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={`text-2xl font-bold tracking-tight ${selected ? "text-hc-snow" : "text-hc-muted"}`}>{label}</span>
        <ChevronDown className="w-5 h-5 text-hc-muted group-hover:text-hc-smoke transition-colors" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute left-0 z-50 mt-2 w-72 max-h-80 overflow-y-auto rounded-hc border border-hc-darkless bg-hc-dark shadow-xl shadow-black/40 p-1.5 animate-in fade-in slide-in-from-top-1 duration-150"
            role="listbox"
          >
            {allowAll && row("", "All workspaces", null)}
            {workspaces.map((w) =>
              row(w.id, `${w.name}${w.enabled ? "" : " (disabled)"}`, `${w.memberCount} member${w.memberCount === 1 ? "" : "s"} · ${w.slug}`),
            )}
          </div>
        </>
      )}
    </div>
  );
}

function MembersTab({
  workspace, members, canPromote, onAdd, onSetRole, onRemove,
}: {
  workspace: Workspace | null;
  members: Member[];
  canPromote: boolean;
  onAdd: (slackId: string) => void;
  onSetRole: (slackId: string, role: "member" | "admin") => void;
  onRemove: (slackId: string) => void;
}) {
  const [addSlackId, setAddSlackId] = useState("");

  if (!workspace) {
    return (
      <div className="bg-hc-dark rounded-hc border border-hc-darkless p-10 text-center text-hc-muted">
        Select a workspace above to manage its members.
      </div>
    );
  }

  const submit = () => { if (addSlackId.trim()) { onAdd(addSlackId.trim()); setAddSlackId(""); } };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="Slack ID (e.g. U0123ABC)"
          value={addSlackId}
          onChange={(e) => setAddSlackId(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          className="flex-1 bg-hc-darker border border-hc-darkless rounded-hc px-4 py-2.5 text-hc-smoke placeholder-hc-muted focus:outline-none focus:border-hc-cyan transition-colors font-mono text-sm"
        />
        <button onClick={submit} className="bg-hc-red hover:bg-[#d82a41] text-white font-bold py-2.5 px-5 rounded-hc transition-colors text-sm">
          Add member
        </button>
      </div>

      <div className="bg-hc-dark rounded-hc border border-hc-darkless overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hc-darkless">
                <th className="text-left text-hc-muted font-bold py-3 px-4">User</th>
                <th className="text-left text-hc-muted font-bold py-3 px-4">Slack ID</th>
                <th className="text-left text-hc-muted font-bold py-3 px-4">Role</th>
                <th className="text-right text-hc-muted font-bold py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.length === 0 ? (
                <tr><td colSpan={4} className="text-center text-hc-muted py-8">No members yet</td></tr>
              ) : (
                members.map((m) => (
                  <tr key={m.slackId} className="border-b border-hc-darkless/50 hover:bg-hc-darker/50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        {m.image && (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={m.image} alt={m.name ?? "User"} className="w-8 h-8 rounded-full" />
                        )}
                        <span className="font-medium text-hc-smoke">{m.name ?? "Unknown"}</span>
                        {m.isSuperadmin && (
                          <span className="bg-hc-red/10 text-hc-red text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-hc-red/20">
                            Superadmin
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-hc-cyan text-xs">{m.slackId}</td>
                    <td className="py-3 px-4">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                        m.role === "admin" ? "bg-hc-orange/10 text-hc-orange border-hc-orange/20" : "bg-hc-slate/10 text-hc-smoke border-hc-slate/20"
                      }`}>
                        {m.role === "admin" ? "Admin" : "Member"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {canPromote && (
                          m.role === "admin" ? (
                            <button onClick={() => onSetRole(m.slackId, "member")} className="text-hc-muted hover:text-hc-smoke transition-colors text-xs font-bold px-2 py-1 rounded hover:bg-hc-slate/20">
                              Make member
                            </button>
                          ) : (
                            <button onClick={() => onSetRole(m.slackId, "admin")} className="text-hc-muted hover:text-hc-orange transition-colors text-xs font-bold px-2 py-1 rounded hover:bg-hc-orange/10">
                              Make admin
                            </button>
                          )
                        )}
                        <button onClick={() => onRemove(m.slackId)} title="Remove from workspace" className="text-hc-muted hover:text-hc-red transition-colors p-1.5 rounded hover:bg-hc-red/10">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SessionsTab({
  sessions, showWorkspace, formatTimeRemaining, onRefresh, onTerminate,
}: {
  sessions: SessionInfo[];
  showWorkspace: boolean;
  formatTimeRemaining: (s: string) => string;
  onRefresh: () => void;
  onTerminate: (id: number) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <span className="text-hc-muted text-sm">{sessions.length} sessions</span>
        <button onClick={onRefresh} className="text-hc-muted hover:text-hc-smoke transition-colors p-2 rounded hover:bg-hc-darkless"><RefreshCw className="w-4 h-4" /></button>
      </div>
      <div className="bg-hc-dark rounded-hc border border-hc-darkless overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hc-darkless">
                <th className="text-left text-hc-muted font-bold py-3 px-4">User</th>
                {showWorkspace && <th className="text-left text-hc-muted font-bold py-3 px-4">Workspace</th>}
                <th className="text-left text-hc-muted font-bold py-3 px-4">VM Type</th>
                <th className="text-left text-hc-muted font-bold py-3 px-4">State</th>
                <th className="text-left text-hc-muted font-bold py-3 px-4">Expires</th>
                <th className="text-left text-hc-muted font-bold py-3 px-4">Created</th>
                <th className="text-right text-hc-muted font-bold py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 ? (
                <tr><td colSpan={showWorkspace ? 7 : 6} className="text-center text-hc-muted py-8">No sessions found</td></tr>
              ) : (
                sessions.map((s) => (
                  <tr key={s.id} className="border-b border-hc-darkless/50 hover:bg-hc-darker/50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        {s.userImage && (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={s.userImage} alt={s.userName ?? ""} className="w-6 h-6 rounded-full" />
                        )}
                        <div>
                          <span className="font-medium text-hc-smoke text-xs">{s.userName ?? "Unknown"}</span>
                          {s.userIsAdmin && <span className="ml-1 text-hc-red text-[10px]">A</span>}
                        </div>
                      </div>
                    </td>
                    {showWorkspace && <td className="py-3 px-4 text-hc-muted text-xs">{s.yswsName ?? "-"}</td>}
                    <td className="py-3 px-4 text-hc-smoke">{s.vmTypeDisplayName ?? "-"}</td>
                    <td className="py-3 px-4">
                      <span className={`${STATE_BG[s.state] ?? ""} ${STATE_COLORS[s.state] ?? "text-hc-muted"} font-bold text-xs px-2 py-0.5 rounded-full border`}>{s.state}</span>
                    </td>
                    <td className="py-3 px-4 text-hc-muted text-xs">
                      {s.expiresAt && ["pending", "provisioning", "ready", "active"].includes(s.state) ? formatTimeRemaining(s.expiresAt) : "-"}
                    </td>
                    <td className="py-3 px-4 text-hc-muted text-xs">{new Date(s.createdAt).toLocaleString()}</td>
                    <td className="py-3 px-4 text-right">
                      {!["terminating", "terminated", "errored"].includes(s.state) && (
                        <button onClick={() => onTerminate(s.id)} title="Terminate session" className="text-hc-muted hover:text-hc-red transition-colors p-1.5 rounded hover:bg-hc-red/10"><XCircle className="w-4 h-4" /></button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function LogsTab({ logs, onRefresh }: { logs: LogEntry[]; onRefresh: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <span className="text-hc-muted text-sm">{logs.length} events</span>
        <button onClick={onRefresh} className="text-hc-muted hover:text-hc-smoke transition-colors p-2 rounded hover:bg-hc-darkless"><RefreshCw className="w-4 h-4" /></button>
      </div>
      <div className="space-y-2">
        {logs.length === 0 ? (
          <div className="text-center text-hc-muted py-8">No events found</div>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="bg-hc-dark rounded-hc border border-hc-darkless p-4 hover:border-hc-slate/30 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  {log.userImage && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={log.userImage} alt="" className="w-6 h-6 rounded-full shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-hc-smoke text-xs">{log.kind}</span>
                      {log.vmType && <span className="text-hc-cyan text-[11px] bg-hc-cyan/10 px-1.5 py-0.5 rounded">{log.vmType}</span>}
                      {log.sessionState && <span className={`${STATE_COLORS[log.sessionState] ?? "text-hc-muted"} text-[11px]`}>{log.sessionState}</span>}
                      <span className="text-hc-muted text-[11px]">Session #{log.vmSessionId}</span>
                      {log.userName && <span className="text-hc-muted text-[11px]">by {log.userName}</span>}
                    </div>
                    {Object.keys(log.payload).length > 0 && (
                      <pre className="text-[11px] text-hc-muted mt-1 font-mono overflow-x-auto">{JSON.stringify(log.payload)}</pre>
                    )}
                  </div>
                </div>
                <span className="text-hc-muted text-[11px] whitespace-nowrap shrink-0">{new Date(log.createdAt).toLocaleString()}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function WorkspacesTab({
  workspaces, onCreate, onUpdate, onDelete,
}: {
  workspaces: Workspace[];
  onCreate: (p: { name: string; slug: string; maxConcurrentVms: number | null }) => void;
  onUpdate: (p: { id: string; name?: string; maxConcurrentVms?: number | null; enabled?: boolean }) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [cap, setCap] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editCap, setEditCap] = useState("");

  const create = () => {
    if (!name.trim() || !slug.trim()) return;
    onCreate({ name: name.trim(), slug: slug.trim(), maxConcurrentVms: cap.trim() === "" ? null : Number(cap) });
    setName(""); setSlug(""); setCap("");
  };

  return (
    <div className="space-y-6">
      <div className="bg-hc-dark rounded-hc border border-hc-darkless p-5 space-y-4">
        <h3 className="text-lg font-bold text-hc-smoke">New workspace</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. High Seas)"
            className="bg-hc-darker border border-hc-darkless rounded-hc px-4 py-2.5 text-hc-smoke placeholder-hc-muted focus:outline-none focus:border-hc-cyan transition-colors text-sm" />
          <input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} placeholder="slug (e.g. high-seas)"
            className="bg-hc-darker border border-hc-darkless rounded-hc px-4 py-2.5 text-hc-smoke placeholder-hc-muted focus:outline-none focus:border-hc-cyan transition-colors font-mono text-sm" />
          <input value={cap} onChange={(e) => setCap(e.target.value)} placeholder="Max VMs (blank = unlimited)" inputMode="numeric"
            className="bg-hc-darker border border-hc-darkless rounded-hc px-4 py-2.5 text-hc-smoke placeholder-hc-muted focus:outline-none focus:border-hc-cyan transition-colors text-sm" />
        </div>
        <button onClick={create} className="bg-hc-red hover:bg-[#d82a41] text-white font-bold py-2.5 px-5 rounded-hc transition-colors text-sm">
          Create workspace
        </button>
      </div>

      <div className="bg-hc-dark rounded-hc border border-hc-darkless overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hc-darkless">
                <th className="text-left text-hc-muted font-bold py-3 px-4">Workspace</th>
                <th className="text-left text-hc-muted font-bold py-3 px-4">Members</th>
                <th className="text-left text-hc-muted font-bold py-3 px-4">VMs (used / cap)</th>
                <th className="text-left text-hc-muted font-bold py-3 px-4">Status</th>
                <th className="text-right text-hc-muted font-bold py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {workspaces.length === 0 ? (
                <tr><td colSpan={5} className="text-center text-hc-muted py-8">No workspaces yet</td></tr>
              ) : (
                workspaces.map((w) => {
                  const hot = w.maxConcurrentVms != null && w.activeVms >= w.maxConcurrentVms;
                  return (
                    <tr key={w.id} className="border-b border-hc-darkless/50 hover:bg-hc-darker/50 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-medium text-hc-smoke">{w.name}</div>
                        <div className="font-mono text-hc-muted text-xs">{w.slug}</div>
                      </td>
                      <td className="py-3 px-4 text-hc-smoke font-mono">{w.memberCount}</td>
                      <td className="py-3 px-4 font-mono">
                        {editing === w.id ? (
                          <div className="flex items-center gap-2">
                            <input autoFocus value={editCap} onChange={(e) => setEditCap(e.target.value)} placeholder="∞" inputMode="numeric"
                              className="w-20 bg-hc-darker border border-hc-cyan/40 rounded px-2 py-1 text-hc-smoke text-xs focus:outline-none" />
                            <button
                              onClick={() => { onUpdate({ id: w.id, maxConcurrentVms: editCap.trim() === "" ? null : Number(editCap) }); setEditing(null); }}
                              className="text-hc-green hover:text-hc-snow p-1"><Check className="w-4 h-4" /></button>
                            <button onClick={() => setEditing(null)} className="text-hc-muted hover:text-hc-smoke p-1"><XCircle className="w-4 h-4" /></button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setEditing(w.id); setEditCap(w.maxConcurrentVms?.toString() ?? ""); }}
                            className="flex items-center gap-1.5 hover:underline decoration-hc-slate/60 underline-offset-4"
                            title="Click to edit cap"
                          >
                            <span className={hot ? "text-hc-red font-bold" : "text-hc-smoke"}>{w.activeVms}</span>
                            <span className="text-hc-muted">/ {w.maxConcurrentVms ?? "∞"}</span>
                          </button>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => onUpdate({ id: w.id, enabled: !w.enabled })}
                          className={`text-xs font-bold px-2 py-0.5 rounded-full border transition-colors ${
                            w.enabled ? "bg-hc-green/10 text-hc-green border-hc-green/20 hover:bg-hc-green/20" : "bg-hc-slate/10 text-hc-muted border-hc-slate/20 hover:bg-hc-slate/20"
                          }`}
                          title={w.enabled ? "Click to disable" : "Click to enable"}
                        >
                          {w.enabled ? "Enabled" : "Disabled"}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => { if (confirm(`Delete workspace "${w.name}"? Members lose access; running VMs keep going but detach.`)) onDelete(w.id); }}
                          title="Delete workspace"
                          className="text-hc-muted hover:text-hc-red transition-colors p-1.5 rounded hover:bg-hc-red/10"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SystemTab({ system }: { system: SystemInfo }) {
  return (
    <div className="space-y-6">
      <PoolCard pool={system.pool} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <StatCard title="App Node" items={[
          { label: "Hostname", value: system.node.hostname },
          { label: "Uptime", value: system.node.uptime },
          { label: "CPU", value: `${system.node.cpus}x ${system.node.cpuModel}` },
          { label: "Memory", value: `${system.node.freeMemory} free / ${system.node.totalMemory} total (${system.node.memoryUsagePercent}%)` },
          { label: "Load Avg", value: system.node.loadAvg.join(", ") },
        ]} />
        {"error" in system.proxmox ? (
          <StatCard title="Proxmox" items={[{ label: "Error", value: system.proxmox.error }]} />
        ) : (
          <StatCard title={`Proxmox (${system.proxmox.node})`} items={[
            { label: "Status", value: system.proxmox.status },
            { label: "Uptime", value: system.proxmox.uptime },
            { label: "CPU", value: `${system.proxmox.cpuPercent}% (${system.proxmox.cpuCores} cores)` },
            { label: "Memory", value: `${system.proxmox.memoryUsed} / ${system.proxmox.memoryTotal} (${system.proxmox.memoryPercent}%)` },
            { label: "Disk", value: `${system.proxmox.diskUsed} / ${system.proxmox.diskTotal} (${system.proxmox.diskPercent}%)` },
          ]} />
        )}
        {"error" in system.queues ? (
          <StatCard title="Job Queues" items={[{ label: "Error", value: system.queues.error }]} />
        ) : (
          <StatCard title="Job Queues (BullMQ)" items={[
            { label: "Waiting", value: String(system.queues.waiting) },
            { label: "Active", value: String(system.queues.active) },
            { label: "Delayed", value: String(system.queues.delayed) },
            { label: "Failed", value: String(system.queues.failed), highlight: system.queues.failed > 0 },
            { label: "Completed", value: String(system.queues.completed) },
          ]} />
        )}
        {"error" in system.redis ? (
          <StatCard title="Redis" items={[{ label: "Error", value: system.redis.error }]} />
        ) : (
          <StatCard title="Redis" items={[
            { label: "Used Memory", value: system.redis.usedMemory },
            { label: "Max Memory", value: system.redis.maxMemory },
            { label: "Connected Clients", value: String(system.redis.connectedClients ?? "N/A") },
          ]} />
        )}
      </div>
    </div>
  );
}

function PoolCard({ pool }: { pool: SystemInfo["pool"] }) {
  if ("error" in pool) return <StatCard title="Warm Pool" items={[{ label: "Error", value: pool.error }]} />;

  const budgetPercent = pool.budgetMb > 0 ? Math.min(100, Math.round((pool.committedMb / pool.budgetMb) * 100)) : 0;
  const budgetHot = budgetPercent >= 85;

  return (
    <div className="bg-hc-dark rounded-hc border border-hc-darkless p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-hc-smoke flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-hc-cyan"></span>Warm Pool</h3>
        <span className="text-hc-muted text-sm font-mono">{(pool.committedMb / 1024).toFixed(1)} / {(pool.budgetMb / 1024).toFixed(1)} GB committed</span>
      </div>
      <div className="h-2 w-full rounded-full bg-hc-darker overflow-hidden mb-5">
        <div className={`h-full rounded-full ${budgetHot ? "bg-hc-red" : "bg-hc-green"}`} style={{ width: `${budgetPercent}%` }}></div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hc-darkless text-hc-muted">
              <th className="text-left font-bold py-2 pr-4">VM Type</th>
              <th className="text-center font-bold py-2 px-2" title="Ready to claim">Warm</th>
              <th className="text-center font-bold py-2 px-2" title="Target pool size">Target</th>
              <th className="text-center font-bold py-2 px-2" title="Booting into pool">Warming</th>
              <th className="text-center font-bold py-2 px-2" title="In use by users">In use</th>
              <th className="text-center font-bold py-2 px-2" title="Users waiting for a VM">Waiting</th>
              <th className="text-right font-bold py-2 pl-2">RAM</th>
            </tr>
          </thead>
          <tbody>
            {pool.types.map((t) => (
              <tr key={t.slug} className="border-b border-hc-darkless/50">
                <td className="py-2 pr-4 text-hc-smoke font-medium">{t.displayName}</td>
                <td className="py-2 px-2 text-center font-mono"><span className={t.warm >= t.target ? "text-hc-green" : "text-hc-yellow"}>{t.warm}</span></td>
                <td className="py-2 px-2 text-center font-mono text-hc-muted">{t.target}</td>
                <td className="py-2 px-2 text-center font-mono text-hc-muted">{t.warming || "-"}</td>
                <td className="py-2 px-2 text-center font-mono text-hc-smoke">{t.active || "-"}</td>
                <td className="py-2 px-2 text-center font-mono"><span className={t.waiting > 0 ? "text-hc-orange font-bold" : "text-hc-muted"}>{t.waiting || "-"}</span></td>
                <td className="py-2 pl-2 text-right font-mono text-hc-muted">{(t.memoryMb / 1024).toFixed(0)}G</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({ title, items }: { title: string; items: { label: string; value: string; highlight?: boolean }[] }) {
  return (
    <div className="bg-hc-dark rounded-hc border border-hc-darkless p-5">
      <h3 className="text-lg font-bold text-hc-smoke mb-4 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-hc-cyan"></span>{title}</h3>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.label} className="flex justify-between items-center">
            <span className="text-hc-muted text-sm">{item.label}</span>
            <span className={`font-mono text-sm ${item.highlight ? "text-hc-red font-bold" : "text-hc-smoke"}`}>{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
