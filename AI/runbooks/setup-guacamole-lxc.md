# Runbook: Set Up the Guacamole LXC

This is the operator setup guide for the **single LXC** described in
[integrations/guacamole.md](../integrations/guacamole.md). It runs:

- `guacd` on `localhost:4822`
- `guacamole` (Tomcat 10) webapp on `:8080`
- `postgresql` (private to the LXC) for Guacamole's auth store

When you're done, the Payload app container can hit the Guacamole REST API at
`http://<guacamole-lxc-ip>:8080/guacamole/api`, and reviewer browsers can hit
the iframe through the reverse proxy at `https://payload.hackclub.com/guac/`.

The whole thing is one Debian 12 LXC. Nothing fancy.

---

## 0. Prereqs

- Proxmox VE 8+ host (the same one running your Linux VM template).
- A **Debian 12 LXC template** downloaded on the Proxmox host:

  ```bash
  pveam update
  pveam available --section system | grep debian-12
  pveam download local debian-12-standard_12.7-1_amd64.tar.zst   # or whatever the latest tag is
  ```

- Payload's app container (or `pnpm dev` host) must be on a network that can
  reach the LXC on TCP 8080. The simplest topology is "same vmbr0 bridge,
  same /24 subnet". If you're segmenting, see §7.

---
guacamole

## 1. Create the LXC

From the Proxmox shell (`root@pve:~#`):

```bash
pct create 9000 \
  local:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst \
  --hostname guacamole-lxc \
  --cores 2 \
  --memory 2048 \
  --swap 1024 \
  --rootfs local-lvm:16 \
  --net0 name=eth0,bridge=vmbr0,ip=dhcp,firewall=0 \
  --features nesting=1 \
  --unprivileged 1 \
  --onboot 1 \
  --password
```

Notes:

- `9000` is the LXC's CTID. Pick something outside your VM ID range so it
  never collides with `nextid` clones.
- `--password` will prompt for a root password; you only need it for the
  initial `pct enter` below.
- 2 vCPU / 2 GB RAM is comfortable for a few concurrent reviewers. Bump it
  later if `tomcat` gets unhappy.
- `nesting=1` is needed so systemd inside the container behaves.

Start it:

```bash
pct start 9000
pct enter 9000
```

Inside the LXC:

```bash
apt update && apt -y full-upgrade
apt -y install ca-certificates curl gnupg sudo locales \
  postgresql postgresql-contrib \
  tomcat10 tomcat10-admin \
  libcairo2-dev libjpeg62-turbo-dev libpng-dev libtool-bin libossp-uuid-dev \
  libavcodec-dev libavformat-dev libavutil-dev libswscale-dev \
  freerdp2-dev libpango1.0-dev libssh2-1-dev libtelnet-dev libvncserver-dev \
  libwebsockets-dev libpulse-dev libssl-dev libvorbis-dev libwebp-dev \
  build-essential

dpkg-reconfigure -f noninteractive locales
update-locale LANG=en_US.UTF-8
```

> Why build `guacd` from source rather than `apt install guacd`? Debian 12's
> `guacd` package is older than the Guacamole webapp version we're going to
> deploy. Mixing major versions across `guacd` ↔ `guacamole.war` is the #1
> cause of "session connects, then dies after 1 second" outages. We pin both
> sides to the same release.

Confirm the LXC's IP:

```bash
ip -4 addr show eth0 | awk '/inet /{print $2}' | cut -d/ -f1
```

Write this down. We'll call it `<GUAC_LXC_IP>` from here on.

---

## 2. Build and install `guacd`

Pin a single version. The current stable is **1.5.5**; bump in lockstep with
the `.war` below if you want a newer one.

```bash
GUAC_VERSION=1.6.0
cd /usr/local/src
curl -fsSLO "https://archive.apache.org/dist/guacamole/${GUAC_VERSION}/source/guacamole-server-${GUAC_VERSION}.tar.gz"
tar xf "guacamole-server-${GUAC_VERSION}.tar.gz"
cd "guacamole-server-${GUAC_VERSION}"

./configure --with-init-dir=/etc/init.d
make -j"$(nproc)"
make install
ldconfig
systemctl daemon-reload
systemctl enable --now guacd
systemctl status guacd --no-pager
```

You should see `guacd[NNN]: Listening on host 127.0.0.1, port 4822`.
**Bind to localhost only** — Payload never talks to `guacd` directly.

If it's listening on `0.0.0.0`, edit `/etc/guacamole/guacd.conf`:

