# Runbook: Deploy Payload to a Proxmox LXC

This is the operator deployment guide for the Payload Next.js app. The app
runs as Docker containers **inside a Debian 12 LXC** that lives on the same
Proxmox cluster as the Guacamole LXC and the ephemeral VMs.

When you finish, you have:

- A Debian 12 LXC (`payload-app`) running Docker
- `payload:latest` Next.js container on `127.0.0.1:3000`
- `postgres:16-alpine` (app DB) and `redis:7-alpine` (BullMQ broker) sidecars
- Caddy on the same LXC handing TLS for `payload.hackclub.com` and proxying
  `/guac/*` to the Guacamole LXC (per ADR-0008)
- Drizzle migrations applied and `vm_types` + `reviewer_allowlist_entries`
  seeded

The Guacamole LXC, the Linux/Windows/Android VM templates, and the Proxmox
API token must already exist; see:

- [setup-guacamole-lxc.md](./setup-guacamole-lxc.md)
- [build-linux-template.md](./build-linux-template.md)
- [../integrations/proxmox.md](../integrations/proxmox.md) for the API token

---

## 0. Prereqs you should already have

| Thing | Where it comes from |
|-------|---------------------|
| Proxmox node with the `nesting=1` LXC feature available | Proxmox VE 8+ |
| Debian 12 LXC template downloaded on the Proxmox host | `pveam download local debian-12-standard_12.7-1_amd64.tar.zst` |
| Hack Club OIDC client ID + secret | [hackclub-oidc.md](../integrations/hackclub-oidc.md) |
| Proxmox API token (`payload@pve!payload`) and secret | [proxmox.md](../integrations/proxmox.md) |
| Guacamole LXC IP and `payload-admin` password | [setup-guacamole-lxc.md](./setup-guacamole-lxc.md) §5 |
| DNS `A`/`AAAA` for `payload.hackclub.com` pointing at the public IP | Hack Club ops |
| Repository pushed to a Git remote the LXC can clone (HTTPS or deploy key) | GitHub |

---

## 1. Create the LXC

From the Proxmox shell (`root@pve:~#`):

```bash
pct create 9100 \
  local:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst \
  --hostname payload-app \
  --cores 4 \
  --memory 4096 \
  --swap 2048 \
  --rootfs local-lvm:32 \
  --net0 name=eth0,bridge=vmbr0,ip=dhcp,firewall=0 \
  --features nesting=1,keyctl=1 \
  --unprivileged 1 \
  --onboot 1 \
  --password
```

Notes:

- `9100` is the CTID. Pick something outside your VM ID range and clear of the
  Guacamole LXC (the example used `9000`).
- `nesting=1` and `keyctl=1` are required so Docker's overlayfs and
  cgroupv2 work cleanly inside an unprivileged LXC.
- 4 vCPU / 4 GB RAM / 32 GB disk is comfortable headroom for the app +
  Postgres + Redis. The compute-heavy work happens on the VM hosts, not here.
- Same `vmbr0` bridge as Guacamole LXC keeps east-west traffic on the LAN.

Start and enter it:

```bash
pct start 9100
pct enter 9100
```

Inside the LXC:

```bash
apt update && apt -y full-upgrade
apt -y install ca-certificates curl gnupg sudo locales git ufw \
  apt-transport-https software-properties-common

dpkg-reconfigure -f noninteractive locales
update-locale LANG=en_US.UTF-8

# Confirm the IP the rest of the cluster sees you on:
ip -4 addr show eth0 | awk '/inet /{print $2}' | cut -d/ -f1
# Write this down as <PAYLOAD_LXC_IP>.
```

---

## 2. Install Docker Engine inside the LXC

Use the official Docker repo. Don't use Debian's `docker.io` package — its
buildx and compose versions lag.

```bash
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg \
  -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/debian bookworm stable" \
  > /etc/apt/sources.list.d/docker.list

apt update
apt -y install docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin

systemctl enable --now docker
docker run --rm hello-world
```

If `hello-world` fails with `permission denied` or `apparmor` errors, the
LXC was created without `nesting=1` — recreate it (§1) instead of fighting
LXC profiles.

---

## 3. Install Node.js + pnpm (host-side, for build & migrations)

We build the Docker image inside the LXC, and we run the one-shot
migration / seed scripts directly from the source tree. Both need Node and
pnpm on the LXC host.

```bash
# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt -y install nodejs

# pnpm (corepack ships with Node)
corepack enable
corepack prepare pnpm@latest --activate

node --version    # v20.x
pnpm --version    # 9.x or newer
```

---

## 4. Clone the repo and install dependencies

```bash
mkdir -p /opt && cd /opt
git clone https://github.com/hexdump0/payload.git
cd payload

pnpm install --frozen-lockfile
```

