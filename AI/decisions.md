# Decisions Log (ADRs)

Append-only. When a decision changes, add a new entry and mark the old one
superseded in prose. Do not silently rewrite history.

---

## ADR-0001 — Use Apache Guacamole instead of per-VM port forwarding

**Date:** 2026-05-09 | **Status:** Accepted

Initial idea: expose each VM's VNC/RDP port on a random public host port and
connect through noVNC.

**Decision:** Use Apache Guacamole as a single-port HTTPS gateway. Guacamole
speaks VNC/RDP to VMs over LAN and exposes one web UI embedded in an iframe.

**Consequences:**
- Single public port, one TLS cert.
- Centralized auth, audit, clipboard, on-screen keyboard, and future recording.
- Adds Tomcat + JDBC dependency.

---

## ADR-0002 — Iframe-embed Guacamole in v1, custom client later

**Date:** 2026-05-09 | **Status:** Accepted

**Decision:** Use the Guacamole iframe for v1. Keep the architecture open for a
custom `guacamole-common-js` client later.

**Consequences:**
- Ships much faster than a custom remote desktop client.
- Guacamole branding and URL-token quirks are accepted for v1.
- Future custom client should be isolated to the session view.

---

## ADR-0003 — Rails 8 + Solid stack

**Date:** 2026-05-09 | **Status:** Superseded by ADR-0012

Original decision was Rails 8 with Solid Queue, Solid Cache, and Solid Cable.
This was superseded when the project moved to TypeScript and Next.js.

---

## ADR-0004 — Browser heartbeat for idle detection

**Date:** 2026-05-09 | **Status:** Accepted

**Decision:** Browser sends heartbeat every 30 seconds while the session page is
mounted and usable. Server records `last_heartbeat_at`. Reaper terminates after
30 minutes idle.

Alternative was polling Guacamole's `lastActive` every minute.

**Consequences:**
- Simple and independent of Guacamole internals.
- User with tab open but AFK may keep VM alive until the 6-hour hard cap.

---

## ADR-0005 — Slack ID allowlist, seeded from repo data

**Date:** 2026-05-09 | **Status:** Accepted

**Decision:** `reviewer_allowlist_entries` table is keyed by `slack_id` and
seeded from repo-owned config. Membership is checked on every VM action, not
only at login.

**Consequences:**
- Allowlist changes are reviewable PRs.
- Future admin UI can write to the same table.
- Exact seed file format is still flexible for the TypeScript implementation.

---

## ADR-0006 — Per-user cap of 2 active VMs, no queue

**Date:** 2026-05-09 | **Status:** Accepted

**Decision:** Reject session creation if the user already has 2 active sessions.
Do not implement a waiting queue in v1.

**Consequences:**
- Easy to explain and enforce.
- Future global cap + queue can be added after capacity is known.

---

## ADR-0007 — macOS treated as normal VM type

**Date:** 2026-05-09 | **Status:** Accepted, acknowledged risk

**Decision:** Model macOS as a first-class VM type when it is added.

**Consequences:**
- EULA risk is accepted by operators.
- Code should not special-case macOS beyond template/protocol details.

---

## ADR-0008 — Single domain with path routing

**Date:** 2026-05-09 | **Status:** Accepted

**Decision:** Single host `payload.hackclub.com`.

Routes:
- `/` -> Next.js app
- `/api/*` -> Next.js route handlers
- `/guac/*` -> Guacamole webapp

**Consequences:**
- One TLS cert.
- Avoids cross-subdomain cookie and iframe policy complications.

---

## ADR-0009 — Project name: Payload

**Date:** 2026-05-09 | **Status:** Accepted

**Decision:** Project name is Payload. Use in repo name, wordmark, and all
user-facing copy.

---

## ADR-0010 — v1 ships Linux only

**Date:** 2026-05-09 | **Status:** Superseded by ADR-0020 (template detail) and
ADR-0024 (OS scope)

Initially v1 scoped four VM types: Windows, Linux, Android, and macOS.

**Decision:** v1 ships Linux only: Ubuntu 24.04 + XFCE over VNC. Windows,
Android, and macOS are deferred.

**Consequences:**
- One template to build and verify before launch.
- Avoids Android IP-discovery, Windows licensing, and macOS-on-x86 work on the
  critical path.

---

## ADR-0011 — Production domain is payload.hackclub.com

**Date:** 2026-05-09 | **Status:** Accepted

**Decision:** Production hostname is `payload.hackclub.com`.

