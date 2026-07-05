#!/bin/sh
set -e

echo ">> Running database migrations..."
tsx scripts/migrate.ts

echo ">> Running database seed..."
tsx scripts/seed.ts

echo ">> Starting server..."
exec node server.js