The lockfile is the source of truth; `--frozen-lockfile` will fail loudly if
something is out of sync.

---

## 5. Write the production `.env.production`

Copy the example and fill it in:

```bash
cp env.example .env.production
chmod 600 .env.production
$EDITOR .env.production
```

Required values:

```bash
# ── Auth ─────────────────────────────────────────────────────────────────
HACKCLUB_OIDC_CLIENT_ID=...
HACKCLUB_OIDC_CLIENT_SECRET=...
HACKCLUB_OIDC_REDIRECT_URI=https://payload.hackclub.com/api/auth/callback/hackclub
AUTH_SECRET=...                     # openssl rand -base64 48

# ── Database (compose-internal hostnames) ────────────────────────────────
# Pick a strong password, then INLINE it into DATABASE_URL below — neither
# dotenv (used by db:migrate / db:seed) nor compose's env_file expand
# ${POSTGRES_PASSWORD} references inside the same file. The `${...}` form
# silently ships to the container/script as a literal string and Postgres
# rejects it with "password authentication failed".
POSTGRES_PASSWORD=PASTE_THE_SAME_PASSWORD_HERE       # openssl rand -base64 32
DATABASE_URL=postgres://payload:PASTE_THE_SAME_PASSWORD_HERE@db:5432/payload
REDIS_URL=redis://redis:6379

# ── Proxmox ──────────────────────────────────────────────────────────────
PROXMOX_HOST=10.10.10.1             # Proxmox node hostname or IP
PROXMOX_PORT=8006
PROXMOX_TOKEN_ID=payload@pve!payload
PROXMOX_TOKEN_SECRET=...
PROXMOX_DEFAULT_NODE=pve
PROXMOX_VERIFY_TLS=false            # `true` once you put a real cert on Proxmox
PROXMOX_SSH_HOST=10.10.10.1
PROXMOX_SSH_USER=root
PROXMOX_SSH_KEY_PATH=/keys/proxmox_id_ed25519   # see §6 for mounting

# ── Guacamole (from setup-guacamole-lxc.md) ──────────────────────────────
GUACAMOLE_BASE_URL=http://10.10.10.67:8080/guacamole
GUACAMOLE_PUBLIC_BASE_URL=https://payload.hackclub.com/guac
GUACAMOLE_DATA_SOURCE=postgresql
GUACAMOLE_ADMIN_USER=payload-admin
GUACAMOLE_ADMIN_PASSWORD=...

# ── Crypto ───────────────────────────────────────────────────────────────
SESSION_ENCRYPTION_KEY=...          # openssl rand -hex 32   (64 hex chars)
```

**Two `.env` files matter** during deploy. This is the single most common
trip wire — read it twice:

| File | Used by | Hostnames |
|------|---------|-----------|
| `.env.production` | `docker compose --env-file` (baked into the app container at runtime) | compose service names: `db`, `redis` |
| `.env` | host-side scripts: `pnpm db:migrate`, `pnpm db:seed`, `pnpm payload …` | `127.0.0.1` (compose publishes Postgres on `127.0.0.1:5432` and Redis on `127.0.0.1:6379`) |

The host has no DNS for `db` / `redis`, so a host-side `pnpm db:migrate`
against `@db:5432` fails with `getaddrinfo ENOTFOUND db`. Build `.env` by
copying `.env.production` and rewriting just those two URLs:

```bash
cp .env.production .env
sed -i 's|@db:5432/|@127.0.0.1:5432/|' .env
sed -i 's|//redis:6379|//127.0.0.1:6379|' .env
chmod 600 .env

# Verify the rewrite landed:
grep -E '^(DATABASE_URL|REDIS_URL)=' .env
# expect:
#   DATABASE_URL=postgres://payload:...@127.0.0.1:5432/payload
#   REDIS_URL=redis://127.0.0.1:6379
```

---

## 6. Mount the Proxmox SSH key into the LXC (one-time)

Provisioning needs to read the Proxmox host's neighbor table over SSH to
discover VM IPs. Generate a dedicated key, drop it on the Proxmox host's
`authorized_keys`, then mount it into the app container.

On the LXC:

```bash
mkdir -p /opt/payload-secrets/keys
ssh-keygen -t ed25519 -N "" -C "payload@payload-app" \
  -f /opt/payload-secrets/keys/proxmox_id_ed25519
cat /opt/payload-secrets/keys/proxmox_id_ed25519.pub
```

Copy that public line into `/root/.ssh/authorized_keys` on the Proxmox host.

Then add a bind mount to `docker-compose.prod.yml` under `app:`:

```yaml
    volumes:
      - /opt/payload-secrets/keys:/keys:ro
```

