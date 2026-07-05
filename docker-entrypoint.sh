#!/bin/sh
set -e

# Materialize the Proxmox SSH key from env, so deploys (e.g. Coolify) can
# provide it as an env var instead of a file mount. Prefer PROXMOX_SSH_KEY_B64
# (base64 of the key file — immune to newline mangling); PROXMOX_SSH_KEY takes
# the raw PEM content. Overrides PROXMOX_SSH_KEY_PATH when present.
if [ -n "${PROXMOX_SSH_KEY_B64:-}" ] || [ -n "${PROXMOX_SSH_KEY:-}" ]; then
  echo ">> Writing Proxmox SSH key from env..."
  key_file="$HOME/.ssh/proxmox_id_ed25519"
  mkdir -p "$HOME/.ssh"
  if [ -n "${PROXMOX_SSH_KEY_B64:-}" ]; then
    printf '%s' "$PROXMOX_SSH_KEY_B64" | base64 -d > "$key_file"
  else
    printf '%s\n' "$PROXMOX_SSH_KEY" > "$key_file"
  fi
  chmod 600 "$key_file"
  export PROXMOX_SSH_KEY_PATH="$key_file"
fi

echo ">> Running database migrations..."
tsx scripts/migrate.ts

echo ">> Running database seed..."
tsx scripts/seed.ts

echo ">> Starting server..."
exec node server.js