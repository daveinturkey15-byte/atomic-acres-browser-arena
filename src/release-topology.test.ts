import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evaluateAcceptance } from '../scripts/release/acceptance-gate.mjs';
import { PASS66_RELEASE_IDENTITY } from './release-identity';

const config = JSON.parse(readFileSync('release-channels.json', 'utf8'));
const pass62Benchmark = JSON.parse(readFileSync('baselines/pass62/best-netcode-benchmark.json', 'utf8'));
const shell = readFileSync('release-shell/release-shell.js', 'utf8');
const shellHtml = readFileSync('release-shell/index.html', 'utf8');
const staging = readFileSync('scripts/release/stage-release-topology.mjs', 'utf8');
const staticVerifier = readFileSync('scripts/qa/verify-release-topology.mjs', 'utf8');
const liveVerifier = readFileSync('scripts/qa/verify-release-topology-browser.mjs', 'utf8');
const playwrightServer = readFileSync('scripts/qa/playwright-web-server.mjs', 'utf8');

describe('Pass 71 release topology', () => {
  it('identifies this source as Pass 71 without moving protected fallback pins', () => {
    expect(PASS66_RELEASE_IDENTITY).toMatchObject({
      pass: 'PASS 71',
      label: 'PASS 71',
      state: 'RELEASE CANDIDATE',
      route: 'channels/the-big-one',
      runtimeLabel: 'PASS 71',
    });
    expect(config.latest.label).toBe('PASS 71');
    expect(config.stable.sourceSha).toBe('8c3ad1cd4d819aba79f07c01c16c8c4294fd14c1');
    expect(config.retained).toMatchObject({
      pass: 'PASS 70',
      sourceSha: '130fd59bd2cf1e1719b802463219ddf36e2484d5',
      pagesSha: '3b5e675c54eaea2a2dd721eca6f247c933361587',
      pagesPath: 'channels/the-big-one',
      runtimeFileCount: 515,
      runtimeTreeSha256: 'c8f6aeed492cd747ef83aa41bdc0d05f2fd86264418d40d0ebbd0916c85d6160',
      pagesSubtreeFileCount: 516,
      pagesSubtreeTreeSha256: '59ca7375a99d79ee644857df7c219b1beee2803ce3d077ba054ec44abd9adfa6',
      path: 'channels/pass70-retained',
    });
    expect(config.rollback.sourceSha).toBe('ac85e9b8b46cc2370aee903d564ecf3c4682b24c');
    expect(config.rollback).toMatchObject({
      pass: 'PASS 63',
      pagesSha: '46d366d188bfc5ebc5ee7a991fd52b792575316c',
      pagesPath: 'channels/pass63-rollback',
      runtimeFileCount: 119,
      runtimeTreeSha256: 'b7416e02c190d8ff0403a65cd7a7c894970507bc6a8de7b196cc2d7979d69bce',
      pagesSubtreeFileCount: 120,
      pagesSubtreeTreeSha256: '43e97691b33240be8992f1f1238f5d3effb292e3765e7528b27756c04695f579',
      path: 'channels/pass63-rollback',
    });
  });

  it('retains the immutable best-ever Pass 62 benchmark record independently', () => {
    expect(pass62Benchmark).toMatchObject({
      designation: 'user-approved-best-ever-netcode',
      releasePass: 'PASS 62',
      immutable: true,
      sourceSha: '249a7ee77dce761eb237f3eb0e0d0ea1d0356317',
      pagesSha: '27c90967bdaf5387c0372933c7965a60ce75a765',
      runtimeFileCount: 118,
      runtimeTreeSha256: '035e868ad80a7d81aeac6a08c17db4123feb6a1343f1b8eb24bbd8b1971c1d5d',
      productionWorkflowRun: 30109672269,
      pagesWorkflowRun: 30109872134,
    });
  });

  it('uses schema 4 and pins stable Pass 67.1 by exact production source, Pages subtree, and runtime digest', () => {
    expect(config.schemaVersion).toBe(4);
    expect(config.stable).toEqual({
      pass: 'PASS 67.1',
      label: 'STABLE SINGLEPLAYER',
      description: expect.any(String),
      sourceSha: '8c3ad1cd4d819aba79f07c01c16c8c4294fd14c1',
      pagesSha: '271cea28299570af8def30e879701ddbd3c4bc12',
      pagesPath: 'channels/recent-stable',
      runtimeFileCount: 508,
      runtimeTreeSha256: 'd8d444578e83a408c2e4d63ca4d1c2c5b705521f565fee6a58daffeb1e205ce9',
      pagesSubtreeFileCount: 509,
      pagesSubtreeTreeSha256: '10e408e5663dda8fef820aae89bbcda174699bd2661b9d94387d060fdb55914a',
      path: 'channels/recent-stable',
    });
  });

  it('stages the Pass 71 candidate at the promotable path and removes old channels', () => {
    expect(config.experimental).toEqual({
      pass: PASS66_RELEASE_IDENTITY.pass,
      label: PASS66_RELEASE_IDENTITY.label,
      description: expect.any(String),
      path: PASS66_RELEASE_IDENTITY.route,
    });
    expect(config.normal).toBeUndefined();
    expect(JSON.stringify(config)).not.toContain('PASS 59');
    expect(config.stable.pass).not.toBe('PASS 64');
    expect(JSON.stringify(config)).not.toContain('channels/new-netcode');
  });

  it('shows Pass 71, exact retained Pass 70 and stable Pass 63 WebGL', () => {
    expect(shell).toContain("['experimental', 'retained', 'stable']");
    expect(shell).not.toContain("['experimental', 'stable', 'rollback']");
    expect(shell).not.toContain("['normal', 'stable', 'experimental']");
    expect(shell).toContain("channel.deploymentState === 'live' ? 'LIVE' : 'RELEASE CANDIDATE'");
    expect(shell).toContain("requested === 'stable' || requested === 'rollback') return route('stable')");
    expect(shell).toContain("requested === 'previous' || requested === 'pass70') return route('retained')");
    expect(shell).toContain("if (!channel) continue");
    expect(shellHtml).toContain('Pass 71');
    expect(shellHtml).toContain('Pass 70');
    expect(shellHtml).not.toContain('local Pass 71');
    expect(shellHtml).not.toContain('The Big One');
    expect(shellHtml).toContain('stable Pass 63 WebGL');
    expect(shellHtml).toContain('Nuke Town');
    expect(shellHtml).not.toContain('Atomic Acres');
    expect(shellHtml).not.toContain('Pass 59');
  });

  it('routes root rooms and legacy latest or normal aliases to Pass 71', () => {
    expect(shell).toContain("requested === 'latest' || requested === 'normal') return route('experimental')");
    expect(shell).toContain("requested === 'experimental'");
    expect(shell).toContain("requested === 'stable' || requested === 'rollback'");
    expect(shell).toContain("target.searchParams.set('release', 'latest')");
  });

  it('bridges overlapping controls into immutable Pass 63 and back without changing channel bytes', () => {
    expect(shell).toContain("const profileKey = 'atomic-acres.player-profile.v1'");
    expect(shell).toContain("bridgeControls(key === 'stable' ? 'stable' : 'latest')");
    expect(shell).toContain("mouseSensitivity: 'atomic-acres-sensitivity'");
    expect(shell).toContain('localStorage.removeItem(key)');
  });

  it('moves the candidate under experimental and requires a timestamped stable rebuild in production', () => {
    expect(staging).toContain('process.env.RELEASE_DIST_ROOT');
    expect(staging).toContain('process.env.RELEASE_TOPOLOGY_RECEIPT_PATH');
    expect(staging).toContain("renameSync(join(distRoot, 'index.html'), join(experimentalRoot, 'index.html'))");
    expect(staging).toContain('process.env.RELEASE_STABLE_DIST');
    expect(staging).toContain('process.env.REQUIRE_STABLE_RELEASE_TIMESTAMP');
    expect(staging).toContain("stageRebuilt('recent-stable', config.stable");
    expect(staging).toContain("stagePinned('recent-stable', config.stable)");
    expect(staging).toContain("stagePinned('pass70-retained', config.retained)");
    expect(staging).toContain('STABLE_RELEASED_AT must be one strict UTC ISO-8601 instant');
    expect(staging).toContain("channel: liveChannelId");
    expect(staging).toContain('channel.pagesPath');
    expect(staging).toContain('paths.length !== channel.pagesSubtreeFileCount');
    expect(staging).toContain('digest !== channel.pagesSubtreeTreeSha256');
    expect(staging).toContain("'pinned-channel-provenance.json'");
    expect(staging).not.toContain("stagePinned('new-netcode'");
    expect(staging).toContain('experimental: {');
    expect(staging).toContain('...(rollback ? {');
    expect(staging).toContain('stable: {');
    expect(staging).not.toContain('RELEASE_ROLLBACK_DIST');
    expect(staging).not.toContain('PASS63_PREVIEW_PIN');
    expect(staging).toContain("rollback = stagePinned('rollback', config.rollback)");
    expect(staticVerifier).toContain('const rollbackFiles = verifyPinned(config.rollback)');
    expect(staticVerifier).toContain('rollbackFiles !== config.rollback.pagesSubtreeFileCount');
    expect(staticVerifier).toContain('retainedWrapper.treeSha256 !== config.retained.pagesSubtreeTreeSha256');
    expect(staticVerifier).toContain('stableProvenance.treeSha256 !== config.stable.pagesSubtreeTreeSha256');
    expect(staticVerifier).toContain('rollbackWrapper.treeSha256 !== config.rollback.pagesSubtreeTreeSha256');
    expect(staticVerifier).toContain('retainedWrapper.treeSha256 !== treeDigest(retainedRoot, retainedPinnedFiles)');
    expect(staticVerifier).toContain('stableProvenance.treeSha256 !== treeDigest(stableRoot, stablePinnedFiles)');
    expect(liveVerifier).toContain('channelConfig.retained.pagesSubtreeFileCount');
    expect(liveVerifier).toContain('channelConfig.retained.pagesSubtreeTreeSha256');
    expect(liveVerifier).toContain('channelConfig.stable.pagesSubtreeFileCount');
    expect(liveVerifier).toContain('channelConfig.stable.pagesSubtreeTreeSha256');
    expect(liveVerifier).toContain('channelConfig.rollback.pagesSubtreeFileCount');
    expect(liveVerifier).toContain('channelConfig.rollback.pagesSubtreeTreeSha256');
    expect(liveVerifier).toContain('retainedWrapper.pinnedRuntime?.treeSha256');
    expect(liveVerifier).toContain('rollbackWrapper.pinnedRuntime?.treeSha256');
    expect(staticVerifier).toContain('rollbackEmbedded.treeSha256 !== config.rollback.runtimeTreeSha256');
    expect(staticVerifier).toContain('rollbackWrapper.pagesSha !== config.rollback.pagesSha');
    expect(staging).toContain("schemaVersion: 4");
    expect(staging).toContain("process.env.RELEASE_BUILT_AT?.trim() ? 'live' : 'candidate'");
    expect(staging).toContain('deploymentState,');
    expect(staging).toContain("deploymentState === 'live'");
    expect(staging).toContain('Publication remains disabled until the release gates pass.');
  });

  it('stages the production channel topology before browser regression tests', () => {
    expect(playwrightServer).toContain("['scripts/release/stage-release-topology.mjs']");
    expect(playwrightServer).toContain("stdio: 'inherit'");
    expect(playwrightServer.indexOf('stage-release-topology.mjs')).toBeLessThan(playwrightServer.indexOf('const server = await preview'));
  });

  it('tracks the current release acceptance lifecycle without allowing premature publication', () => {
    const manifestPath = 'acceptance/pass-71.json';
    if (!existsSync(manifestPath)) {
      expect(() => evaluateAcceptance({ phase: 'release', pass: PASS66_RELEASE_IDENTITY.pass }))
        .toThrow(`acceptance manifest does not exist: ${manifestPath}`);
      return;
    }

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const result = evaluateAcceptance({ phase: 'release', pass: PASS66_RELEASE_IDENTITY.pass }) as {
      ok: boolean;
      errors: string[];
      approvalParity: { ok: boolean };
    };
    // A runtime candidate must fail closed until its immutable preview has a
    // matching owner approval. A stale historical preview is expected to report
    // approval drift here; that is evidence of a blocked release, not a reason
    // to relax the acceptance gate.
    if (!result.approvalParity.ok) {
      expect(result.ok).toBe(false);
      expect(result.errors.some((error) => error.startsWith('preview approval invalid:'))).toBe(true);
      return;
    }
    if (!manifest.humanAcceptance) {
      expect(result.ok).toBe(false);
      expect(result.errors).toEqual(['humanAcceptance must be approved by Dave with timestamped evidence']);
      return;
    }
    expect(result.ok).toBe(true);
  });
});
