# Runbook: Guacamole Down

## Symptoms

- Session page shows iframe that never connects.
- `POST /api/tokens` to Guacamole returns 500 or times out.
- Active sessions show "connecting..." indefinitely.

## Diagnose

1. From a host that can reach Guacamole:
   ```bash
   curl -s -o /dev/null -w "%{http_code}" http://guacamole-lxc:8080/guacamole/
   ```
2. Check if guacd is running:
   ```bash
   ssh guacamole-lxc "systemctl status guacd"
   ```
3. Check Tomcat logs:
   ```bash
   ssh guacamole-lxc "tail -100 /var/log/tomcat*/guacamole*.log"
   ```

## Common fixes

### guacd not running

```bash
ssh guacamole-lxc "systemctl start guacd"
```

### Tomcat out of memory

```bash
ssh guacamole-lxc "systemctl restart tomcat10"
# or whatever the service name is
```

### Postgres backing Guacamole is down

```bash
ssh guacamole-lxc "systemctl status postgresql"
ssh guacamole-lxc "systemctl restart postgresql"
```

### Network connectivity lost between Rails and Guacamole

Check Caddy routing:
```bash
curl -s -o /dev/null -w "%{http_code}" https://payload.hackclub.com/guac/
```

## Live sessions during outage

- VMs are NOT affected — they keep running.
- Reviewers cannot connect to existing sessions.
- No new sessions can be spawned (Guacamole registration fails).
- VMs will be reaped normally by the reaper job after their TTL/idle timeout.

## Recovery verification

After restart:
```bash
curl -s http://guacamole-lxc:8080/guacamole/api/tokens \
  -d "username=payload-admin&password=$GUAC_ADMIN_PW" | jq .authToken
```

Should return a token. Then test via the Payload UI.
