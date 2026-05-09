# Runbook: Rebuild a VM Template

## When

- Security update for OS that all new VMs should inherit
- New software needs pre-installation
- Template was modified accidentally
- Performance tuning

## Procedure

1. Clone existing template to fresh working VM:
   ```bash
   pvesh create /nodes/pve/qemu/{template_vmid}/clone \
     --newid 999 --name template-rebuild-windows --full 1
   ```
2. Boot it, make changes, **verify** with checklist in `../vm-templates.md`.
3. Generalize:
   - Linux: `cloud-init clean --logs --machine-id`, remove SSH host keys, clear bash history, shut down
   - Windows: `sysprep /generalize /oobe /shutdown /unattend:C:\unattend.xml`
   - macOS: `sudo rm -rf /var/db/.AppleSetupDone`, shut down
   - Android: clear `/data` user data via recovery, shut down
4. In Proxmox UI: right-click → "Convert to template".
5. Update `db/seeds/vm_types.yml` if template VMID changed.
6. Bump version note in seed entry's description.
7. Test: spawn a session via Payload UI, verify end-to-end.
8. Keep old template for a week as `template-windows-old` in case of regression.

## Rollback

1. In Proxmox UI: rename `windows-template` → `windows-template-broken`,
   rename `template-windows-old` → `windows-template`.
2. If VMID changed, update `db/seeds/vm_types.yml` and redeploy.
