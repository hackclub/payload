# Apache Guacamole Integration

Payload uses Guacamole as the protocol gateway. Reviewers never see
Guacamole's login screen. The Next.js app creates connections and short-lived
tokens through the Guacamole REST API, then embeds the client UI in an iframe.

## Components

- `guacd` protocol daemon on `localhost:4822`; speaks VNC/RDP to target VMs.
- `guacamole` Tomcat webapp; REST API + JS client UI.
- Guacamole Postgres database, separate from Payload's app database.

## Deployment

Run as a single LXC on Proxmox:

```
guacamole-lxc:
  - guacd                    (port 4822, localhost only)
  - tomcat10 + guacamole.war (port 8080)
  - postgres                 (port 5432, localhost only)
```

Reverse proxy route:

```
https://payload.hackclub.com/guac/* -> http://guacamole-lxc:8080/guacamole/*
```

## guacamole.properties

```properties
postgresql-hostname=localhost
postgresql-database=guacamole_db
postgresql-username=guacamole
postgresql-password=******
api-session-timeout=15
extension-priority=postgresql
```

## REST API surface

Base: `http://guacamole-lxc:8080/guacamole/api`
Data source: `postgresql`

### 1. Get admin token

```http
POST /api/tokens
Content-Type: application/x-www-form-urlencoded

username=guac-admin&password=<secret>
```

Response:

```json
{
  "authToken": "C90FE...",
  "username": "guac-admin",
  "dataSource": "postgresql"
}
```

Cache in memory with TTL slightly below `api-session-timeout`. Refresh on 401.
This is safe for one app container. Use Redis cache if the app is scaled later.

### 2. Create one-shot user

```http
POST /api/session/data/postgresql/users?token=<admin>
Content-Type: application/json

{
  "username": "payload-42",
  "password": "<random>"
}
```

### 3. Create VNC connection

```http
POST /api/session/data/postgresql/connections?token=<admin>
Content-Type: application/json

{
  "parentIdentifier": "ROOT",
  "name": "payload-42",
  "protocol": "vnc",
  "parameters": {
    "hostname": "10.0.0.42",
    "port": "5900",
    "password": "<vm credential>",
    "color-depth": "24",
    "disable-copy": "true",
    "disable-paste": "false"
  },
  "attributes": {
    "max-connections": "1",
    "max-connections-per-user": "1"
  }
}
```

Response: `{ "identifier": "17" }`. Store as `guacamole_connection_id`.

### 4. Create RDP connection

Same shape, but `protocol` is `rdp` and parameters include:

```json
{
  "hostname": "10.0.0.42",
  "port": "3389",
  "username": "shipwrights",
  "password": "<vm credential>",
  "ignore-cert": "true",
  "security": "tls",
  "disable-auth": "false",
  "resize-method": "display-update",
  "disable-copy": "true",
  "disable-paste": "false"
}
```

### 5. Grant user access to connection

```http
PATCH /api/session/data/postgresql/users/payload-42/permissions?token=<admin>
Content-Type: application/json

[
  { "op": "add", "path": "/connectionPermissions/17", "value": "READ" }
]
```

### 6. Issue session token for reviewer

```http
POST /api/tokens
Content-Type: application/x-www-form-urlencoded

username=payload-42&password=<that-user-password>
```

`authToken` goes in the iframe URL. The one-shot Guacamole password should be
encrypted in Payload's database so fresh tokens can be issued while the VM is
alive.

### 7. Iframe URL

Connection identifier is base64 of `<id>\0c\0<dataSource>`:

```ts
const idParam = Buffer.from("17\0c\0postgresql", "utf8").toString("base64");
```

Iframe src:

```text
https://payload.hackclub.com/guac/#/client/MTcAYwBwb3N0Z3Jlc3Fs?token=<authToken>
```

### 8. Cleanup on terminate

```http
DELETE /api/session/data/postgresql/connections/17?token=<admin>
DELETE /api/session/data/postgresql/users/payload-42?token=<admin>
```

Both are idempotent. Treat 404 as success.

## Env vars

```bash
GUACAMOLE_BASE_URL=http://guacamole-lxc:8080/guacamole
GUACAMOLE_PUBLIC_BASE_URL=https://payload.hackclub.com/guac
GUACAMOLE_DATA_SOURCE=postgresql
GUACAMOLE_ADMIN_USER=payload-admin
GUACAMOLE_ADMIN_PASSWORD=...
```

## Why iframe, not custom client

Iframe remains the v1 choice. A custom `guacamole-common-js` client requires a
websocket tunnel, keyboard/mouse handling, clipboard plumbing, and on-screen
keyboard work. The iframe gets the review workflow shipping quickly.

To make the future swap easier:

- Keep connection creation in a `GuacamoleClient` / `registerGuacamoleConnection`
  service.
- Do not mention Guacamole internals in user-facing copy.
- Keep iframe-specific logic isolated to the session view.

## Clipboard policy

Payload allows **host → VM paste only**. Reviewers can paste text from their
local clipboard into the VM, but cannot copy data out of the VM.

Guacamole's parameters are written from the reviewer's perspective in the
browser:

- `disable-copy` controls copying *out of* the remote (VM → host).
- `disable-paste` controls pasting *into* the remote (host → VM).

So every connection Payload creates uses:

```json
{
  "disable-copy": "true",
  "disable-paste": "false"
}
```

This works for the v1 OSes without any host-side agent:

| OS | Protocol | Why it works |
|----|----------|--------------|
| Debian XFCE | RDP via xrdp | `xrdp-chansrv` bridges the RDP CLIPRDR channel to the X selection. |
| Windows 11 | RDP | Clipboard redirection is on by default in the RDP client/server. |
| BlissOS / Android | VNC | The VNC server honors the standard RFB `ClientCutText` message. |

macOS is intentionally **not** supported on this clipboard path. Apple's
Screen Sharing speaks a non-standard VNC dialect that does not implement
`ClientCutText`, so a future macOS template needs either a third-party
RFB-compliant server or a small in-VM clipboard agent. macOS is deferred to
v2.x; until then, document "clipboard not supported on macOS sessions".

## Known gotchas

- Clipboard on RDP requires `disable-paste = false` and Windows clipboard
  redirection enabled in the guest.
- Tokens in iframe URLs can appear in browser history. Keep TTL short and do not
  log URLs with query strings.
- Audio is off by default and not worth v1 complexity.