```ini
[server]
bind_host = 127.0.0.1
bind_port = 4822
```

Then `systemctl restart guacd`.

---

## 3. Set up Postgres for Guacamole

Inside the LXC:

```bash
systemctl enable --now postgresql

GUAC_DB_PASSWORD="$(openssl rand -base64 24)"
echo "GUACAMOLE DB PASSWORD: $GUAC_DB_PASSWORD"   # save this; you'll need it twice

sudo -u postgres psql <<SQL
CREATE DATABASE guacamole_db;
CREATE USER guacamole_user WITH PASSWORD '$GUAC_DB_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE guacamole_db TO guacamole_user;
\c guacamole_db
GRANT ALL ON SCHEMA public TO guacamole_user;
SQL
```

Make sure Postgres only listens on the LXC loopback. In
`/etc/postgresql/15/main/postgresql.conf`:

```
listen_addresses = 'localhost'
```

And `/etc/postgresql/15/main/pg_hba.conf` should keep the default `local` and
`host ... 127.0.0.1/32` entries — don't open it to `0.0.0.0/0`.

```bash
systemctl restart postgresql
```

---

## 4. Install the Guacamole webapp + JDBC auth extension

```bash
GUAC_VERSION=1.6.0
cd /usr/local/src

# Webapp WAR
curl -fsSLO "https://archive.apache.org/dist/guacamole/${GUAC_VERSION}/binary/guacamole-${GUAC_VERSION}.war"
mv "guacamole-${GUAC_VERSION}.war" /var/lib/tomcat10/webapps/guacamole.war

# JDBC auth extension (postgresql)
curl -fsSLO "https://archive.apache.org/dist/guacamole/${GUAC_VERSION}/binary/guacamole-auth-jdbc-${GUAC_VERSION}.tar.gz"
tar xf "guacamole-auth-jdbc-${GUAC_VERSION}.tar.gz"

mkdir -p /etc/guacamole/{extensions,lib}
cp "guacamole-auth-jdbc-${GUAC_VERSION}/postgresql/guacamole-auth-jdbc-postgresql-${GUAC_VERSION}.jar" \
   /etc/guacamole/extensions/

# Postgres JDBC driver
curl -fsSL "https://jdbc.postgresql.org/download/postgresql-42.7.4.jar" \
  -o /etc/guacamole/lib/postgresql.jar

# Initialize the schema
cat "guacamole-auth-jdbc-${GUAC_VERSION}/postgresql/schema/"*.sql | \
  sudo -u postgres psql -d guacamole_db
```

Now write the Guacamole config. Substitute `$GUAC_DB_PASSWORD` from §3.

```bash
cat > /etc/guacamole/guacamole.properties <<EOF
postgresql-hostname: localhost
postgresql-port: 5432
postgresql-database: guacamole_db
postgresql-username: guacamole_user
postgresql-password: $GUAC_DB_PASSWORD
postgresql-auto-create-accounts: false
api-session-timeout: 15
extension-priority: postgresql
EOF

# Tomcat needs to find /etc/guacamole
echo 'GUACAMOLE_HOME=/etc/guacamole' >> /etc/default/tomcat10
```

Make the config tree readable by Tomcat:

```bash
chown -R root:tomcat /etc/guacamole
chmod -R 750 /etc/guacamole
chmod 640 /etc/guacamole/guacamole.properties
```

Restart Tomcat and verify:

```bash
systemctl restart tomcat10
sleep 5
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8080/guacamole/
# expect: 200
```

If you get 404, check `/var/log/tomcat10/catalina.out` — usually the
`guacamole.war` didn't get exploded yet, or `GUACAMOLE_HOME` isn't being
picked up.

Tomcat by default binds to `0.0.0.0:8080`. That's fine inside the LXC
because the bridge is private; the reverse proxy is what gives the public
the only path in. If you want belt-and-suspenders, edit
`/etc/tomcat10/server.conf` and set `<Connector address="<GUAC_LXC_IP>" ...>`.

---

## 5. Replace the default `guacadmin` user with `payload-admin`

Guacamole's JDBC schema seeds a user `guacadmin` / `guacadmin` with full
ADMINISTER. **You need to delete that and create your own admin** before
exposing anything.

Generate a password and a salted SHA-256 hash that matches Guacamole's
internal scheme (password + uppercase hex salt, UTF-8 encoded, then SHA-256):

