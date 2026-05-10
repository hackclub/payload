# VM Lifecycle

## State machine

```
pending -> provisioning -> ready -> active
                |             |
                v             v
           terminating -> terminated
                |
                v
             errored
```

## Step-by-step

### 1. Create

- Trigger: `POST /api/sessions` or a server action with `vm_type_slug`.
- Guards: user in allowlist, user has fewer than 2 active VMs, VM type enabled.
- Use a Postgres transaction and advisory lock keyed by user id to prevent
  double-click races.
- DB: insert `vm_sessions` with `state = pending` and `expires_at = now + 6h`.
- Queue: add BullMQ job `provision-vm` with `{ sessionId }`.
- Response: 201 with session id; UI shows provisioning screen and opens SSE
  stream for updates.

### 2. Provision (BullMQ job: `provision-vm`)

1. Transition `pending -> provisioning`.
2. Generate per-VM credential with `crypto.randomBytes(32)` and encrypt it with
   AES-256-GCM before writing to Postgres.
3. Proxmox:
   - `GET /cluster/nextid`.
   - `POST /nodes/{node}/qemu/{template_vmid}/clone` with fresh `newid`.
   - Poll task status until clone completes.
   - `POST /nodes/{node}/qemu/{vmid}/status/start`.
4. Wait for IP via Proxmox host neighbor table:
   - Read VM MAC from Proxmox config (`net0`).
   - SSH to Proxmox host and poll `ip -4 neigh show` for matching `lladdr`.
   - Timeout after about 120 seconds.
   - qemu-guest-agent is not used in v1 (template has `agent enabled=0`).
5. Guacamole:
   - Create one-shot user `payload-{session_id}` with random password.
   - Create RDP/VNC connection with `hostname = vm_ip`, port, protocol, `disable-copy: false`
     (clipboard enabled), and `security=tls` for RDP.
   - Grant that user permission to use the connection.
6. Transition `provisioning -> ready`, persist `proxmox_vmid`, `vm_ip`,
   `guacamole_connection_id`, and encrypted Guacamole password.
7. Publish session-ready notification for SSE subscribers.

On error: log to `vm_session_events`, mark `errored`, and enqueue
`terminate-vm` with reason `error` if any external resource was created.

### 3. Connect

- UI requests a fresh Guacamole token: `POST /api/sessions/:id/guac-token`.
- Server decrypts the one-shot Guacamole password, calls Guacamole `/api/tokens`,
  and returns auth token + base64 connection identifier.
- UI renders:

```html
<iframe src="/guac/#/client/{base64_id}?token={token}"></iframe>
```

- UI starts heartbeat loop after the iframe appears.

### 4. Heartbeat

- Mechanism: `POST /api/sessions/:id/heartbeat` every 30 seconds while the tab is
  visible and the session page is mounted.
- Server updates `last_heartbeat_at`.
- First heartbeat transitions `ready -> active`.
- Heartbeat stays in the parent Payload UI because the Guacamole iframe is not a
  trustworthy app-control surface.

### 5. SSE status stream

- Endpoint: `GET /api/sessions/:id/events`.
- Sends `ready`, `errored`, `terminating`, and `terminated` events.
- Implemented via Redis pub/sub (`sse:session:<id>` channels) so multiple app
  containers can fan out events. Each process maintains an in-memory subscriber
  map for its own SSE connections.

### 6. Reap (BullMQ scheduled job: `reap-vm-sessions`)

Run every 60 seconds. BullMQ should use Job Schedulers for recurring work.

```sql
-- TTL reaper
SELECT id FROM vm_sessions
 WHERE state IN ('pending','provisioning','ready','active')
   AND expires_at <= now();

-- Idle reaper
SELECT id FROM vm_sessions
 WHERE state = 'active'
   AND last_heartbeat_at <= now() - interval '30 minutes';

-- Stuck provisioning reaper
SELECT id FROM vm_sessions
 WHERE state IN ('pending','provisioning')
   AND created_at <= now() - interval '10 minutes';
```

For each row, enqueue `terminate-vm` with reason `ttl`, `idle`, or `stuck`.

### 7. Terminate (BullMQ job: `terminate-vm`)

1. Transition to `terminating` unless already `terminated`.
2. Guacamole: delete connection and delete one-shot user. Treat 404 as success.
3. Proxmox:
   - `POST /nodes/{node}/qemu/{vmid}/status/stop`.
   - `DELETE /nodes/{node}/qemu/{vmid}?purge=1`.
4. Transition to `terminated`, set `terminated_at` and `termination_reason`.

Idempotency: every step must be safe to retry. Prefer "check current state, then
act" over assuming a previous attempt left the world clean.

## End-user controls

- **Destroy button** -> `DELETE /api/sessions/:id` -> enqueue `terminate-vm`.
- **Time remaining** display counts down to `min(expires_at, idle_deadline_at)`.
- **Warning toast** at 10 minutes and 1 minute remaining.

## Limits

- Per-user cap: 2 active sessions, enforced inside a transaction with advisory
  lock.
- Global cap: not in v1, but add `PAYLOAD_MAX_GLOBAL_SESSIONS` before launch if
  Proxmox capacity is tight.
