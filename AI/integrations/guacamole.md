# Apache Guacamole Integration

We use Guacamole as the protocol gateway. Reviewers never see Guacamole's
login screen — Rails creates connections + tokens via REST API and embeds the
client UI in an iframe with a query-string token.

## Components

- **`guacd`** — protocol daemon on `localhost:4822`. Speaks VNC/RDP to target VMs.
- **`guacamole`** — Tomcat webapp. REST API + JS client UI. Backed by JDBC
  PostgreSQL auth extension.
- **Postgres** (separate from Rails' DB) — Guacamole's auth/connection store.

## Deployment

Run as a single LXC on Proxmox:

```
guacamole-lxc:
  - guacd               (port 4822, localhost only)
  - tomcat10 + guacamole.war  (port 8080)
  - postgres            (port 5432, localhost only)
```

Caddy routes `https://payload.hackclub.com/guac/*` → `http://guacamole-lxc:8080/guacamole/*`.

### guacamole.properties settings

```properties
postgresql-hostname=localhost
postgresql-database=guacamole_db
postgresql-username=guacamole
postgresql-password=******
api-session-timeout=15      # minutes; short because Rails issues fresh tokens
extension-priority=postgresql
```

## REST API surface we use

Base: `http://guacamole-lxc:8080/guacamole/api`
Data source: `postgresql`

### 1. Get admin token (Rails → Guacamole)

```
POST /api/tokens
Content-Type: application/x-www-form-urlencoded
username=guac-admin&password=<secret>
```

Response:
```json
{ "authToken": "C90FE...", "username": "guac-admin",
  "dataSource": "postgresql" }
```

Cache in Solid Cache (TTL = `api-session-timeout - 1m`). Refresh on 401.

### 2. Create one-shot user

```
POST /api/session/data/postgresql/users?token=<admin>
Content-Type: application/json
{
  "username": "payload-42",
  "password": "<random>"
}
```

### 3. Create VNC connection (Linux/Android/macOS)

```
POST /api/session/data/postgresql/connections?token=<admin>
{
  "parentIdentifier": "ROOT",
  "name": "payload-42",
  "protocol": "vnc",
  "parameters": {
    "hostname": "10.0.0.42",
    "port": "5900",
    "password": "<vm credential>",
    "color-depth": "24",
    "disable-copy": "false",
    "disable-paste": "false"
  },
  "attributes": {
    "max-connections": "1",
    "max-connections-per-user": "1"
  }
}
```

Response: `{ "identifier": "17", ... }` — store as `guacamole_connection_id`.

### 3b. Create RDP connection (Windows)

Same shape, `protocol: "rdp"`, with parameters:
```json
{
  "hostname": "10.0.0.42", "port": "3389",
  "username": "reviewer", "password": "<vm credential>",
  "ignore-cert": "true", "security": "any",
  "disable-copy": "false", "disable-paste": "false"
}
```

### 4. Grant user access to connection

```
PATCH /api/session/data/postgresql/users/payload-42/permissions?token=<admin>
[
  { "op": "add", "path": "/connectionPermissions/17", "value": "READ" }
]
```

### 5. Issue session token for reviewer

```
POST /api/tokens
username=payload-42&password=<that-user's-password>
```

→ authToken goes in the iframe URL.

### 6. Iframe URL

Connection identifier is **base64 of `<id>\0c\0<dataSource>`** (NULL-separated):

```ruby
require "base64"
id_param = Base64.strict_encode64("17\0c\0postgresql")  # → "MTcAYwBwb3N0Z3Jlc3Fs"
```

Iframe src:
```
https://payload.hackclub.com/guac/#/client/MTcAYwBwb3N0Z3Jlc3Fs?token=<authToken>
```

### 7. Cleanup on terminate

```
DELETE /api/session/data/postgresql/connections/17?token=<admin>
DELETE /api/session/data/postgresql/users/payload-42?token=<admin>
```

Both idempotent — treat 404 as success.

## Env vars

```bash
GUACAMOLE_BASE_URL=http://guacamole-lxc:8080/guacamole
GUACAMOLE_PUBLIC_BASE_URL=https://payload.hackclub.com/guac
GUACAMOLE_DATA_SOURCE=postgresql
GUACAMOLE_ADMIN_USER=payload-admin
GUACAMOLE_ADMIN_PASSWORD=…
```

## Why iframe, not custom client (for v1)

Iframe for v1. Architecture stays open for custom `guacamole-common-js` client later.

The custom-client path requires websocket tunnel, keyboard/mouse/clipboard plumbing,
and OSK reimplementation. That's nontrivial. Iframe gets 90% of the value in 10%
of the time.

To make the swap easy later:
- Keep connection-creation in `Guacamole::ConnectionRegistrar` service object.
- Don't depend on Guacamole's web UI in any user-visible copy.

## Known gotchas

- **Clipboard on RDP**: requires `disable-copy: "false"` AND Windows RDP
  clipboard redirection enabled (default is on).
- **Token in URL**: appears in browser history. Token TTL is short and bound to
  one-shot user. Don't log it server-side or include in error reports.
- **Audio**: off by default. Not worth it for v1.
