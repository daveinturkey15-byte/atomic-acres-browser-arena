import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const config = JSON.parse(readFileSync('release-channels.json', 'utf8'));
const shell = readFileSync('release-shell/release-shell.js', 'utf8');
const shellHtml = readFileSync('release-shell/index.html', 'utf8');
const staging = readFileSync('scripts/release/stage-release-topology.mjs', 'utf8');

describe('Pass 62 two-channel release topology', () => {
  it('uses schema 3 and pins stable Pass 60 by exact source and Pages SHAs', () => {
    expect(config.schemaVersion).toBe(3);
    expect(config.stable).toEqual({
      pass: 'PASS 60',
      label: 'NEW NETCODE',
      description: expect.any(String),
      sourceSha: 'b1af49be064610126a80c2ee538af334389f8f43',
      pagesSha: 'fb06eeeefc42f35d591e9ee340a3adab62916883',
      path: 'channels/recent-stable',
    });
  });

  it('keeps Pass 62 live at the experimental netcode path and removes old channels', () => {
    expect(config.experimental).toEqual({
      pass: 'PASS 62',
      label: 'EXPERIMENTAL NEW NETCODE',
      description: expect.any(String),
      path: 'channels/experimental-netcode-pass',
    });
    expect(config.normal).toBeUndefined();
    expect(JSON.stringify(config)).not.toContain('PASS 59');
    expect(JSON.stringify(config)).not.toContain('channels/new-netcode');
  });

  it('renders exactly live Pass 62 and stable Pass 60 choices', () => {
    expect(shell).toContain("['experimental', 'stable']");
    expect(shell).not.toContain("['normal', 'stable', 'experimental']");
    expect(shell).toContain("key === 'stable' ? 'STABLE' : 'LIVE'");
    expect(shellHtml).toContain('live Pass 62 experimental netcode build');
    expect(shellHtml).toContain('byte-exact Pass 60 stable fallback');
    expect(shellHtml).not.toContain('Pass 59');
  });

  it('routes root rooms and legacy latest or normal aliases to Pass 62', () => {
    expect(shell).toContain("requested === 'latest' || requested === 'normal') return route('experimental')");
    expect(shell).toContain("requested === 'experimental'");
    expect(shell).toContain("requested === 'stable'");
    expect(shell).toContain("target.searchParams.set('release', 'latest')");
  });

  it('moves the candidate under experimental and reconstructs only stable Pass 60 from Git blobs', () => {
    expect(staging).toContain("renameSync(join(distRoot, 'index.html'), join(experimentalRoot, 'index.html'))");
    expect(staging).toContain("const stable = stagePinned('recent-stable', config.stable)");
    expect(staging).not.toContain("stagePinned('new-netcode'");
    expect(staging).toContain("channels: { experimental, stable }");
    expect(staging).toContain("schemaVersion: 3");
  });
});
