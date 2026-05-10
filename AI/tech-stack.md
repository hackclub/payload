# Tech Stack

All choices below are the new TypeScript baseline for Payload as of
2026-05-09. The previous Ruby/Rails codebase has been intentionally removed.

## Research summary

- **Next.js 16 App Router** is the chosen framework by project decision (16.2.6
  as installed). The official docs currently show newer Next.js releases, so
  consult the specific API docs in `node_modules/next/dist/docs/` for version
  compatibility: <https://nextjs.org/docs/app>.
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
| Framework | Next.js 16 App Router | Server Components by default; client components only when needed |
| Package manager | pnpm | Commit `pnpm-lock.yaml` |
| Database | PostgreSQL 16+ | Primary app DB |
| ORM / migrations | Drizzle + drizzle-kit | Codebase-first schema, generated SQL migrations |
| Auth | Auth.js v5 | Custom OIDC provider for Hack Club Auth |
| Jobs | BullMQ | Requires Redis |
| Worker model | In-process BullMQ worker | Starts only in runtime server process |
| Realtime | Server-Sent Events (Redis pub/sub) | Session-ready and status updates |
| Heartbeat | `fetch` POST every 30s | `POST /api/sessions/:id/heartbeat` |
| HTTP client | Native `fetch` | Wrap with timeout/retry helpers for Proxmox and Guacamole |
| Validation | Zod | Env, route inputs, external API responses where useful |
| Encryption | Node `crypto` AES-256-GCM | For `vm_credential` and Guacamole one-shot password |
| CSS | Tailwind CSS v4 | App-wide theme tokens |
| Component lib | FlyonUI | Keep framework-agnostic Tailwind components |
| Icons | Lucide React | Buttons and VM type glyphs |
| Test | Vitest + Playwright | **Not yet installed** — deferred, no test suite exists yet |
| Lint/format | ESLint + Prettier | Prettier **not yet installed**; ESLint only for now |

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

## Initial packages

The following reflects what is currently installed in `package.json`. The
original planned packages are listed below, with differences noted.

```json
{
  "dependencies": {
    "@auth/drizzle-adapter": "^1.11.2",
    "bullmq": "^5.76.6",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "drizzle-orm": "^0.45.2",
    "flyonui": "^2.4.1",
    "ioredis": "^5.10.1",
    "lodash": "^4.18.1",
    "lucide-react": "^1.14.0",
    "next": "16.2.6",
    "next-auth": "5.0.0-beta.31",
    "postgres": "^3.4.9",
    "react": "19.2.4",
    "react-dom": "19.2.4",
    "tailwind-merge": "^3.5.0",
    "tailwindcss-animate": "^1.0.7",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "dotenv": "^17.4.2",
    "drizzle-kit": "^0.31.10",
    "eslint": "^9",
    "eslint-config-next": "16.2.6",
    "tailwindcss": "^4",
    "tsx": "^4.21.0",
    "typescript": "^5"
  }
}
```

Not yet installed (planned but deferred):
- `vitest`, `@playwright/test` — no test suite yet
- `prettier` — ESLint only for now

## Important tradeoffs

- **BullMQ over Postgres-backed jobs:** adds Redis, but gives strong job retry
  behavior and a large Node ecosystem.
- **In-process worker:** simplest Docker deployment for now. This is acceptable
  for one app container, but must be revisited before scaling the web container
  horizontally because each replica may start its own worker.
- **FlyonUI over shadcn/ui:** keeps the current visual direction and avoids
  re-theming the interface while moving frameworks.
- **SSE over WebSockets:** enough for session-ready and status updates, easier to
  operate behind a proxy, and pairs cleanly with normal HTTP heartbeats. SSE
  fanout is implemented via Redis pub/sub (`src/lib/sse/index.ts`), which
  already supports multi-container scale-out.
