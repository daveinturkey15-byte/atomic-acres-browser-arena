import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Pass 66 owned browser verifier runners', () => {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
    scripts: Record<string, string>;
  };
  const runner = readFileSync('scripts/qa/run-pass66-owned-browser-verifier.mjs', 'utf8');
  const firefox = readFileSync('scripts/qa/verify-installed-firefox.mjs', 'utf8');
  const privateLobby = readFileSync('scripts/qa/verify-private-lobby.mjs', 'utf8');
  const authoritativeNetcode = readFileSync('scripts/qa/verify-pass61-authoritative-netcode.mjs', 'utf8');
  const supportPromptRunner = readFileSync('scripts/qa/run-pass66-support-operate-prompt-evidence.mjs', 'utf8');
  const supportPromptSpec = readFileSync('tests/e2e/pass66-support-operate-prompt.spec.ts', 'utf8');
  const multiplayerStability = readFileSync('scripts/qa/verify-pass66-multiplayer-stability.mjs', 'utf8');

  it('routes browser evidence gates through the clean owned topology runner', () => {
    expect(packageJson.scripts['qa:private-lobby']).toContain('run-pass66-owned-browser-verifier.mjs private-lobby');
    expect(packageJson.scripts['qa:pass66:installed-firefox']).toContain('run-pass66-owned-browser-verifier.mjs installed-firefox');
    expect(packageJson.scripts['qa:pass61:netcode']).toContain('run-pass66-owned-browser-verifier.mjs pass61-netcode');
    expect(packageJson.scripts['qa:pass66:support-operate-prompt']).toContain('run-pass66-owned-browser-verifier.mjs support-operate-prompt');
    expect(packageJson.scripts['qa:multiplayer:stability']).toContain('run-pass66-owned-browser-verifier.mjs multiplayer-stability');
    expect(packageJson.scripts['qa:pass66:multiplayer-stability']).toContain('run-pass66-owned-browser-verifier.mjs multiplayer-stability');
    for (const alias of [
      'qa:pass66:host-recovery',
      'qa:pass66:owner-feedback-multiplayer-ui',
      'qa:pass66:timed-map-weapons-multiplayer-rejoin',
      'qa:pass66:qoder-multiplayer-authority',
      'qa:pass66:adrenaline-lifecycle',
    ]) expect(packageJson.scripts[alias]).toBe('npm run qa:pass66:multiplayer-stability');
    expect(packageJson.scripts['qa:private-lobby']).not.toContain('run-with-preview-server.mjs');
    expect(packageJson.scripts['qa:pass66:installed-firefox']).not.toContain('run-with-preview-server.mjs');
    expect(packageJson.scripts['qa:pass61:netcode']).not.toContain('run-with-preview-server.mjs');
    for (const marker of [
      "'status', '--porcelain', '--untracked-files=all'",
      'VITE_MATCH_BUILD_ID: sourceSha',
      "SOURCE_SHA: sourceSha",
      "RELEASE_DIST_ROOT: temporaryDist",
      "RELEASE_TOPOLOGY_RECEIPT_PATH: topologyReceiptPath",
      "assertStagedTopology(topology, sourceSha, releasePass)",
      "assertOwnedBrowserVerifierReceipt(receipt",
      "Refusing stale or unowned listener on PeerJS port",
      "'support-operate-prompt': Object.freeze",
      "'pass61-netcode': Object.freeze",
      "'multiplayer-stability': Object.freeze",
      'sourceState =',
      'assertSupportPromptEvidenceFiles(receipt)',
    ]) expect(runner).toContain(marker);
  });

  it('binds the nine-test stability matrix to five wrapper-owned tokenized peer identities', () => {
    expect(multiplayerStability).toContain("PASS66_HOST_RECOVERY_PEER_PATH");
    expect(multiplayerStability).toContain("PASS66_OWNER_FEEDBACK_PEER_PATH");
    expect(multiplayerStability).toContain("PASS66_TIMED_WEAPONS_PEER_PATH");
    expect(multiplayerStability).toContain("PASS66_QODER_AUTHORITY_PEER_PATH");
    expect(multiplayerStability).toContain("PASS66_ADRENALINE_PEER_PATH");
    expect(multiplayerStability).toContain("path: `/peerjs-${randomBytes(12).toString('hex')}`");
    expect(multiplayerStability).toContain('servedCandidateAfter');
    expect(multiplayerStability).toContain('ownedPeerServers');
  });

  it('binds both browser receipts to served candidate provenance', () => {
    for (const source of [firefox, privateLobby]) {
      expect(source).toContain("new URL('channel-provenance.json', baseUrl)");
      expect(source).toContain('PASS66_OWNED_RECEIPT_PATH');
      expect(source).toContain('expectedSourceSha');
      expect(source).toContain('expectedTreeSha256');
      expect(source).toContain('expectedFileCount');
    }
    expect(firefox).toContain('value.sourceSha !== expectedSourceSha');
    expect(firefox).toContain('value.treeSha256 !== expectedTreeSha256');
    expect(privateLobby).toContain('servedCandidate.sourceSha !== expectedSourceSha');
    expect(privateLobby).toContain('servedCandidate.treeSha256 !== expectedTreeSha256');
  });

  it('uses the real runtime backend field and tokenized owned PeerJS path', () => {
    expect(firefox).toContain('state.render?.runtime?.actualBackend ?? null');
    expect(firefox).toContain('const url = new URL(baseUrl)');
    expect(firefox).not.toContain("new URL('/', baseUrl)");
    expect(firefox).toContain("active.backend !== 'webgl2'");
    expect(firefox).not.toContain('state.render?.backend ?? null');
    expect(privateLobby).toContain("url.searchParams.set('peerQaPath', peerPath)");
    expect(privateLobby).toContain("schema: 'atomic-acres/pass66-private-lobby@2'");
    expect(privateLobby).not.toContain("path', '/peerjs'");
    expect(authoritativeNetcode).toContain("url.searchParams.set('peerQaPath', peerPath)");
    expect(authoritativeNetcode).toContain("schema: 'atomic-acres/pass61-authoritative-netcode@1'");
  });

  it('freezes the renderer and binds both single-surface support actions to the served candidate', () => {
    expect(supportPromptRunner).toContain("QA_EXTERNAL_PREVIEW: '1'");
    expect(supportPromptRunner).toContain('tests/e2e/pass66-support-operate-prompt.spec.ts');
    expect(supportPromptSpec).toContain('debug.setRenderPaused(true)');
    expect(supportPromptSpec).toContain('hiddenBackgroundDriftPixelCount');
    expect(supportPromptSpec).toContain('paused compositor drift remains negligible');
    expect(supportPromptSpec).toContain('hiddenBackgroundDriftPixelCount * 50');
    expect(supportPromptSpec).toContain("id: 'chopper', slot: 4");
    expect(supportPromptSpec).toContain("id: 'piloted-drone', slot: 2");
    expect(supportPromptSpec).toContain("label: '960x540'");
    expect(supportPromptSpec).toContain('action contained on bottom');
    expect(supportPromptSpec).toContain("legacyStandalonePromptCount");
    expect(supportPromptSpec).toContain("toHaveCount(0)");
    expect(supportPromptSpec).toContain("new URL('channel-provenance.json', window.location.href)");
    expect(supportPromptSpec).toContain('PASS66_OWNED_RECEIPT_PATH');
  });
});
