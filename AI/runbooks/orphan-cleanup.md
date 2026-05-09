# Runbook: Orphan VM Cleanup

## Symptom

A `vm_sessions` row is `terminated` or `errored` but the Proxmox VM still
exists, or a live row points to a VM that no longer exists.

## Diagnose

List live Payload sessions from the app:

```bash
pnpm payload sessions:list-live
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

If a Guacamole user or connection also exists, delete it through the admin UI or
the Payload cleanup script:

```bash
pnpm payload guac:delete-session-artifacts <session-id>
```

### B. Session row says ready/active but VM is gone

```bash
pnpm payload sessions:mark-terminated <session-id> --reason error
pnpm payload guac:delete-session-artifacts <session-id>
```

### C. Stuck in terminating

Re-enqueue termination:

```bash
pnpm payload sessions:terminate <session-id> --reason admin
```

## Notes

All cleanup commands should be idempotent. If they are not, fix the command
before relying on this runbook in production.
