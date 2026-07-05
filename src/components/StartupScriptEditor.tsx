"use client";

import { useRef, useState } from "react";
import OsToggle, { type Os } from "@/components/OsToggle";
import SaveStatusIndicator from "@/components/SaveStatusIndicator";
import { useAutosave } from "@/lib/useAutosave";

type ScriptState = { script: string; runAsAdmin: boolean };
type Initial = Record<Os, ScriptState>;

const PLACEHOLDER: Record<Os, string> = {
  windows: "# PowerShell — runs on every Windows VM you start\nWrite-Host 'hello'",
  linux: "#!/bin/bash\n# Bash — runs on every Linux VM you start\necho hello",
};

export default function StartupScriptEditor({ initial }: { initial: Initial }) {
  const [os, setOs] = useState<Os>("windows");
  const [state, setState] = useState<Initial>(initial);
  const fileRef = useRef<HTMLInputElement>(null);
  const { status, schedule, saveNow, retry } = useAutosave();

  const current = state[os];

  function saver(o: Os, s: ScriptState) {
    return () =>
      fetch("/api/customization/startup-script", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ os: o, script: s.script, runAsAdmin: s.runAsAdmin }),
      });
  }

  /** Update the current OS's script state, then autosave it. */
  function patch(next: Partial<ScriptState>, immediate = false) {
    const merged = { ...state[os], ...next };
    setState((s) => ({ ...s, [os]: merged }));
    const save = saver(os, merged);
    if (immediate) saveNow(save);
    else schedule(save);
  }

  async function loadFile(file: File) {
    const text = await file.text();
    patch({ script: text }, true);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <OsToggle os={os} onChange={setOs} />
        <SaveStatusIndicator status={status} onRetry={retry} />
      </div>

      <textarea
        value={current.script}
        onChange={(e) => patch({ script: e.target.value })}
        placeholder={PLACEHOLDER[os]}
        spellCheck={false}
        rows={10}
        className="w-full bg-hc-darker border border-hc-slate/30 rounded-hc px-3 py-2 font-mono text-sm text-hc-snow placeholder:text-hc-muted focus:border-hc-cyan outline-none resize-y"
      />

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="bg-hc-darkless hover:bg-hc-slate/30 text-hc-smoke border border-hc-slate/30 font-bold py-2 px-4 rounded-hc text-sm transition-colors"
        >
          Upload file…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".ps1,.bat,.cmd,.sh,.bash,text/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void loadFile(file);
            e.target.value = "";
          }}
        />

        <label className="flex items-center gap-2 text-sm text-hc-smoke cursor-pointer">
          <input
            type="checkbox"
            checked={current.runAsAdmin}
            onChange={(e) => patch({ runAsAdmin: e.target.checked }, true)}
            className="accent-hc-cyan"
          />
          Run as administrator (system)
        </label>
        <span className="text-hc-muted text-xs">
          {current.runAsAdmin
            ? "Full privileges"
            : "Runs inside your desktop session (can open apps)."}
        </span>
      </div>
    </div>
  );
}