**Consequences:**
- OIDC redirect URI must be registered as:
  `https://payload.hackclub.com/api/auth/callback/hackclub`.

---

## ADR-0012 — Switch from Ruby/Rails to TypeScript + Next.js

**Date:** 2026-05-09 | **Status:** Accepted

**Decision:** Restart the implementation with TypeScript, Next.js 15 App Router,
Node.js LTS, and pnpm.

**Consequences:**
- Rails codebase is removed.
- UI can use React components while keeping FlyonUI and Tailwind.
- App Router route handlers replace Rails controllers.
- Server actions may be used for form-driven mutations, but API route handlers
  remain the stable contract for VM lifecycle calls.

---

## ADR-0013 — Use Drizzle for Postgres access

**Date:** 2026-05-09 | **Status:** Accepted

**Decision:** Use Drizzle ORM and drizzle-kit migrations.

Alternatives considered:
- Prisma: mature and polished, but heavier and more schema-abstraction than this
  project needs.
- Kysely: excellent type-safe query builder, but leaves migration/schema source
  of truth more manual.

**Consequences:**
- Schema lives in TypeScript and migrations are generated as SQL.
- Engineers should still understand the SQL being generated.

---

## ADR-0014 — Use Auth.js v5 for Hack Club OIDC

**Date:** 2026-05-09 | **Status:** Accepted

**Decision:** Use Auth.js v5 with a custom OIDC provider pointed at Hack Club's
well-known discovery URL.

**Consequences:**
- Standard Next.js auth integration.
- Slack-ID allowlist remains a Payload authorization check layered after login.

---

## ADR-0015 — Use BullMQ for background jobs

**Date:** 2026-05-09 | **Status:** Accepted

**Decision:** Use BullMQ for provisioning, termination, retries, and scheduled
reaping.

Alternatives considered:
- pg-boss and Graphile Worker: simpler infra because they use Postgres.
- BullMQ: more common in Node job systems, stronger ecosystem, but requires
  Redis.

**Consequences:**
- Redis is now required.
- Jobs must be idempotent because retries are expected.

---

## ADR-0016 — Start BullMQ worker in-process for now

**Date:** 2026-05-09 | **Status:** Accepted

**Decision:** Start the BullMQ worker in the Next.js runtime process for v1.

**Consequences:**
- One Docker image and one app service are enough for now.
- Must guard against starting during build/migration scripts.
- Must revisit before running multiple app replicas.

---

## ADR-0017 — Use SSE for session status updates

**Date:** 2026-05-09 | **Status:** Accepted, extended by ADR-0021

**Decision:** Use server-sent events for session-ready, errored, terminating,
and terminated updates. Keep heartbeat as normal `fetch` POSTs.

**Consequences:**
- No WebSocket server or cable layer required.
- Fanout was originally planned as in-process in-memory, but was later moved to
  Redis pub/sub under ADR-0021, making multi-container scale-out possible.

---

## ADR-0018 — Keep FlyonUI

**Date:** 2026-05-09 | **Status:** Accepted

**Decision:** Keep Tailwind CSS v4 + FlyonUI rather than switching to shadcn/ui.

**Consequences:**
- Preserves existing design direction.
- React components should wrap FlyonUI class patterns where reuse is valuable.

---

## ADR-0019 — Docker image deploy, Coolify later

**Date:** 2026-05-09 | **Status:** Accepted

**Decision:** Produce a plain Docker image using Next.js standalone output.
Do not wire Kamal for now. Coolify is likely later.

**Consequences:**
- Deployment surface stays portable.
- Compose files are useful for local and early production setups.

---

## ADR-0020 — Linux v1 template is Debian 12 + XFCE + xrdp

**Date:** 2026-05-10 | **Status:** Accepted (OS-scope portion superseded by
ADR-0024; the template details below still describe the `linux` row)

The original Linux-only v1 decision picked Ubuntu 24.04 + XFCE over VNC. During
Milestone 2/3 validation, the working path became Debian 12 + XFCE over xrdp,
connected through Guacamole RDP with `security=tls`.

**Decision:** v1 ships a Debian 12 + XFCE + xrdp template. The template uses the
fixed operator-managed `shipwrights` / `shipwrights` Linux credential until
per-session credential injection is added.

**Consequences:**
- Guacamole test connections default to RDP on TCP 3389.
- The canonical build guide is `AI/runbooks/build-linux-template.md`.
- VNC remains supported by the Guacamole client wrapper for future VM types, but
  it is not the Linux v1 path.

