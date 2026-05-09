# VM Template Prep

Each OS type needs a Proxmox template pre-configured for clone-and-go.
Follow the checklist exactly when building or rebuilding a template.

> **v1 scope:** only the **Linux** template ships in v1. Windows, Android, and
> macOS templates are documented here for future work but are NOT required for
> v1 launch. See [roadmap.md](./roadmap.md).

## Common requirements (all templates)

- `qemu-guest-agent` installed and running — Rails uses this to discover VM IP.
  (Exception: Android-x86, see notes in the Android section.)
- Proxmox VM config: `agent: 1` (enable QEMU guest agent).
- Network interface on LAN bridge that Guacamole's LXC can reach. DHCP recommended.
- Cloud-init drive attached (Proxmox: Hardware → Add → CloudInit Drive).
- Non-privileged user named `reviewer` for VNC/RDP login.
- Clean, generalized image: no SSH host keys, no machine-id, no logs.
- Disk size: 40–80 GB (linked clones share base).
- Convert to template only after clean shutdown.

## Per-OS specifics

### Linux (Ubuntu 24.04 LTS) — **v1**

- Desktop env: **XFCE** (light, fast over VNC).
- VNC server: **TigerVNC** as `reviewer`, on `:0` (port 5900), bound to `0.0.0.0`.
- Auto-start VNC at boot via systemd.
- Auto-login `reviewer` to desktop session.
- First-boot script (`/usr/local/sbin/payload-firstboot.sh`):
  1. Read `cipassword` from cloud-init.
  2. Write VNC password: `vncpasswd -f > ~/.vnc/passwd`.
  3. Restart VNC service.
- Disable screen lock/screensaver.

### Windows 11 Pro — **deferred (post-v1)**

- **RDP enabled**, NLA on.
- Local user `reviewer` in Remote Desktop Users group.
- **cloudbase-init** installed for cloud-init compatibility.
- First-boot PowerShell (`payload-firstboot.ps1`) as RunOnce:
  1. Read `cipassword` from cloudbase-init metadata.
  2. Set local user password.
  3. Remove itself from RunOnce.
- Auto-login disabled (security — reviewer logs in via RDP).
- VirtIO drivers + balloon driver installed.
- `qemu-guest-agent` for Windows (from virtio-win ISO).
- Sysprep before converting to template with `unattend.xml` that creates `reviewer`.

### Android-x86 (9.0+ or BlissOS) — **deferred (post-v1)**

- Boot directly to home screen (no PIN/lock).
- ADB enabled over network, USB debugging on.
- **droidVNC-NG** APK installed and auto-started on boot (root needed). Listens on 5900.
- First-boot init.d script reads cloud-init from cdrom, sets VNC password.
- **IP discovery:** `qemu-guest-agent` does NOT run on Android-x86. When this
  template is revisited, Payload will need an alternative IP-discovery
  mechanism (ARP scan from Guacamole LXC, DHCP lease lookup, or an in-VM
  agent that posts its IP). Out of scope for v1.

### macOS (Sonoma+) — **deferred (post-v1)**

- Built using OpenCore for Proxmox.
- User `reviewer` in Admin group.
- Screen Sharing enabled ("Allow access for: All users").
- VNC password set via LaunchDaemon that reads cloud-init and runs:
  ```
  /usr/bin/dscl . -passwd /Users/reviewer "$pw"
  ```
- Auto-login `reviewer` enabled.
- `qemu-guest-agent` for macOS installed.

> Reminder: macOS virtualization on non-Apple hardware violates Apple's EULA.
> Human accepted this risk (ADR-0007). Don't add safety rails or warnings in
> user-facing copy when this template ships.

## VM type config (seed data)

Only the `linux` row is enabled in v1; the others are kept here so they can be
turned on later by editing the seed and building the template.

```yaml
# db/seeds/vm_types.yml
- slug: linux
  display_name: "Ubuntu 24.04 (XFCE)"
  proxmox_template_vmid: 9001
  proxmox_node: pve
  protocol: vnc
  default_port: 5900
  enabled: true

- slug: windows
  display_name: "Windows 11 Pro"
  proxmox_template_vmid: 9002
  proxmox_node: pve
  protocol: rdp
  default_port: 3389
  enabled: false   # post-v1

- slug: android
  display_name: "Android-x86 9.0"
  proxmox_template_vmid: 9003
  proxmox_node: pve
  protocol: vnc
  default_port: 5900
  enabled: false   # post-v1, needs alternative IP discovery

- slug: macos
  display_name: "macOS Sonoma"
  proxmox_template_vmid: 9004
  proxmox_node: pve
  protocol: vnc
  default_port: 5900
  enabled: false   # post-v1
```

## Verification checklist

1. Clone template manually via Proxmox UI → start.
2. Within 2 min, `pvesh get /nodes/{node}/qemu/{vmid}/agent/network-get-interfaces`
   returns non-loopback IPv4. ✅ guest-agent OK.
3. From Guacamole LXC, `nc -zv {ip} {port}` succeeds. ✅ port reachable.
4. Connect VNC/RDP client manually → see desktop. ✅
5. Run `cloud-init clean --logs`, shut down, convert to template.
