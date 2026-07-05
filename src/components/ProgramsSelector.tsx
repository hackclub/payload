"use client";

import { useState } from "react";
import { INSTALLABLE_APPS } from "@/config/installable-apps";

type Os = "windows" | "linux";
type Selections = Record<Os, string[]>;

const OS_LABEL: Record<Os, string> = { windows: "Windows", linux: "Linux" };
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/;

export default function ProgramsSelector({ initial }: { initial: Selections }) {
  const [os, setOs] = useState<Os>("windows");
  const [selections, setSelections] = useState<Selections>(initial);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = selections[os];
  const curated = INSTALLABLE_APPS[os];

  function setFor(next: string[]) {
    setSelections((s) => ({ ...s, [os]: next }));
    setSaved(false);
  }

  function toggle(id: string) {
    setFor(selected.includes(id) ? selected.filter((p) => p !== id) : [...selected, id]);
  }

  function addFree() {
    const name = input.trim();
    if (!name) return;
    if (!NAME_RE.test(name)) {
      setError("Package names can only contain letters, numbers, and . _ + -");
      return;
    }
    setError(null);
    if (!selected.includes(name)) setFor([...selected, name]);
    setInput("");
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/customization/packages", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(selections),
      });
      if (!res.ok) throw new Error("Could not save");
      const data = await res.json();
      setSelections({ windows: data.windows, linux: data.linux });
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  const curatedIds = new Set(curated.map((a) => a.id));

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

      <div className="flex flex-wrap gap-2">
        {curated.map((app) => (
          <button
            key={app.id}
            type="button"
            onClick={() => toggle(app.id)}
            className={`px-3 py-1.5 rounded-hc text-sm border transition-colors ${
              selected.includes(app.id)
                ? "bg-hc-cyan/20 border-hc-cyan text-hc-snow"
                : "bg-hc-darker border-hc-slate/30 text-hc-smoke hover:border-hc-cyan/60"
            }`}
          >
            {app.name}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addFree())}
          placeholder={os === "windows" ? "Chocolatey package id…" : "apt package name…"}
          className="flex-1 bg-hc-darker border border-hc-slate/30 rounded-hc px-3 py-2 text-sm text-hc-snow placeholder:text-hc-muted focus:border-hc-cyan outline-none"
        />
        <button
          type="button"
          onClick={addFree}
          className="bg-hc-darkless hover:bg-hc-slate/30 text-hc-smoke border border-hc-slate/30 font-bold py-2 px-4 rounded-hc text-sm transition-colors"
        >
          Add
        </button>
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((id) => {
            const known = curatedIds.has(id);
            const label = known ? curated.find((a) => a.id === id)?.name ?? id : id;
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1.5 bg-hc-darker border border-hc-slate/30 rounded-hc pl-3 pr-2 py-1 text-sm text-hc-snow"
              >
                {label}
                {!known && <span className="text-hc-muted text-xs">(custom)</span>}
                <button
                  type="button"
                  onClick={() => toggle(id)}
                  className="text-hc-muted hover:text-hc-red font-bold px-1"
                  aria-label={`Remove ${label}`}
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}

      {error && <p className="text-hc-red text-sm">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="bg-hc-red hover:bg-[#d82a41] disabled:opacity-50 text-white font-bold py-2.5 px-5 rounded-hc transition-colors"
        >
          Save programs
        </button>
        {saved && <span className="text-hc-cyan text-sm">Saved ✓</span>}
      </div>
    </div>
  );
}
