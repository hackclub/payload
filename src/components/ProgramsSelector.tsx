"use client";

import { useState } from "react";
import PackageBrowser from "@/components/PackageBrowser";
import OsToggle, { type Os } from "@/components/OsToggle";
import SaveStatusIndicator from "@/components/SaveStatusIndicator";
import { useAutosave } from "@/lib/useAutosave";

type Selections = Record<Os, string[]>;

// Popular quick-picks shown before the user searches. These must be real
// package ids: Chocolatey ids on Windows, apt package names (AppStream desktop
// apps) on Linux.
const POPULAR_IDS: Record<Os, string[]> = {
  windows: [
    "googlechrome", "firefox", "vscode", "git", "nodejs",
    "python", "7zip", "notepadplusplus", "vlc", "discord",
  ],
  linux: [
    "firefox-esr", "chromium", "vlc", "gimp", "inkscape",
    "thunderbird", "libreoffice-writer", "blender", "krita", "obs-studio",
  ],
};

export default function ProgramsSelector({ initial }: { initial: Selections }) {
  const [os, setOs] = useState<Os>("windows");
  const [selections, setSelections] = useState<Selections>(initial);
  const { status, saveNow, retry } = useAutosave();

  function setFor(next: string[]) {
    const merged: Selections = { ...selections, [os]: next };
    setSelections(merged);
    // Package add/remove are discrete clicks — save immediately.
    saveNow(() =>
      fetch("/api/customization/packages", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(merged),
      }),
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <OsToggle os={os} onChange={setOs} />
        <SaveStatusIndicator status={status} onRetry={retry} />
      </div>

      {os === "windows" ? (
        <PackageBrowser
          key="windows"
          endpoint="/api/customization/chocolatey"
          defaultIds={POPULAR_IDS.windows}
          selected={selections.windows}
          onChange={setFor}
          placeholder="Search Chocolatey for Windows apps…"
        />
      ) : (
        <PackageBrowser
          key="linux"
          endpoint="/api/customization/appstream"
          defaultIds={POPULAR_IDS.linux}
          selected={selections.linux}
          onChange={setFor}
          placeholder="Search Debian apps…"
          emptyResultsHint="No apps found. Command-line tools may not appear here — add them by name below."
          allowCustom
          customPlaceholder="apt package name (e.g. git, htop)…"
        />
      )}
    </div>
  );
}
