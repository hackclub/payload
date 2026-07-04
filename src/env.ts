import { z } from "zod";

function booleanFromEnv(defaultValue: boolean) {
  return z.preprocess(
    (val) => {
      if (val === undefined || val === "") return defaultValue;
      if (val === "1" || String(val).toLowerCase() === "true") return true;
      return false;
    },
    z.boolean()
  );
}

const envSchema = z.object({
  // Auth
  HACKCLUB_OIDC_CLIENT_ID: z.string().min(1),
  HACKCLUB_OIDC_CLIENT_SECRET: z.string().min(1),
  HACKCLUB_OIDC_REDIRECT_URI: z.string().url().optional(),
  AUTH_SECRET: z.string().min(1),

  // Database
  DATABASE_URL: z.string().min(1),

  // Redis
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),

  // Proxmox
  PROXMOX_HOST: z.string().min(1),
  PROXMOX_PORT: z.coerce.number().int().positive().default(8006),
  PROXMOX_TOKEN_ID: z
    .string()
    .min(1)
    .refine(
      (val) => /^[^@\s]+@[^!\s]+![^!\s]+$/.test(val),
      "Must be the full Proxmox API token id, e.g. payload@pve!payload"
    ),
  PROXMOX_TOKEN_SECRET: z.string().min(1),
  PROXMOX_DEFAULT_NODE: z.string().min(1),
  PROXMOX_VERIFY_TLS: booleanFromEnv(true),
  PROXMOX_SSH_HOST: z.string().optional(),
  PROXMOX_SSH_USER: z.string().optional(),
  PROXMOX_SSH_KEY_PATH: z.string().optional(),
  PROXMOX_SSH_PASSWORD: z.string().optional(),
  PROXMOX_SSH_PORT: z.coerce.number().int().positive().default(22),

  // Guacamole
  GUACAMOLE_BASE_URL: z.string().url(),
  GUACAMOLE_PUBLIC_BASE_URL: z.string().url(),
  GUACAMOLE_DATA_SOURCE: z.string().min(1).default("postgresql"),
  GUACAMOLE_ADMIN_USER: z.string().min(1),
  GUACAMOLE_ADMIN_PASSWORD: z.string().min(1),

  // Crypto
  SESSION_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "Must be 64 hex characters (32 bytes for AES-256-GCM)"),

  // App tuning
  SLACK_REQUEST_URL: z.string().url().default("https://google.com"),
  SESSION_LIFETIME_MS: z.coerce.number().int().positive().default(6 * 60 * 60 * 1000),
  IDLE_TIMEOUT_MS: z.coerce.number().int().positive().default(30 * 60 * 1000),
  STUCK_TIMEOUT_MS: z.coerce.number().int().positive().default(10 * 60 * 1000),
  REAPER_INTERVAL_MS: z.coerce.number().int().positive().default(60 * 1000),
  HEARTBEAT_INTERVAL_MS: z.coerce.number().int().positive().default(30_000),
  MAX_SESSIONS_PER_USER: z.coerce.number().int().positive().default(2),
  IP_DISCOVERY_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),

  // Warm pool (ADR-0033)
  // Total RAM (MB) the warm pool + all sessions may commit. Admission and
  // pool decisions are made against this, summing vm_types.memory_mb.
  PAYLOAD_VM_MEMORY_BUDGET_MB: z.coerce.number().int().positive().default(50_000),
  // Recycle a warm VM once it has been idle in the pool this long (keep under
  // the DHCP lease renewal window so its IP can't go stale).
  WARM_MAX_AGE_MS: z.coerce.number().int().positive().default(2 * 60 * 60 * 1000),
  // Cap on concurrent warm-VM boots per reconcile tick (avoid boot storms).
  MAX_CONCURRENT_WARM_BOOTS: z.coerce.number().int().positive().default(2),
  // How often the pool reconciler runs (it is also kicked on new demand).
  RECONCILE_INTERVAL_MS: z.coerce.number().int().positive().default(15_000),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:");
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  }
  throw new Error("Invalid environment variables");
}

export const env = parsed.data;
export type Env = z.infer<typeof envSchema>;
