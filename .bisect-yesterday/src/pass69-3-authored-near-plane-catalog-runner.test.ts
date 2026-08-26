import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WEAPON_IDS } from './protocol';

describe('Pass 69.3 real-authored near-plane evidence boundary', () => {
  it('owns separate clean-SHA installed-Edge WebGL2 and native-WebGPU lanes', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };
    const runner = readFileSync('scripts/qa/run-pass69-3-authored-near-plane-catalog.mjs', 'utf8');

    expect(packageJson.scripts['qa:pass69-3:near-plane:edge-webgl2'])
      .toBe('node scripts/qa/run-pass69-3-authored-near-plane-catalog.mjs edge-webgl2');
    expect(packageJson.scripts['qa:pass69-3:near-plane:edge-webgpu'])
      .toBe('node scripts/qa/run-pass69-3-authored-near-plane-catalog.mjs edge-webgpu');
    expect(packageJson.scripts['qa:pass69-3:near-plane'])
      .toBe('npm run qa:pass69-3:near-plane:edge-webgl2 && npm run qa:pass69-3:near-plane:edge-webgpu');
    for (const token of [
      "'edge-webgl2': Object.freeze({ renderer: 'webgl2'",
      "'edge-webgpu': Object.freeze({ renderer: 'webgpu'",
      "['status', '--porcelain', '--untracked-files=all']",
      'run-playwright-with-topology.mjs',
      "QA_INSTALLED_EDGE: '1'",
      'PASS69_3_NEAR_PLANE_SOURCE_SHA: sourceSha',
      'PASS69_3_NEAR_PLANE_TARGET: targetName',
      "!key.toUpperCase().startsWith('VITE_')",
      'runtime.softwareAdapter === false',
      'runtime.actualBackend === target.renderer',
      'receipt.schemaVersion !== 3',
      "receipt.contract !== 'atomic-acres/pass69-3-authored-near-plane-catalog@3'",
      "receipt.evidenceScope !== 'maximum-contact-hip-settled-ads-fire-kick-reload-near-plane-clearance'",
      'endingSha !== sourceSha || sourceStatus()',
    ]) expect(runner).toContain(token);
  });

  it('covers the complete canonical weapon catalog with independent exact retreat expectations', () => {
    const spec = readFileSync('tests/e2e/pass69-3-authored-near-plane-catalog.spec.ts', 'utf8');
    const runner = readFileSync('scripts/qa/run-pass69-3-authored-near-plane-catalog.mjs', 'utf8');
    expect(WEAPON_IDS).toHaveLength(21);
    expect(spec).toContain('satisfies Readonly<Record<WeaponId, number>>');
    expect(spec).toContain("expect(Object.keys(EXPECTED_CONTACT_RETREAT).sort()).toEqual([...WEAPON_IDS].sort())");
    expect(spec).toContain('for (const [index, weapon] of WEAPON_IDS.entries())');
    expect(spec).toContain("lmg: 0.1");
    expect(spec).toContain("sniper: 0.14");
    expect(spec).toContain("'m14-ebr': 0.05");
    expect(spec).toContain('railgun: 0.1');
    expect(runner).toContain('receipt.weapons.length === expectedWeapons.length');
    expect(runner).toContain('receipt.catalog?.weaponCount !== expectedWeapons.length');
    expect(runner).toContain('JSON.stringify(receipt.catalog?.contactRetreatTable) !== JSON.stringify(expectedRetreats)');
  });

  it('requires real GLB identity and the unweakened camera.near plus 0.02 metre margin in every visible pose', () => {
    const spec = readFileSync('tests/e2e/pass69-3-authored-near-plane-catalog.spec.ts', 'utf8');
    for (const token of [
      "presentation.modelKind, `${label}: real authored model kind`).toBe('project-original-blender')",
      'presentation.weaponModelId, `${label}: exact authored design id`).toBe(expectedDesignId)',
      'presentation.importedModel, `${label}: exact live GLB telemetry`',
      "source: expectedAssetSource(weapon)",
      "socketContractReady: true",
      "presentation.armsSource, `${label}: authored two-chain arms`).toBe('authored-two-chain')",
      "contract: 'authored-glb-contact-retreat-2026-08-09-v1'",
      'cameraNear: 0.08',
      'requiredMargin: 0.02',
      'baseRetreat: 0.06',
      'maximumSurfaceRetreat: 0.28',
      'framing.nearestDepth, `${label}: ${kind} clears camera.near + 0.02`).toBeGreaterThanOrEqual(requiredDepth)',
    ]) expect(spec).toContain(token);
  });

  it('samples dense fire kick and reload arcs while treating fullscreen optics as hierarchy-suppressed', () => {
    const spec = readFileSync('tests/e2e/pass69-3-authored-near-plane-catalog.spec.ts', 'utf8');
    const runner = readFileSync('scripts/qa/run-pass69-3-authored-near-plane-catalog.mjs', 'utf8');
    expect(spec).toContain('[0, 4, 8, 12, 16, 24, 36, 52, 78, 105, 150, 225, 310]');
    expect(spec).toContain('[0.08, 0.22, 0.38, 0.52, 0.68, 0.84]');
    expect(spec).toContain('function expectedFireCycle(weapon: WeaponId, ageMs: number)');
    expect(spec).toContain('fireState.weaponPresentation.fireCycle.boltTravel');
    expect(spec).toContain('expectedFireCycle: expectedCycle');
    expect(spec).toContain("const FULLSCREEN_OPTIC_WEAPONS = new Set<WeaponId>(['sniper', 'm14-ebr'])");
    expect(spec).toContain('state.sniperScope.viewmodelVisible, `${label}: hierarchy-suppressed viewmodel is not misclassified as visible`).toBe(false)');
    expect(spec).toContain('state.dmrThermal.active, `${label}: M14 fullscreen thermal optic owns the frame`).toBe(true)');
    expect(spec).toContain("contract: 'retained-structural-lights-fullscreen-suppression-v1'");
    expect(spec).toContain("['first-person-muzzle-light', 'first-person-viewmodel-fill']");
    expect(spec).toContain('rootVisible: true');
    expect(spec).toContain('structuralLightCount: 2');
    expect(runner).toContain("sample.effectiveViewmodelVisible === false");
    expect(runner).toContain('structuralSuppressionValid(sample.fullscreenSuppression, true)');
    expect(runner).toContain("visiblePoseValid(sample, weapon, 'fire-kick', expectedFireAges[sampleIndex])");
    expect(runner).toContain('fireCycleValid(sample, weapon, expectedFireAges[sampleIndex])');
    expect(runner).toContain("visiblePoseValid(sample, weapon, 'reload', expectedReloadProgress[sampleIndex])");
  });

  it('rejects inherited or unconverged transforms before every measured pose', () => {
    const spec = readFileSync('tests/e2e/pass69-3-authored-near-plane-catalog.spec.ts', 'utf8');
    const runner = readFileSync('scripts/qa/run-pass69-3-authored-near-plane-catalog.mjs', 'utf8');
    for (const token of [
      "contract: 'consecutive-presented-transform-and-depth-v1'",
      'requiredStableTransitions: 8',
      'minimumStableElapsedMs: 50',
      'maximumPositionDelta: 0.0005',
      'maximumRotationDelta: 0.0005',
      'maximumDepthDelta: 0.0005',
      'frame === previous.frame + 1',
      'presentation.viewmodelViewport?.rootRotation',
      'waitForPoseConvergence(page',
    ]) expect(spec).toContain(token);
    expect(runner).toContain('convergence.endedPresentedFrame - convergence.startedPresentedFrame === convergence.stableTransitions');
    expect(runner).toContain('convergence.maximumPositionDelta <= 0.0005');
    expect(runner).toContain('convergence.maximumRotationDelta <= 0.0005');
    expect(runner).toContain('convergence.maximumDepthDelta <= 0.0005');
  });

  it('binds maximum-contact evidence to the stable grounded west-wall prone pose', () => {
    const spec = readFileSync('tests/e2e/pass69-3-authored-near-plane-catalog.spec.ts', 'utf8');
    const runner = readFileSync('scripts/qa/run-pass69-3-authored-near-plane-catalog.mjs', 'utf8');
    for (const token of [
      "contract: 'gun-range-west-wall-prone-pose-v2'",
      'teleportPosition: Object.freeze([-19.65, 1.7, -14.5] as const)',
      'settledPosition: Object.freeze([-19.6465, 0.6363, -14.5] as const)',
      'maximumPositionAxisError: 0.005',
      'maximumAngularError: 0.000001',
      "contract: 'consecutive-presented-contact-fixture-v1'",
      'requiredStableTransitions: 8',
      'minimumStableElapsedMs: 50',
      'maximumSurfaceRetreatDelta: 0.0005',
      'maximumSurfaceLiftDelta: 0.0005',
      "state.matchPhase === 'active'",
      'frame === previous.frame + 1',
      'state.player.yaw - fixture.yaw',
      'state.player.pitch - fixture.pitch',
      "contract: 'saturated-viewmodel-surface-retreat-v1'",
      "return stageStableContactFixture(page, 'initial-deploy')",
      'const fixtureConvergence = await stageStableContactFixture(page, `${afterWeapon}->${nextWeapon}`)',
    ]) expect(spec).toContain(token);
    expect(runner).toContain('function contactFixtureValid(contact)');
    expect(runner).toContain('function contactFixtureConvergenceValid(convergence, expectedLabel)');
    expect(runner).toContain('settledPosition: Object.freeze([-19.6465, 0.6363, -14.5])');
    expect(runner).toContain('maximumPositionAxisError: 0.005');
    expect(runner).toContain('convergence.endedPresentedFrame - convergence.startedPresentedFrame === convergence.stableTransitions');
    expect(runner).toContain("requirements?.matchPhase === 'active'");
    expect(runner).toContain('observed.surfaceRetreat >= observed.maximumSurfaceRetreat');
    expect(runner).toContain('contactFixtureConvergenceValid(contact.convergence, \'initial-deploy\')');
    expect(runner).toContain('maximumPositionAxisError <= expectedContactFixture.maximumPositionAxisError');
    expect(runner).toContain('yawError <= expectedContactFixture.maximumAngularError');
    expect(runner).toContain('pitchError <= expectedContactFixture.maximumAngularError');
    expect(runner).toContain('!contactFixtureValid(receipt.contactFixture)');
    const stageStart = spec.indexOf('async function stageStableContactFixture(');
    const stageEnd = spec.indexOf('async function deploy(', stageStart);
    expect(stageStart).toBeGreaterThan(-1);
    expect(stageEnd).toBeGreaterThan(stageStart);
    const stage = spec.slice(stageStart, stageEnd);
    expect(stage.indexOf('api.setStance(fixture.stance);'))
      .toBeLessThan(stage.indexOf('api.teleportPlayer(...fixture.teleportPosition, fixture.yaw, fixture.pitch);'));
  });

  it('keeps the long catalog inside the production Gun Range round lifecycle without weakening convergence', () => {
    const spec = readFileSync('tests/e2e/pass69-3-authored-near-plane-catalog.spec.ts', 'utf8');
    const runner = readFileSync('scripts/qa/run-pass69-3-authored-near-plane-catalog.mjs', 'utf8');
    for (const token of [
      "contract: 'gun-range-production-rematch-round-refresh-v1'",
      'api.rematch();',
      'expect(roundBefore.playerAlive, `${afterWeapon}: player is alive before production rematch`).toBe(true)',
      'state.killstreak.matchEpoch > previous.matchEpoch',
      'roundBefore.matchEpoch + 1',
      'roundBefore.playerContinuity + 1',
      'timerAfterSeconds, `${afterWeapon}: production rematch advances the visible deadline`).toBeGreaterThan(timerBeforeSeconds)',
      'roundContinuity.push(await rematchGunRangeRoundAndRestoreContact(page, weapon, nextWeapon))',
      'refreshCount: roundContinuity.length',
    ]) expect(spec).toContain(token);
    expect(runner).toContain('function roundContinuityValid(continuity)');
    expect(runner).toContain('continuity.refreshCount !== expectedWeapons.length - 1');
    expect(runner).toContain('entry.timerAfter.seconds > entry.timerBefore.seconds');
    expect(runner).toContain('before?.playerAlive === true');
    expect(runner).toContain('after?.playerAlive === true');
    expect(runner).toContain('after.matchEpoch === before.matchEpoch + 1');
    expect(runner).toContain('after.playerContinuity === before.playerContinuity + 1');
    expect(runner).toContain('returnedFixtureValid(entry.returnedFixture, `${entry.afterWeapon}->${entry.nextWeapon}`)');
    expect(runner).toContain('!roundContinuityValid(receipt.roundContinuity)');
    expect(spec).toContain('requiredStableTransitions: 8');
    expect(spec).toContain('maximumDepthDelta: 0.0005');
  });
});