`PROXMOX_SSH_KEY_PATH=/keys/proxmox_id_ed25519` in `.env.production` matches.

Verify from the LXC host:

```bash
ssh -i /opt/payload-secrets/keys/proxmox_id_ed25519 \
    root@<PROXMOX_HOST> 'pveversion'
```

---

## 7. Bring up Postgres + Redis (without the app yet)

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production \
  up -d db redis

docker compose -f docker-compose.prod.yml ps
# both should be (healthy) within ~10s
```

---

## 8. Apply migrations and seed reference data

```bash
# Drizzle migrations (uses /opt/payload/.env DATABASE_URL → 127.0.0.1:5432)
pnpm db:migrate

# Seeds: vm_types rows + reviewer_allowlist_entries + admins
pnpm db:seed
```

Expected: `Migrations applied.` and a list of inserted/updated `vm_types`.

If you need to add a reviewer later, edit `scripts/seed.ts` (per ADR-0023),
re-run `pnpm db:seed`.

---

## 9. Build and start the app container

```bash
# The footer commit sha is resolved automatically from .git in the build
# context (see .dockerignore); no GIT_SHA prefix needed.
docker compose -f docker-compose.prod.yml --env-file .env.production \
  build app

docker compose -f docker-compose.prod.yml --env-file .env.production \
  up -d app

docker compose -f docker-compose.prod.yml logs -f app
# expect: "▲ Next.js ... ready" within ~5s
# the in-process BullMQ worker logs "[worker] ready" right after that
```

Smoke test from the LXC:

```bash
curl -sI http://127.0.0.1:3000 | head -3
# expect 200 (or 307 redirect to /api/auth/signin)
```

---

## 10. Caddy reverse proxy on the same LXC

Caddy serves `payload.hackclub.com` and routes `/guac/*` to the Guacamole
LXC (per [setup-guacamole-lxc.md §6](./setup-guacamole-lxc.md)).

```bash
apt -y install debian-keyring debian-archive-keyring
curl -fsSL "https://dl.cloudsmith.io/public/caddy/stable/gpg.key" \
  | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -fsSL "https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt" \
  > /etc/apt/sources.list.d/caddy-stable.list
apt update
apt -y install caddy
```

Drop in `/etc/caddy/Caddyfile`:

```caddy
payload.hackclub.com {
    encode zstd gzip

    # Guacamole iframe — strip /guac, keep /guacamole/...
    handle_path /guac/* {
        reverse_proxy http://<GUAC_LXC_IP>:8080 {
            header_up Host {upstream_hostport}
            header_up X-Forwarded-Host {host}
            header_up X-Forwarded-Proto {scheme}
            header_up Connection {>Connection}
            header_up Upgrade {>Upgrade}
        }
        rewrite * /guacamole{uri}
    }

    # SSE: never buffer responses
    @sse path /api/sessions/*/events
    reverse_proxy @sse 127.0.0.1:3000 {
        flush_interval -1
    }

    # Everything else → Next.js
    reverse_proxy 127.0.0.1:3000
}
```

Reload and verify TLS:

```bash
systemctl reload caddy
curl -sI https://payload.hackclub.com | head -5
# expect 200 / 307; cert auto-issued by Let's Encrypt
```

If port 80/443 isn't reachable from the public internet, the Hack Club
edge proxy may need to forward to `<PAYLOAD_LXC_IP>` first.

---

## 11. Lock down the LXC firewall

UFW is the simplest sane default:

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
ufw status verbose
```

Notes:

- The app port (3000), Postgres (5432), and Redis (6379) are bound to
  `127.0.0.1` in compose, so UFW doesn't need rules for them.
- Outbound to Proxmox (8006), Guacamole (8080), and Hack Club OIDC
  (`hackclub.com`) is allowed by default-allow-out.

---

## 12. Smoke test the full stack

1. Open `https://payload.hackclub.com` in a browser.
2. Click **Log in** → Hack Club OIDC consent → land on dashboard.
3. Click a **Linux** tile → wait for the provision screen.
4. Within ~30–90s the iframe should swap in and show the XFCE desktop.
5. Open another tab to `https://payload.hackclub.com/api/health` (if it
   exists) or `docker compose logs -f app` to confirm:
   - `provision-vm` job logs success
   - `[sse] publish session-ready` line
   - heartbeat POSTs every 30s

If provision fails:

- `docker compose logs app | rg provision-vm` — first line of the stack
  trace usually points at Proxmox (token), Guacamole (admin password), or
  the SSH key (IP discovery).
- Run `pnpm payload proxmox:test-clone` from the LXC to isolate Proxmox.
- Run `pnpm payload guac:test-connection` against a known-good VM IP to
  isolate Guacamole.

