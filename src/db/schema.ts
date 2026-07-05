import { boolean, customType, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { type AdapterAccountType } from "next-auth/adapters";

// Raw binary column (Postgres bytea). drizzle-orm/pg-core has no built-in bytea,
// so define one. Used for the reviewer's uploaded wallpaper image.
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  slackId: text("slack_id"),
  // Per-reviewer customization, applied to every VM they launch in the
  // background after bind (see customize-vm job). All null/empty = template
  // default. See ADR-0035.
  //
  // Wallpaper (user-session task, applied by the companion agent).
  wallpaperImage: bytea("wallpaper_image"),
  wallpaperMime: text("wallpaper_mime"),
  wallpaperUpdatedAt: timestamp("wallpaper_updated_at", { withTimezone: true }),
  // Packages to install per-OS (admin task, run as SYSTEM/root via the guest
  // agent). Windows = Chocolatey package ids, Linux = apt package names.
  installPackagesWindows: jsonb("install_packages_windows").$type<string[]>().notNull().default([]),
  installPackagesLinux: jsonb("install_packages_linux").$type<string[]>().notNull().default([]),
  // Per-OS startup script run on every VM of that type. `runAsAdmin` picks the
  // executor: true → guest agent (SYSTEM/root), false → companion (user session).
  startupScriptWindows: text("startup_script_windows"),
  startupScriptWindowsRunAsAdmin: boolean("startup_script_windows_run_as_admin").notNull().default(true),
  startupScriptLinux: text("startup_script_linux"),
  startupScriptLinuxRunAsAdmin: boolean("startup_script_linux_run_as_admin").notNull().default(true),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ]
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })]
);

export const reviewerAllowlistEntries = pgTable("reviewer_allowlist_entries", {
  slackId: text("slack_id").primaryKey(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const adminEntries = pgTable("admin_entries", {
  slackId: text("slack_id").primaryKey(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const vmTypes = pgTable("vm_types", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  slug: text("slug").notNull().unique(),
  displayName: text("display_name").notNull(),
  proxmoxTemplateVmid: integer("proxmox_template_vmid").notNull(),
  proxmoxNode: text("proxmox_node").notNull(),
  protocol: text("protocol").notNull(),
  defaultPort: integer("default_port").notNull(),
  enabled: boolean("enabled").notNull().default(false),
  description: text("description"),
  username: text("username"),
  password: text("password"),
  iconUrl: text("icon_url"),
  // Extra wait, in milliseconds, between IP discovery and the Guacamole
  // connection being created. Used for VMs (e.g. Android) whose remote
  // display server only starts after the OS finishes booting.
  bootDelayMs: integer("boot_delay_ms").notNull().default(0),
  // Warm-pool target: how many pre-booted, ownerless VMs of this type the
  // reconciler tries to keep ready (ADR-0033). 0 = never pre-warm.
  warmPoolSize: integer("warm_pool_size").notNull().default(0),
  // Configured RAM (MB) for a VM of this type. Used for warm-pool budget
  // accounting against PAYLOAD_VM_MEMORY_BUDGET_MB.
  memoryMb: integer("memory_mb").notNull().default(4096),
  // Costlier type (e.g. macOS). First candidate for pool sacrifice under
  // budget pressure; UI/pool policy may treat it more conservatively.
  expensive: boolean("expensive").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const vmSessionState = pgEnum("vm_session_state", [
  // Pre-booted, ownerless VM waiting in the warm pool (ADR-0033). No user_id,
  // no expires_at, no Guacamole footprint until claimed.
  "warm",
  "pending",
  "provisioning",
  "ready",
  "active",
  "terminating",
  "terminated",
  "errored",
]);

export const vmSessions = pgTable(
  "vm_sessions",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    // Nullable: warm-pool VMs are ownerless until claimed (ADR-0033).
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    vmTypeId: integer("vm_type_id")
      .notNull()
      .references(() => vmTypes.id),
    state: vmSessionState("state").notNull().default("pending"),
    proxmoxVmid: integer("proxmox_vmid"),
    proxmoxNode: text("proxmox_node"),
    vmIp: text("vm_ip"),
    vmCredentialCiphertext: text("vm_credential_ciphertext"),
    guacamoleConnectionId: text("guacamole_connection_id"),
    guacamoleUsername: text("guacamole_username"),
    guacamolePasswordCiphertext: text("guacamole_password_ciphertext"),
    // Nullable: the 6h TTL clock starts at claim, not while warm (ADR-0033).
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    // When a warm VM was claimed by a user (null while warm).
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
    terminatedAt: timestamp("terminated_at", { withTimezone: true }),
    terminationReason: text("termination_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index("vm_sessions_user_state_idx").on(table.userId, table.state),
    stateExpiresIdx: index("vm_sessions_state_expires_idx").on(table.state, table.expiresAt),
    stateHeartbeatIdx: index("vm_sessions_state_heartbeat_idx").on(table.state, table.lastHeartbeatAt),
    proxmoxVmidIdx: uniqueIndex("vm_sessions_proxmox_vmid_idx").on(table.proxmoxVmid),
    // Fast warm-pool lookups: "warm VMs of type X" for claim + reconcile.
    // Composite (not partial) on purpose: a `WHERE state = 'warm'` predicate
    // would use the just-added enum value in the same migration transaction,
    // which Postgres rejects. This composite serves the same query.
    stateTypeIdx: index("vm_sessions_state_type_idx").on(table.state, table.vmTypeId),
  }),
);

export const vmSessionEvents = pgTable("vm_session_events", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  vmSessionId: integer("vm_session_id")
    .notNull()
    .references(() => vmSessions.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  payload: jsonb("payload").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const vmSessionsRelations = relations(vmSessions, ({ one }) => ({
  vmType: one(vmTypes, {
    fields: [vmSessions.vmTypeId],
    references: [vmTypes.id],
  }),
  user: one(users, {
    fields: [vmSessions.userId],
    references: [users.id],
  }),
}));

export const vmSessionEventsRelations = relations(vmSessionEvents, ({ one }) => ({
  session: one(vmSessions, {
    fields: [vmSessionEvents.vmSessionId],
    references: [vmSessions.id],
  }),
}));
