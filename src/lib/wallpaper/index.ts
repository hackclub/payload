import sharp from "sharp";
import type { ProxmoxClient } from "@/lib/proxmox/client";
import type { GuestOs } from "@/lib/guest/transfer";
import { dropTask, ensureSpool, writeSpoolPayload } from "@/lib/guest/spool";

// Desktop wallpapers never need more than 1080p; keeping it small keeps the
// chunked guest transfer fast.
const MAX_WIDTH = 1920;
const MAX_HEIGHT = 1080;

export const WALLPAPER_MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // reject absurd uploads before decoding

/**
 * Validate + normalize an uploaded image: strip metadata, auto-orient, fit
 * within 1080p, re-encode to JPEG. Returns null if the bytes aren't a decodable
 * image. JPEG loads on every target (Windows reads it directly; XFCE sniffs by
 * content, not extension).
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

/**
 * Apply the reviewer's wallpaper (ADR-0035). Transfer the image into the spool,
 * then drop a `wallpaper` task; the companion agent — running in the user
 * session — sets it live (SystemParametersInfo on Windows, xfconf on Linux).
 * This returns as soon as the task is dropped; the companion picks it up whether
 * the reviewer is already connected or logs in later. Best-effort.
 */
export async function applyWallpaper(input: {
  proxmox: ProxmoxClient;
  node: string;
  vmid: number;
  os: GuestOs;
  sessionId: number;
  image: Buffer;
}): Promise<void> {
  const { proxmox, node, vmid, os, sessionId, image } = input;
  await ensureSpool(proxmox, node, vmid, os);
  const name = `wp-${sessionId}.jpg`;
  await writeSpoolPayload(proxmox, node, vmid, os, name, image);
  await dropTask(proxmox, node, vmid, os, {
    v: 1,
    id: `wallpaper-${sessionId}`,
    type: "wallpaper",
    payload_file: name,
  });
}
