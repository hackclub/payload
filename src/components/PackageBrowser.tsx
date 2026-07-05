"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, Download, Check, Plus, Package as PackageIcon, Loader2 } from "lucide-react";

export type CatalogPackage = {
  id: string;
  title: string;
  summary: string;
  iconUrl: string | null;
  downloadCount: number;
  version: string;
  author: string | null;
};

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/;

export default function PackageBrowser({
  endpoint,
  defaultIds,
  selected,
  onChange,
  placeholder,
  emptyResultsHint,
  allowCustom = false,
  customPlaceholder = "package name…",
}: {
  endpoint: string;
  defaultIds: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  emptyResultsHint?: string;
  allowCustom?: boolean;
  customPlaceholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CatalogPackage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);
  // Metadata for every package we've seen, so selected rows and the default
  // "popular" list can render an icon and title without a live search.
  const [meta, setMeta] = useState<Record<string, CatalogPackage>>({});

  const term = query.trim();
  const isDefault = term === "";

  const cacheMeta = useCallback((pkgs: CatalogPackage[]) => {
    if (pkgs.length === 0) return;
    setMeta((m) => {
      const next = { ...m };
      for (const p of pkgs) next[p.id.toLowerCase()] = p;
      return next;
    });
  }, []);

  // Hydrate already-saved selections + the default "popular" list with real
  // icons/titles on mount.
  useEffect(() => {
    const ids = [...new Set([...defaultIds, ...selected.map((s) => s.toLowerCase())])];
    if (ids.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${endpoint}?ids=${encodeURIComponent(ids.join(","))}`);
        if (!res.ok) return;
        const data: CatalogPackage[] = await res.json();
        if (cancelled) return;
        cacheMeta(data);
      } catch {
        /* best-effort hydration */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced search as the user types. All state updates happen inside the
  // async timeout callback (never synchronously in the effect body).
  useEffect(() => {
    if (term === "") return;
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`${endpoint}?q=${encodeURIComponent(term)}`);
        if (!res.ok) throw new Error("Search failed");
        const data: CatalogPackage[] = await res.json();
        cacheMeta(data);
        setSearchResults(data);
        setError(null);
      } catch {
        setError("Couldn't reach the package catalog. Try again.");
        setSearchResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [term, endpoint, cacheMeta]);

  // The default view is the curated "popular" list, derived from whatever we've
  // hydrated into `meta`; a live search swaps in its results.
  const popular = orderByIds(
    defaultIds.map((id) => meta[id.toLowerCase()]).filter((p): p is CatalogPackage => Boolean(p)),
    defaultIds,
  );
  const results = isDefault ? popular : searchResults;

  const selectedSet = new Set(selected.map((s) => s.toLowerCase()));

  function toggle(id: string) {
    const lower = id.toLowerCase();
    if (selectedSet.has(lower)) {
      onChange(selected.filter((s) => s.toLowerCase() !== lower));
    } else {
      onChange([...selected, id]);
    }
  }

  function addCustom() {
    const name = custom.trim();
    if (!name) return;
    if (!NAME_RE.test(name)) {
      setCustomError("Package names can only contain letters, numbers, and . _ + -");
      return;
    }
    setCustomError(null);
    if (!selectedSet.has(name.toLowerCase())) onChange([...selected, name]);
    setCustom("");
  }

  const selectedPackages = selected.map(
    (id) => meta[id.toLowerCase()] ?? fallbackPackage(id),
  );

  return (
    <div className="space-y-5">
      {/* Search bar */}
      <div className="relative">
        <Search className="w-4 h-4 text-hc-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-hc-darker border border-hc-slate/30 rounded-hc pl-9 pr-9 py-2.5 text-sm text-hc-snow placeholder:text-hc-muted focus:border-hc-cyan outline-none transition-colors"
        />
        {loading && (
          <Loader2 className="w-4 h-4 text-hc-muted absolute right-3 top-1/2 -translate-y-1/2 animate-spin" />
        )}
      </div>

      {/* Selected */}
      {selectedPackages.length > 0 && (
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wide text-hc-muted mb-2">
            Selected — {selectedPackages.length}
          </h3>
          <div className="flex flex-wrap gap-2">
            {selectedPackages.map((p) => (
              <span
                key={p.id}
                className="inline-flex items-center gap-2 bg-hc-cyan/10 border border-hc-cyan/40 rounded-hc pl-2 pr-1.5 py-1 text-sm text-hc-snow"
              >
                <PkgIcon pkg={p} size={16} />
                {p.title}
                <button
                  type="button"
                  onClick={() => toggle(p.id)}
                  className="text-hc-muted hover:text-hc-red font-bold px-1 leading-none"
                  aria-label={`Remove ${p.title}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wide text-hc-muted mb-2">
          {isDefault ? "Popular apps" : "Search results"}
        </h3>

        {error && !isDefault && <p className="text-hc-red text-sm py-3">{error}</p>}

        {!error && results.length === 0 && !loading && (
          <p className="text-hc-muted text-sm py-3">
            {isDefault ? "Loading popular apps…" : emptyResultsHint ?? "No packages found."}
          </p>
        )}

        {results.length > 0 && (
          <div className="rounded-hc border border-hc-darkless divide-y divide-hc-darkless overflow-hidden">
            {results.map((p) => {
              const isSelected = selectedSet.has(p.id.toLowerCase());
              return (
                <div
                  key={p.id}
                  className="flex items-start gap-3 p-3 bg-hc-darker hover:bg-hc-dark/60 transition-colors"
                >
                  <PkgIcon pkg={p} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-hc-snow truncate">{p.title}</span>
                      <span className="text-hc-muted text-xs font-mono truncate">{p.id}</span>
                    </div>
                    {p.summary && (
                      <p className="text-hc-smoke text-sm mt-0.5 line-clamp-2">{p.summary}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-hc-muted">
                      {p.author && <span className="truncate max-w-[40%]">{p.author}</span>}
                      {p.downloadCount > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Download className="w-3 h-3" />
                          {formatCount(p.downloadCount)}
                        </span>
                      )}
                      {p.version && <span className="font-mono">v{p.version}</span>}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggle(p.id)}
                    className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-hc text-sm font-bold transition-colors ${
                      isSelected
                        ? "bg-hc-cyan/20 border border-hc-cyan text-hc-snow"
                        : "bg-hc-cyan text-hc-darker hover:bg-hc-cyan/90"
                    }`}
                  >
                    {isSelected ? (
                      <>
                        <Check className="w-4 h-4" /> Added
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4" /> Add
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Custom package escape hatch (e.g. CLI tools not in the app catalog). */}
      {allowCustom && (
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wide text-hc-muted mb-2">
            Add a package by name
          </h3>
          <div className="flex gap-2">
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustom())}
              placeholder={customPlaceholder}
              className="flex-1 bg-hc-darker border border-hc-slate/30 rounded-hc px-3 py-2 text-sm text-hc-snow placeholder:text-hc-muted focus:border-hc-cyan outline-none"
            />
            <button
              type="button"
              onClick={addCustom}
              className="bg-hc-darkless hover:bg-hc-slate/30 text-hc-smoke border border-hc-slate/30 font-bold py-2 px-4 rounded-hc text-sm transition-colors"
            >
              Add
            </button>
          </div>
          {customError && <p className="text-hc-red text-sm mt-2">{customError}</p>}
        </div>
      )}
    </div>
  );
}

function PkgIcon({ pkg, size }: { pkg: CatalogPackage; size: number }) {
  const [failed, setFailed] = useState(false);
  const px = `${size}px`;
  if (!pkg.iconUrl || failed) {
    return (
      <span
        className="shrink-0 grid place-items-center rounded bg-hc-darkless text-hc-muted"
        style={{ width: px, height: px }}
      >
        <PackageIcon style={{ width: size * 0.55, height: size * 0.55 }} />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={pkg.iconUrl}
      alt=""
      onError={() => setFailed(true)}
      className="shrink-0 rounded bg-white/5 object-contain"
      style={{ width: px, height: px }}
    />
  );
}

function orderByIds(pkgs: CatalogPackage[], order: string[]): CatalogPackage[] {
  const rank = new Map(order.map((id, i) => [id.toLowerCase(), i]));
  return [...pkgs].sort(
    (a, b) => (rank.get(a.id.toLowerCase()) ?? 999) - (rank.get(b.id.toLowerCase()) ?? 999),
  );
}

function fallbackPackage(id: string): CatalogPackage {
  return { id, title: id, summary: "", iconUrl: null, downloadCount: 0, version: "", author: null };
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
