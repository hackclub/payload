# Payload — Agent Context

This folder is the canonical context source for AI agents (and humans) working on
**Payload**: an ephemeral-VM service for Hack Club project reviewers.

## What is Payload?

A web app where whitelisted Hack Club reviewers log in with their Hack Club
account, pick a VM type (Windows / Linux / Android / macOS), and within seconds
get an in-browser desktop session to that VM. The VM auto-destructs after **6
hours** (hard cap) or **30 minutes** of browser inactivity, whichever comes first.

## Read in this order

1. [overview.md](./overview.md) — product scope, users, non-goals
2. [architecture.md](./architecture.md) — system diagram and component responsibilities
3. [tech-stack.md](./tech-stack.md) — chosen technologies and version pins
4. [domain-model.md](./domain-model.md) — Postgres schema and Drizzle models
5. [vm-lifecycle.md](./vm-lifecycle.md) — provisioning, heartbeat, reaping
6. [integrations/hackclub-oidc.md](./integrations/hackclub-oidc.md)
7. [integrations/proxmox.md](./integrations/proxmox.md)
8. [integrations/guacamole.md](./integrations/guacamole.md)
9. [vm-templates.md](./vm-templates.md) — per-OS template prep checklist
10. [design-system.md](./design-system.md) — Hack Club theme + FlyonUI usage
11. [decisions.md](./decisions.md) — log of architectural decisions
12. [roadmap.md](./roadmap.md) — v1 scope and future work
13. [runbooks/](./runbooks) — operational procedures
    - [runbooks/deploy-payload-lxc.md](./runbooks/deploy-payload-lxc.md) —
      production deploy guide (Docker-in-LXC on Proxmox)

## Operating principles for agents

- **Smallest correct change.** Don't refactor adjacent code unprompted.
- **Verify, don't assume.** Read referenced files; don't guess interfaces.
- **Update these docs** when you make a decision that contradicts what's here.
  Stale docs are worse than no docs.
- **Treat assumptions as bugs.** If a doc says "TBD", get an answer from the
  human before coding around it.

## Status legend

- ✅ **Decided** — locked in, change requires updating `decisions.md`
- 🟡 **Default** — sensible default, fine to revisit if a real reason appears
- 🔴 **TBD** — needs a human decision before implementation
