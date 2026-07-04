# Overview

## Problem

Hack Club reviewers need to evaluate projects submitted by community members.
Some projects can only be meaningfully reviewed inside a real desktop OS
(Windows installer, Android app, macOS-specific tool, Linux GUI app, etc.).
Asking reviewers to maintain four local VMs is unrealistic, and untrusted code
on a reviewer's personal machine is a security risk.

## Solution

**Payload** is a self-service portal where reviewers spin up a clean,
short-lived desktop VM in the browser, do their review, and walk away. The VM
is destroyed automatically.

## Users

**Reviewers** — Hack Club community members on a Slack-ID allowlist. They log in
via Hack Club Auth, pick a VM type, get a browser-embedded desktop, work for up
to 6 hours, log out.

**Admins** — small set of operators who manage the allowlist and watch system
health. v1 = manage by editing a YAML file in the repo and re-deploying; v2 =
admin UI.

## What's in v1

- Hack Club OIDC login + Slack-ID allowlist gate
- Spawn a **Linux**, **Windows**, **Android**, or **macOS** desktop VM
  (ADR-0024 + ADR-0031):
  - Linux: Debian 12 + XFCE over RDP/xrdp
  - Windows: Windows 11 Enterprise IoT LTSC over RDP
  - Android: BlissOS over VNC
  - macOS: macOS Sequoia (15) over VNC — enabled in the seed (ADR-0031);
    clipboard is **not** supported (ADR-0028) and the EULA risk is accepted
    (ADR-0007)
- Clone a Proxmox template, boot, register with Guacamole
- Embedded Guacamole iframe with auto-login token
- Clipboard sync (in + out of VM)
- 6-hour hard cap + 30-minute idle cap (browser heartbeat)
- Per-reviewer cap of 2 active VMs
- Hack Club–themed UI built with Tailwind + FlyonUI, served from
  `payload.hackclub.com`

## What's NOT in v1

- File transfer in/out of the VM — nice-to-have, ship later
- Session recording — planned but not v1
- Custom Guacamole client (replacing iframe) — keep door open, build later
- Project review workflow — just a blank cloned template for now
- Queue when at limit — just reject with friendly error for v1
- Admin UI — manage allowlist via YAML in repo for v1
- Multi-region / HA Proxmox — single Proxmox cluster

## Constraints

- Reviewers are volunteers; UI must be friction-free and feel polished.
- Hack Club is a non-profit; infra cost matters. One Proxmox host is baseline.
- macOS VMs on commodity x86 Proxmox in violation of Apple's EULA — human
  accepted this risk; treat macOS as just another VM type in code.
