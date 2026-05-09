# VM Templates

v1 ships Linux only. The schema still supports more VM types later, but template
work should not block the first usable reviewer flow.

## Common requirements

Every template should:

- Boot headlessly on Proxmox.
- Use DHCP on the private VM network.
- Start a remote desktop service on boot.
- Avoid persistent reviewer data between clones.
- Disable sleep, lock screens, and auto-updaters that interrupt reviews.
- Have a clean shutdown path but tolerate force stop.

## Linux v1 template

Target: Debian + KDE Plasma + RDP.

Current operator-provided constraints:

- Cloud-init is not available.
- qemu-guest-agent is not assumed to be installed.
- Normal Proxmox VM clones are available.
- RDP listens on the default port, `3389`.
- The template user/password is `shipwrights` / `shipwrights`.

Suggested setup:

```bash
apt update
apt install -y kde-plasma-desktop xrdp
systemctl enable --now xrdp
```

Create user if the template does not already have one:

```bash
useradd -m -s /bin/bash shipwrights
echo 'shipwrights:shipwrights' | chpasswd
usermod -aG sudo shipwrights
```

Proxmox template settings:

- DHCP on the VM network.
- Linked clones require compatible storage.
- template VMID recorded in `vm_types`

IP discovery:

- Payload reads the clone's `net0` MAC address from Proxmox config.
- Payload polls the Proxmox host neighbor table over SSH with `ip -4 neigh show`.
- The matched IPv4 is passed to Guacamole as the RDP target.

Future hardening:

- Install qemu-guest-agent and use Proxmox guest-agent IP lookup, or
- Add a DHCP/IPAM lookup service by MAC address, and
- Replace the fixed template password with per-session credentials before
  broader reviewer rollout.

## Future Windows template

- Windows 11 Pro.
- RDP enabled.
- Cloudbase-init or autounattend handles `reviewer` password.
- qemu-guest-agent for Windows installed and enabled.
- Clipboard redirection enabled.

## Future macOS template

- OpenCore on Proxmox.
- Screen Sharing / VNC enabled.
- LaunchDaemon handles injected password.
- EULA risk is accepted by operators; code treats macOS as a normal VM type.

## Future Android template

- Android-x86 or BlissOS.
- qemu-guest-agent likely unavailable.
- Needs alternative IP discovery before enabling:
  - DHCP lease lookup from Proxmox host.
  - ARP scan from Guacamole LXC.
  - Tiny in-VM agent that POSTs its IP to Payload.
- VNC server must be re-validated.

## Seed data shape

Keep seed data in `src/config/vm-types.ts`, then load via a pnpm script.

```ts
export const vmTypeSeeds = [
  {
    slug: "linux",
    displayName: "Debian KDE",
    proxmoxTemplateVmid: 9001,
    proxmoxNode: "pve",
    protocol: "rdp",
    defaultPort: 3389,
    enabled: true,
    description: "Clean Debian KDE desktop for reviewing Linux GUI apps.",
  },
];
```
