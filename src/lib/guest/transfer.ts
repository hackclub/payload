import type { ProxmoxClient } from "@/lib/proxmox/client";

/** OS types we know how to customize in-guest. */
export type GuestOs = "windows" | "linux";

/** Map a vm_types slug to a customizable OS, or null if unsupported. */
export function guestOs(slug: string): GuestOs | null {
  return slug === "windows" || slug === "linux" ? slug : null;
}

// Proxmox agent/file-write caps `content` at 61440 chars; base64 inflates 4/3,
// so keep each raw chunk under 61440 * 3/4.
const RAW_CHUNK_BYTES = 45_000;

/**
 * Write a binary file into the guest at `destPath`. The payload is sent in
 * base64 chunks to sibling `.partNNNN` temp files, then concatenated in-guest
 * (byte-perfect: `cat` on Linux, PowerShell `ReadAllBytes` on Windows) and the
 * parts removed. `destPath` must be Payload-controlled (never interpolate user
 * input — it lands in a shell command).
 */
export async function writeGuestFile(input: {
  proxmox: ProxmoxClient;
  node: string;
  vmid: number;
  os: GuestOs;
  destPath: string;
  data: Buffer;
}): Promise<void> {
  const { proxmox, node, vmid, os, destPath, data } = input;
  const total = Math.max(1, Math.ceil(data.length / RAW_CHUNK_BYTES));

  for (let i = 0; i < total; i += 1) {
    const slice = data.subarray(i * RAW_CHUNK_BYTES, (i + 1) * RAW_CHUNK_BYTES);
    await proxmox.guestFileWrite({
      node,
      vmid,
      file: `${destPath}.part${String(i).padStart(4, "0")}`,
      content: slice.toString("base64"),
      encode: false,
    });
  }

  if (os === "windows") {
    const glob = `${destPath}.part*`;
    const concat = [
      `$ErrorActionPreference='Stop'`,
      `New-Item -ItemType Directory -Force -Path (Split-Path -Parent '${destPath}') | Out-Null`,
      `$files = Get-ChildItem '${glob}' | Sort-Object Name`,
      `$out = [System.IO.File]::Create('${destPath}')`,
      `foreach ($f in $files) { $b = [System.IO.File]::ReadAllBytes($f.FullName); $out.Write($b, 0, $b.Length) }`,
      `$out.Close()`,
      `Remove-Item '${glob}' -Force`,
    ].join("; ");
    await proxmox.waitForGuestExec({
      node,
      vmid,
      command: ["powershell", "-NoProfile", "-NonInteractive", "-Command", concat],
      intervalMs: 400,
      timeoutMs: 90_000,
    });
  } else {
    const script = [
      `mkdir -p "$(dirname '${destPath}')"`,
      `cat '${destPath}'.part* > '${destPath}'`,
      `rm -f '${destPath}'.part*`,
    ].join(" && ");
    await proxmox.waitForGuestExec({
      node,
      vmid,
      command: ["/bin/bash", "-lc", script],
      intervalMs: 250,
    });
  }
}
