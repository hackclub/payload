# Runbook: Rebuild a VM Template

## When

- Security update for OS that all new VMs should inherit.
- New software needs pre-installation.
- Template was modified accidentally.
- Performance tuning.

## Procedure

1. Clone existing template to a fresh working VM:
   ```bash
   pvesh create /nodes/pve/qemu/{template_vmid}/clone \
     --newid 999 --name template-rebuild-linux --full 1
   ```
2. Boot it and make changes.
3. Verify with checklist in [vm-templates.md](../vm-templates.md).
4. Generalize:
   - Linux: `cloud-init clean --logs --machine-id`, remove SSH host keys, clear shell history, shut down.
   - Windows: `sysprep /generalize /oobe /shutdown /unattend:C:\unattend.xml`.
   - macOS: `sudo rm -rf /var/db/.AppleSetupDone`, shut down.
   - Android: clear `/data` user data via recovery, shut down.
5. In Proxmox UI: right-click and convert to template.
6. Update VM type seed data if template VMID changed.
7. Bump version note in the seed entry's description.
8. Deploy seed changes.
9. Test by spawning a session via Payload UI and verifying end to end.
10. Keep old template for a week as `template-linux-old` in case of regression.

## Rollback

1. In Proxmox UI: rename the new template to `template-linux-broken`.
2. Rename `template-linux-old` back to the expected template name.
3. If VMID changed, update VM type seed data and deploy.
