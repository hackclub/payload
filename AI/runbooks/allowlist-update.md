# Runbook: Update Reviewer Allowlist

The reviewer seed file is `src/config/reviewers.ts`.

## Add a reviewer

1. Edit `src/config/reviewers.ts`:
   ```ts
   export const reviewers = [
     { slackId: "U0123ABC", note: "Arcade reviewer 2026", addedBy: "<your slack id>" },
   ];
   ```
2. Open a PR and get a review.
3. Merge and deploy.
4. Run the allowlist sync script if deploy does not run it automatically:
   ```bash
   pnpm payload allowlist:sync
   ```

## Remove a reviewer

1. Delete the entry from the reviewer seed file.
2. Open PR, merge, and deploy.
3. Terminate any active sessions:
   ```bash
   pnpm payload sessions:terminate-user U0123ABC --reason admin
   ```

## Emergency revoke

If a deploy is too slow:

```bash
pnpm payload allowlist:remove U0123ABC
pnpm payload sessions:terminate-user U0123ABC --reason admin
```

Then remove the reviewer from the seed file so the next deploy does not re-add
the entry.
