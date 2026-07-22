export type ReleaseChannelDecision = 'choose' | 'latest' | 'stable';

export type ReleaseChannelConfig = {
  schemaVersion: number;
  canonicalHostname: string;
  latest: {
    label: string;
    description: string;
  };
  stable: {
    label: string;
    description: string;
    pass: string;
    pagesSha: string;
    path: string;
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
  if (requested === 'latest') return 'latest';
  if (requested === 'stable') return 'stable';
  if (requested === 'choose') return 'choose';

  return hostname.toLowerCase() === canonicalHostname.toLowerCase() ? 'choose' : 'latest';
}

export function stableReleaseUrl(baseUri: string, configuredPath: string): string {
  const path = configuredPath.replace(/^\/+|\/+$/g, '');
  if (!path || path.split('/').some((part) => part === '.' || part === '..')) {
    throw new Error('Stable release path must be a safe relative path');
  }
  return new URL(`./${path}/`, baseUri).toString();
}
