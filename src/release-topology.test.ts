import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const config = JSON.parse(readFileSync('release-channels.json', 'utf8'));
const pass62Benchmark = JSON.parse(readFileSync('baselines/pass62/best-netcode-benchmark.json', 'utf8'));
const shell = readFileSync('release-shell/release-shell.js', 'utf8');
const shellHtml = readFileSync('release-shell/index.html', 'utf8');
const staging = readFileSync('scripts/release/stage-release-topology.mjs', 'utf8');

describe('Pass 63 two-channel release topology', () => {
  it('binds the stable channel to the immutable best-ever Pass 62 benchmark', () => {
    expect(pass62Benchmark).toMatchObject({
      designation: 'user-approved-best-ever-netcode',
      releasePass: config.stable.pass,
      immutable: true,
      sourceSha: config.stable.sourceSha,
      pagesSha: config.stable.pagesSha,
      pagesPath: config.stable.pagesPath,
      runtimeFileCount: config.stable.runtimeFileCount,
      runtimeTreeSha256: config.stable.runtimeTreeSha256,
      productionWorkflowRun: 30109672269,
      pagesWorkflowRun: 30109872134,
    });
  });

  it('uses schema 4 and pins stable Pass 62 by exact source, Pages subtree, and runtime digest', () => {
    expect(config.schemaVersion).toBe(4);
    expect(config.stable).toEqual({
      pass: 'PASS 62',
      label: 'NEW NETCODE',
      description: expect.any(String),
      sourceSha: '249a7ee77dce761eb237f3eb0e0d0ea1d0356317',
      pagesSha: '27c90967bdaf5387c0372933c7965a60ce75a765',
      pagesPath: 'channels/experimental-netcode-pass',
      runtimeFileCount: 118,
      runtimeTreeSha256: '035e868ad80a7d81aeac6a08c17db4123feb6a1343f1b8eb24bbd8b1971c1d5d',
      path: 'channels/recent-stable',
    });
  });

  it('keeps Pass 63 live at the experimental netcode path and removes old channels', () => {
    expect(config.experimental).toEqual({
      pass: 'PASS 63',
      label: 'EXPERIMENTAL NEW NETCODE',
      description: expect.any(String),
      path: 'channels/experimental-netcode-pass',
    });
    expect(config.normal).toBeUndefined();
    expect(JSON.stringify(config)).not.toContain('PASS 59');
    expect(JSON.stringify(config)).not.toContain('channels/new-netcode');
  });

  it('renders exactly live Pass 63 and stable Pass 62 choices', () => {
    expect(shell).toContain("['experimental', 'stable']");
    expect(shell).not.toContain("['normal', 'stable', 'experimental']");
    expect(shell).toContain("key === 'stable' ? 'STABLE' : 'LIVE'");
    expect(shellHtml).toContain('live Pass 63 build');
    expect(shellHtml).toContain('byte-exact Pass 62 best-netcode benchmark');
    expect(shellHtml).toContain('Nuke Town');
    expect(shellHtml).not.toContain('Atomic Acres');
    expect(shellHtml).not.toContain('Pass 59');
  });

  it('routes root rooms and legacy latest or normal aliases to Pass 63', () => {
    expect(shell).toContain("requested === 'latest' || requested === 'normal') return route('experimental')");
    expect(shell).toContain("requested === 'experimental'");
    expect(shell).toContain("requested === 'stable'");
    expect(shell).toContain("target.searchParams.set('release', 'latest')");
  });

  it('moves the candidate under experimental and reconstructs only stable Pass 62 from Git blobs', () => {
    expect(staging).toContain("renameSync(join(distRoot, 'index.html'), join(experimentalRoot, 'index.html'))");
    expect(staging).toContain("const stable = stagePinned('recent-stable', config.stable)");
    expect(staging).toContain('channel.pagesPath');
    expect(staging).toContain("'pinned-channel-provenance.json'");
    expect(staging).not.toContain("stagePinned('new-netcode'");
    expect(staging).toContain("channels: { experimental, stable }");
    expect(staging).toContain("schemaVersion: 4");
  });
});
