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

Access is organized around **workspaces (YSWS programs)** since ADR-0036. Three
roles:

**Members (reviewers)** are added to a workspace by its admins (by Slack ID).
They log in via Hack Club Auth, pick a VM type, get a browser-embedded desktop,
work for up to 6 hours, log out. A person can belong to several workspaces and
switches the active one from the nav.

**YSWS admins** run a program: they add and remove its members, promote members
to admin, and see the sessions and logs for their workspace. They do this from
the same admin panel, scoped to the workspaces they administer.

**Platform superadmins** are the global operators: they create and delete
workspaces (each with its own concurrent-VM cap), appoint admins, watch overall
system health, and can act in or see across every workspace.

## What's in v1

- Hack Club OIDC login + workspace-membership gate (ADR-0036)
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
- Per-reviewer cap of 2 active VMs, plus a per-workspace concurrent-VM cap set
  by superadmins (ADR-0036)
- Hack Club–themed UI built with Tailwind + FlyonUI, served from
  `payload.hackclub.com`

## What's NOT in v1

- File transfer in/out of the VM — nice-to-have, ship later
- Session recording — planned but not v1
- Custom Guacamole client (replacing iframe) — keep door open, build later
- Project review workflow — just a blank cloned template for now
- Queue when at limit — just reject with friendly error for v1
- Multi-region / HA Proxmox — single Proxmox cluster

## Constraints

- Reviewers are volunteers; UI must be friction-free and feel polished.
- Hack Club is a non-profit; infra cost matters. One Proxmox host is baseline.
- macOS VMs on commodity x86 Proxmox in violation of Apple's EULA — human
  accepted this risk; treat macOS as just another VM type in code.
