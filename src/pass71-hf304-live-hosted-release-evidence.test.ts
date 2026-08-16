import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('HF-304 separate live hosted closing evidence lane', () => {
  const main = source('src/legacy-main.ts');
  const oldContract = source('scripts/qa/pass71-hf304-glass-evidence-contract.mjs');
  const contract = source('scripts/qa/pass71-hf304-live-hosted-evidence-contract.mjs');
  const contractTypes = source('scripts/qa/pass71-hf304-live-hosted-evidence-contract.d.mts');
  const spec = source('tests/e2e/pass71-hf304-live-hosted.spec.ts');
  const runner = source('scripts/qa/run-pass71-hf304-live-hosted-evidence.mjs');
  const playwright = source('playwright.config.ts');
  const packageJson = JSON.parse(source('package.json')) as { scripts: Record<string, string> };

  it('keeps the former full mechanical component explicitly non-closing', () => {
    expect(oldContract).toContain("kind: 'pass71-hf304-glass-full-mechanical-component'");
    expect(oldContract).toContain('closesFeedback: false');
    expect(oldContract).toContain('closingAuthority: false');
    expect(contract).not.toContain("kind: 'pass71-hf304-glass-full-mechanical-component'");
  });

  it('exports a separate exact-one closing descriptor and registry validator', () => {
    expect(contract).toContain("kind: 'pass71-hf304-live-hosted-native'");
    expect(contract).toContain("contract: 'atomic-acres/pass71-hf304-live-hosted-native@1'");
    expect(contract).toContain('closesFeedback: true');
    expect(contract).toContain('closingAuthority: true');
    expect(contract).toContain("ownerSubjectiveApproval: 'not-claimed'");
    expect(contract).toContain('maximumCount: 1');
    expect(contract).toContain('createPass71Hf304LiveHostedEvidenceRegistryEntry');
    expect(contractTypes).toContain('Pass71Hf304LiveHostedEvidenceDescriptor');
  });

  it('owns the literal four-scope 1,920-cell, 144-trail, embedded-PNG schema', () => {
    for (const scope of ['quality/webgl2', 'performance/webgl2', 'quality/webgpu', 'performance/webgpu']) {
      expect(contract).toContain(`id: '${scope}'`);
    }
    expect(contract).toContain('PASS71_HF304_LIVE_HOSTED_TOTAL_CELL_COUNT = 1_920');
    expect(contract).toContain('PASS71_HF304_LIVE_HOSTED_TOTAL_CRACK_CONTROLS = 96');
    expect(contract).toContain('PASS71_HF304_LIVE_HOSTED_TOTAL_DEBRIS_TRAILS = 144');
    expect(contract).toContain('PASS71_HF304_LIVE_HOSTED_VISUALS_PER_SCOPE = 4');
    expect(contract).toContain('PASS71_HF304_LIVE_HOSTED_VISUAL_WIDTH = 192');
    expect(contract).toContain('PASS71_HF304_LIVE_HOSTED_VISUAL_HEIGHT = 144');
    expect(contract).toContain('PASS71_HF304_LIVE_HOSTED_MAX_VISUAL_BYTES = 104 * 1_024');
    expect(contract).toContain('PASS71_HF304_LIVE_HOSTED_MAX_RECORD_BYTES = 12 * 1_024 * 1_024');
    expect(contract).toContain("Buffer.byteLength(JSON.stringify(record, null, 2), 'utf8')");
    expect(contract).toContain("failures.push('record:encoded-byte-cap')");
    expect(contract).toContain('pass71Hf304LiveHostedToolingHashesAtSource');
    expect(contract).toContain('pass71Hf304LiveHostedRecordSha256');
  });

  it('routes page-side batching through real private runtime owners and ledgers', () => {
    expect(main).toContain("contract: 'hf304-live-private-runtime-prepare-v1'");
    expect(main).toContain("contract: 'hf304-live-private-runtime-authority-v1'");
    expect(main).toContain("contract: 'hf304-live-private-runtime-observation-v1'");
    expect(main).toContain("contract: 'hf304-live-private-runtime-crack-v1'");
    expect(main).toContain('probeHf304GlassEvidenceCrack');
    expect(main).toContain('damageQ: GLASS_CRACK_DAMAGE_Q');
    expect(main).toContain('weaponGlassBreakPolicy(weapon)');
    expect(main).toContain('actions.set(actionNonce, {');
    expect(main).toContain('network.send(shot);');
    expect(main).toContain('const accepted = breakHouseWindow(');
    expect(main).toContain('canonicalHostWindowBreak(untrustedMessage, performance.now())');
    expect(main).toContain('if (canonicalMessage) network.send(canonicalMessage);');
    expect(main).toContain('currentAdmittedShotAction(hostId, actionNonce)');
    expect(main).toContain('processedNonces.has(windowEventNonce)');
    expect(main).toContain("message.weapon === 'railgun'");
    expect(main).toContain('const admission = admitRemoteShot(message, remoteSender?.snapshot, performance.now(), prior);');
    expect(main).toContain('if (localMultiplayerQa) {');
  });

  it('uses an owned two-peer topology rather than a simulated guest projection', () => {
    expect(spec).toContain('startOwnedPeerServer(peerPort)');
    expect(spec).toContain("await host.locator('#host').click()");
    expect(spec).toContain("await guest.locator('#join').click()");
    expect(spec).toContain('prepareHf304GlassEvidenceCell');
    expect(spec).toContain('authorHf304GlassEvidenceCell');
    expect(spec).toContain('sampleHf304GlassEvidenceCell');
    expect(spec).toContain('waitForGuestHostState');
    expect(spec).toContain('waitForGuestGlass');
    expect(spec).toContain('host/guest native renderer identity diverged');
    expect(spec).toContain("crackControls.push(...await runCrackControls('solo'");
    expect(spec).toContain("crackControls.push(...await runCrackControls('hosted'");
    expect(spec).toContain('guestLedgerCurrent');
    expect(spec).toContain('guestProcessed');
    expect(spec).toContain('guestActionIdentity');
    expect(spec).toContain('guestWindowEventIdentity');
    expect(spec).toContain('rememberedImpactIds: pane.state.rememberedImpactIds');
    expect(contract).toContain('durablePaneState(cell?.authority?.hostAfter?.state)');
    expect(contract).toContain('cell.authority.localMutationTicks.guest !== cell?.authority?.guestAfter?.state?.lastMutationTick');
    expect(spec).not.toContain("from '../../src/glass-authority'");
    expect(spec).not.toContain('admitGlassImpact(');
    expect(spec).not.toContain('createGlassState(');
  });

  it('proves collider retirement plus bounded fall, settle and retirement on both peers', () => {
    expect(spec).toContain("motionOwner: first.physical && first.physicsActive ? 'rapier-major-body' : 'bounded-presentation-fall'");
    expect(spec).toContain('current.position[1] <= first.position[1] - 0.025');
    expect(spec).toContain('Math.abs(entry.position[1] - entry.support.restY) <= 0.04');
    expect(spec).toContain('snapshot.debris.length === 0');
    expect(spec).toContain('snapshot.pool.activePhysics <= 2');
    expect(spec).toContain('snapshot.rapierMajorBodies <= 18');
    expect(spec).toContain('colliderRetired: true');
    expect(spec).toContain('duplicateDebris: false');
  });

  it('embeds bounded lossless representative crops attributable to intact and breached states', () => {
    expect(spec).toContain("type: 'png', animations: 'disabled'");
    expect(spec).toContain('PASS71_HF304_LIVE_HOSTED_VISUAL_WIDTH) / 2');
    expect(spec).toContain("dataUrl: `data:image/png;base64,${bytes.toString('base64')}`");
    expect(spec).toContain("visuals.push(await captureVisual(solo, 'solo', 'intact'");
    expect(spec).toContain("visuals.push(await captureVisual(solo, 'solo', 'breached'");
    expect(spec).toContain("visuals.push(await captureVisual(guest, 'hosted', 'intact'");
    expect(spec).toContain("visuals.push(await captureVisual(guest, 'hosted', 'breached'");
  });

  it('runs each scope in a fresh clean signed installed-Edge owner', () => {
    expect(runner).toContain('checkoutSourceSha !== expectedSourceSha || !clean()');
    expect(runner).toContain("args.machine !== 'dave-gaming-pc'");
    expect(runner).toContain("sha256(Buffer.from(hostname().toLowerCase(), 'utf8'))");
    expect(runner).toContain('hostnameSha256 !== PASS71_HF304_LIVE_HOSTED_MACHINE_HOSTNAME_SHA256');
    expect(runner).toContain('environment: { machine: args.machine, hostnameSha256');
    expect(runner).toContain('assertInstalledEdgeExecutableIdentity(readWindowsExecutableIdentity(edgeExecutable))');
    expect(runner).toContain('for (const [index, scope] of PASS71_HF304_LIVE_HOSTED_SCOPES.entries())');
    expect(runner).toContain('PASS71_HF304_LIVE_HOSTED_SCOPE_ID: scope.id');
    expect(runner).toContain('PASS71_HF304_LIVE_HOSTED_PEER_PORT: String(peerPort)');
    expect(runner).toContain("PASS71_HF304_EDGE_EXECUTABLE: edgeExecutable");
    expect(runner).toContain("QA_INSTALLED_EDGE: '1'");
    expect(runner).toContain("processIsolation: 'fresh-owned-installed-edge-process-and-profile-per-scope'");
    expect(runner).toContain('embedded visual drifted from');
    expect(runner).toContain("'src/remote-shot-admission.test.ts'");
    expect(runner).toContain("'src/hosted-bot-glass-authority.test.ts'");
    expect(runner).toContain('assertPass71Hf304LiveHostedEvidence(record');
    expect(playwright).toContain('const pass71Hf304EdgeExecutable = process.env.PASS71_HF304_EDGE_EXECUTABLE;');
    expect(packageJson.scripts['qa:pass71:hf304-live-hosted:contract'])
      .toBe('node --test scripts/qa/pass71-hf304-live-hosted-evidence-contract.test.mjs');
    expect(packageJson.scripts['qa:pass71:hf304-live-hosted'])
      .toBe('npm run qa:pass71:hf304-live-hosted:contract && node scripts/qa/run-pass71-hf304-live-hosted-evidence.mjs');
  });
});
