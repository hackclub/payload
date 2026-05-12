# VM Templates

v1 ships **Linux, Windows, and Android** templates (ADR-0024). macOS is still
deferred to v2.x.

## Common requirements

Every template should:

- Boot headlessly on Proxmox.
- Use DHCP on the private VM network.
- Start a remote desktop service on boot.
- Avoid persistent reviewer data between clones.
- Disable sleep, lock screens, and auto-updaters that interrupt reviews.
- Have a clean shutdown path but tolerate force stop.

## Linux template (slug `linux`)

Target: Debian 12 + XFCE + xrdp.

Current operator-provided constraints:

- Cloud-init is not available.
- qemu-guest-agent is not assumed to be installed.
- Normal Proxmox VM clones are available.
- RDP listens on the default port, `3389`.
- Guacamole RDP `security` mode is `any` in the deployed code (ADR-0026
  relaxed ADR-0020's `tls` recommendation because not every xrdp build
  negotiates TLS cleanly).
- The template user/password is `shipwrights` / `shipwrights`, stored in
  `vm_types.username` / `vm_types.password`.

Canonical setup:

Use [runbooks/build-linux-template.md](./runbooks/build-linux-template.md) for
the from-scratch template build. If an older Debian KDE/KRDP template must be
salvaged, use [runbooks/template-switch-to-xrdp.md](./runbooks/template-switch-to-xrdp.md)
as a migration reference, but the preferred v1 template is XFCE.

Proxmox template settings:

- DHCP on the VM network.
- Linked clones require compatible storage.
- template VMID recorded in `vm_types` (currently `67001`).

IP discovery:

- Payload reads the clone's `net0` MAC address from Proxmox config.
- Payload polls the Proxmox host neighbor table over SSH with `ip -4 neigh show`.
- The matched IPv4 is passed to Guacamole as the RDP target.

Future hardening:

- Install qemu-guest-agent and use Proxmox guest-agent IP lookup, or
- Add a DHCP/IPAM lookup service by MAC address, and
- Replace the fixed template password with per-session credentials before
  broader reviewer rollout (v1.x roadmap item).

## Windows template (slug `windows`)

Target: Windows 11 Enterprise IoT LTSC.

- RDP enabled on `3389`.
- Local user `shipwrights` / `shipwrights` (matches `vm_types.username` /
  `vm_types.password`).
- Clipboard redirection enabled.
- Auto-updates disabled to prevent reviewer-disrupting reboots.
- qemu-guest-agent installed and enabled (does not affect IP discovery; we
  still use the Proxmox neighbor-table path).
- Template VMID recorded in `vm_types` (currently `67002`).

Build runbook: **TBD** — capture the install + sysprep + RDP-enable steps in a
new `runbooks/build-windows-template.md` before next reviewer onboarding.

## Android template (slug `android`)

Target: BlissOS on Android 13 (Android-x86 derivative).

- VNC server listening on `5901` for Guacamole.
- No username (`vm_types.username` is `null`); password is empty in v1 (free
  desktop, EULA-accepted-by-operator).
- Template VMID recorded in `vm_types` (currently `67003`).
- IP discovery: Proxmox neighbor table works for the current image. If a future
  Android image breaks that path, fall back to:
  - DHCP lease lookup from the Proxmox host, or
  - ARP scan from the Guacamole LXC, or
  - A tiny in-VM agent that POSTs its IP to Payload.

Build runbook: **TBD** — capture the BlissOS install + VNC-on-boot steps in a
new `runbooks/build-android-template.md`.

## Future macOS template

- OpenCore on Proxmox.
- Screen Sharing / VNC enabled.
- LaunchDaemon handles injected password.
- EULA risk is accepted by operators; code treats macOS as a normal VM type.

## Seed data shape

Keep seed data in `src/config/vm-types.ts`, then load via
`pnpm payload db:seed`. The actual current seed file ships all three v1 OSes:

```ts
import { env } from "../env";

export const vmTypeSeeds = [
  {
    slug: "linux",
    displayName: "Debian XFCE",
    proxmoxTemplateVmid: 67001,
    proxmoxNode: env.PROXMOX_DEFAULT_NODE,
    protocol: "rdp",
    defaultPort: 3389,
    enabled: true,
    description: "Debian running XFCE",
    username: "shipwrights",
    password: "shipwrights",
    iconUrl: "https://cdn.hackclub.com/.../debian.png",
  },
  {
    slug: "windows",
    displayName: "Windows 11",
    proxmoxTemplateVmid: 67002,
    proxmoxNode: env.PROXMOX_DEFAULT_NODE,
    protocol: "rdp",
    defaultPort: 3389,
    enabled: true,
    description: "Windows 11 Enterprise IoT LTSC",
    username: "shipwrights",
    password: "shipwrights",
    iconUrl: "https://cdn.hackclub.com/.../windows11.png",
  },
  {
    slug: "android",
    displayName: "Android",
    proxmoxTemplateVmid: 67003,
    proxmoxNode: env.PROXMOX_DEFAULT_NODE,
    protocol: "vnc",
    defaultPort: 5901,
    enabled: true,
    description: "Bliss OS on Android 13",
    username: "shipwrights",
    password: "",
    iconUrl: "https://cdn.hackclub.com/.../android.png",
  },
] as const;
```

The `iconUrl` value is also persisted in the `vm_types.icon_url` column so the
dashboard renders correctly even when only DB rows are available.
