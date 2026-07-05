"use client";

import { useCallback, useRef, useState } from "react";

export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

/** A save action: performs the request and resolves to the fetch Response. */
type Saver = () => Promise<Response>;

/**
 * Debounced autosave. `schedule` coalesces rapid edits (e.g. typing) into one
 * request; `saveNow` fires immediately (e.g. toggling a checkbox). Only the
 * latest request is allowed to set the final status, so a slow earlier save
 * can't clobber a newer one.
 */
export function useAutosave(delayMs = 700) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);
  const lastSaver = useRef<Saver | null>(null);

  const run = useCallback(async (saver: Saver) => {
    lastSaver.current = saver;
    const mine = ++seq.current;
    setStatus("saving");
    try {
      const res = await saver();
      if (!res.ok) throw new Error(String(res.status));
      if (seq.current === mine) setStatus("saved");
    } catch {
      if (seq.current === mine) setStatus("error");
    }
  }, []);

  const schedule = useCallback(
    (saver: Saver) => {
      if (timer.current) clearTimeout(timer.current);
      setStatus("pending");
      timer.current = setTimeout(() => void run(saver), delayMs);
    },
    [run, delayMs],
  );

  const saveNow = useCallback(
    (saver: Saver) => {
      if (timer.current) clearTimeout(timer.current);
      void run(saver);
    },
    [run],
  );

  const retry = useCallback(() => {
    if (lastSaver.current) void run(lastSaver.current);
  }, [run]);

  return { status, schedule, saveNow, retry };
}
