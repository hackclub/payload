# Domain Model

Drizzle schema lives in `src/db/schema.ts`. SQL migrations live under
`drizzle/`. Keep the schema close to Postgres types; do not invent repository
abstractions until there is real duplication.

## Tables

### users

The authenticated principal. One row per Hack Club account that has ever logged
in.

| column | type | notes |
|--------|------|-------|
| id | bigserial pk | |
| slack_id | text unique not null | from OIDC claim, e.g. `U0123ABC` |
| oidc_sub | text unique not null | the `sub` claim, e.g. `ident!abc123` |
| email | text | from `email` claim |
| name | text | from `name` claim |
| avatar_url | text | derived from cachet |
| last_login_at | timestamptz | |
| created_at / updated_at | timestamptz | |

Auth.js may also need its own adapter tables if we use database sessions. Keep
those tables separate from this domain table and document the mapping in code.

### reviewer_allowlist_entries

The set of Slack IDs permitted to use Payload. Seed from
`src/config/reviewers.ts` at deploy time.

| column | type | notes |
|--------|------|-------|
| id | bigserial pk | |
| slack_id | text unique not null | |
| note | text | optional, e.g. "Arcade reviewer 2026" |
| added_by | text | who added this entry |
| created_at / updated_at | timestamptz | |

Authorization rule: a user may use Payload iff a row exists with the same
`slack_id`. Enforce in server-side helpers used by every VM action and API route.

### vm_types

Reference data, seeded from `src/config/vm-types.ts`. One row per supported OS
template.

| column | type | notes |
|--------|------|-------|
| id | bigserial pk | |
| slug | text unique not null | `linux`, later `windows`, `android`, `macos` |
| display_name | text not null | "Debian XFCE", etc. |
| proxmox_template_vmid | integer not null | source template VMID |
| proxmox_node | text not null | Proxmox node hosting the template |
| protocol | text not null | `vnc` or `rdp`; validate with Drizzle enum or check |
| default_port | integer not null | 5900 or 3389 |
| enabled | boolean not null default false | hide from picker without deleting |
| description | text | shown in picker UI |
| created_at / updated_at | timestamptz | |

v1 ships only Linux enabled.

### vm_sessions

The core resource: one row per ephemeral VM.

| column | type | notes |
|--------|------|-------|
| id | bigserial pk | |
| user_id | bigint fk users.id not null | owner |
| vm_type_id | bigint fk vm_types.id not null | |
| state | vm_session_state not null | enum below |
| proxmox_vmid | integer | nil until cloned |
| proxmox_node | text | |
| vm_ip | inet | nil until guest-agent reports it |
| vm_credential_ciphertext | text | encrypted VNC/RDP password |
| guacamole_connection_id | text | from Guacamole REST |
| guacamole_username | text | one-shot Guacamole user |
| guacamole_password_ciphertext | text | encrypted one-shot password |
| expires_at | timestamptz not null | `created_at + 6h` hard cap |
| last_heartbeat_at | timestamptz | updated by browser heartbeat |
| terminated_at | timestamptz | nil while alive |
| termination_reason | text | `idle`, `ttl`, `user`, `error`, `admin`, `stuck` |
| created_at / updated_at | timestamptz | |

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

- `(user_id, state)` for "how many active VMs does this user have?"
- `(state, expires_at)` for TTL reaper query
- `(state, last_heartbeat_at)` for idle reaper query
- unique partial index on `proxmox_vmid` where not null, if useful

### vm_session_events

Append-only audit log per session.

| column | type | notes |
|--------|------|-------|
| id | bigserial pk | |
| vm_session_id | bigint fk vm_sessions.id not null | |
| kind | text not null | `created`, `clone_started`, `ip_acquired`, etc. |
| payload | jsonb not null default `{}` | structured details |
| created_at | timestamptz not null | |

## Drizzle sketch

```ts
import {
  bigint,
  bigserial,
  boolean,
  inet,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const vmSessionState = pgEnum("vm_session_state", [
  "pending",
  "provisioning",
  "ready",
  "active",
  "terminating",
  "terminated",
  "errored",
]);

export const users = pgTable("users", {
  id: bigserial("id", { mode: "bigint" }).primaryKey(),
  slackId: text("slack_id").notNull().unique(),
  oidcSub: text("oidc_sub").notNull().unique(),
  email: text("email"),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const reviewerAllowlistEntries = pgTable("reviewer_allowlist_entries", {
  id: bigserial("id", { mode: "bigint" }).primaryKey(),
  slackId: text("slack_id").notNull().unique(),
  note: text("note"),
  addedBy: text("added_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const vmTypes = pgTable("vm_types", {
  id: bigserial("id", { mode: "bigint" }).primaryKey(),
  slug: text("slug").notNull().unique(),
  displayName: text("display_name").notNull(),
  proxmoxTemplateVmid: integer("proxmox_template_vmid").notNull(),
  proxmoxNode: text("proxmox_node").notNull(),
  protocol: text("protocol").notNull(),
  defaultPort: integer("default_port").notNull(),
  enabled: boolean("enabled").notNull().default(false),
  description: text("description"),
});

export const vmSessions = pgTable(
  "vm_sessions",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    userId: bigint("user_id", { mode: "bigint" }).notNull().references(() => users.id),
    vmTypeId: bigint("vm_type_id", { mode: "bigint" }).notNull().references(() => vmTypes.id),
    state: vmSessionState("state").notNull().default("pending"),
    proxmoxVmid: integer("proxmox_vmid"),
    proxmoxNode: text("proxmox_node"),
    vmIp: inet("vm_ip"),
    vmCredentialCiphertext: text("vm_credential_ciphertext"),
    guacamoleConnectionId: text("guacamole_connection_id"),
    guacamoleUsername: text("guacamole_username"),
    guacamolePasswordCiphertext: text("guacamole_password_ciphertext"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
    terminatedAt: timestamp("terminated_at", { withTimezone: true }),
    terminationReason: text("termination_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    proxmoxVmidIdx: uniqueIndex("vm_sessions_proxmox_vmid_idx").on(table.proxmoxVmid),
  }),
);

export const vmSessionEvents = pgTable("vm_session_events", {
  id: bigserial("id", { mode: "bigint" }).primaryKey(),
  vmSessionId: bigint("vm_session_id", { mode: "bigint" })
    .notNull()
    .references(() => vmSessions.id),
  kind: text("kind").notNull(),
  payload: jsonb("payload").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```
