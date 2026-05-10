# Runbooks

Operational procedures for the on-call human. Keep copy-paste ready and current.

## Index

- [setup-guacamole-lxc.md](./setup-guacamole-lxc.md) — first-time setup of the
  Guacamole LXC on Proxmox (operator guide for Milestone 3)
- [build-linux-template.md](./build-linux-template.md) — build the Debian 12
  + XFCE + xrdp Linux VM template from scratch (canonical template build)
- [template-switch-to-xrdp.md](./template-switch-to-xrdp.md) — convert an
  existing Debian KDE template from KRDP to xrdp
- [orphan-cleanup.md](./orphan-cleanup.md) — find and clean up VMs left over on
  Proxmox after an app or worker crash mid-terminate
- [allowlist-update.md](./allowlist-update.md) — add or remove a reviewer
- [rebuild-template.md](./rebuild-template.md) — when an OS template needs rebuilding
- [guacamole-down.md](./guacamole-down.md) — what to do if Guacamole stops responding
