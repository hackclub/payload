import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-guard";
import { createProxmoxClient } from "@/lib/proxmox/config";
import { vmQueue } from "@/lib/queue";
import { redis } from "@/lib/redis";
import os from "node:os";

export async function GET() {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [proxmoxStats, queueCounts, redisInfo] = await Promise.allSettled([
    getProxmoxNodeStats(),
    getQueueCounts(),
    getRedisInfo(),
  ]);

  return NextResponse.json({
    node: {
      hostname: os.hostname(),
      uptime: formatUptime(os.uptime()),
      platform: os.platform(),
      cpus: os.cpus().length,
      cpuModel: os.cpus()[0]?.model ?? "unknown",
      totalMemory: formatBytes(os.totalmem()),
      freeMemory: formatBytes(os.freemem()),
      memoryUsagePercent: ((1 - os.freemem() / os.totalmem()) * 100).toFixed(1),
      loadAvg: os.loadavg().map((l) => l.toFixed(2)),
    },
    proxmox: proxmoxStats.status === "fulfilled" ? proxmoxStats.value : { error: proxmoxStats.reason?.message ?? "Failed to fetch" },
    queues: queueCounts.status === "fulfilled" ? queueCounts.value : { error: queueCounts.reason?.message ?? "Failed to fetch" },
    redis: redisInfo.status === "fulfilled" ? redisInfo.value : { error: redisInfo.reason?.message ?? "Failed to fetch" },
  });
}

async function getProxmoxNodeStats() {
  const client = createProxmoxClient();
  const { getProxmoxConfig } = await import("@/lib/proxmox/config");
  const config = getProxmoxConfig();

  type ProxmoxNodeStatus = {
    cpu?: number;
    uptime?: number;
    cpuinfo?: { cpus?: number; model?: string };
    memory?: { total?: number; used?: number; free?: number; available?: number };
    rootfs?: { total?: number; used?: number; free?: number; avail?: number };
    swap?: { total?: number; used?: number; free?: number };
    loadavg?: string[];
  };

  const nodeStatus = await client.request<ProxmoxNodeStatus>(`/nodes/${config.defaultNode}/status`);

  const cpu = nodeStatus.cpu ?? 0;
  const cpuCores = nodeStatus.cpuinfo?.cpus ?? 0;
  const cpuPercent = cpuCores > 0 ? (cpu * 100).toFixed(1) : "0.0";

  const memUsed = nodeStatus.memory?.used ?? 0;
  const memTotal = nodeStatus.memory?.total ?? 1;
  const memPercent = memTotal > 0 ? ((memUsed / memTotal) * 100).toFixed(1) : "0.0";

  const diskUsed = nodeStatus.rootfs?.used ?? 0;
  const diskTotal = nodeStatus.rootfs?.total ?? 1;
  const diskPercent = diskTotal > 0 ? ((diskUsed / diskTotal) * 100).toFixed(1) : "0.0";

  return {
    node: config.defaultNode,
    status: "online",
    uptime: formatUptime(nodeStatus.uptime ?? 0),
    cpuPercent,
    cpuCores,
    memoryUsed: formatBytes(memUsed),
    memoryTotal: formatBytes(memTotal),
    memoryPercent: memPercent,
    diskUsed: formatBytes(diskUsed),
    diskTotal: formatBytes(diskTotal),
    diskPercent,
  };
}

async function getQueueCounts() {
  const [waiting, active, delayed, failed, completed] = await Promise.all([
    vmQueue.getWaitingCount(),
    vmQueue.getActiveCount(),
    vmQueue.getDelayedCount(),
    vmQueue.getFailedCount(),
    vmQueue.getCompletedCount(),
  ]);

  return { waiting, active, delayed, failed, completed };
}

async function getRedisInfo() {
  const info = await redis.info("memory");
  const usedMemoryMatch = info.match(/used_memory_human:(\S+)/);
  const maxMemoryMatch = info.match(/maxmemory_human:(\S+)/);
  const connectedClientsMatch = info.match(/connected_clients:(\d+)/);

  return {
    usedMemory: usedMemoryMatch?.[1] ?? "unknown",
    maxMemory: maxMemoryMatch?.[1] ?? "unlimited",
    connectedClients: connectedClientsMatch ? Number(connectedClientsMatch[1]) : null,
  };
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(1)} ${units[i]}`;
}

function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0m";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
