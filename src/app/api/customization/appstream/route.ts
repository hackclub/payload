import { NextResponse } from "next/server";
import { gunzipSync } from "node:zlib";
import { getAllowlistedUser } from "@/lib/auth-guard";

export const runtime = "nodejs";

// AppStream has no REST API — distributions publish DEP-11 metadata (a YAML
// dialect of AppStream) alongside their apt repositories. We download Debian's
// DEP-11 catalog once, parse the fields we need, and cache it in memory. Icons
// are hotlinked from appstream.debian.org via the feed's MediaBaseUrl.
const SUITE = "trixie";
const COMPONENTS_URL = `https://deb.debian.org/debian/dists/${SUITE}/main/dep11/Components-amd64.yml.gz`;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const SEARCH_LIMIT = 20;

export type CatalogPackage = {
  id: string;
  title: string;
  summary: string;
  iconUrl: string | null;
  downloadCount: number;
  version: string;
  author: string | null;
};

type AppEntry = {
  pkg: string;
  name: string;
  summary: string;
  iconUrl: string | null;
  developer: string | null;
};

type Catalog = { at: number; apps: AppEntry[]; byPkg: Map<string, AppEntry> };

let cache: Catalog | null = null;
let inflight: Promise<Catalog> | null = null;

export async function GET(request: Request) {
  const authResult = await getAllowlistedUser();
  if (!authResult) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const q = url.searchParams.get("q");
  const idsParam = url.searchParams.get("ids");

  try {
    const { apps, byPkg } = await loadCatalog();

    if (idsParam !== null) {
      const ids = idsParam.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean).slice(0, 50);
      const resolved = ids
        .map((id) => byPkg.get(id))
        .filter((e): e is AppEntry => e !== undefined)
        .map(toPackage);
      return NextResponse.json(resolved);
    }

    const term = (q ?? "").trim().toLowerCase();
    if (!term) return NextResponse.json([]);
    return NextResponse.json(search(apps, term).map(toPackage));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "AppStream catalog unavailable" },
      { status: 502 },
    );
  }
}

function toPackage(e: AppEntry): CatalogPackage {
  return {
    id: e.pkg,
    title: e.name,
    summary: e.summary,
    iconUrl: e.iconUrl,
    downloadCount: 0, // AppStream has no popularity metric.
    version: "",
    author: e.developer,
  };
}

function search(apps: AppEntry[], term: string): AppEntry[] {
  const scored: { e: AppEntry; score: number }[] = [];
  for (const e of apps) {
    const name = e.name.toLowerCase();
    const pkg = e.pkg.toLowerCase();
    let score = -1;
    if (pkg === term || name === term) score = 0;
    else if (name.startsWith(term) || pkg.startsWith(term)) score = 1;
    else if (name.includes(term) || pkg.includes(term)) score = 2;
    else if (e.summary.toLowerCase().includes(term)) score = 3;
    if (score >= 0) scored.push({ e, score });
  }
  scored.sort((a, b) => a.score - b.score || a.e.name.length - b.e.name.length);
  return scored.slice(0, SEARCH_LIMIT).map((s) => s.e);
}

async function loadCatalog(): Promise<Catalog> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache;
  if (inflight) return inflight;
  inflight = buildCatalog()
    .then((c) => {
      cache = c;
      return c;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

async function buildCatalog(): Promise<Catalog> {
  const res = await fetch(COMPONENTS_URL);
  if (!res.ok) throw new Error(`DEP-11 fetch returned ${res.status}`);
  const gz = Buffer.from(await res.arrayBuffer());
  const yml = gunzipSync(gz).toString("utf8");
  const apps = parseDep11(yml);
  const byPkg = new Map(apps.map((a) => [a.pkg.toLowerCase(), a]));
  return { at: Date.now(), apps, byPkg };
}

// ---------------------------------------------------------------------------
// Targeted DEP-11 parser. The format is a stream of YAML documents separated by
// `\n---\n`; we only need a few scalar fields per app, so we extract them
// directly rather than pulling a YAML dependency and materializing 20+ MB.
// ---------------------------------------------------------------------------

function parseDep11(yml: string): AppEntry[] {
  const docs = yml.split("\n---\n");
  const media = docs[0].match(/^MediaBaseUrl:\s*(.+)$/m)?.[1]?.trim() ?? "";

  const apps: AppEntry[] = [];
  for (const doc of docs.slice(1)) {
    // Only user-facing apps (GUI + a handful of console apps).
    if (!/^Type: (?:desktop-application|console-application)/m.test(doc)) continue;
    const pkg = doc.match(/^Package:\s*(.+)$/m)?.[1]?.trim();
    if (!pkg) continue;

    const name = localized(doc, "Name") || pkg;
    const summary = localized(doc, "Summary");
    const developer = localized(doc, "DeveloperName") || null;
    const iconUrl = remoteIcon(doc, media);

    apps.push({ pkg, name, summary, iconUrl, developer });
  }
  return apps;
}

/** Read the `C`/`en` value from a localized block like `Name:\n  C: Firefox`. */
function localized(doc: string, key: string): string {
  const block = doc.match(new RegExp(`^${key}:\\n((?:[ ].*\\n?)*)`, "m"));
  if (!block) return "";
  const c = block[1].match(/^  (?:C|en|en-US): (.+)$/m);
  return c ? c[1].trim().replace(/^['"]|['"]$/g, "") : "";
}

/** First remote icon URL, resolved against MediaBaseUrl. */
function remoteIcon(doc: string, media: string): string | null {
  const iconBlock = doc.match(/^Icon:\n((?:[ ].*\n?)*)/m);
  if (!iconBlock || !media) return null;
  const remote = iconBlock[1].match(/^  remote:\n((?:[ ].*\n?)*)/m);
  if (!remote) return null;
  const url = remote[1].match(/url: (.+)$/m)?.[1]?.trim();
  return url ? `${media}/${url}` : null;
}
