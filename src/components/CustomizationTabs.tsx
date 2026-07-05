"use client";

import { useState } from "react";
import { Package, Image as ImageIcon, Terminal } from "lucide-react";

type TabKey = "programs" | "wallpaper" | "startup";

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: "wallpaper", label: "Wallpaper", icon: ImageIcon },
  { key: "programs", label: "Programs", icon: Package },
  { key: "startup", label: "Startup script", icon: Terminal },
];

export default function CustomizationTabs({
  programs,
  wallpaper,
  startup,
}: {
  programs: React.ReactNode;
  wallpaper: React.ReactNode;
  startup: React.ReactNode;
}) {
  const [activeTab, setActiveTab] = useState<TabKey>("wallpaper");

  const panels: Record<TabKey, React.ReactNode> = { programs, wallpaper, startup };

  return (
    <div>
      <div className="flex flex-wrap gap-2 border-b border-hc-darkless pb-4">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-hc font-bold text-sm transition-all ${
                isActive
                  ? "bg-hc-red text-white shadow-sm"
                  : "bg-hc-darkless text-hc-muted hover:text-hc-smoke hover:bg-hc-slate/30"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="mt-8">
        {TABS.map((tab) => (
          <div key={tab.key} hidden={activeTab !== tab.key}>
            {panels[tab.key]}
          </div>
        ))}
      </div>
    </div>
  );
}
