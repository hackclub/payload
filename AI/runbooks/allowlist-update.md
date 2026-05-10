# Runbook: Update Reviewer Allowlist

The reviewer seed data is in `scripts/seed.ts` (hardcoded Slack IDs).

## Add a reviewer

1. Edit `scripts/seed.ts` and add the Slack ID to the allowlist entries:
   ```ts
   { slackId: "U0123ABC" },
   ```
2. Open a PR and get a review.
3. Merge and deploy.
4. Run the seed script if deploy does not run it automatically:
   ```bash
   pnpm tsx scripts/seed.ts
   ```

## Remove a reviewer

1. Delete the entry from `scripts/seed.ts`.
2. Open PR, merge, and deploy.
3. Terminate any active sessions directly:
   ```bash
   pnpm payload sessions:terminate-user U0123ABC --reason admin
   ```

## Emergency revoke

If a deploy is too slow:

```bash
# Manually delete from DB (the table uses slack_id as PK):
# DELETE FROM reviewer_allowlist_entries WHERE slack_id = 'U0123ABC';
pnpm payload sessions:terminate-user U0123ABC --reason admin
```

Then remove the reviewer from `scripts/seed.ts` so the next deploy does not
re-add the entry.
