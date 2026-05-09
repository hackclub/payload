# VM Templates

v1 ships Linux only. The schema still supports more VM types later, but template
work should not block the first usable reviewer flow.

## Common requirements

Every template should:

- Boot headlessly on Proxmox.
- Use DHCP on the private VM network.
- Run `qemu-guest-agent` when the OS supports it. Payload uses this to discover
  VM IP.
- Start a remote desktop service on boot.
- Accept an injected per-session password.
- Avoid persistent reviewer data between clones.
- Disable sleep, lock screens, and auto-updaters that interrupt reviews.
- Have a clean shutdown path but tolerate force stop.

## Linux v1 template

Target: Ubuntu 24.04 LTS + XFCE + TigerVNC.

Suggested setup:

```bash
apt update
apt install -y qemu-guest-agent xfce4 xfce4-goodies tigervnc-standalone-server
systemctl enable --now qemu-guest-agent
```

Create user:

```bash
useradd -m -s /bin/bash reviewer
usermod -aG sudo reviewer
```

First-boot script responsibilities:

- Read cloud-init password for `reviewer`.
- Set Linux login password.
- Set VNC password for TigerVNC.
- Start VNC on `:0` or `:1` consistently.
- Write a small marker so repeated boots do not re-randomize credentials unless
  intended.

Proxmox template settings:

- `agent: 1`
- cloud-init drive attached
- DHCP via `ipconfig0=ip=dhcp`
- serial console optional but useful for debugging
- template VMID recorded in `vm_types`

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
    displayName: "Ubuntu 24.04",
    proxmoxTemplateVmid: 9001,
    proxmoxNode: "pve",
    protocol: "vnc",
    defaultPort: 5900,
    enabled: true,
    description: "Clean Ubuntu desktop for reviewing Linux GUI apps.",
  },
];
```
