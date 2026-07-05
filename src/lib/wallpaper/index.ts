import sharp from "sharp";
import type { ProxmoxClient } from "@/lib/proxmox/client";

// Proxmox agent/file-write caps `content` at 61440 chars. base64 inflates by
// 4/3, so keep each raw chunk under 61440 * 3/4 = 46080 bytes.
const RAW_CHUNK_BYTES = 45_000;

// Downscale target. A desktop wallpaper never needs more than 1080p, and
// keeping it small keeps the chunked guest transfer fast.
const MAX_WIDTH = 1920;
const MAX_HEIGHT = 1080;

export const WALLPAPER_MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // reject absurd uploads before decoding

/**
 * Validate + normalize an uploaded image: strip metadata, auto-orient, fit
 * within 1080p, and re-encode to JPEG. Returns null if the bytes aren't a
 * decodable image. The JPEG loads fine on all targets (Windows reads it
 * directly; XFCE's GdkPixbuf sniffs by content, not extension).
 */
export async function processWallpaperUpload(
  input: Buffer,
): Promise<{ data: Buffer; mime: string } | null> {
  try {
    const data = await sharp(input)
      .rotate()
      .resize(MAX_WIDTH, MAX_HEIGHT, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    return { data, mime: "image/jpeg" };
  } catch {
    return null;
  }
}

type ApplyTarget = {
  proxmox: ProxmoxClient;
  node: string;
  vmid: number;
  /** vm_types.slug: "linux" | "windows" | "macos" | "android" */
  osSlug: string;
  /** session id — used to namespace guest temp files across concurrent binds */
  sessionId: number;
  image: Buffer;
};

/** Whether we know how to apply a wallpaper to this OS type today. */
export function wallpaperSupported(osSlug: string): boolean {
  return osSlug === "linux" || osSlug === "windows";
}

/**
 * Push the image into the guest (chunked) and set it as the wallpaper. The
 * mechanism is per-OS but the shape is the same: clean stale temp files,
 * write the image in base64 chunks to temp files, then one guest-exec to
 * concatenate + install + clean up. Best-effort — the caller treats failure
 * as non-fatal (the session is already connectable).
 */
export async function applyWallpaper(target: ApplyTarget): Promise<void> {
  switch (target.osSlug) {
    case "linux":
      return applyLinux(target);
    case "windows":
      return applyWindows(target);
    default:
      throw new Error(`Wallpaper not supported for OS type "${target.osSlug}"`);
  }
}

async function transferChunks(
  { proxmox, node, vmid, image }: ApplyTarget,
  tempPath: (index: string) => string,
): Promise<void> {
  const total = Math.ceil(image.length / RAW_CHUNK_BYTES);
  for (let i = 0; i < total; i += 1) {
    const slice = image.subarray(i * RAW_CHUNK_BYTES, (i + 1) * RAW_CHUNK_BYTES);
    await proxmox.guestFileWrite({
      node,
      vmid,
      file: tempPath(String(i).padStart(4, "0")),
      content: slice.toString("base64"),
      encode: false, // content is already base64; guest writes decoded bytes
    });
  }
}

// --- Linux (Debian + XFCE) --------------------------------------------------
// XFCE reads the backdrop from a fixed file the template points at
// (/home/shipwrights/Downloads/desktop-wallpaper.png). Overwriting that file is
// enough — the next session render picks it up. guest-exec runs as root, so we
// chown the result back to the desktop user.

const LINUX_USER = "shipwrights";
const LINUX_TARGET = `/home/${LINUX_USER}/Downloads/desktop-wallpaper.png`;

async function applyLinux(target: ApplyTarget): Promise<void> {
  const { proxmox, node, vmid, sessionId } = target;
  const glob = `/tmp/payload-wp-${sessionId}.`;
  const tempPath = (index: string) => `${glob}${index}`;

  await proxmox.waitForGuestExec({
    node,
    vmid,
    command: ["/bin/bash", "-lc", `rm -f ${glob}*`],
  });

  await transferChunks(target, tempPath);

  const script = [
    `mkdir -p /home/${LINUX_USER}/Downloads`,
    `cat ${glob}* > ${LINUX_TARGET}`,
    `chown ${LINUX_USER}:${LINUX_USER} ${LINUX_TARGET}`,
    `rm -f ${glob}*`,
  ].join(" && ");
  await proxmox.waitForGuestExec({ node, vmid, command: ["/bin/bash", "-lc", script], intervalMs: 250 });

  // Overwriting the file the backdrop points at is picked up by a *fresh* XFCE
  // session, but does not repaint an already-connected one. If the reviewer is
  // logged in (xfce4-session running), reload their live desktop — as the user,
  // with their session's DISPLAY/DBUS lifted from /proc. Best-effort.
  const reload = [
    `pid="$(pgrep -u ${LINUX_USER} -f xfce4-session | head -n1)"`,
    `[ -z "$pid" ] && pid="$(pgrep -u ${LINUX_USER} xfdesktop | head -n1)"`,
    `[ -z "$pid" ] && exit 0`,
    `D="$(tr '\\0' '\\n' < /proc/$pid/environ | sed -n 's/^DISPLAY=//p' | head -n1)"`,
    `B="$(tr '\\0' '\\n' < /proc/$pid/environ | sed -n 's/^DBUS_SESSION_BUS_ADDRESS=//p' | head -n1)"`,
    `runuser -u ${LINUX_USER} -- env DISPLAY="$D" DBUS_SESSION_BUS_ADDRESS="$B" IMG=${LINUX_TARGET} bash -c 'for p in $(xfconf-query -c xfce4-desktop -l 2>/dev/null | grep -E "last-image$"); do xfconf-query -c xfce4-desktop -p "$p" -s "$IMG"; done; xfdesktop --reload' || true`,
  ].join("\n");
  await proxmox.waitForGuestExec({ node, vmid, command: ["/bin/bash", "-lc", reload], intervalMs: 250 }).catch(() => {});
}

// --- Windows ----------------------------------------------------------------
// guest-exec runs as SYSTEM, and setting the wallpaper does NOT repaint an
// already-logged-in desktop — the reviewer connects immediately, so we must run
// the apply *inside their session*. Done via a scheduled task with an
// interactive token (`/it`, no stored password → runs as the logged-on user).
//
// Two lessons from live testing:
//   1. Apply with a plain VBScript (registry write + `rundll32
//      UpdatePerUserSystemParameters`), launched via `wscript` — NOT PowerShell
//      + `Add-Type`. `Add-Type` compiles C# at runtime (~15-20s on a cold VM,
//      in a *visible* console window — the "stuck terminal" reviewers saw).
//      wscript has no console and rundll32 is launched hidden, so zero flash.
//   2. Two tasks: `payload-wallpaper` (ONLOGON — fires at logon, for when this
//      job finishes before the reviewer connects) and `payload-wallpaper-now`
//      (ONCE + on-demand `/run` — immediate repaint if already logged in;
//      best-effort, since `/run` only works with a live session). `/rp`+`/it`
//      together, and on-demand `/run` of an ONLOGON task, do NOT work.

const WINDOWS_TARGET = "C:\\ProgramData\\payload\\wallpaper.jpg";
const WINDOWS_VBS_PATH = "C:\\ProgramData\\payload\\set-wallpaper.vbs";
const WINDOWS_USER = "shipwrights";
const WINDOWS_TASK = "payload-wallpaper";
const WINDOWS_TASK_NOW = "payload-wallpaper-now";

// Runs as `shipwrights` in their session: point the wallpaper regkeys at the
// image and repaint the live desktop. No compilation, no visible window.
const WINDOWS_VBS = [
  `img = "${WINDOWS_TARGET}"`,
  `Set fso = CreateObject("Scripting.FileSystemObject")`,
  `If fso.FileExists(img) Then`,
  `  Set sh = CreateObject("WScript.Shell")`,
  `  sh.RegWrite "HKCU\\Control Panel\\Desktop\\WallPaper", img, "REG_SZ"`,
  `  sh.RegWrite "HKCU\\Control Panel\\Desktop\\WallpaperStyle", "10", "REG_SZ"`,
  `  sh.RegWrite "HKCU\\Control Panel\\Desktop\\TileWallpaper", "0", "REG_SZ"`,
  `  sh.Run "rundll32.exe user32.dll,UpdatePerUserSystemParameters 1, True", 0, True`,
  `End If`,
].join("\r\n");

async function applyWindows(target: ApplyTarget): Promise<void> {
  const { proxmox, node, vmid, sessionId } = target;
  const tempPath = (index: string) => `C:\\Windows\\Temp\\payload-wp-${sessionId}.${index}`;

  await transferChunks(target, tempPath);

  // Create the dir and binary-concat the chunks (ordered) → the image path, then
  // clean up temp files. PowerShell ReadAllBytes concat is byte-perfect (proven)
  // and fast — it does no runtime compilation (that was only the old apply step).
  const globPs = `C:\\Windows\\Temp\\payload-wp-${sessionId}.*`;
  const concat = [
    `$ErrorActionPreference='Stop'`,
    `New-Item -ItemType Directory -Force -Path 'C:\\ProgramData\\payload' | Out-Null`,
    `$files = Get-ChildItem '${globPs}' | Sort-Object Name`,
    `$out = [System.IO.File]::Create('${WINDOWS_TARGET}')`,
    `foreach ($f in $files) { $b = [System.IO.File]::ReadAllBytes($f.FullName); $out.Write($b, 0, $b.Length) }`,
    `$out.Close()`,
    `Remove-Item '${globPs}' -Force`,
  ].join("; ");
  await proxmox.waitForGuestExec({
    node,
    vmid,
    command: ["powershell", "-NoProfile", "-NonInteractive", "-Command", concat],
    intervalMs: 400,
    timeoutMs: 90_000,
  });

  // Dir now exists — drop the hidden apply script.
  await proxmox.guestFileWrite({
    node,
    vmid,
    file: WINDOWS_VBS_PATH,
    content: Buffer.from(WINDOWS_VBS, "utf8").toString("base64"),
    encode: false,
  });

  // schtasks must be separate argv calls — embedding the quoted `/tr "wscript.exe
  // <path>"` inside a chained `cmd /c` string mangles the quotes.
  const trArg = `wscript.exe ${WINDOWS_VBS_PATH}`;

  // Persistent logon trigger — applies at any logon (handles the pre-connect race).
  await proxmox.waitForGuestExec({
    node,
    vmid,
    command: ["schtasks", "/create", "/tn", WINDOWS_TASK, "/tr", trArg, "/sc", "ONLOGON", "/ru", WINDOWS_USER, "/it", "/f"],
    intervalMs: 250,
  });
  await proxmox.waitForGuestExec({
    node,
    vmid,
    command: ["schtasks", "/create", "/tn", WINDOWS_TASK_NOW, "/tr", trArg, "/sc", "ONCE", "/st", "00:00", "/ru", WINDOWS_USER, "/it", "/f"],
    intervalMs: 250,
  });

  // Immediate repaint if the reviewer is already logged in. Best-effort — if
  // they aren't logged in yet, /run fails and the ONLOGON task covers it.
  await proxmox
    .waitForGuestExec({ node, vmid, command: ["schtasks", "/run", "/tn", WINDOWS_TASK_NOW], intervalMs: 250 })
    .catch(() => {});
}