```bash
PAYLOAD_ADMIN_PASSWORD="$(openssl rand -base64 24)"
echo "PAYLOAD ADMIN PASSWORD: $PAYLOAD_ADMIN_PASSWORD"   # save this for Payload's .env

SALT_HEX="$(openssl rand -hex 32)"

HASH_HEX="$(python3 -c "
import hashlib
password = '${PAYLOAD_ADMIN_PASSWORD}'
salt_upper = '${SALT_HEX}'.upper()
print(hashlib.sha256((password + salt_upper).encode('utf-8')).hexdigest())
")"

sudo -u postgres psql -d guacamole_db <<SQL
-- delete the default
DELETE FROM guacamole_user
  WHERE entity_id = (SELECT entity_id FROM guacamole_entity
                     WHERE name='guacadmin' AND type='USER');
DELETE FROM guacamole_entity WHERE name='guacadmin' AND type='USER';

-- create payload-admin
INSERT INTO guacamole_entity (name, type) VALUES ('payload-admin', 'USER');
INSERT INTO guacamole_user (entity_id, password_hash, password_salt, password_date)
  SELECT entity_id, decode('${HASH_HEX}','hex'), decode('${SALT_HEX}','hex'), now()
  FROM guacamole_entity WHERE name='payload-admin' AND type='USER';

-- grant system permissions
INSERT INTO guacamole_system_permission (entity_id, permission)
  SELECT entity_id, p::guacamole_system_permission_type
  FROM guacamole_entity, unnest(ARRAY['CREATE_CONNECTION','CREATE_USER','ADMINISTER']) p
  WHERE name='payload-admin' AND type='USER';

-- grant guacamole_user full table access (required for JDBC auth to function)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO guacamole_user;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO guacamole_user;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO guacamole_user;
SQL
```

Verify login works:

```bash
curl -s -X POST http://127.0.0.1:8080/guacamole/api/tokens \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=payload-admin&password=${PAYLOAD_ADMIN_PASSWORD}" \
  | grep -o '"authToken":"[^"]*"'
```

You should see an `authToken` in the response.

If that works, **save** `PAYLOAD_ADMIN_PASSWORD` for Payload's `.env`.

---

## 6. Reverse proxy (Caddy)

The architecture decision is single host with path routing
([ADR-0008](../decisions.md)). Reviewer browsers hit
`https://payload.hackclub.com/guac/...` and Caddy proxies to
`http://<GUAC_LXC_IP>:8080/guacamole/...`.

Snippet for `Caddyfile`:

```caddy
payload.hackclub.com {
    encode zstd gzip

    # Guacamole iframe — strip the /guac prefix so the upstream sees /guacamole/...
    handle_path /guac/* {
        reverse_proxy http://<GUAC_LXC_IP>:8080 {
            header_up Host {upstream_hostport}
            header_up X-Forwarded-Host {host}
            header_up X-Forwarded-Proto {scheme}
            # WebSocket tunnel for the Guacamole client
            header_up Connection {>Connection}
            header_up Upgrade {>Upgrade}
        }
        rewrite * /guacamole{uri}
    }

    # everything else → Next.js
    reverse_proxy localhost:3000
}
```

Two things people get wrong here:

1. **Path rewrite must keep the trailing path.** The Guacamole client makes
   relative requests to `/guacamole/api/...` — the rewrite above keeps that.
2. **WebSocket headers.** The iframe uses a WebSocket tunnel. If the proxy
   strips `Upgrade`/`Connection`, the iframe shows the Guacamole UI but
   never connects to a session.

Reload Caddy, then verify from your laptop:

```bash
curl -sI https://payload.hackclub.com/guac/  | head -5
# expect 200 or 302
```

---

## 7. Network access from the Payload app

The Payload Next.js container (`payload-app`) must be able to reach
`<GUAC_LXC_IP>:8080`. Two common topologies:

**A. Single host, same bridge.** App container is on `vmbr0` and shares the
LXC's subnet. Nothing extra to do — just set `GUACAMOLE_BASE_URL` to the
LXC IP.

**B. App in Docker on a different host.** Make sure the Docker host's
firewall allows outbound TCP 8080 to the LXC, and that the Proxmox host's
firewall allows it inbound. If you're paranoid:

```bash
# inside the LXC: only allow 8080 from the app host's IP
apt -y install nftables
nft add table inet filter
nft add chain inet filter input '{ type filter hook input priority 0; policy drop; }'
nft add rule inet filter input ct state established,related accept
nft add rule inet filter input iif lo accept
nft add rule inet filter input tcp dport 22 accept
nft add rule inet filter input ip saddr <APP_HOST_IP> tcp dport 8080 accept
nft list ruleset > /etc/nftables.conf
systemctl enable --now nftables
```

