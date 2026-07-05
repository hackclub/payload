# syntax=docker/dockerfile:1.7

# ─────────────────────────────────────────────────────────────────────────────
# Payload — production Docker image
#
# Multi-stage build that produces a minimal Next.js standalone server.
# Build:  docker build -t payload:latest .
# Run:    docker compose -f docker-compose.prod.yml up -d
# ─────────────────────────────────────────────────────────────────────────────

# 1. Base image with pnpm enabled
FROM node:lts-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# 2. Install dependencies (cached layer)
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# 3. Build the Next.js app
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Env-var validation in src/env.ts runs at build/import time. The build only
# needs values that exist; production secrets are injected at runtime.
ENV HACKCLUB_OIDC_CLIENT_ID=build \
    HACKCLUB_OIDC_CLIENT_SECRET=build \
    AUTH_SECRET=build_build_build_build_build_build_build \
    DATABASE_URL=postgres://build:build@build:5432/build \
    PROXMOX_HOST=build \
    PROXMOX_TOKEN_ID=build@pve!build \
    PROXMOX_TOKEN_SECRET=build \
    PROXMOX_DEFAULT_NODE=build \
    GUACAMOLE_BASE_URL=http://build/guacamole \
    GUACAMOLE_PUBLIC_BASE_URL=http://build/guacamole \
    GUACAMOLE_ADMIN_USER=build \
    GUACAMOLE_ADMIN_PASSWORD=build \
    SESSION_ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000

RUN pnpm build

# 4. Final runtime image
FROM node:20-bookworm-slim AS runner
WORKDIR /app

# ssh for provision-vm jobs
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssh-client ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# sharp needs its prebuilt linux-x64 binary at runtime; Next.js standalone
# output does not include optional deps, so install it in the runner image.
RUN npm install -g sharp@0.33 --os=linux --cpu=x64 --libc=glibc

# tsx lets us run the .ts migration/seed scripts at runtime.
RUN npm install -g tsx

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Run as non-root for safety
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs --create-home --shell /bin/false nextjs

# Standalone output is the entire runtime: app code + minimal node_modules.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Migrations and CLI scripts ship alongside the app. We need the full
# node_modules (rather than the trimmed standalone set) so tsx can resolve
# dotenv/drizzle-orm/postgres etc. at runtime.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
COPY --from=builder --chown=nextjs:nodejs /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/src ./src
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

COPY --chown=nextjs:nodejs docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

USER nextjs
EXPOSE 3000

CMD ["./docker-entrypoint.sh"]
