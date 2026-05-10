import { boolean, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { type AdapterAccountType } from "next-auth/adapters";

export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  slackId: text("slack_id"),
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const vmSessionState = pgEnum("vm_session_state", [
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
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
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
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
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
