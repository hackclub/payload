# Domain Model

Drizzle schema lives in `src/db/schema.ts`. SQL migrations live under
`drizzle/`. Keep the schema close to Postgres types; do not invent repository
abstractions until there is real duplication.

## Tables

### users (Auth.js adapter)

Uses the standard NextAuth/Auth.js v5 adapter schema. One row per Hack Club
account that has ever logged in.

| column | type | notes |
|--------|------|-------|
| id | text pk | crypto.randomUUID() |
| name | text | from OIDC `name` claim |
| email | text unique | from `email` claim |
| emailVerified | timestamptz | managed by Auth.js |
| image | text | avatar from cachet |
| slack_id | text | from OIDC `slack_id` claim |

### accounts (Auth.js adapter)

Auth.js OAuth account linking table.

| column | type | notes |
|--------|------|-------|
| userId | text fk users.id | |
| type | text | OAuth provider type |
| provider | text | e.g. "hackclub" |
| providerAccountId | text | account ID from provider |
| refresh_token, access_token, expires_at, token_type, scope, id_token, session_state | various | standard OAuth fields |

Composite PK on `(provider, providerAccountId)`.

### sessions (Auth.js adapter)

Auth.js database session store.

| column | type | notes |
|--------|------|-------|
| sessionToken | text pk | |
| userId | text fk users.id | |
| expires | timestamptz not null | |

### verificationTokens (Auth.js adapter)

Auth.js email verification / magic link tokens.

| column | type | notes |
|--------|------|-------|
| identifier | text | |
| token | text | |
| expires | timestamptz not null | |

Composite PK on `(identifier, token)`.

### reviewer_allowlist_entries

The set of Slack IDs permitted to use Payload. Seeded at deploy time via
`scripts/seed.ts`.

| column | type | notes |
|--------|------|-------|
| slack_id | text pk | Slack ID, e.g. `U0123ABC` |
| created_at | timestamptz not null default now() | |

Simplified from the original design: no `id` column, no `note`/`added_by`
fields, `slack_id` is the primary key directly. The seed data is currently
hardcoded in the seed script rather than read from `src/config/reviewers.ts`.

Authorization rule: a user may use Payload iff a row exists with the same
`slack_id`. Enforce in server-side helpers used by every VM action and API route.

### vm_types

Reference data, seeded from `src/config/vm-types.ts`. One row per supported OS
template.

| column | type | notes |
|--------|------|-------|
| id | integer pk identity | auto-generated |
| slug | text unique not null | `linux`, later `windows`, `android`, `macos` |
| display_name | text not null | "Debian XFCE", etc. |
| proxmox_template_vmid | integer not null | source template VMID |
| proxmox_node | text not null | Proxmox node hosting the template |
| protocol | text not null | `vnc` or `rdp` |
| default_port | integer not null | 3389 for RDP, 5900 for VNC |
| enabled | boolean not null default false | hide from picker without deleting |
| description | text | shown in picker UI |
| username | text | template VM default username |
| password | text | template VM default password |
| created_at / updated_at | timestamptz | |

The `username` and `password` columns hold the fixed template credential. These
are the credentials used for Guacamole connections in v1 (per-session credential
injection is deferred).

### vm_sessions

The core resource: one row per ephemeral VM.

| column | type | notes |
|--------|------|-------|
| id | integer pk identity | auto-generated |
| user_id | text fk users.id not null | owner |
| vm_type_id | integer fk vm_types.id not null | |
| state | vm_session_state not null | enum below |
| proxmox_vmid | integer | nil until cloned |
| proxmox_node | text | |
| vm_ip | text | nil until IP discovered |
| vm_credential_ciphertext | text | encrypted VNC/RDP password |
| guacamole_connection_id | text | from Guacamole REST |
| guacamole_username | text | one-shot Guacamole user |
| guacamole_password_ciphertext | text | encrypted one-shot password |
| expires_at | timestamptz not null | `created_at + 6h` hard cap |
| last_heartbeat_at | timestamptz | updated by browser heartbeat |
| terminated_at | timestamptz | nil while alive |
| termination_reason | text | `idle`, `ttl`, `user`, `error`, `admin`, `stuck` |
| created_at / updated_at | timestamptz | |

Note: `vm_ip` is `text` (not `inet`) because the Proxmox neighbor table returns
a string. `user_id` is `text` (UUID) matching the Auth.js users table.

#### state enum

```
pending      -> row created, before BullMQ worker starts provisioning
provisioning -> clone in progress, polling for IP
ready        -> IP known, Guacamole registered, reviewer may connect
active       -> browser sent at least one heartbeat
terminating  -> cleanup triggered
terminated   -> cleanup complete; row kept for audit
errored      -> provisioning or termination failed; needs operator
```

#### Indexes

- `vm_sessions_user_state_idx` on `(user_id, state)` for "how many active VMs does this user have?"
- `vm_sessions_state_expires_idx` on `(state, expires_at)` for TTL reaper query
- `vm_sessions_state_heartbeat_idx` on `(state, last_heartbeat_at)` for idle reaper query
- `vm_sessions_proxmox_vmid_idx` unique on `proxmox_vmid` (partial index, nulls not constrained)

### vm_session_events

Append-only audit log per session.

| column | type | notes |
|--------|------|-------|
| id | integer pk identity | auto-generated |
| vm_session_id | integer fk vm_sessions.id not null | |
| kind | text not null | `created`, `clone_started`, `ip_acquired`, etc. |
| payload | jsonb not null default `{}` | structured details |
| created_at | timestamptz not null | |

## Drizzle schema (actual implementation)

```ts
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
  username: text("username"),
  password: text("password"),
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
```
