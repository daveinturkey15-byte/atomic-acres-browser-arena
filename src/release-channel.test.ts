import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { releaseChannelDecision, stableReleaseUrl } from './release-channel';

const canonical = 'daveinturkey15-byte.github.io';

describe('release channel entry routing', () => {
  it('shows the chooser on an ordinary canonical production landing', () => {
    expect(releaseChannelDecision('', canonical, canonical)).toBe('choose');
  });

  it('does not interrupt local development or browser QA unless forced', () => {
    expect(releaseChannelDecision('', 'localhost', canonical)).toBe('latest');
    expect(releaseChannelDecision('?release=choose', 'localhost', canonical)).toBe('choose');
  });

  it('routes latest, normal and experimental aliases to live Pass 62', () => {
    expect(releaseChannelDecision('?release=latest', canonical, canonical)).toBe('latest');
    expect(releaseChannelDecision('?release=normal', canonical, canonical)).toBe('latest');
    expect(releaseChannelDecision('?release=experimental', canonical, canonical)).toBe('latest');
    expect(releaseChannelDecision('?release=stable', canonical, canonical)).toBe('stable');
  });

  it('keeps room invitations on the live Pass 62 multiplayer client', () => {
    expect(releaseChannelDecision('?room=abc&autojoin=1&release=choose', canonical, canonical)).toBe('latest');
  });

  it('resolves the pinned Pass 60 tree beneath the repository Pages root and bypasses its archived chooser', () => {
    expect(stableReleaseUrl(
      'https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/',
      'channels/recent-stable',
    )).toBe('https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/channels/recent-stable/?release=latest');
  });

  it('rejects paths that could escape the deployed root', () => {
    expect(() => stableReleaseUrl('https://example.test/game/', '../old')).toThrow(/safe relative path/);
  });

  it('declares an inline favicon so repository Pages does not probe the origin root', () => {
    const entryHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    expect(entryHtml).toContain('<link rel="icon" href="data:image/svg+xml,');
    expect(entryHtml).not.toMatch(/href=["']\/favicon\.ico/);
  });
});
