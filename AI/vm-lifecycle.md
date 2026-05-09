# VM Lifecycle

## State machine

```
pending → provisioning → ready → active
                ↓              ↓
           terminating → terminated
                ↓
            errored
```

## Step-by-step

### 1. Create

- Trigger: `POST /sessions` with `vm_type_slug`.
- Guards: user in allowlist, user has <2 active VMs, VmType enabled.
- DB: `INSERT vm_sessions (state: pending, expires_at: now + 6h)`.
- Response: 201 with session id; UI shows "provisioning..." splash.

### 2. Provision (Solid Queue job — ProvisionVmJob)

1. `state: pending → provisioning`.
2. Generate per-VM credential (32-byte random, encoded for VNC/RDP).
3. **Proxmox**:
   - `POST /nodes/{node}/qemu/{template_vmid}/clone` with fresh `newid`.
   - Wait for clone task to finish (poll task status).
   - Inject credential via cloud-init.
   - `POST /nodes/{node}/qemu/{vmid}/status/start`.
4. **Wait for IP** via `qemu-guest-agent`:
   - Poll `GET /nodes/{node}/qemu/{vmid}/agent/network-get-interfaces` until
     non-loopback IPv4 appears or 120s timeout.
5. **Guacamole**:
   - Create one-shot user `payload-{session_id}` with random password.
   - Create connection with `hostname=vm_ip`, `port=...`, credentials.
   - Grant user permission to use this connection.
6. `state: provisioning → ready`. Persist proxmox_vmid, vm_ip,
   guacamole_connection_id, guacamole_username.
7. ActionCable broadcast `session_ready` → UI swaps splash for iframe.

On error: `state: errored`, log to vm_session_events, kick cleanup job.

### 3. Connect

- UI requests fresh Guacamole token (`POST /sessions/:id/guac_token`).
- Server calls Guacamole API, returns authToken + base64 connection identifier.
- UI renders `<iframe src="/guac/#/client/{base64_id}?token={token}">`.
- UI starts heartbeat loop.

### 4. Heartbeat

- Mechanism: `POST /sessions/:id/heartbeat` every 30s while tab visible.
- Server: `update_columns(last_heartbeat_at: Time.current)`.
- State transitions `ready → active` on first heartbeat.
- Why parent window? Guacamole iframe is cross-origin; heartbeat lives in our
  own UI for simplicity.

### 5. Reap (ReapVmSessionsJob, every 1 minute)

```sql
-- TTL reaper
SELECT id FROM vm_sessions
 WHERE state IN ('pending','provisioning','ready','active')
   AND expires_at <= now();

-- Idle reaper
SELECT id FROM vm_sessions
 WHERE state = 'active'
   AND last_heartbeat_at <= now() - interval '30 minutes';

-- Stuck-provisioning reaper
SELECT id FROM vm_sessions
 WHERE state IN ('pending','provisioning')
   AND created_at <= now() - interval '10 minutes';
```

For each, enqueue `TerminateVmJob(session, reason:)`.

### 6. Terminate (TerminateVmJob)

1. `state → terminating`.
2. **Guacamole**: delete connection + delete user (idempotent — treat 404 as success).
3. **Proxmox**:
   - `POST /nodes/{node}/qemu/{vmid}/status/stop` (force).
   - `DELETE /nodes/{node}/qemu/{vmid}?purge=1`.
4. `state → terminated`, `terminated_at: now`, set `termination_reason`.

Idempotency: every step safe to retry. Use find-or-initialize-style checks.

## End-user controls

- **Destroy button** → `DELETE /sessions/:id` → enqueues TerminateVmJob.
- **Time remaining** display (countdown to `min(expires_at, idle_deadline_at)`).
- **Warning toast** at 10 min and 1 min remaining.

## Limits

- Per-user cap: enforced via row count with Postgres advisory lock (prevents
  double-click race).
- Global cap: not in v1, but add `PAYLOAD_MAX_GLOBAL_SESSIONS` config before launch.
