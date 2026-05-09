# Tech Stack

All choices below are the new TypeScript baseline for Payload as of
2026-05-09. The previous Ruby/Rails codebase has been intentionally removed.

## Research summary

- **Next.js 15 App Router** is the chosen framework by project decision. The
  official docs currently show newer Next.js releases, so revisit the exact
  major version before scaffolding if there is no compatibility reason to stay
  on 15: <https://nextjs.org/docs/app>.
- **Drizzle** is chosen over Prisma and Kysely. It keeps schema definitions in
  TypeScript, generates SQL migrations with `drizzle-kit`, and stays close to
  Postgres instead of hiding SQL behind a heavy ORM:
  <https://orm.drizzle.team/docs/migrations>.
- **Auth.js v5** is chosen for Hack Club OIDC. It is the standard Next.js auth
  integration point and exposes `auth()` plus route handlers that fit App Router:
  <https://authjs.dev/>.
- **BullMQ** is chosen by decision, even though it adds Redis. It gives mature
  retries, delayed jobs, workers, and scheduled jobs. BullMQ docs now recommend
  Job Schedulers over older repeatable-job APIs:
  <https://docs.bullmq.io/guide/workers> and
  <https://docs.bullmq.io/guide/jobs/repeatable>.

## Web app

| Layer | Choice | Notes |
|-------|--------|-------|
| Language | TypeScript | Strict mode; no implicit `any` |
| Runtime | Node.js LTS | Use the active LTS line available at implementation time |
| Framework | Next.js 15 App Router | Server Components by default; client components only when needed |
| Package manager | pnpm | Commit `pnpm-lock.yaml` |
| Database | PostgreSQL 16+ | Primary app DB |
| ORM / migrations | Drizzle + drizzle-kit | Codebase-first schema, generated SQL migrations |
| Auth | Auth.js v5 | Custom OIDC provider for Hack Club Auth |
| Jobs | BullMQ | Requires Redis |
| Worker model | In-process BullMQ worker | Starts only in runtime server process |
| Realtime | Server-Sent Events | Session-ready and status updates |
| Heartbeat | `fetch` POST every 30s | `POST /api/sessions/:id/heartbeat` |
| HTTP client | Native `fetch` | Wrap with timeout/retry helpers for Proxmox and Guacamole |
| Validation | Zod | Env, route inputs, external API responses where useful |
| Encryption | Node `crypto` AES-256-GCM | For `vm_credential` and Guacamole one-shot password |
| CSS | Tailwind CSS v4 | App-wide theme tokens |
| Component lib | FlyonUI | Keep framework-agnostic Tailwind components |
| Icons | Lucide React | Buttons and VM type glyphs |
| Test | Vitest + Playwright | Unit/service tests + browser E2E |
| Lint/format | ESLint + Prettier | Use Next.js defaults, extend only when needed |

## Infrastructure

| Layer | Choice | Notes |
|-------|--------|-------|
| Hypervisor | Proxmox VE 8+ | Hosts VM templates and ephemeral VMs |
| Remote desktop gateway | Apache Guacamole 1.5+ | guacamole webapp + guacd daemon |
| Guacamole DB | PostgreSQL 16+ separate DB | via guacamole-auth-jdbc-postgresql |
| App DB | PostgreSQL 16+ | Payload application tables |
| Queue broker | Redis 7+ | BullMQ backend |
| Reverse proxy | Caddy 2 | Auto TLS and `/guac/*` path routing |
| App deploy | Docker image | Next.js standalone output |
| Future deploy | Coolify likely | Keep Docker image boring and portable |

## Initial packages to install

```json
{
  "dependencies": {
    "@auth/drizzle-adapter": "latest",
    "@tailwindcss/postcss": "latest",
    "bullmq": "latest",
    "drizzle-orm": "latest",
    "flyonui": "latest",
    "ioredis": "latest",
    "lucide-react": "latest",
    "next": "^15",
    "next-auth": "^5",
    "pg": "latest",
    "react": "latest",
    "react-dom": "latest",
    "tailwindcss": "latest",
    "zod": "latest"
  },
  "devDependencies": {
    "@playwright/test": "latest",
    "@types/node": "latest",
    "@types/pg": "latest",
    "drizzle-kit": "latest",
    "eslint": "latest",
    "prettier": "latest",
    "typescript": "latest",
    "vitest": "latest"
  }
}
```

Use exact versions after `pnpm create next-app` and first install, then let
Dependabot propose updates.

## Important tradeoffs

- **BullMQ over Postgres-backed jobs:** adds Redis, but gives strong job retry
  behavior and a large Node ecosystem.
- **In-process worker:** simplest Docker deployment for now. This is acceptable
  for one app container, but must be revisited before scaling the web container
  horizontally because each replica may start its own worker.
- **FlyonUI over shadcn/ui:** keeps the current visual direction and avoids
  re-theming the interface while moving frameworks.
- **SSE over WebSockets:** enough for session-ready and status updates, easier to
  operate behind a proxy, and pairs cleanly with normal HTTP heartbeats.
