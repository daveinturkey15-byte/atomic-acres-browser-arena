export type ReleaseChannelDecision = 'choose' | 'latest' | 'stable';

type RoutedReleaseChannel = {
  label: string;
  description: string;
  pass: string;
  path: string;
};

type PinnedReleaseChannel = RoutedReleaseChannel & {
  sourceSha: string;
  pagesSha: string;
  pagesPath: string;
  runtimeFileCount: number;
  runtimeTreeSha256: string;
};

export type ReleaseChannelConfig = {
  schemaVersion: number;
  canonicalHostname: string;
  latest: {
    label: string;
    description: string;
  };
  experimental: RoutedReleaseChannel;
  previous: PinnedReleaseChannel;
  retained: PinnedReleaseChannel;
  historical: PinnedReleaseChannel;
  stable: PinnedReleaseChannel;
  /**
   * PASS 84, the single pinned safe backup at channels/pass84 (HF-400, owner
   * 2026-09-02: "pin this version and remove all past versions, this can be the
   * safe backup"). Optional because the key post-dates schemaVersion 5 consumers,
   * but it IS on gh-pages and it is the only predecessor the pass85 publish
   * keeps - which is why the direct-link chooser in bootstrap.ts prefers it over
   * `rollback`, whose tree 404s.
   */
  pass84Backup?: Readonly<{ label: string; description: string; pass: string; path: string }>;
  rollback?: PinnedReleaseChannel & {
    rebuiltFromSource: boolean;
  };
};

export function releaseChannelDecision(
  search: string,
  hostname: string,
  canonicalHostname: string,
): ReleaseChannelDecision {
  const params = new URLSearchParams(search);

  // Shared room URLs are entry contracts, not ordinary landing-page visits.
  if (params.get('room')?.trim()) return 'latest';

  const requested = params.get('release')?.trim().toLowerCase();
  if (requested === 'latest' || requested === 'normal' || requested === 'experimental') return 'latest';
  if (requested === 'stable') return 'stable';
  if (requested === 'choose') return 'choose';

  return hostname.toLowerCase() === canonicalHostname.toLowerCase() ? 'choose' : 'latest';
}

export function stableReleaseUrl(baseUri: string, configuredPath: string): string {
  const path = configuredPath.replace(/^\/+|\/+$/g, '');
  if (!path || path.split('/').some((part) => part === '.' || part === '..')) {
    throw new Error('Stable release path must be a safe relative path');
  }
  const target = new URL(`./${path}/`, baseUri);
  target.searchParams.set('release', 'latest');
  return target.toString();
}
