# Runbook: Manage workspace members and admins

Since ADR-0036 access is managed in the **admin panel** (`/admin`), not by
editing `scripts/seed.ts`. Membership is per workspace (YSWS), keyed by Slack ID
so a person can be added before their first login.

## Add or remove a reviewer (member)

1. Open `/admin` and pick the workspace from the selector.
2. On the **Members** tab, type the Slack ID (e.g. `U0123ABC`) and click
   "Add member". To remove, click the trash icon on their row.

A workspace admin or a superadmin can do this. Removing a member does not
terminate their running VMs; terminate them from the **Sessions** tab if needed.

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

```bash
pnpm payload sessions:terminate-user U0123ABC --reason admin
```
