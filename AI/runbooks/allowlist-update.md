# Runbook: Manage workspace members and admins

Since ADR-0036 access is managed in the **admin panel** (`/admin`), not by
editing `scripts/seed.ts`. Membership is per workspace (YSWS), keyed by Slack ID
so a person can be added before their first login.

## Add or remove a reviewer (member)

1. Open `/admin` and pick the workspace from the selector.
2. On the **Members** tab, type the Slack ID (e.g. `U0123ABC`) and click
   "Add member". To remove, click the trash icon on their row.

A workspace admin or a superadmin can do this. Removing a member here does not
terminate their running VMs; terminate them from the **Sessions** tab if needed.
Plain members of fiona's workspace are managed from fiona, see below.

## Members fiona manages (`FIONA_WORKSPACE`)

fiona owns the plain members of `FIONA_WORKSPACE` (`shipwrights` unless set
otherwise, ADR-0040). It adds someone when it approves their Payload access
and removes them when that access is revoked, which also ends their VMs in
that workspace (reason `revoked`). Give or revoke that access in fiona, not
here: fiona doesn't re-sync, so a member added or removed here stays that way
until fiona next decides something about them.

fiona never touches admins, superadmins or other workspaces. It can't remove
an admin either: the removal shows as failed in fiona until you demote or
remove them here, then **Try again** in fiona finishes it.

## Promote or demote a workspace admin

On the **Members** tab, use the shield button on a member's row to promote them
to admin or demote them back. Workspace admins and superadmins may do this.

## Create or cap a workspace (superadmin)

On the **Workspaces** tab (superadmin only): create a workspace with a slug,
name, and optional concurrent-VM cap; edit the cap inline; toggle enabled; or
delete it. A blank cap means unlimited. Over-cap launches are rejected with a
"no capacity in your workspace" error.

## Superadmins

Once you have one superadmin, manage the rest from the **Superadmins** tab in
`/admin` (superadmin only): add or revoke by Slack ID. You cannot revoke your
own, to avoid locking the platform out.

## Bootstrap / disaster recovery

The first superadmin has to be granted out-of-band, since only a superadmin can
appoint others. `scripts/seed.ts` seeds the first one and the "Legacy"
workspace. To grant emergency superadmin access directly in the DB:

```sql
INSERT INTO platform_superadmins (slack_id) VALUES ('U0123ABC')
  ON CONFLICT DO NOTHING;
```

To emergency-revoke a member and kill their VMs:

```sql
-- Remove from a workspace (repeat per workspace, or delete all their rows):
DELETE FROM ysws_memberships WHERE slack_id = 'U0123ABC';
```

There's no CLI command to end their VMs, so terminate each one from the
**Sessions** tab in `/admin`. To find them:

```sql
SELECT s.id, s.state, w.slug
  FROM vm_sessions s
  JOIN "user" u ON u.id = s.user_id
  LEFT JOIN ysws w ON w.id = s.ysws_id
 WHERE u.slack_id = 'U0123ABC'
   AND s.state IN ('pending', 'provisioning', 'ready', 'active');
```

In fiona's workspace, revoking their Payload access in fiona does both.