---

## 13. Operations: day-2 commands

**Tail logs:**

```bash
cd /opt/payload
docker compose -f docker-compose.prod.yml logs -f app
```

**Update to a new release:**

```bash
cd /opt/payload
git pull
pnpm install --frozen-lockfile          # only if package.json changed
pnpm db:migrate                         # only if drizzle/ changed
docker compose -f docker-compose.prod.yml --env-file .env.production \
  build app
docker compose -f docker-compose.prod.yml --env-file .env.production \
  up -d app
```

The new app container starts before the old one is killed (compose default),
so live sessions blink but don't drop their iframe.

**Restart only the worker** (not separately addressable today —
ADR-0016 keeps the worker in-process; restart the app):

```bash
docker compose -f docker-compose.prod.yml restart app
```

**Backup the app DB:**

```bash
docker compose -f docker-compose.prod.yml exec db \
  pg_dump -U payload payload \
  | gzip > /opt/payload-backups/payload-$(date +%F).sql.gz
```

The Guacamole DB is throwaway (per setup-guacamole-lxc.md §10), so we
only back up the app DB.

**Manual reaper invoke** (rare; the BullMQ scheduler runs it every 60s,
ADR-0027):

```bash
# Inside the app container shell:
docker compose -f docker-compose.prod.yml exec app sh
node -e "import('./src/lib/queue/index.js').then(({vmQueue}) => \
  vmQueue.add('reap-vm-sessions', {}))"
```

**Allowlist update** — see [allowlist-update.md](./allowlist-update.md).

**Orphan VM cleanup** — see [orphan-cleanup.md](./orphan-cleanup.md).

**Guacamole down** — see [guacamole-down.md](./guacamole-down.md).

---

## 14. Gotchas

- **`${VAR}` references inside `.env` / `.env.production` are NOT expanded.**
  Both `dotenv` (host-side scripts) and Docker Compose's `env_file:`
  directive ship the value to the consumer as a literal string. Writing
  `DATABASE_URL=postgres://payload:${POSTGRES_PASSWORD}@db:5432/payload`
  yields the literal string `${POSTGRES_PASSWORD}` as the password and
  Postgres returns `password authentication failed for user "payload"`.
  Inline the password into `DATABASE_URL` directly. (`docker compose run`
  with `--env` from the shell *does* expand because the shell does it
  before compose ever sees the value — but that's not what we use here.)
- **LXC `nesting=1` and `keyctl=1` are not optional** for Docker. If you
  see weird `mkdir`/`chown` errors during `docker build`, the LXC was
  created without them. Recreate it; don't try to retrofit.
- **`docker compose up -d` does not run migrations.** Always run
  `pnpm db:migrate` from the host before `up -d app` after a release that
  changed `drizzle/`. The app will boot with the wrong schema otherwise
  and the first failing job will be opaque.
- **Caddy buffers SSE by default.** If the dashboard "Provisioning…"
  spinner never flips to the iframe even though `docker compose logs app`
  shows `[sse] publish session-ready`, you forgot the `flush_interval -1`
  block in §10.
- **Two `.env` files on purpose.** `db:migrate` and `db:seed` run from
  the LXC host and need `127.0.0.1:5432`. The container needs `db:5432`.
  Don't try to share one file with `db:5432` everywhere — the host can't
  resolve compose service names.
- **OIDC redirect URI** must exactly match the registered value
  `https://payload.hackclub.com/api/auth/callback/hackclub` (ADR-0011).
  Trailing slash, scheme, and casing matter to the provider.
- **The BullMQ worker runs in-process** (ADR-0016). Restarting the app
  container is the same as restarting the worker. There is no separate
  worker service to scale yet — see the v1.x roadmap item.
- **VM credentials are template-fixed**, not per-session, until the v1.x
  per-session-credentials work lands (ADR-0026). Anyone with the template
  default password can RDP into a stale orphan VM if cleanup fails. The
  reaper closes that window in ≤60s in normal operation.

---

## 15. What to write down after deploy

| Variable | Value |
|----------|-------|
| `<PAYLOAD_LXC_IP>` | from §1 |
| `POSTGRES_PASSWORD` | from §5 |
| `AUTH_SECRET` | from §5 |
| `SESSION_ENCRYPTION_KEY` | from §5 |
| Proxmox SSH key location | `/opt/payload-secrets/keys/proxmox_id_ed25519` |
| Caddy site config | `/etc/caddy/Caddyfile` |
| Compose file | `/opt/payload/docker-compose.prod.yml` |
| Repo working copy | `/opt/payload` |

Stash the env files in your password manager. The repo working copy is
not the source of truth for secrets.
