"use client";

export type Os = "windows" | "linux";

const OS_LABEL: Record<Os, string> = { windows: "Windows", linux: "Linux" };

/** Segmented Windows/Linux selector shared across the customization editors. */
export default function OsToggle({ os, onChange }: { os: Os; onChange: (os: Os) => void }) {
  return (
    <div className="inline-flex p-1 bg-hc-darker border border-hc-darkless rounded-hc">
      {(["windows", "linux"] as Os[]).map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          aria-pressed={os === o}
          className={`px-5 py-1.5 rounded-[0.4rem] text-sm font-bold transition-all ${
            os === o ? "bg-hc-cyan text-hc-darker shadow-sm" : "text-hc-muted hover:text-hc-snow"
          }`}
        >
          {OS_LABEL[o]}
        </button>
      ))}
    </div>
  );
}
