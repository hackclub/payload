# VM Templates

v1 ships **Linux, Windows, Android, and macOS** templates (ADR-0024 +
ADR-0031). All four are seeded `enabled: true` in `src/config/vm-types.ts`.

> **Template VMIDs are defined in the seed, not here.** The canonical source is
> `src/config/vm-types.ts`. As of the current seed they are: `linux` → 67007,
> `windows` → 67006, `android` → 67003, `macos` → 67005 (ADR-0032). Do not trust
> any VMID written elsewhere in this doc over the seed.

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
- Linked clones require compatible storage. `ProxmoxClient.cloneVm` defaults to
  `full=0` (linked clone), so clones are thin and near-instant.
- template VMID recorded in `vm_types` (currently `67007`).

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
- Template VMID recorded in `vm_types` (currently `67006`).

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

## macOS template (slug `macos`)

Target: macOS Sequoia (15) on OpenCore. **Enabled in v1** (ADR-0031); marked
`expensive: true` in the seed.

- Screen Sharing / VNC on `5900`.
- Local user `shipwrights` / `shipwrights` (matches `vm_types.username` /
  `vm_types.password`).
- Template VMID recorded in `vm_types` (currently `67005`).
- **Clipboard is not supported** (ADR-0028): Apple's Screen Sharing speaks a
  non-standard VNC dialect that does not implement RFB `ClientCutText`. The
  session UI should say so until a third-party RFB server or an in-VM clipboard
  agent (LaunchDaemon) lands.
- EULA risk is accepted by operators (ADR-0007); code treats macOS as a normal
  VM type.
- Higher resource cost than the other types (8 GB RAM) — a reason to keep its
  warm-pool size at 0 (see roadmap v1.x).

## Seed data shape

`src/config/vm-types.ts` is the **canonical source** for VM-type seed data;
load it with `pnpm db:seed`. Read that file directly rather than trusting a
copy here — a duplicated snippet is exactly what drifted before. As of now it
ships four OSes (`linux`, `windows`, `android`, `macos`), each with:

- `slug`, `displayName`, `description`, `iconUrl`
- `proxmoxTemplateVmid` (67007 / 67006 / 67003 / 67005), `proxmoxNode`
- `protocol` (`rdp` for linux/windows, `vnc` for android/macos), `defaultPort`
- `enabled: true` for all four
- `username` / `password` (fixed template credential; empty password for android)
- `bootDelayMs` (Android is 6000; the rest are 1000)
- `expensive` (**seed-only, not yet a DB column** — macOS is `true`; see
  `domain-model.md`)

The `iconUrl` value is also persisted in the `vm_types.icon_url` column so the
dashboard renders correctly even when only DB rows are available. `bootDelayMs`
is persisted; `expensive` is not (Drizzle drops the unknown key at insert time).
