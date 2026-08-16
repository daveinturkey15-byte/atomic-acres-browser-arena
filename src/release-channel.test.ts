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

  it('routes latest, normal and experimental aliases to the Pass 71 candidate', () => {
    expect(releaseChannelDecision('?release=latest', canonical, canonical)).toBe('latest');
    expect(releaseChannelDecision('?release=normal', canonical, canonical)).toBe('latest');
    expect(releaseChannelDecision('?release=experimental', canonical, canonical)).toBe('latest');
    expect(releaseChannelDecision('?release=stable', canonical, canonical)).toBe('stable');
  });

  it('keeps room invitations on the Pass 71 multiplayer candidate', () => {
    expect(releaseChannelDecision('?room=abc&autojoin=1&release=choose', canonical, canonical)).toBe('latest');
  });

  it('resolves the pinned Pass 63 tree beneath the repository Pages root and bypasses its archived chooser', () => {
    expect(stableReleaseUrl(
      'https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/',
      'channels/pass63-rollback',
    )).toBe('https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/channels/pass63-rollback/?release=latest');
  });

  it('rejects paths that could escape the deployed root', () => {
    expect(() => stableReleaseUrl('https://example.test/game/', '../old')).toThrow(/safe relative path/);
  });

  it('declares an inline favicon so repository Pages does not probe the origin root', () => {
    const entryHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    expect(entryHtml).toContain('<link rel="icon" href="data:image/svg+xml,');
    expect(entryHtml).not.toMatch(/href=["']\/favicon\.ico/);
  });

  it('keeps the tactical font stack local so offline play cannot stall or emit network errors', () => {
    const style = readFileSync(new URL('./style.css', import.meta.url), 'utf8');
    expect(style).not.toMatch(/@import\s+url\(["']?https?:/u);
    expect(style).toContain("local('Segoe UI')");
    expect(style).toContain("local('Bahnschrift Condensed')");
  });
});
