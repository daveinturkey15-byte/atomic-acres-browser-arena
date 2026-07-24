import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const config = JSON.parse(readFileSync('release-channels.json', 'utf8'));
const shell = readFileSync('release-shell/release-shell.js', 'utf8');
const staging = readFileSync('scripts/release/stage-release-topology.mjs', 'utf8');

describe('three-channel release topology', () => {
  it('pins normal Pass 60 and stable Pass 59 by exact Pages SHA', () => {
    expect(config.normal).toMatchObject({
      pass: 'PASS 60', label: 'NEW NETCODE',
      pagesSha: 'fb06eeeefc42f35d591e9ee340a3adab62916883', path: 'channels/new-netcode',
    });
    expect(config.stable).toMatchObject({
      pass: 'PASS 59', pagesSha: 'b29d44f1f45a6ade65e72738fc4adb58235f6f26', path: 'channels/recent-stable',
    });
  });

  it('keeps Pass 61 at a separate experimental path', () => {
    expect(config.experimental).toMatchObject({
      pass: 'PASS 61', label: 'EXPERIMENTAL NETCODE PASS', path: 'channels/experimental-netcode-pass',
    });
    expect(new Set([config.normal.path, config.stable.path, config.experimental.path]).size).toBe(3);
  });

  it('routes root rooms and legacy latest to normal while preserving explicit experimental choice', () => {
    expect(shell).toContain("params.get('room')?.trim() || requested === 'latest' || requested === 'normal'");
    expect(shell).toContain("requested === 'experimental'");
    expect(shell).toContain("['normal', 'stable', 'experimental']");
    expect(shell).toContain("target.searchParams.set('release', 'latest')");
  });

  it('moves the new candidate under experimental and reconstructs pinned channels from Git blobs', () => {
    expect(staging).toContain("renameSync(join(distRoot, 'index.html'), join(experimentalRoot, 'index.html'))");
    expect(staging).toContain("git', ['cat-file', 'blob'");
    expect(staging).toContain("root: { kind: 'chooser-only'");
  });
});
