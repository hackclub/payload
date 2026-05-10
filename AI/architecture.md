# Architecture

## High-level diagram

```
Browser (Reviewer)
  ├─ Payload UI (Next.js App Router + React)
  ├─ EventSource stream for session-ready updates
  └─ <iframe> Guacamole client (auto-auth token)
         │
         │ HTTPS + WSS
         ▼
  ┌─────────────────────────────┐
  │ Next.js app (Payload)       │ ◄── Hack Club OIDC login
  │ • App Router pages/actions  │
  │ • Route handlers / API      │     REST calls to Proxmox + Guacamole
  │ • In-process BullMQ worker  │     BullMQ jobs via Redis
  └──────┬──────────────┬───────┘
         │              │
         ▼              ▼
   ┌──────────┐    ┌────────┐
   │Postgres  │    │Redis   │
   │app data  │    │queues  │
   └────┬─────┘    └────────┘
        │
    ┌───┴────────────┐
    │                │
    ▼                ▼
┌─────────┐   ┌─────────────────────────────┐
│Proxmox  │   │ Guacamole stack (LXC)       │
│cluster  │   │ • guacamole webapp + Tomcat │
│templates│   │ • guacd daemon (VNC/RDP)    │
│VMs      │   │ • Postgres (auth store)     │
└─────────┘   └─────────────────────────────┘
                     │
                     │ LAN VNC/RDP
                     ▼
              ┌──────────────┐
              │ Ephemeral VMs│
              │ Linux in v1  │
              └──────────────┘
```

## Components

### 1. Next.js app

- Brain. Speaks to reviewers, Proxmox, Guacamole, Postgres, and Redis.
- Uses App Router for UI routes and Route Handlers for API endpoints.
- Handles Auth.js login, Slack-ID allowlist enforcement, VM CRUD, heartbeat
  ingest, server-sent events, and BullMQ job processing.
- Runs as one Docker container for now. The BullMQ worker is started in-process
  during runtime, guarded so it does not start during builds or migrations.

### 2. Postgres

- Primary application database.
- Drizzle schema and SQL migrations are the source of truth for app tables.
- Guacamole runs its own separate Postgres database. Do not share.

### 3. Redis

- Required by BullMQ.
- Stores job queues, delayed jobs, retries, and scheduled reaper jobs.
- v1 deployment should run Redis alongside the app and Postgres.

### 4. Reverse proxy

- Single public hostname: `payload.hackclub.com`.
- Path routing:
  - `/` -> Next.js app
  - `/api/*` -> Next.js route handlers
  - `/guac/*` -> Guacamole webapp
- Caddy is still a good default because TLS and path routing are simple, but the
  app itself is only responsible for producing a Docker image.

### 5. Guacamole stack

- Runs as LXC on the Proxmox cluster.
- `guacd` speaks VNC/RDP to VMs over LAN.
- `guacamole` (Tomcat) exposes REST API + iframe-embeddable client UI.
- Backed by its own Postgres for JDBC auth extension.

### 6. Proxmox cluster

- One node minimum.
- Hosts VM templates, Guacamole LXC, and ephemeral VMs.
- Payload calls Proxmox API over HTTPS using an API token.

## Data flow: reviewer creates a VM

1. Reviewer clicks "Spawn Linux".
2. Next.js server action or route handler checks: user in allowlist, user has
   fewer than 2 active VMs, VM type enabled.
3. App inserts a `vm_sessions` row and enqueues a BullMQ `provision-vm` job.
4. Worker clones the template in Proxmox, starts it, reads the clone MAC from
   Proxmox config, and polls the Proxmox host neighbor table until the VM IP is
   known.
5. Worker creates the Guacamole user + connection, then marks the session ready.
6. Browser receives a server-sent event and swaps the provisioning screen for the
   Guacamole iframe.
7. Browser sends heartbeat with `fetch` every 30 seconds while the tab is usable.
8. Reaper job runs every minute and enqueues termination for idle, expired, or
   stuck sessions.

## Security boundaries

- Public internet reaches only the reverse proxy on ports 80/443.
- Proxmox API, Guacamole REST, Redis, Postgres, and VM VNC/RDP stay on private
  LAN/VLAN networks.
- v1 Linux uses a fixed operator-managed template credential. Per-session VM
  credentials should replace this before broader rollout.
- Guacamole tokens are short-lived and bound to a one-shot Guacamole user.
- Slack-ID allowlist is enforced server-side on every authenticated VM action.
