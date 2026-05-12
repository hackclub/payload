# Roadmap

## v0 — TypeScript reset

Goal: remove the Rails implementation and establish a clean Next.js foundation.

- [x] `pnpm create next-app` with TypeScript, App Router, ESLint, and `src/`
- [x] Tailwind CSS v4 + FlyonUI installed
- [x] Hack Club theme, Phantom Sans, and base layout wired
- [ ] Dockerfile using Next.js standalone output
- [x] `docker-compose.yml` for Postgres and Redis in local/dev deploys (app
      runs on host; Dockerfile is the missing piece)
- [ ] `env.ts` with Zod validation (Zod is installed; env access is currently
      ad-hoc per module via `getProxmoxConfig` / `getGuacamoleConfig` helpers)

## v1 — Ship to reviewers (multi-OS)

Goal: a small set of Hack Club reviewers can log in, spawn a Linux, Windows, or
Android VM, use it for up to 6 hours, and walk away.

Scope note: v1 was originally Linux-only (ADR-0010, ADR-0020) but expanded to
ship Linux, Windows, and Android together (ADR-0024). macOS is still deferred
to v2.x.

### Milestone 1 — App skeleton

- [x] Auth.js Hack Club OIDC login works end to end
- [x] `users` and `reviewer_allowlist_entries` tables migrated with Drizzle
- [x] Allowlist gate for every server action / route handler touching VMs
- [x] Empty dashboard renders for allowlisted user
- [x] Denied page renders for authenticated non-reviewer

### Milestone 2 — Proxmox plumbing

- [x] `ProxmoxClient` using native `fetch`, API token auth, timeout, and retries
- [x] `pnpm payload proxmox:test-clone` script clones, polls IP, stops, deletes
- [x] Linux VM template built and verified: Debian 12 + XFCE + xrdp
- [x] `vm_types` seed data loaded with `linux` row enabled
- [x] Windows 11 IoT LTSC template built and seeded (`vm_types.windows`)
- [x] BlissOS / Android template built and seeded (`vm_types.android`)

### Milestone 3 — Guacamole plumbing

- [x] Guacamole LXC built and reachable from the app container
      (operator setup guide: `AI/runbooks/setup-guacamole-lxc.md`)
- [x] `GuacamoleClient`: admin token, create user, create RDP/VNC connection,
      grant permissions, issue token, delete resources
- [x] `pnpm payload guac:test-connection` script registers a known test VM and
      prints the iframe URL (verified end-to-end: iframe loads the XFCE desktop)

### Milestone 4 — End-to-end lifecycle

- [x] `vm_sessions` and `vm_session_events` tables migrated
- [x] BullMQ queue, in-process worker, and Redis connection wired
- [x] `provision-vm` job glues Proxmox and Guacamole
- [x] Session view renders iframe with fresh token
- [x] SSE endpoint notifies session-ready / errored / terminated
- [x] Browser heartbeat route updates `last_heartbeat_at`
- [x] `reap-vm-sessions` scheduled job runs every 60 seconds (BullMQ Job
      Scheduler API, not the deprecated repeatable-job API)
- [x] `terminate-vm` job cleans up Guacamole + Proxmox
- [x] Per-user cap of 2 enforced with Postgres advisory lock inside a
      transaction

### Milestone 5 — Polish + ship

- [x] Linux VM tile works end to end (production deploy still pending)
- [x] Windows VM tile works end to end (production deploy still pending)
- [x] Android VM tile works end to end (production deploy still pending)
- [x] Time-remaining countdown (live HH:MM:SS per session)
- [ ] Warning toasts before TTL expiry (10 min, 1 min)
- [x] Session-end screen with reason
- [x] Error states designed (terminated, errored, stuck)
- [ ] Error states tested (no test suite yet)
- [ ] Production Docker image deployed
- [ ] Production secrets configured
- [ ] Runbooks updated from real deployment notes

## v1.x — Polish

- [ ] File transfer in/out of VM via Guacamole SFTP
- [ ] Session recording to disk
- [ ] Admin UI for allowlist
- [ ] Global session cap
- [x] Move SSE fanout to Redis pub/sub if app scales beyond one container
- [ ] Split BullMQ worker into a separate process if in-process starts hurting
- [ ] Per-session VM credentials (replace fixed `vm_types.username` /
      `vm_types.password`)
- [ ] Compute-cost dashboard

## v2 — Custom Guacamole client

- [ ] Replace iframe with `guacamole-common-js` client
- [ ] Custom on-screen keyboard themed to Hack Club
- [ ] Keep iframe as feature-flagged fallback

## v2.x — More VM types

Each adds a new `vm_types` row and a verified Proxmox template.

- [ ] macOS Sonoma+: OpenCore on Proxmox; EULA risk accepted in ADR-0007

Android IP discovery (current Android image): the BlissOS template is reachable
on the same Proxmox neighbor-table path used for Linux/Windows. If a future
Android image makes that unreliable, fallbacks to evaluate are: ARP scan from
Guacamole LXC, DHCP lease lookup on the Proxmox host, or a tiny in-VM agent
that POSTs its IP to Payload.

## v3 — Project review workflow

- [ ] Reviewer picks project by Git URL or submission ID
- [ ] First-boot script clones project into VM
- [ ] "Mark reviewed" and notes integrate with Hack Club review system

## Explicitly out of scope

- Public sign-up
- Long-lived VMs over 6 hours
- Persistent storage between sessions
- Multi-region Proxmox failover before real demand exists
