"use client";

import { useState, useEffect, useCallback } from "react";
import { Users, Monitor, Server, ScrollText, Shield, Plus, Trash2, XCircle, RefreshCw } from "lucide-react";

type Tab = "users" | "sessions" | "system" | "logs" | "admins";

type AllowlistUser = {
  slackId: string;
  name: string | null;
  image: string | null;
  isAdmin: boolean;
  createdAt: string;
};

type SessionInfo = {
  id: number;
  state: string;
  vmType: string | null;
  vmTypeDisplayName: string | null;
  userId: string;
  userName: string | null;
  userImage: string | null;
  userSlackId: string | null;
  userIsAdmin: boolean;
  proxmoxVmid: number | null;
  expiresAt: string;
  lastHeartbeatAt: string | null;
  terminatedAt: string | null;
  terminationReason: string | null;
  createdAt: string;
};

type SystemInfo = {
  node: {
    hostname: string;
    uptime: string;
    platform: string;
    cpus: number;
    cpuModel: string;
    totalMemory: string;
    freeMemory: string;
    memoryUsagePercent: string;
    loadAvg: string[];
  };
  proxmox: {
    node: string;
    status: string;
    uptime: string;
    cpuPercent: string;
    cpuCores: number;
    memoryUsed: string;
    memoryTotal: string;
    memoryPercent: string;
    diskUsed: string;
    diskTotal: string;
    diskPercent: string;
  } | { error: string };
  queues: {
    waiting: number;
    active: number;
    delayed: number;
    failed: number;
    completed: number;
  } | { error: string };
  redis: {
    usedMemory: string;
    maxMemory: string;
    connectedClients: number | null;
  } | { error: string };
};

type LogEntry = {
  id: number;
  vmSessionId: number;
  kind: string;
  payload: Record<string, unknown>;
  createdAt: string;
  sessionState: string | null;
  vmType: string | null;
  userName: string | null;
  userImage: string | null;
};

type AdminEntry = {
  slackId: string;
  name: string | null;
  image: string | null;
  createdAt: string;
};

const STATE_COLORS: Record<string, string> = {
  pending: "text-hc-yellow",
  provisioning: "text-hc-yellow",
  ready: "text-hc-green",
  active: "text-hc-green",
  terminating: "text-hc-orange",
  terminated: "text-hc-muted",
  errored: "text-hc-red",
};

const STATE_BG: Record<string, string> = {
  pending: "bg-hc-yellow/10 border-hc-yellow/20",
  provisioning: "bg-hc-yellow/10 border-hc-yellow/20",
  ready: "bg-hc-green/10 border-hc-green/20",
  active: "bg-hc-green/10 border-hc-green/20",
  terminating: "bg-hc-orange/10 border-hc-orange/20",
  terminated: "bg-hc-darker border-hc-slate/20",
  errored: "bg-hc-red/10 border-hc-red/20",
};

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: "users", label: "Users", icon: Users },
  { key: "sessions", label: "Sessions", icon: Monitor },
  { key: "system", label: "System", icon: Server },
  { key: "logs", label: "Logs", icon: ScrollText },
  { key: "admins", label: "Admins", icon: Shield },
];

