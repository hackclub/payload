# Runbook: Update Reviewer Allowlist

## Add a reviewer

1. Edit `config/reviewers.yml`:
   ```yaml
   - slack_id: U0123ABC
     note: "Arcade reviewer 2026"
     added_by: <your slack id>
   ```
2. Open a PR. Get a +1.
3. Merge. The deploy will sync the table on boot.

## Remove a reviewer

1. Delete the entry from `config/reviewers.yml`. Open PR, merge, deploy.
2. Optional but recommended: also terminate any active sessions:
   ```ruby
   user = User.find_by(slack_id: "U0123ABC")
   user&.vm_sessions&.alive&.find_each do |s|
     TerminateVmJob.perform_later(s, reason: "admin")
   end
   ```

## Emergency revoke (no deploy)

From production Rails console:

```ruby
ReviewerAllowlistEntry.where(slack_id: "U0123ABC").destroy_all
User.find_by(slack_id: "U0123ABC")&.vm_sessions&.alive&.find_each do |s|
  TerminateVmJob.perform_later(s, reason: "admin")
end
```

Then remove from `config/reviewers.yml` so next deploy doesn't re-add.
