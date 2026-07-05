import { NextResponse } from "next/server";
import { getAllowlistedUser } from "@/lib/auth-guard";

export const runtime = "nodejs";

const FEED = "https://community.chocolatey.org/api/v2";
const SEARCH_LIMIT = 20;

export type ChocoPackage = {
  id: string;
  title: string;
  summary: string;
  iconUrl: string | null;
  downloadCount: number;
  version: string;
  author: string | null;
};

/**
 * Proxy + normalizer for the Chocolatey community feed (NuGet v2 OData, Atom
 * XML). Gated to allowlisted reviewers so it can't be used as an open proxy.
 *
 * - `?q=<term>`  → relevance-ordered search (default when browsing)
 * - `?ids=a,b,c` → resolve exact package ids (used to hydrate already-saved
 *   selections with icons/titles)
 */
export async function GET(request: Request) {
  const authResult = await getAllowlistedUser();
  if (!authResult) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const q = url.searchParams.get("q");
  const idsParam = url.searchParams.get("ids");

  try {
    if (idsParam !== null) {
      const ids = idsParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 50);
      const resolved = await Promise.all(ids.map((id) => resolveById(id)));
      return NextResponse.json(resolved.filter((p): p is ChocoPackage => p !== null));
    }

    const term = (q ?? "").trim();
    const packages = await search(term);
    return NextResponse.json(packages);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Chocolatey feed unavailable" },
      { status: 502 },
    );
  }
}

async function search(term: string): Promise<ChocoPackage[]> {
  const params = new URLSearchParams({
    searchTerm: `'${term.replace(/'/g, "")}'`,
    includePrerelease: "false",
    targetFramework: "''",
    // Without this the feed returns every historical version of each package,
    // producing duplicate rows for the same id.
    $filter: "IsLatestVersion",
    $top: String(SEARCH_LIMIT),
  });
  const xml = await fetchFeed(`${FEED}/Search()?${params.toString()}`);
  return parseFeed(xml);
}

async function resolveById(id: string): Promise<ChocoPackage | null> {
  const params = new URLSearchParams({ id: `'${id.replace(/'/g, "")}'` });
  const xml = await fetchFeed(`${FEED}/FindPackagesById()?${params.toString()}`);
  const entries = parseFeed(xml);
  if (entries.length === 0) return null;
  // FindPackagesById returns every version; the newest is listed first.
  return entries[0];
}

async function fetchFeed(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { Accept: "application/atom+xml" },
    // Chocolatey package metadata changes rarely; cache for an hour.
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`Chocolatey feed returned ${res.status}`);
  return res.text();
}

// ---------------------------------------------------------------------------
// Minimal Atom/OData parser. The feed is a controlled, well-formed source, so
// targeted extraction is sufficient and avoids pulling an XML dependency.
// ---------------------------------------------------------------------------

function parseFeed(xml: string): ChocoPackage[] {
  const entries = xml.split("<entry>").slice(1);
  const packages: ChocoPackage[] = [];

  for (const entry of entries) {
    const id = pickTag(entry, "title");
    if (!id) continue;

    const displayTitle = pickProp(entry, "Title");
    const summary = pickTag(entry, "summary");
    const description = pickProp(entry, "Description");
    const iconUrl = pickProp(entry, "IconUrl");
    const downloadCount = Number(pickProp(entry, "DownloadCount") ?? "0");
    const version = pickProp(entry, "Version") ?? "";
    const author = pickAuthor(entry);

    packages.push({
      id,
      title: displayTitle || id,
      summary: summary || firstLine(description),
      iconUrl: iconUrl || null,
      downloadCount: Number.isFinite(downloadCount) ? downloadCount : 0,
      version,
      author,
    });
  }

  return packages;
}

/** Atom element like `<title type="text">Firefox</title>`. */
function pickTag(entry: string, tag: string): string {
  const m = entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? decodeEntities(m[1].trim()) : "";
}

/** OData property like `<d:IconUrl>...</d:IconUrl>`. */
function pickProp(entry: string, prop: string): string {
  const m = entry.match(new RegExp(`<d:${prop}[^>]*>([\\s\\S]*?)</d:${prop}>`));
  return m ? decodeEntities(m[1].trim()) : "";
}

function pickAuthor(entry: string): string | null {
  const authorBlock = entry.match(/<author>([\s\S]*?)<\/author>/);
  if (!authorBlock) return null;
  const name = authorBlock[1].match(/<name>([\s\S]*?)<\/name>/);
  return name ? decodeEntities(name[1].trim()) || null : null;
}

function firstLine(text: string): string {
  const line = text.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  return line.length > 200 ? `${line.slice(0, 200)}…` : line;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
