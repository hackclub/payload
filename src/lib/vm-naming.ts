// Proxmox VM naming (ADR-0033).
//
// Warm-pool VMs are cloned ownerless as `<prefix>-warm-<type>`. When a user
// claims one, bindSession renames it to `<prefix>-<user>-<type>` so operators
// can tell at a glance who is on which VM. Proxmox VM names must be DNS-style
// (RFC 1123: lowercase letters, digits, hyphens; no leading/trailing hyphen).
//
// The prefix (VM_NAME_PREFIX, default "payload") namespaces environments that
// share one Proxmox: the reaper only sweeps VMs carrying its own prefix.

import { env } from "@/env";

/** Slugify an arbitrary identity (display name or slack id) into a DNS label. */
export function slugifyIdentity(input: string): string {
  const slug = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24)
    .replace(/-+$/g, "");
  return slug || "user";
}

/** Name for a pre-booted, ownerless warm-pool VM. */
export function warmVmName(slug: string): string {
  return `${env.VM_NAME_PREFIX}-warm-${slug}`;
}

/** Name for a VM owned by a user, e.g. `payload-jane-doe-linux`. */
export function ownedVmName(identity: string, slug: string): string {
  return `${env.VM_NAME_PREFIX}-${slugifyIdentity(identity)}-${slug}`;
}