---

## ADR-0021 — SSE fanout via Redis pub/sub instead of in-memory

**Date:** 2026-05-10 | **Status:** Accepted

ADR-0017 originally assumed in-memory fanout would be enough for one app
container. During implementation, Redis pub/sub was chosen for SSE fanout
instead.

**Decision:** SSE events are published on Redis channels (`sse:session:<id>`)
and consumed by subscribers in each Next.js process. In-memory subscriber maps
are still used per-process, but the fanout crosses process boundaries via Redis.

**Consequences:**
- SSE already supports multi-container scale-out without additional work.
- Every app replica receives a duplicate of every Redis channel message
  (acceptable at current scale).
- The v1.x roadmap item "Move SSE fanout to Redis pub/sub" is already done.

---

## ADR-0022 — Use Auth.js adapter schema for users table

**Date:** 2026-05-10 | **Status:** Accepted

The original domain model described a custom `users` table with `bigserial` PK,
`oidc_sub`, `avatar_url`, and `last_login_at`. During implementation, the
`@auth/drizzle-adapter` was adopted, which expects a standard Auth.js schema
(text UUID PK, `image` instead of `avatar_url`, plus `accounts`, `sessions`, and
`verificationTokens` tables).

**Decision:** Let the Auth.js adapter drive the schema. Store `slack_id` as an
additional column on the `user` table (no unique constraint). The OIDC `sub`
claim lives in the `accounts` table's `providerAccountId` column.

**Consequences:**
- Four Auth.js tables (`user`, `account`, `session`, `verificationToken`) are
  generated by Drizzle rather than a single custom `users` table.
- Schema stays compatible with Auth.js migration tooling and future updates.
- The domain model in `AI/domain-model.md` has been updated to match.

---

## ADR-0023 — Allowlist seed from scripts/seed.ts, not src/config/reviewers.ts

**Date:** 2026-05-10 | **Status:** Accepted

The original plan was to maintain allowlist entries in `src/config/reviewers.ts`
as a source-of-truth config file. During v1 implementation, the allowlist seed
was kept in `scripts/seed.ts` directly.

**Decision:** For v1, the allowlist seed is hardcoded in `scripts/seed.ts`.
`src/config/reviewers.ts` does not exist. The `reviewer_allowlist_entries` table
is the runtime source of truth; the seed script just bootstraps it.

**Consequences:**
- Adding a reviewer means editing `scripts/seed.ts`, deploying, and running
  `pnpm payload allowlist:sync` (or manual seed).
- `src/config/reviewers.ts` can be created later as part of the v1.x admin UI
  work.

---

## ADR-0024 — v1 ships Linux + Windows + Android (supersedes ADR-0010 / ADR-0020)

**Date:** 2026-05-11 | **Status:** Accepted

ADR-0010 narrowed v1 to Linux only. ADR-0020 locked in the Debian 12 + XFCE +
xrdp template as the v1 Linux template. During v1 polish, working Proxmox
templates also became available for Windows and Android (BlissOS), so v1 is now
shipping all three together.

**Decision:** v1 ships three VM types from day one:

- `linux`: Debian 12 + XFCE + xrdp on RDP/3389 (template VMID 67001)
- `windows`: Windows 11 Enterprise IoT LTSC on RDP/3389 (template VMID 67002)
- `android`: BlissOS on VNC/5901 (template VMID 67003)

macOS remains deferred to v2.x (ADR-0007 risk still applies).

**Consequences:**
- The picker on the dashboard renders three tiles, not one.
- Per-OS template-build runbooks are still needed for Windows and Android (only
  the Debian one exists today).
- Android IP discovery currently rides the same Proxmox neighbor-table path as
  Linux/Windows. If that breaks for a future Android image, the fallbacks
  listed in the roadmap (ARP scan, DHCP lease lookup, in-VM agent) still apply.
- ADR-0010 and ADR-0020 are superseded for the OS-scope question. The Debian
  template details from ADR-0020 still describe the Linux row specifically.

---

## ADR-0025 — Advisory lock for per-user cap runs inside a transaction

**Date:** 2026-05-11 | **Status:** Accepted

ADR-0006 (per-user cap of 2) was implemented in `createUserSession` using
`pg_advisory_xact_lock(...)` issued through `db.execute(...)` outside of any
transaction. `pg_advisory_xact_lock` is a no-op outside a transaction (the
lock is acquired and released as part of the same statement), so two concurrent
"Launch" clicks could both pass the cap check.

