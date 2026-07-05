"use client";

import { useRef, useState } from "react";

export default function WallpaperUploader({ hasWallpaper }: { hasWallpaper: boolean }) {
  // Cache-busting token so the <img> refetches after upload/remove.
  const [version, setVersion] = useState(() => (hasWallpaper ? 1 : 0));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasImage = version > 0;
  const previewSrc = `/api/customization/wallpaper?v=${version}`;

  async function upload(file: File) {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    setBusy(true);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/api/customization/wallpaper", { method: "POST", body });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Upload failed");
      }
      setVersion((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/customization/wallpaper", { method: "DELETE" });
      if (!res.ok) throw new Error("Could not remove wallpaper");
      setVersion(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove wallpaper");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div
        onClick={() => !busy && inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files?.[0];
          if (file) void upload(file);
        }}
        className={`relative aspect-video w-full overflow-hidden rounded-hc border-2 border-dashed transition-colors ${
          busy
            ? "border-hc-slate/30 cursor-wait"
            : "border-hc-slate/40 hover:border-hc-cyan cursor-pointer"
        } bg-hc-darker flex items-center justify-center`}
      >
        {hasImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewSrc} alt="Your wallpaper" className="h-full w-full object-cover" />
        ) : (
          <div className="text-center px-6 py-10 text-hc-muted">
            <p className="font-bold text-hc-smoke">Drop an image here, or click to choose</p>
            <p className="text-sm mt-1">PNG or JPG. Resized to 1080p automatically.</p>
            <p className="text-sm mt-1">Leave empty to use the Hack Club default.</p>
          </div>
        )}
        {busy && (
          <div className="absolute inset-0 bg-hc-darker/70 flex items-center justify-center">
            <span className="text-hc-cyan font-bold text-sm animate-pulse">Working…</span>
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = "";
        }}
      />

      {error && <p className="text-hc-red text-sm">{error}</p>}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="bg-hc-red hover:bg-[#d82a41] disabled:opacity-50 text-white font-bold py-2.5 px-5 rounded-hc transition-colors"
        >
          {hasImage ? "Replace image" : "Choose image"}
        </button>
        {hasImage && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void remove()}
            className="bg-hc-darkless hover:bg-hc-slate/30 disabled:opacity-50 text-hc-smoke border border-hc-slate/30 font-bold py-2.5 px-5 rounded-hc transition-colors"
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
