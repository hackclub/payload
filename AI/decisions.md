# Decisions Log (ADRs)

Append-only. When you change a decision, add a new entry — don't edit history.

---

## ADR-0001 — Use Apache Guacamole instead of per-VM port forwarding

**Date:** 2026-05-09 | **Status:** Accepted

Initial idea: expose each VM's VNC/RDP port on a random public host port,
connect via noVNC.

**Decision:** Use Apache Guacamole as single-port HTTPS gateway. Guacamole
speaks VNC/RDP to VMs over LAN, exposes one web UI embedded in iframe.

**Consequences:**
- ✅ Single public port (443), one TLS cert.
- ✅ Centralized auth, audit, clipboard, on-screen keyboard, file transfer (later).
- ⚠️ Adds Tomcat + JDBC dependency.

---

## ADR-0002 — Iframe-embed Guacamole in v1, custom client later

**Date:** 2026-05-09 | **Status:** Accepted

Two options: iframe with server-issued token, or custom client with
`guacamole-common-js`.

**Decision:** Iframe for v1. Keep architecture open for custom client later.

**Consequences:**
- ✅ Ship in days, not weeks. Guacamole UX for free.
- ⚠️ Guacamole branding leaks through unless CSS-overrided. Acceptable.
- ⚠️ Tokens in iframe URL → never log server-side.
- 🔄 Future: replace with `guacamole-common-js` client when UX matters more.

---

## ADR-0003 — Rails 8 + Solid stack (no Redis)

**Date:** 2026-05-09 | **Status:** Accepted

**Decision:** Rails 8 with Solid Queue / Solid Cache / Solid Cable, all backed
by same Postgres instance.

**Consequences:**
- ✅ Zero extra infra. One Postgres, one Rails process, one LXC.
- ⚠️ At very high job throughput Solid Queue can be a bottleneck. Not a concern
  at our scale (dozens of reviewers, low jobs/minute).

---

## ADR-0004 — Browser heartbeat for idle detection

**Date:** 2026-05-09 | **Status:** Accepted

**Decision:** Browser sends heartbeat every 30s while tab visible. Server records
`last_heartbeat_at`. Reaper terminates after 30 min idle.

Alternative was polling Guacamole's `lastActive` every minute.

**Consequences:**
- ✅ Trivial to implement, independent of Guacamole.
- ⚠️ User with tab open but AFK keeps VM alive. 6h hard cap bounds this.

---

## ADR-0005 — Slack ID allowlist, seeded from YAML

**Date:** 2026-05-09 | **Status:** Accepted

**Decision:** `reviewer_allowlist_entries` table keyed on `slack_id`. Seeded from
`config/reviewers.yml` on every deploy. Membership checked in base controller
`before_action`, not just at login.

**Consequences:**
- ✅ Allowlist changes are reviewable PRs in Git.
- 🔄 Future: admin UI for non-engineer Hack Club staff.

---

## ADR-0006 — Per-user cap of 2 active VMs, no queue

**Date:** 2026-05-09 | **Status:** Accepted

**Decision:** Reject `POST /sessions` with 422 if user has 2 active sessions.
No queue.

**Consequences:**
- ✅ Simple to implement and explain.
- 🔄 Future: add global cap + queue.

---

## ADR-0007 — macOS treated as normal VM type

**Date:** 2026-05-09 | **Status:** Accepted (acknowledged risk)

**Decision:** Ship macOS as first-class VM type on commodity x86 Proxmox.

**Consequences:**
- ⚠️ EULA risk accepted by Hack Club operators.
- Treat as just another VM type in code.

---

## ADR-0008 — Single domain with path routing

**Date:** 2026-05-09 | **Status:** Accepted

**Decision:** Single host `payload.hackclub.com`. Caddy routes:
- `/` → Rails
- `/guac/*` → Guacamole webapp
- `/cable` → Rails ActionCable

**Consequences:**
- ✅ One TLS cert, one CORS origin, no cross-subdomain cookie issues.

---

## ADR-0009 — Project name: "Payload"

**Date:** 2026-05-09 | **Status:** Accepted

**Decision:** Project name is **Payload**. Use in repo name, wordmark, all
user-facing copy, Caddy site name.

---

## ADR-0010 — v1 ships Linux only

**Date:** 2026-05-09 | **Status:** Accepted

Initially v1 scoped four VM types (Windows, Linux, Android, macOS).

**Decision:** v1 ships **Linux only** (Ubuntu 24.04 + XFCE over VNC). Windows,
Android, and macOS templates and their `vm_types` rows are kept in the codebase
but `enabled: false`, to be turned on post-v1.

**Consequences:**
- ✅ One template to build and verify before launch.
- ✅ Avoids the unresolved Android IP-discovery problem (qemu-guest-agent does
  not run on Android-x86) blocking v1.
- ✅ Avoids Windows licensing and macOS-on-x86 EULA work showing up on the
  critical path to first reviewer.
- 🔄 ADR-0007 (macOS treated as a normal VM type) still stands for when macOS
  is enabled later.

---

## ADR-0011 — Production domain is payload.hackclub.com

**Date:** 2026-05-09 | **Status:** Accepted (supersedes earlier `vm.hackclub.com`)

**Decision:** Production hostname is `payload.hackclub.com`. ADR-0008's
single-host + path-routing scheme is unchanged; only the hostname is updated.

**Consequences:**
- ✅ Matches project name; no extra subdomain to register.
- 🔄 OIDC redirect URI must be registered as
  `https://payload.hackclub.com/auth/hackclub/callback`.