**Decision:** Run the cap check, the `vm_sessions` insert, and the
`vm_session_events` insert inside a single `db.transaction(...)` and acquire
`pg_advisory_xact_lock` at the top of that transaction. The BullMQ enqueue
happens *after* the transaction commits so a Redis hiccup cannot roll back the
session row.

**Consequences:**
- The race window for double-launching past the per-user cap is closed.
- If `enqueueProvisionVm` ever fails, the row exists in `pending` state and
  will be picked up by the stuck-provisioning reaper after 10 minutes.

---

## ADR-0026 — Provisioning reads VM credentials from `vm_types`

**Date:** 2026-05-11 | **Status:** Accepted

The original `provision-vm` job hard-coded `username = "shipwrights"` for RDP
and a literal password string, ignoring the `username` / `password` columns
already on the `vm_types` table. This made adding Windows or Android (which
need different defaults) require a code change.

**Decision:** `provision-vm` reads the per-OS credentials from the `vm_types`
row. RDP connections include `username` only when `vm_types.username` is set;
VNC connections only pass the `password`. The Guacamole RDP `security` mode
stays at `any` (operator preference; ADR-0020's `tls` recommendation is
relaxed for the live deployment because not every Windows/xrdp combination
negotiates TLS cleanly).

**Consequences:**
- Adding a VM type is now seed data + a Proxmox template, not a code patch.
- Per-session credential injection (v1.x roadmap item) replaces both the
  `vm_types.password` column and the encrypted `vm_credential_ciphertext` on
  the session row.

---

## ADR-0027 — Reaper uses BullMQ Job Scheduler, not repeatable jobs

**Date:** 2026-05-11 | **Status:** Accepted

`scheduleReaper` originally used `vmQueue.add("reap-vm-sessions", {}, { repeat:
{ every } })`. BullMQ now recommends Job Schedulers over the older
repeatable-job API (the older API is deprecated and slated for removal in v6).

**Decision:** `scheduleReaper` calls
`vmQueue.upsertJobScheduler("reap-vm-sessions", { every: REAPER_INTERVAL_MS },
{ name: "reap-vm-sessions", data: {} })`. `upsertJobScheduler` is idempotent on
the scheduler id, so it safely runs on every app boot.

**Consequences:**
- One less BullMQ deprecation to chase later.
- Operators removing the schedule should use `removeJobScheduler` instead of
  `removeRepeatable`.

---

## ADR-0028 — Clipboard is host → VM only (paste-into-VM, no copy-out)

**Date:** 2026-05-12 | **Status:** Accepted

Reviewers need to paste text (URLs, snippets, credentials) from their machine
into the VM, but should not be able to exfiltrate data from the VM through the
clipboard. We considered: (a) full bidirectional clipboard, (b) no clipboard,
(c) host → VM only via Guacamole's built-in flags, (d) a custom in-VM agent.

**Decision:** Use option (c). Every Guacamole connection Payload creates sets
`disable-copy: "true"` (block VM → host) and `disable-paste: "false"` (allow
host → VM). Naming is from the reviewer's browser perspective: "copy" = copy
*out of* the remote, "paste" = paste *into* the remote.

This works natively on the v1 OSes:

- **Linux (Debian + xrdp)** — `xrdp-chansrv` bridges the RDP CLIPRDR channel
  to the X selection.
- **Windows 11** — RDP clipboard redirection is on by default in the template.
- **Android (BlissOS)** — the VNC server on the template handles the standard
  RFB `ClientCutText` message.

macOS is **excluded** because Apple's Screen Sharing speaks a non-standard
VNC dialect that does not implement `ClientCutText`. macOS support is
deferred to v2.x along with the macOS template; the chosen mechanism then
will be either a third-party RFB-compliant server or a small in-VM clipboard
agent (LaunchDaemon).

**Consequences:**
- One config change (`disable-copy` flipped from `false` to `true`) gives the
  policy across all OSes; no per-OS code branches.
- Reviewers paste into the VM with their normal browser shortcut; same-origin
  iframe under `payload.hackclub.com/guac/*` makes the Clipboard API work
  without extra prompts.
- The smoke-test script (`scripts/payload.ts`) mirrors the same flags so
  manual Guacamole verification matches production.
- `enable-drive` and `enable-printing` remain off (Guacamole defaults), so
  the clipboard is the only host → VM data channel.
- macOS sessions, when added in v2.x, must explicitly state "clipboard not
  supported" in the UI until the agent path lands.
