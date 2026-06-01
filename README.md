# Payload

Ephemeral desktop VMs for Hack Club project reviewers. Reviewers log in, spin up a Linux/Windows/Android VM in the browser, and it auto-destroys after 6 hours or 30 minutes of inactivity.

## Getting Started

```bash
pnpm install
cp env.example .env
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

- `pnpm dev` — Start dev server
- `pnpm build` — Build for production
- `pnpm lint` — Run linter
- `pnpm db:migrate` — Run database migrations
- `pnpm db:seed` — Seed database
- `pnpm db:generate` — Generate Drizzle migrations
