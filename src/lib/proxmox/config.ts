import { ProxmoxClient } from "./client";

export type ProxmoxConfig = {
  host: string;
  port: number;
  baseUrl: string;
  tokenId: string;
  tokenSecret: string;
  defaultNode: string;
  verifyTls: boolean;
  sshHost?: string;
  sshUser?: string;
  sshKeyPath?: string;
  sshPassword?: string;
  sshPort: number;
};

export function getProxmoxConfig(env: NodeJS.ProcessEnv = process.env): ProxmoxConfig {
  const host = requiredEnv(env, "PROXMOX_HOST");
  const port = numberEnv(env, "PROXMOX_PORT", 8006);
  const verifyTls = booleanEnv(env, "PROXMOX_VERIFY_TLS", true);
  const tokenId = requiredEnv(env, "PROXMOX_TOKEN_ID");

  if (!verifyTls) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }

  if (!/^[^@\s]+@[^!\s]+![^!\s]+$/.test(tokenId)) {
    throw new Error(
      "PROXMOX_TOKEN_ID must be the full Proxmox API token id, for example " +
        "`payload@pve!payload` or `root@pam!payload`. The token name alone is not enough.",
    );
  }

  return {
    host,
    port,
    baseUrl: `https://${host}:${port}`,
    tokenId,
    tokenSecret: requiredEnv(env, "PROXMOX_TOKEN_SECRET"),
    defaultNode: requiredEnv(env, "PROXMOX_DEFAULT_NODE"),
    verifyTls,
    sshHost: env.PROXMOX_SSH_HOST,
    sshUser: env.PROXMOX_SSH_USER,
    sshKeyPath: env.PROXMOX_SSH_KEY_PATH,
    sshPassword: env.PROXMOX_SSH_PASSWORD,
    sshPort: numberEnv(env, "PROXMOX_SSH_PORT", 22),
  };
}

export function createProxmoxClient(config = getProxmoxConfig()) {
  return new ProxmoxClient({
    baseUrl: config.baseUrl,
    tokenId: config.tokenId,
    tokenSecret: config.tokenSecret,
  });
}

function requiredEnv(env: NodeJS.ProcessEnv, name: string) {
  const value = env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

function numberEnv(env: NodeJS.ProcessEnv, name: string, fallback: number) {
  const raw = env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a number`);
  }
  return parsed;
}

function booleanEnv(env: NodeJS.ProcessEnv, name: string, fallback: boolean) {
  const raw = env[name];
  if (!raw) {
    return fallback;
  }
  return raw === "1" || raw.toLowerCase() === "true";
}
