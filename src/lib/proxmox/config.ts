import { ProxmoxClient } from "./client";
import { env } from "../../env";

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

export function getProxmoxConfig(): ProxmoxConfig {
  if (!env.PROXMOX_VERIFY_TLS) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }

  return {
    host: env.PROXMOX_HOST,
    port: env.PROXMOX_PORT,
    baseUrl: `https://${env.PROXMOX_HOST}:${env.PROXMOX_PORT}`,
    tokenId: env.PROXMOX_TOKEN_ID,
    tokenSecret: env.PROXMOX_TOKEN_SECRET,
    defaultNode: env.PROXMOX_DEFAULT_NODE,
    verifyTls: env.PROXMOX_VERIFY_TLS,
    sshHost: env.PROXMOX_SSH_HOST,
    sshUser: env.PROXMOX_SSH_USER,
    sshKeyPath: env.PROXMOX_SSH_KEY_PATH,
    sshPassword: env.PROXMOX_SSH_PASSWORD,
    sshPort: env.PROXMOX_SSH_PORT,
  };
}

export function createProxmoxClient(config = getProxmoxConfig()) {
  return new ProxmoxClient({
    baseUrl: config.baseUrl,
    tokenId: config.tokenId,
    tokenSecret: config.tokenSecret,
  });
}
