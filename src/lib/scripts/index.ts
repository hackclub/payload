import type { ProxmoxClient } from "@/lib/proxmox/client";
import type { GuestOs } from "@/lib/guest/transfer";
import { writeGuestFile } from "@/lib/guest/transfer";
import { dropTask, ensureSpool, writeSpoolPayload } from "@/lib/guest/spool";

export const MAX_SCRIPT_BYTES = 256 * 1024;

const SCRIPT_TIMEOUT_MS = 15 * 60 * 1000;

function adminScriptPath(os: GuestOs, sessionId: number): string {
  return os === "windows"
    ? `C:\\ProgramData\\payload\\startup-${sessionId}.ps1`
    : `/tmp/payload-startup-${sessionId}.sh`;
}

/**
 * Run the reviewer's startup script on the VM. `runAsAdmin` picks the executor:
 *  - true  → guest agent (SYSTEM/root): write the script to a guest temp file,
 *            then exec it by path (script text never touches a shell).
 *  - false → companion (user session): drop a run-script spool task; the agent
 *            runs it in the desktop and this returns immediately.
 * The script body is always transferred as a file, never interpolated.
 */
export async function runStartupScript(input: {
  proxmox: ProxmoxClient;
  node: string;
  vmid: number;
  os: GuestOs;
  sessionId: number;
  script: string;
  runAsAdmin: boolean;
}): Promise<void> {
  const { proxmox, node, vmid, os, sessionId, script, runAsAdmin } = input;
  const data = Buffer.from(script, "utf8");
  const interpreter = os === "windows" ? "powershell" : "bash";

  if (runAsAdmin) {
    const path = adminScriptPath(os, sessionId);
    await writeGuestFile({ proxmox, node, vmid, os, destPath: path, data });
    const command =
      os === "windows"
        ? ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path]
        : ["/bin/bash", path];
    await proxmox.waitForGuestExec({ node, vmid, command, timeoutMs: SCRIPT_TIMEOUT_MS, intervalMs: 1_000 });
    return;
  }

  await ensureSpool(proxmox, node, vmid, os);
  const name = os === "windows" ? `startup-${sessionId}.ps1` : `startup-${sessionId}.sh`;
  await writeSpoolPayload(proxmox, node, vmid, os, name, data);
  await dropTask(proxmox, node, vmid, os, {
    v: 1,
    id: `script-${sessionId}`,
    type: "run-script",
    payload_file: name,
    interpreter,
  });
}
