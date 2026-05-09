# Architecture

## High-level diagram

```
Browser (Reviewer)
  ├─ Payload UI (Rails+JS)
  └─ <iframe> Guacamole client (auto-auth token)
         │
         │ HTTPS + WSS
         ▼
  ┌──────────────────────┐
  │ Rails app (Payload)  │ ◄── Hack Club OIDC login
  │ • REST API for VMs  │     REST calls to Proxmox + Guacamole
  │ • Solid Queue jobs  │
  └──────┬───────────────┘
         │
    ┌────┴────────────┐
    │                 │
    ▼                 ▼
┌─────────┐   ┌─────────────────────────────┐
│Proxmox  │   │ Guacamole stack (LXC)      │
│cluster  │   │ • guacamole webapp + Tomcat │
│         │   │ • guacd daemon (VNC/RDP)     │
│ templates     │ • Postgres (auth store)   │
│ VMs      │   └─────────────────────────────┘
└─────────┘         │
                     │ LAN VNC/RDP
                     ▼
              ┌──────────────┐
              │ Ephemeral VMs│
              │ Win/Lin/And/Mac
              └──────────────┘
```

## Components

### 1. Rails app

- Brain. Speaks to user, Proxmox, and Guacamole.
- Handles OIDC login, allowlist enforcement, VM CRUD, heartbeat ingest,
  idle/TTL reaping (Solid Queue).
- Stateless web tier; all state in Postgres.

### 2. Postgres

- Single Postgres database. Solid Queue/Cache/Cable tables alongside app tables.
- Guacamole runs its own separate Postgres (do NOT share).

### 3. Reverse proxy — Caddy

- Single public hostname (`payload.hackclub.com`).
- Path routing:
  - `/` → Rails
  - `/guac/*` → Guacamole webapp (iframe `src` lives here)
  - `/cable` → Rails ActionCable

### 4. Guacamole stack

- Runs as LXC on Proxmox cluster.
- `guacd` — protocol daemon, speaks VNC/RDP to VMs over LAN.
- `guacamole` (Tomcat) — REST API + iframe-embeddable client UI.
- Backed by its own Postgres for JDBC auth extension.

### 5. Proxmox cluster

- One node minimum. Hosts VM templates, Guacamole LXC, (optionally) Rails+Postgres.
- Rails calls Proxmox API over HTTPS using API token.

## Data flow: reviewer creates a VM

1. Reviewer clicks "Spawn Linux".
2. Rails checks: user in allowlist? <2 active VMs?
3. Rails calls Proxmox API: clone template → new vmid, then start.
4. Rails polls `qemu-guest-agent` until VM reports IP (timeout ~120s).
5. Rails calls Guacamole REST: create connection row + issue auth token.
6. Rails renders session page with `<iframe src="/guac/#/client/<id>?token=…">`.
7. Browser sends heartbeat every 30s.
8. Reaper job runs every minute: terminate on 30min idle OR 6h TTL.

## Security boundaries

- Public internet → only Caddy (ports 80/443).
- Proxmox API, Guacamole REST, VM VNC/RDP → private LAN/VLAN. Only Rails and
  Guacamole can reach them.
- Per-VM credentials: each cloned VM gets fresh VNC/RDP password.
- Guacamole tokens: short TTL (15 min default), bound to single connection.
- Slack-ID allowlist: enforced server-side on every authenticated request.