const API_PATH: Record<Tab, string> = {
  users: "allowlist",
  sessions: "sessions",
  system: "system",
  logs: "logs",
  admins: "admins",
};

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>("users");
  const [users, setUsers] = useState<AllowlistUser[]>([]);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [admins, setAdmins] = useState<AdminEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [addSlackId, setAddSlackId] = useState("");
  const [adminAddSlackId, setAdminAddSlackId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const fetchTab = useCallback(async (tab: Tab) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/${API_PATH[tab]}`);
      if (!res.ok) throw new Error(`Failed to fetch ${tab}`);
      const data = await res.json();
      if (tab === "users") setUsers(data);
      else if (tab === "sessions") setSessions(data);
      else if (tab === "system") setSystem(data);
      else if (tab === "logs") setLogs(data);
      else if (tab === "admins") setAdmins(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/${API_PATH[activeTab]}`);
        if (cancelled) return;
        if (!res.ok) throw new Error(`Failed to fetch ${activeTab}`);
        const data = await res.json();
        if (cancelled) return;
        if (activeTab === "users") setUsers(data);
        else if (activeTab === "sessions") setSessions(data);
        else if (activeTab === "system") setSystem(data);
        else if (activeTab === "logs") setLogs(data);
        else if (activeTab === "admins") setAdmins(data);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [activeTab]);

  const handleAddUser = async () => {
    if (!addSlackId.trim()) return;
    const res = await fetch("/api/admin/allowlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slackId: addSlackId.trim() }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to add user");
      return;
    }
    setAddSlackId("");
    fetchTab("users");
  };

  const handleRemoveUser = async (slackId: string) => {
    const res = await fetch("/api/admin/allowlist", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slackId }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to remove user");
      return;
    }
    fetchTab("users");
  };

  const handleTerminateSession = async (sessionId: number) => {
    const res = await fetch(`/api/admin/sessions/${sessionId}/terminate`, {
      method: "POST",
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to terminate session");
      return;
    }
    fetchTab("sessions");
  };

  const handleAddAdmin = async () => {
    if (!adminAddSlackId.trim()) return;
    const res = await fetch("/api/admin/admins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slackId: adminAddSlackId.trim() }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to add admin");
      return;
    }
    setAdminAddSlackId("");
    fetchTab("admins");
  };

  const handleRemoveAdmin = async (slackId: string) => {
    const res = await fetch("/api/admin/admins", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slackId }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to remove admin");
      return;
    }
    fetchTab("admins");
  };

  const [now, setNow] = useState(() => {
    if (typeof window !== "undefined") return Date.now();
    return 0;
  });

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

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-hc-snow tracking-tight">Admin Panel</h1>
        <p className="text-hc-muted text-lg mt-2">Manage users, monitor sessions, and view system health.</p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-hc-darkless pb-4">
        {TABS.map((tab) => {
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

      {error && (
        <div className="bg-hc-red/10 border border-hc-red/30 rounded-hc p-4 flex items-center justify-between">
          <span className="text-hc-red text-sm font-medium">{error}</span>
          <button onClick={() => setError(null)} className="text-hc-red hover:text-hc-smoke">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-hc-muted text-sm">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Loading...
        </div>
      )}

      {!loading && activeTab === "users" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              placeholder="Slack ID (e.g. U0123ABC)"
              value={addSlackId}
              onChange={(e) => setAddSlackId(e.target.value)}
              className="flex-1 bg-hc-darker border border-hc-darkless rounded-hc px-4 py-2.5 text-hc-smoke placeholder-hc-muted focus:outline-none focus:border-hc-cyan transition-colors font-mono text-sm"
              onKeyDown={(e) => e.key === "Enter" && handleAddUser()}
            />
            <button
              onClick={handleAddUser}
              className="bg-hc-red hover:bg-[#d82a41] text-white font-bold py-2.5 px-5 rounded-hc flex items-center gap-2 transition-colors text-sm"
            >
              <Plus className="w-4 h-4" /> Add User
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
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center text-hc-muted py-8">No allowlisted users</td>
                    </tr>
                  ) : (
                    users.map((u) => (
                      <tr key={u.slackId} className="border-b border-hc-darkless/50 hover:bg-hc-darker/50 transition-colors">
<td className="py-3 px-4">
                           <div className="flex items-center gap-3">
                             {u.image && (
                               /* eslint-disable-next-line @next/next/no-img-element */
                               <img src={u.image} alt={u.name ?? "User"} className="w-8 h-8 rounded-full" />
                             )}
                             <span className="font-medium text-hc-smoke">{u.name ?? "Unknown"}</span>
                           </div>
                         </td>
                        <td className="py-3 px-4 font-mono text-hc-cyan text-xs">{u.slackId}</td>
                        <td className="py-3 px-4">
                          {u.isAdmin && (
                            <span className="bg-hc-red/10 text-hc-red text-xs font-bold px-2 py-0.5 rounded-full border border-hc-red/20">Admin</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => handleRemoveUser(u.slackId)}
                            className="text-hc-muted hover:text-hc-red transition-colors p-1.5 rounded hover:bg-hc-red/10"
                            title="Remove from allowlist"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {!loading && activeTab === "sessions" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-hc-muted text-sm">{sessions.length} sessions</span>
            <button
              onClick={() => fetchTab("sessions")}
              className="text-hc-muted hover:text-hc-smoke transition-colors p-2 rounded hover:bg-hc-darkless"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
          <div className="bg-hc-dark rounded-hc border border-hc-darkless overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-hc-darkless">
                    <th className="text-left text-hc-muted font-bold py-3 px-4">User</th>
                    <th className="text-left text-hc-muted font-bold py-3 px-4">VM Type</th>
                    <th className="text-left text-hc-muted font-bold py-3 px-4">State</th>
                    <th className="text-left text-hc-muted font-bold py-3 px-4">Expires</th>
                    <th className="text-left text-hc-muted font-bold py-3 px-4">Created</th>
                    <th className="text-right text-hc-muted font-bold py-3 px-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center text-hc-muted py-8">No sessions found</td>
                    </tr>
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
                        <td className="py-3 px-4 text-hc-smoke">{s.vmTypeDisplayName ?? "-"}</td>
                        <td className="py-3 px-4">
                          <span className={`${STATE_BG[s.state] ?? ""} ${STATE_COLORS[s.state] ?? "text-hc-muted"} font-bold text-xs px-2 py-0.5 rounded-full border`}>
                            {s.state}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-hc-muted text-xs">
                          {["pending", "provisioning", "ready", "active"].includes(s.state)
                            ? formatTimeRemaining(s.expiresAt)
                            : "-"}
                        </td>
                        <td className="py-3 px-4 text-hc-muted text-xs">
                          {new Date(s.createdAt).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {!["terminating", "terminated", "errored"].includes(s.state) && (
                            <button
                              onClick={() => handleTerminateSession(s.id)}
                              className="text-hc-muted hover:text-hc-red transition-colors p-1.5 rounded hover:bg-hc-red/10"
                              title="Terminate session"
                            >
                              <XCircle className="w-4 h-4" />
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
      )}

      {!loading && activeTab === "system" && system && (
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
      )}

      {!loading && activeTab === "logs" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-hc-muted text-sm">{logs.length} events</span>
            <button
              onClick={() => fetchTab("logs")}
              className="text-hc-muted hover:text-hc-smoke transition-colors p-2 rounded hover:bg-hc-darkless"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
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
                          {log.vmType && (
                            <span className="text-hc-cyan text-[11px] bg-hc-cyan/10 px-1.5 py-0.5 rounded">{log.vmType}</span>
                          )}
                          {log.sessionState && (
                            <span className={`${STATE_COLORS[log.sessionState] ?? "text-hc-muted"} text-[11px]`}>
                              {log.sessionState}
                            </span>
                          )}
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
      )}

      {!loading && activeTab === "admins" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              placeholder="Slack ID (e.g. U0123ABC)"
              value={adminAddSlackId}
              onChange={(e) => setAdminAddSlackId(e.target.value)}
              className="flex-1 bg-hc-darker border border-hc-darkless rounded-hc px-4 py-2.5 text-hc-smoke placeholder-hc-muted focus:outline-none focus:border-hc-cyan transition-colors font-mono text-sm"
              onKeyDown={(e) => e.key === "Enter" && handleAddAdmin()}
            />
            <button
              onClick={handleAddAdmin}
              className="bg-hc-red hover:bg-[#d82a41] text-white font-bold py-2.5 px-5 rounded-hc flex items-center gap-2 transition-colors text-sm"
            >
              <Plus className="w-4 h-4" /> Add Admin
            </button>
          </div>

          <div className="bg-hc-dark rounded-hc border border-hc-darkless overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-hc-darkless">
                    <th className="text-left text-hc-muted font-bold py-3 px-4">Admin</th>
                    <th className="text-left text-hc-muted font-bold py-3 px-4">Slack ID</th>
                    <th className="text-right text-hc-muted font-bold py-3 px-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {admins.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="text-center text-hc-muted py-8">No admins</td>
                    </tr>
                  ) : (
                    admins.map((a) => (
                      <tr key={a.slackId} className="border-b border-hc-darkless/50 hover:bg-hc-darker/50 transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            {a.image && (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img src={a.image} alt={a.name ?? "Admin"} className="w-8 h-8 rounded-full" />
                            )}
                            <span className="font-medium text-hc-smoke">{a.name ?? "Unknown"}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono text-hc-cyan text-xs">{a.slackId}</td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => handleRemoveAdmin(a.slackId)}
                            className="text-hc-muted hover:text-hc-red transition-colors p-1.5 rounded hover:bg-hc-red/10"
                            title="Remove admin access"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ title, items }: { title: string; items: { label: string; value: string; highlight?: boolean }[] }) {
  return (
    <div className="bg-hc-dark rounded-hc border border-hc-darkless p-5">
      <h3 className="text-lg font-bold text-hc-smoke mb-4 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-hc-cyan"></span>
        {title}
      </h3>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.label} className="flex justify-between items-center">
            <span className="text-hc-muted text-sm">{item.label}</span>
            <span className={`font-mono text-sm ${item.highlight ? "text-hc-red font-bold" : "text-hc-smoke"}`}>
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
