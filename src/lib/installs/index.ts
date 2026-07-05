import type { ProxmoxClient } from "@/lib/proxmox/client";
import type { GuestOs } from "@/lib/guest/transfer";

// A package id/name across choco + apt: starts alphanumeric, then a small safe
// charset. Validated on save AND passed as separate argv (never shell-
// interpolated), so a malformed/hostile name cannot inject a command.
const PACKAGE_RE = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/;
const MAX_NAME_LEN = 100;
const MAX_PACKAGES = 40;

export function isValidPackageName(name: string): boolean {
  return name.length > 0 && name.length <= MAX_NAME_LEN && PACKAGE_RE.test(name);
}

/** Trim, drop invalid names, dedupe (case-insensitive), and cap the count. */
export function sanitizePackages(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const name = raw.trim();
    if (!isValidPackageName(name)) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= MAX_PACKAGES) break;
  }
  return out;
}

const INSTALL_TIMEOUT_MS = 20 * 60 * 1000;

/**
 * Install packages in the guest as SYSTEM/root via the guest agent (choco on
 * Windows, apt on Linux). Package managers are idempotent, so a job retry is
 * safe. `packages` must already be sanitized.
 */
export async function installPackages(
  proxmox: ProxmoxClient,
  node: string,
  vmid: number,
  os: GuestOs,
  packages: string[],
): Promise<void> {
  if (packages.length === 0) return;

  if (os === "windows") {
    await proxmox.waitForGuestExec({
      node,
      vmid,
      command: ["choco", "install", ...packages, "-y", "--no-progress", "--limit-output"],
      timeoutMs: INSTALL_TIMEOUT_MS,
      intervalMs: 2_000,
    });
  } else {
    // Packages are passed as positional args ("$@"), never interpolated.
    const script = `export DEBIAN_FRONTEND=noninteractive; apt-get update -qq && apt-get install -y --no-install-recommends "$@"`;
    await proxmox.waitForGuestExec({
      node,
      vmid,
      command: ["/bin/bash", "-lc", script, "_", ...packages],
      timeoutMs: INSTALL_TIMEOUT_MS,
      intervalMs: 2_000,
    });
  }
}