**Reverse proxy still needs port 8080.** If the Caddy proxy runs on a
different host than the Payload app, put both source IPs in the allow list.

---

## 8. Wire it into Payload's `.env`

On the host where you run `pnpm dev` or the Payload Docker container:

```bash
# Internal URL — what the Next.js process uses to call the REST API
GUACAMOLE_BASE_URL=http://<GUAC_LXC_IP>:8080/guacamole

# Public URL — what the reviewer's browser uses for the iframe
GUACAMOLE_PUBLIC_BASE_URL=https://payload.hackclub.com/guac

GUACAMOLE_DATA_SOURCE=postgresql
GUACAMOLE_ADMIN_USER=payload-admin
GUACAMOLE_ADMIN_PASSWORD=<the value from §5>
```

For local dev without a public proxy, you can point the public URL at the
internal one:

```bash
GUACAMOLE_PUBLIC_BASE_URL=http://<GUAC_LXC_IP>:8080/guacamole
```

…but the iframe URL the test script prints will only work if your browser
can reach that IP directly.

---

## 9. Smoke test from Payload

Make sure you have a Linux VM running with RDP listening on 3389. The
easiest path:

```bash
# in the Payload repo
pnpm payload proxmox:test-clone
# note the IP it prints — but cancel before it stops/destroys the VM,
# OR temporarily edit the script to skip cleanup,
# OR just clone manually in Proxmox and start it.
```

Then, with the VM running:

```bash
GUAC_TEST_VM_IP=<vm ip> \
GUAC_TEST_VM_USERNAME=shipwrights \
GUAC_TEST_VM_PASSWORD=shipwrights \
pnpm payload guac:test-connection
```

Expected output:

```
→ Verifying admin token at http://<GUAC_LXC_IP>:8080/guacamole...
  admin token OK
→ Creating one-shot Guacamole user payload-test-XXXX...
→ Creating RDP connection payload-test-XXXX → <vm ip>:3389...
  connection identifier = 17
→ Granting payload-test-XXXX READ on connection 17...
→ Issuing reviewer session token for payload-test-XXXX...

================================================================
Guacamole iframe URL (open in a browser to verify):

https://payload.hackclub.com/guac/#/client/MTcAYwBwb3N0Z3Jlc3Fs?token=...
================================================================
```

Open the URL in a browser. You should see the Debian XFCE desktop within a
few seconds. Press Enter in the terminal to clean up the test user +
connection.

If the iframe loads but stays blank: open browser devtools → Network → look
for the WebSocket request to `…/guacamole/websocket-tunnel`. If that's a
404 or non-101, your reverse proxy isn't passing `Upgrade`/`Connection`
correctly (back to §6).

---

## 10. Gotchas (read this before paging me)

- **`guacd` and `.war` versions must match.** If you upgrade one, upgrade
  both. The error mode is "iframe connects, then immediately disconnects".
- **Password hash format** in §5 is salted SHA-256 with the salt's
  uppercased hex form appended to the password before hashing. That detail
  matters; lowercase salt → admin login silently fails.
- **`api-session-timeout`** is in **minutes**, not seconds. The default is
  60 minutes; we set it to 15 to keep stolen tokens short-lived. The client
  in `src/lib/guacamole/client.ts` caches the admin token for 12 minutes
  to stay under that ceiling.
- **Don't put the LXC on the same VLAN as ephemeral VMs unless you want
  reviewers' VMs to be able to talk to Guacamole's Postgres directly.**
  Payload's threat model assumes those VMs are hostile.
- **Backups.** The Guacamole DB is throwaway in v1 — connections and users
  are recreated on every session. You don't need a backup of it.

---

## Quick reference: things to write down

After completing this runbook, you should have these values ready for
Payload's `.env`:

| Variable | From |
|----------|------|
| `GUACAMOLE_BASE_URL` | `http://<GUAC_LXC_IP>:8080/guacamole` |
| `GUACAMOLE_PUBLIC_BASE_URL` | `https://payload.hackclub.com/guac` |
| `GUACAMOLE_DATA_SOURCE` | `postgresql` (just leave it) |
| `GUACAMOLE_ADMIN_USER` | `payload-admin` |
| `GUACAMOLE_ADMIN_PASSWORD` | from §5 |

And these LXC-internal secrets, which you do **not** need to put in
Payload's env:

- The `guacamole_user` Postgres password (only used in
  `/etc/guacamole/guacamole.properties` inside the LXC).
- The root password for the LXC.
