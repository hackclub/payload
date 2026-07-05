import type { GuestOs } from "@/lib/guest/transfer";

/**
 * Curated quick-pick apps for the customization UI. These are convenience
 * chips only — reviewers can also type arbitrary package names (Chocolatey ids
 * on Windows, apt package names on Linux). `id` is the exact package id passed
 * to the package manager.
 */
export type InstallableApp = { id: string; name: string };

export const INSTALLABLE_APPS: Record<GuestOs, InstallableApp[]> = {
  windows: [
    { id: "googlechrome", name: "Google Chrome" },
    { id: "firefox", name: "Firefox" },
    { id: "vscode", name: "VS Code" },
    { id: "git", name: "Git" },
    { id: "nodejs", name: "Node.js" },
    { id: "python", name: "Python" },
    { id: "7zip", name: "7-Zip" },
    { id: "notepadplusplus", name: "Notepad++" },
    { id: "vlc", name: "VLC" },
    { id: "discord", name: "Discord" },
  ],
  linux: [
    { id: "firefox-esr", name: "Firefox ESR" },
    { id: "chromium", name: "Chromium" },
    { id: "git", name: "Git" },
    { id: "nodejs", name: "Node.js" },
    { id: "python3-pip", name: "Python (pip)" },
    { id: "build-essential", name: "Build tools" },
    { id: "neovim", name: "Neovim" },
    { id: "vlc", name: "VLC" },
    { id: "gimp", name: "GIMP" },
    { id: "htop", name: "htop" },
  ],
};
