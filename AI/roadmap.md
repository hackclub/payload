# Roadmap

## v1 — Ship to reviewers (Linux-only)

Goal: small set of Hack Club reviewers can log in, spawn a **Linux** VM, use it
for up to 6h, and walk away.

> **Scope note:** v1 is Linux-first. Windows, Android, and macOS templates are
> intentionally deferred — see "v1.x" and "v2" below. The data model still keeps
> `vm_types` polymorphic so adding more OSes later is a seed-data + template
> change, not a refactor.

### Milestone 1 — Skeleton
- [x] `rails new payload --css=tailwind --database=postgresql`
- [x] FlyonUI installed, Hack Club theme applied, Phantom Sans loaded
- [x] Sign-in / sign-out via Hack Club OIDC working end to end
- [x] `users` + `reviewer_allowlist_entries` tables, allowlist gate
- [x] Empty dashboard renders for allowlisted user

### Milestone 2 — Proxmox plumbing
- [ ] `Proxmox::Client` Faraday client with API token auth
- [ ] Manually-runnable rake task: clone template, poll IP, stop + delete VM
- [ ] **Linux** VM template built and verified (Ubuntu 24.04 + XFCE + TigerVNC)
- [ ] `vm_types` seed data loaded with the `linux` row only (others disabled)

### Milestone 3 — Guacamole plumbing
- [ ] Guacamole LXC built and reachable from Rails
- [ ] `Guacamole::Client` class: get token, create user, create VNC connection,
      grant perms, delete
- [ ] Manually-runnable rake task: register a connection, open in browser

### Milestone 4 — End-to-end
- [ ] `VmSession` model + state machine
- [ ] `ProvisionVmJob` glues Proxmox + Guacamole steps
- [ ] Session view renders iframe with fresh token
- [ ] Browser heartbeat + `POST /sessions/:id/heartbeat`
- [ ] `ReapVmSessionsJob` recurring every 1 min
- [ ] `TerminateVmJob` cleans up Guacamole + Proxmox
- [ ] Per-user cap of 2 enforced (advisory lock)

### Milestone 5 — Polish + ship
- [ ] Linux VM tile works end to end on production
- [ ] Time-remaining countdown + warning toasts
- [ ] Session-end screen with reason
- [ ] Error states designed
- [ ] Caddy site config (`payload.hackclub.com`) + Kamal deploy file
- [ ] Production secrets in deploy store
- [ ] `runbooks/` populated

## v1.x — Polish (still Linux-only)
- [ ] File transfer in/out of VM (Guacamole SFTP)
- [ ] Session recording to disk
- [ ] Admin UI for allowlist
- [ ] Global session cap

## v2 — Custom Guacamole client
- [ ] Replace iframe with `guacamole-common-js` client
- [ ] Custom on-screen keyboard themed to Hack Club
- [ ] Keep iframe as feature-flagged fallback

## v2.x — More VM types

Each adds a new `vm_types` row + a verified Proxmox template.

- [ ] **Windows 11 Pro** — RDP, cloudbase-init, qemu-guest-agent for Windows.
- [ ] **macOS** (Sonoma+) — OpenCore on Proxmox; EULA risk previously accepted
      in ADR-0007. Treat as a normal VM type in code.
- [ ] **Android-x86 / BlissOS** — needs an alternative IP-discovery mechanism
      because `qemu-guest-agent` does not run on Android-x86. Options to
      evaluate later: ARP-scan from the Guacamole LXC, DHCP lease lookup on the
      Proxmox host, or a tiny in-VM agent that POSTs its IP to Rails. VNC inside
      Android (e.g. droidVNC-NG) also needs to be re-validated.

## v3 — Project review workflow
- [ ] Reviewer picks project (git URL or submission ID)
- [ ] First-boot script clones project into VM
- [ ] "Mark reviewed" + notes to Hack Club's review system

## Stretch / maybe-never
- Multi-region Proxmox failover
- Resource quotas per VM type
- Cost reporting

## Explicitly out of scope
- Public sign-up. Closed reviewer tool.
- Long-lived (>6h) VMs.
- Persistent storage between sessions.
