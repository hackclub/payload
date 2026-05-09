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

**Date:** 2026-05-09 | **Status:** Accepted

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

**Date:** 2026-05-09 | **Status:** Accepted

**Decision:** Use server-sent events for session-ready, errored, terminating,
and terminated updates. Keep heartbeat as normal `fetch` POSTs.

**Consequences:**
- No WebSocket server or cable layer required.
- In-memory fanout is acceptable only while there is one app container.

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
