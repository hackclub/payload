import { spawn } from "node:child_process";
import { sleep } from "./client";
import type { ProxmoxConfig } from "./config";

export type IpDiscoveryInput = {
  macAddress: string;
  timeoutMs?: number;
  intervalMs?: number;
  config: ProxmoxConfig;
};

export async function discoverIpFromProxmoxNeighborTable(input: IpDiscoveryInput) {
  const timeoutAt = Date.now() + (input.timeoutMs ?? 120_000);
  const intervalMs = input.intervalMs ?? 3_000;
  const macAddress = input.macAddress.toLowerCase();

  while (Date.now() < timeoutAt) {
    const neighbors = await readNeighborTable(input.config);
    const match = findIpForMac(neighbors, macAddress);
    if (match) {
      return match;
    }

    await sleep(intervalMs);
  }

  throw new Error(`Timed out waiting for an IPv4 neighbor entry for ${macAddress}`);
}

export function findIpForMac(neighborTable: string, macAddress: string) {
  const normalizedMac = macAddress.toLowerCase();

  for (const line of neighborTable.split("\n")) {
    const columns = line.trim().split(/\s+/);
    const ip = columns[0];
    const lladdrIndex = columns.findIndex((column) => column === "lladdr");
    const mac = lladdrIndex >= 0 ? columns[lladdrIndex + 1]?.toLowerCase() : undefined;

    if (mac === normalizedMac && isUsableIpv4(ip)) {
      return ip;
    }
  }

  return undefined;
}

async function readNeighborTable(config: ProxmoxConfig) {
  const sshTarget = config.sshHost
    ? `${config.sshUser ? `${config.sshUser}@` : ""}${config.sshHost}`
    : `${config.sshUser ? `${config.sshUser}@` : ""}${config.host}`;

  const sshArgs = [
    "-o",
    `BatchMode=${config.sshPassword ? "no" : "yes"}`,
    "-o",
    "StrictHostKeyChecking=accept-new",
    "-p",
    String(config.sshPort),
  ];

  if (config.sshKeyPath && !config.sshPassword) {
    sshArgs.push("-i", config.sshKeyPath);
  }

  sshArgs.push(sshTarget, "ip -4 neigh show");

  if (config.sshPassword) {
    return run("sshpass", ["-e", "ssh", ...sshArgs], {
      SSHPASS: config.sshPassword,
    });
  }

  return run("ssh", sshArgs);
}

function run(command: string, args: string[], env?: Record<string, string>) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, {
      env: env ? { ...process.env, ...env } : process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`${command} exited ${code}: ${stderr.trim()}`));
      }
    });
  });
}

function isUsableIpv4(ip: string | undefined) {
  return Boolean(ip && /^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip) && !ip.startsWith("127."));
}
