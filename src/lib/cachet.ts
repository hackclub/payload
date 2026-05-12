type CachetProfile = {
  displayName?: string;
  imageUrl?: string;
};

const cachetCache = new Map<string, { data: CachetProfile; expires: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function getCachetProfile(slackId: string): Promise<CachetProfile> {
  const cached = cachetCache.get(slackId);
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }

  try {
    const res = await fetch(`https://cachet.dunkirk.sh/users/${slackId}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return {};
    const data = (await res.json()) as CachetProfile;
    cachetCache.set(slackId, { data, expires: Date.now() + CACHE_TTL_MS });
    return data;
  } catch {
    return {};
  }
}

export function cachetAvatarUrl(slackId: string): string {
  return `https://cachet.dunkirk.sh/users/${slackId}/r`;
}
