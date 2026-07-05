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
  // Set the first time the reviewer opens the customization page. Until then the
  // "Customize" nav button is highlighted to help them discover the feature.
  customizationSeenAt: timestamp("customization_seen_at", { withTimezone: true }),
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

// A YSWS ("You Ship, We Ship") program / workspace. The top-level tenant:
// members belong to it, VMs are stamped with it, and each one carries its own
// concurrent-VM ceiling set by a platform superadmin (ADR-0036).
export const ysws = pgTable("ysws", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  // Hide from switchers / block new launches without deleting history.
  enabled: boolean("enabled").notNull().default(true),
  // Ceiling on concurrent (committed) VMs across all members of this workspace.
  // Null = unlimited. Enforced in createUserSession (ADR-0036).
  maxConcurrentVms: integer("max_concurrent_vms"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const yswsRole = pgEnum("ysws_role", ["member", "admin"]);

// Membership of a user (by Slack ID, so people can be pre-authorized before
// their first login) in a YSWS. A user in two workspaces has two rows. A YSWS
// admin manages members and may promote them to admin (ADR-0036).
export const yswsMemberships = pgTable(
  "ysws_memberships",
  {
    yswsId: text("ysws_id")
      .notNull()
      .references(() => ysws.id, { onDelete: "cascade" }),
    slackId: text("slack_id").notNull(),
    role: yswsRole("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.yswsId, t.slackId] }),
    slackIdx: index("ysws_memberships_slack_idx").on(t.slackId),
  }),
);

// Platform superadmins: global power, keyed by Slack ID. They create/delete
// workspaces, appoint YSWS admins, and see across every tenant. This replaces
// the old flat `admin_entries` (ADR-0036 supersedes ADR-0005's admin half).
export const platformSuperadmins = pgTable("platform_superadmins", {
  slackId: text("slack_id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
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
    // The workspace this VM belongs to. Null while warm/ownerless; stamped from
    // the claiming user's active YSWS at claim/create time (ADR-0036). set null
    // on workspace delete so audit rows survive.
    yswsId: text("ysws_id").references(() => ysws.id, { onDelete: "set null" }),
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
    // Per-workspace concurrent-cap count and admin session/log scoping (ADR-0036).
    yswsStateIdx: index("vm_sessions_ysws_state_idx").on(table.yswsId, table.state),
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

// AI-assisted project setup ("Review a Repo"). One row per pasted repo URL.
// Strictly sequential lifecycle: the AI analyzes first (pending → analyzing →
// analyzed), and only then is a Linux VM session created and linked; the
// setup script then runs on it (running → done/failed). Failure at any stage
// parks the row at `failed` with `error` set — and, before `analyzed`, boots
// no VM at all.
export const repoSetupStatus = pgEnum("repo_setup_status", [
  "pending",
  "analyzing",
  "analyzed",
  "running",
  "done",
  "failed",
]);

export const repoSetups = pgTable(
  "repo_setups",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Workspace the eventual VM will be launched in (captured at submit time).
    // set null on workspace delete so the audit row survives.
    yswsId: text("ysws_id").references(() => ysws.id, { onDelete: "set null" }),
    // Linked only after analysis succeeds — no session exists during the AI phase.
    vmSessionId: integer("vm_session_id").references(() => vmSessions.id, { onDelete: "set null" }),
    repoUrl: text("repo_url").notNull(),
    status: repoSetupStatus("status").notNull().default("pending"),
    // AI artifacts, saved before the VM is launched.
    setupScript: text("setup_script"),
    reviewerGuide: text("reviewer_guide"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userStatusIdx: index("repo_setups_user_status_idx").on(table.userId, table.status),
    vmSessionIdx: uniqueIndex("repo_setups_vm_session_idx").on(table.vmSessionId),
  }),
);

export const repoSetupsRelations = relations(repoSetups, ({ one }) => ({
  user: one(users, {
    fields: [repoSetups.userId],
    references: [users.id],
  }),
  vmSession: one(vmSessions, {
    fields: [repoSetups.vmSessionId],
    references: [vmSessions.id],
  }),
}));

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
  ysws: one(ysws, {
    fields: [vmSessions.yswsId],
    references: [ysws.id],
  }),
}));

export const yswsRelations = relations(ysws, ({ many }) => ({
  memberships: many(yswsMemberships),
}));

export const yswsMembershipsRelations = relations(yswsMemberships, ({ one }) => ({
  ysws: one(ysws, {
    fields: [yswsMemberships.yswsId],
    references: [ysws.id],
  }),
}));

export const vmSessionEventsRelations = relations(vmSessionEvents, ({ one }) => ({
  session: one(vmSessions, {
    fields: [vmSessionEvents.vmSessionId],
    references: [vmSessions.id],
  }),
}));
