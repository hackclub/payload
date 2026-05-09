# Runbook: Orphan VM Cleanup

## Symptom

A `vm_session` row is `terminated`/`errored` but Proxmox VM still exists,
or vice versa.

## Diagnose

From Rails console on production:

```ruby
VmSession.where(state: %w[ready active]).pluck(:id, :proxmox_vmid, :proxmox_node)
```

Cross-check against Proxmox:

```bash
pvesh get /cluster/resources --type vm --output-format json \
  | jq '.[] | select(.name | startswith("payload-")) | {vmid, name, status}'
```

## Repair

### A. VM exists in Proxmox but no live session row

```bash
pvesh create /nodes/{node}/qemu/{vmid}/status/stop
pvesh delete /nodes/{node}/qemu/{vmid} --purge 1
```

### B. Session row says ready/active but VM is gone

```ruby
session = VmSession.find(<id>)
session.update!(state: "terminated", terminated_at: Time.current,
              termination_reason: "error")
Guacamole.client.delete_connection(session.guacamole_connection_id) rescue nil
Guacamole.client.delete_user(session.guacamole_username) rescue nil
```

### C. Stuck in terminating

Re-enqueue the terminate job:

```ruby
TerminateVmJob.perform_later(VmSession.find(<id>), reason: "admin")
```
