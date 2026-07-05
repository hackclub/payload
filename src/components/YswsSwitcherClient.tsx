"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown } from "lucide-react";
import { switchYsws } from "@/app/ysws-actions";

type Workspace = { id: string; slug: string; name: string; role: "member" | "admin" };

export default function YswsSwitcherClient({
  workspaces,
  activeId,
  isSuperadmin,
}: {
  workspaces: Workspace[];
  activeId: string | null;
  isSuperadmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const active = workspaces.find((w) => w.id === activeId) ?? workspaces[0];
  // A single workspace with no ability to reach others: show a static label.
  const soleFixed = workspaces.length === 1 && !isSuperadmin;

  function select(id: string) {
    setOpen(false);
    if (id === active?.id) return;
    startTransition(async () => {
      await switchYsws(id);
      router.refresh();
    });
  }

  const divider = <span className="w-px h-5 bg-hc-darkless" aria-hidden />;

  if (soleFixed) {
    return (
      <>
        {divider}
        <span className="text-sm font-bold text-hc-smoke truncate max-w-[12rem]">{active?.name}</span>
      </>
    );
  }

  return (
    <>
      {divider}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={pending}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm font-bold text-hc-smoke hover:bg-hc-darkless border border-transparent hover:border-hc-slate/40 transition-colors disabled:opacity-60"
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span className="truncate max-w-[12rem]">{active?.name ?? "Select workspace"}</span>
          <ChevronDown className="w-3.5 h-3.5 text-hc-muted shrink-0" />
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div
              className="absolute left-0 z-50 mt-2 w-64 max-h-80 overflow-y-auto rounded-hc border border-hc-darkless bg-hc-dark shadow-xl shadow-black/40 p-1.5 animate-in fade-in slide-in-from-top-1 duration-150"
              role="listbox"
            >
              <div className="px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide text-hc-muted flex items-center justify-between">
                <span>Workspace</span>
                {isSuperadmin && <span className="text-hc-red normal-case tracking-normal">Superadmin</span>}
              </div>
              {workspaces.map((w) => {
                const isActive = w.id === active?.id;
                return (
                  <button
                    key={w.id}
                    onClick={() => select(w.id)}
                    role="option"
                    aria-selected={isActive}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-sm transition-colors ${
                      isActive ? "bg-hc-cyan/10 text-hc-snow" : "text-hc-smoke hover:bg-hc-darkless"
                    }`}
                  >
                    <span className="flex-1 min-w-0">
                      <span className="block font-bold truncate">{w.name}</span>
                      <span className="block text-[11px] text-hc-muted truncate">
                        {w.role === "admin" ? "Admin" : "Member"} · {w.slug}
                      </span>
                    </span>
                    {isActive && <Check className="w-4 h-4 text-hc-cyan shrink-0" />}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </>
  );
}
