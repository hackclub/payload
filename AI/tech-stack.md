# Tech Stack

All versions pinned to latest stable as of project start (May 2026).

## Web app

| Layer | Choice | Notes |
|-------|--------|-------|
| Language | Ruby 3.3+ | |
| Framework | Rails 8 | Defaults — Solid Queue/Cache/Cable, Propshaft, importmaps |
| Database | PostgreSQL 16+ | One DB, Solid* tables + app tables |
| Background jobs | Solid Queue | No Redis |
| Cache | Solid Cache | |
| WebSockets | Solid Cable | For heartbeats (alternative: HTTP POST) |
| OIDC client | omniauth-openid_connect | Discovery: `https://auth.hackclub.com/.well-known/openid-configuration` |
| HTTP client | Faraday + faraday-retry | For Proxmox + Guacamole API calls |
| Auth model | omniauth → User row keyed by slack_id | |
| CSS | Tailwind CSS v4 | via tailwindcss-rails |
| Component lib | FlyonUI (Tailwind-based) | Buttons, modals, tabs, toasts, etc. |
| JS | Stimulus + Turbo (Hotwire) | Default Rails 8 stack |
| Build | importmaps (no Node) | |
| Lint | RuboCop (Omakase) + ERB Lint | |
| Test | Minitest + system tests | |

## Infrastructure

| Layer | Choice | Notes |
|-------|--------|-------|
| Hypervisor | Proxmox VE 8+ | |
| Remote desktop gateway | Apache Guacamole 1.5+ | guacamole webapp + guacd daemon |
| Guacamole DB | PostgreSQL 16+ (separate) | via guacamole-auth-jdbc-postgresql |
| Reverse proxy | Caddy 2 | Auto TLS, simple path routing |
| Container runtime | LXC on Proxmox | For Rails / Guacamole / Postgres |
| App deploy | Kamal 2 | Rails 8 default deploy tool |

## External services

| Service | Purpose |
|---------|---------|
| Hack Club Auth | OIDC identity provider |
| Hack Club Slack | Source of truth for slack_id allowlist |

## Gemfile versions to pin

```ruby
ruby "3.3.x"
rails "~> 8.0"
pg "~> 1.5"
solid_queue "~> 1.0"
solid_cache "~> 1.0"
solid_cable "~> 1.0"
omniauth "~> 2.1"
omniauth-openid_connect "~> 0.7"
omniauth-rails_csrf_protection "~> 1.0"
faraday "~> 2.9"
faraday-retry "~> 2.2"
tailwindcss-rails "~> 4.0"
```

## Why these choices

- **Rails 8 + Solid stack**: zero external infra (no Redis), fast to deploy on
  a single LXC, batteries-included for jobs/cache/realtime.
- **Guacamole**: industry-standard HTML5 RDP/VNC gateway; single public port;
  built-in clipboard, audio, session recording (later).
- **Caddy**: simplest TLS + path routing in one binary.
- **FlyonUI**: Tailwind-native, no React/Vue dependency, works with Hotwire.
- **Kamal**: Rails 8 first-party deploy tool; trivial rollbacks, no Kubernetes.
