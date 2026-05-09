# Runbook: Guacamole Down

## Symptoms

- Session page shows iframe that never connects.
- `POST /api/tokens` to Guacamole returns 500 or times out.
- Active sessions show "connecting" indefinitely.

## Diagnose

From a host that can reach Guacamole:

```bash
curl -s -o /dev/null -w "%{http_code}" http://guacamole-lxc:8080/guacamole/
```

Check `guacd`:

```bash
ssh guacamole-lxc "systemctl status guacd"
```

Check Tomcat logs:

```bash
ssh guacamole-lxc "tail -100 /var/log/tomcat*/guacamole*.log"
```

Check from the app container:

```bash
docker exec payload-app curl -s -o /dev/null -w "%{http_code}" "$GUACAMOLE_BASE_URL/"
```

## Common fixes

### guacd not running

```bash
ssh guacamole-lxc "systemctl start guacd"
```

### Tomcat out of memory

```bash
ssh guacamole-lxc "systemctl restart tomcat10"
```

### Postgres backing Guacamole is down

```bash
ssh guacamole-lxc "systemctl status postgresql"
ssh guacamole-lxc "systemctl restart postgresql"
```

### Network connectivity lost between Payload and Guacamole

Check reverse proxy routing:

```bash
curl -s -o /dev/null -w "%{http_code}" https://payload.hackclub.com/guac/
```

Check private network routing from the app container to the Guacamole LXC.

## Live sessions during outage

- VMs keep running.
- Reviewers cannot connect to existing sessions.
- New sessions fail during Guacamole registration.
- BullMQ reaper should still terminate VMs after TTL or idle timeout.

## Recovery verification

After restart:

```bash
curl -s http://guacamole-lxc:8080/guacamole/api/tokens \
  -d "username=payload-admin&password=$GUACAMOLE_ADMIN_PASSWORD" | jq .authToken
```

Then test via the Payload UI.
