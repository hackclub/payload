import { GuacamoleClient } from "./client";
import { env } from "../../env";

export type GuacamoleConfig = {
  /** Internal base URL the app uses to talk to Guacamole's REST API. */
  baseUrl: string;
  /** Public base URL the reviewer's browser uses to load the iframe. */
  publicBaseUrl: string;
  dataSource: string;
  adminUsername: string;
  adminPassword: string;
};

export function getGuacamoleConfig(): GuacamoleConfig {
  return {
    baseUrl: env.GUACAMOLE_BASE_URL.replace(/\/$/, ""),
    publicBaseUrl: env.GUACAMOLE_PUBLIC_BASE_URL.replace(/\/$/, ""),
    dataSource: env.GUACAMOLE_DATA_SOURCE,
    adminUsername: env.GUACAMOLE_ADMIN_USER,
    adminPassword: env.GUACAMOLE_ADMIN_PASSWORD,
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
