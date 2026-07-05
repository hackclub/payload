"use client";

import { useRef, useState } from "react";

type Os = "windows" | "linux";
type ScriptState = { script: string; runAsAdmin: boolean };
type Initial = Record<Os, ScriptState>;

const OS_LABEL: Record<Os, string> = { windows: "Windows", linux: "Linux" };
const PLACEHOLDER: Record<Os, string> = {
  windows: "# PowerShell — runs on every Windows VM you start\nWrite-Host 'hello'",
  linux: "#!/bin/bash\n# Bash — runs on every Linux VM you start\necho hello",
};

export default function StartupScriptEditor({ initial }: { initial: Initial }) {
  const [os, setOs] = useState<Os>("windows");
  const [state, setState] = useState<Initial>(initial);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const current = state[os];

  function patch(next: Partial<ScriptState>) {
    setState((s) => ({ ...s, [os]: { ...s[os], ...next } }));
    setSaved(false);
  }

  async function loadFile(file: File) {
    const text = await file.text();
    patch({ script: text });
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/customization/startup-script", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ os, script: current.script, runAsAdmin: current.runAsAdmin }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not save");
      }
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["windows", "linux"] as Os[]).map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => { setOs(o); setError(null); }}
            className={`px-4 py-1.5 rounded-hc text-sm font-bold transition-colors ${
              os === o ? "bg-hc-cyan text-hc-darker" : "bg-hc-darkless text-hc-smoke hover:bg-hc-slate/30"
            }`}
          >
            {OS_LABEL[o]}
          </button>
        ))}
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
            onChange={(e) => patch({ runAsAdmin: e.target.checked })}
            className="accent-hc-cyan"
          />
          Run as administrator (system)
        </label>
        <span className="text-hc-muted text-xs">
          {current.runAsAdmin
            ? "Full privileges, runs before you connect."
            : "Runs inside your desktop session (can open apps)."}
        </span>
      </div>

      {error && <p className="text-hc-red text-sm">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="bg-hc-red hover:bg-[#d82a41] disabled:opacity-50 text-white font-bold py-2.5 px-5 rounded-hc transition-colors"
        >
          Save {OS_LABEL[os]} script
        </button>
        {saved && <span className="text-hc-cyan text-sm">Saved ✓</span>}
      </div>
    </div>
  );
}
