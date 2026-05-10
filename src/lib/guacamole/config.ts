import { GuacamoleClient } from "./client";

export type GuacamoleConfig = {
  /** Internal base URL the app uses to talk to Guacamole's REST API. */
  baseUrl: string;
  /** Public base URL the reviewer's browser uses to load the iframe. */
  publicBaseUrl: string;
  dataSource: string;
  adminUsername: string;
  adminPassword: string;
};

export function getGuacamoleConfig(env: NodeJS.ProcessEnv = process.env): GuacamoleConfig {
  return {
    baseUrl: requiredEnv(env, "GUACAMOLE_BASE_URL").replace(/\/$/, ""),
    publicBaseUrl: requiredEnv(env, "GUACAMOLE_PUBLIC_BASE_URL").replace(/\/$/, ""),
    dataSource: env.GUACAMOLE_DATA_SOURCE ?? "postgresql",
    adminUsername: requiredEnv(env, "GUACAMOLE_ADMIN_USER"),
    adminPassword: requiredEnv(env, "GUACAMOLE_ADMIN_PASSWORD"),
  };
}

export function createGuacamoleClient(config = getGuacamoleConfig()) {
  return new GuacamoleClient({
    baseUrl: config.baseUrl,
    dataSource: config.dataSource,
    adminUsername: config.adminUsername,
    adminPassword: config.adminPassword,
  });
}

function requiredEnv(env: NodeJS.ProcessEnv, name: string) {
  const value = env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}
