import type { ProxmoxClient } from "@/lib/proxmox/client";
import { writeGuestFile, type GuestOs } from "@/lib/guest/transfer";

// Fixed spool paths — must match the companion agent's spool_dir() (agent/src/main.rs).
const LINUX_USER = "shipwrights";
const LINUX_HOME = `/home/${LINUX_USER}`;
const SPOOL = {
  windows: "C:\\ProgramData\\payload\\spool",
  linux: `${LINUX_HOME}/.payload/spool`,
} as const;

/** A task the companion agent runs in the user session. Mirrors agent protocol.rs. */
export type SpoolTask =
  | { v: 1; id: string; type: "wallpaper"; payload_file: string }
  | { v: 1; id: string; type: "run-script"; payload_file: string; interpreter: "bash" | "powershell" };

function spoolFile(os: GuestOs, name: string): string {
  return os === "windows" ? `${SPOOL.windows}\\${name}` : `${SPOOL.linux}/${name}`;
}

/**
 * Ensure the spool dir exists and the desktop user can read tasks + write and
 * delete results there. Idempotent; runs each customize pass as SYSTEM/root.
 *
 * Windows: grant the Users group (well-known SID S-1-5-32-545, locale-proof)
 * Modify so the companion can delete SYSTEM-created task/payload files.
 * Linux: own the tree by the desktop user — file deletion is governed by the
 * (user-owned) directory, so root-written files inside remain deletable.
 */
export async function ensureSpool(proxmox: ProxmoxClient, node: string, vmid: number, os: GuestOs): Promise<void> {
  if (os === "windows") {
    const ps = [
      `New-Item -ItemType Directory -Force -Path '${SPOOL.windows}' | Out-Null`,
      `icacls 'C:\\ProgramData\\payload' /grant '*S-1-5-32-545:(OI)(CI)M' /T | Out-Null`,
    ].join("; ");
    await proxmox.waitForGuestExec({
      node,
      vmid,
      command: ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps],
      intervalMs: 300,
    });
  } else {
    const script = `mkdir -p '${SPOOL.linux}' && chown -R ${LINUX_USER}:${LINUX_USER} '${LINUX_HOME}/.payload'`;
    await proxmox.waitForGuestExec({ node, vmid, command: ["/bin/bash", "-lc", script], intervalMs: 250 });
  }
}

/** Transfer a payload blob into the spool under `name`. */
export async function writeSpoolPayload(
  proxmox: ProxmoxClient,
  node: string,
  vmid: number,
  os: GuestOs,
  name: string,
  data: Buffer,
): Promise<void> {
  await writeGuestFile({ proxmox, node, vmid, os, destPath: spoolFile(os, name), data });
}

/**
 * Drop a task file for the companion to pick up. Write payloads BEFORE calling
 * this — the companion acts the moment it sees `<id>.task.json`.
 */
export async function dropTask(
  proxmox: ProxmoxClient,
  node: string,
  vmid: number,
  os: GuestOs,
  task: SpoolTask,
): Promise<void> {
  const json = JSON.stringify(task);
  await proxmox.guestFileWrite({
    node,
    vmid,
    file: spoolFile(os, `${task.id}.task.json`),
    content: Buffer.from(json, "utf8").toString("base64"),
    encode: false,
  });
}
