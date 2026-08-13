import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PASS71_HF300_DRONE_THERMAL_COVERAGE,
  PASS71_HF300_DRONE_THERMAL_EVIDENCE_REGISTRY_ENTRY,
  PASS71_HF300_DRONE_THERMAL_SCOPES,
} from '../scripts/qa/pass71-hf300-drone-thermal-evidence-contract.mjs';

const source = (path: string) => readFileSync(path, 'utf8');

describe('Pass 71 HF-300 piloted-drone exact thermal evidence integration', () => {
  it('retains host sensor authority and routes only admitted contacts to the shared exact-rig renderer', () => {
    const authority = source('src/killstreak-runtime.ts');
    const integration = source('src/legacy-main.ts');
    const presentation = source('src/thermal-ghost-presentation.ts');

    for (const token of [
      "owner.possession?.kind !== 'piloted-drone'",
      'this.sortedHostileTargets(world, owner.actorId, owner.team)',
      'range > PILOTED_DRONE_SENSOR_PROFILE.maximumRangeM',
      'target.lifeId',
      "relation: 'hostile' as const",
      'if (contacts.length === 16) break',
      'sensorEntity.sensorContacts.map',
    ]) expect(authority).toContain(token);

    for (const token of [
      "const pilotedDroneThermal = possessionKind === 'piloted-drone'",
      'new Set(killstreakSnapshot.sensorContacts.map',
      'if (pilotedDroneContactKeys && !pilotedDroneContactKeys.has',
      'contact?.solidOccluded ?? true',
      'thermalGhostPresentation.sync(targets, true)',
      'updateThermalGhosts();',
    ]) expect(integration).toContain(token);

    for (const token of [
      "THERMAL_GHOST_PRESENTATION_CONTRACT = 'occlusion-conditioned-single-exact-animated-thermal-operator-v2'",
      "name: 'through-wall-single-thermal-body'",
      'depthTest: false',
      'depthWrite: false',
      'mesh.bind(source.skeleton, source.bindMatrix)',
      'model.geometry === layer.source.geometry',
      'model.skeleton === layer.source.skeleton',
      'model.material === this.sharedThermalMaterial',
      'treatmentsPerTarget: this.activeTargets > 0 ? 1 : 0',
      'proxyMeshes: 0',
      'maxOwnedMaterials: THERMAL_GHOST_MAX_OWNED_MATERIALS',
    ]) expect(presentation).toContain(token);
  });

  it('binds bot and remote-human LOS plus all cleanup phases to lossless fixed-camera proof', () => {
    const spec = source('tests/e2e/pass71-hf300-drone-thermal.spec.ts');
    for (const token of [
      "PASS71_HF300_TARGET_KIND === 'remote-human'",
      'stagePossessedPilotedDroneSensorTarget(hidden)',
      'teleportPlayer(x, y + 0.65, z, 0, 0)',
      'stageHostedBotAgainstRemote()',
      'placeBotRelative(9, -9)',
      "damageBotWithCause('gun')",
      'aimPossessedPilotedDroneAtTarget(id)',
      'togglePilotedDroneControl()',
      'forceRemoteDeathForReconnect(id)',
      "toHaveText('RETURN EVERYONE TO LOBBY')",
      'nextEpoch: state.killstreak.matchEpoch',
      "contract: 'hf300-same-capture-camera-pose-v2'",
      'setCaptureCameraPose(',
      'awaitCommittedCameraCompletion()',
      'executablePath: exactEdgeExecutable',
      'pass71Hf300PngEvidence',
      'pass71Hf300PngPairMetrics',
      "targetAliveAfter: deathAfterState.alive",
    ]) expect(spec).toContain(token);
  });

  it('owns four fresh staged installed-Edge process/profile boundaries and fails closed on renderer drift', () => {
    const runner = source('scripts/qa/run-pass71-hf300-drone-thermal-evidence.mjs');
    const playwrightConfig = source('playwright.config.ts');
    for (const token of [
      "git('status', '--porcelain', '--untracked-files=all')",
      "releaseChannels?.experimental?.pass !== 'PASS 71'",
      'assertInstalledEdgeExecutableIdentity',
      "QA_INSTALLED_EDGE: '1'",
      "VITE_MATCH_BUILD_ID: expectedSourceSha",
      "resolve(root, 'scripts/qa/run-playwright-with-topology.mjs')",
      "'--project=chromium', '--workers=1', '--retries=0'",
      'for (const identity of PASS71_HF300_DRONE_THERMAL_SCOPES)',
      'scope.browser.version !== executableIdentity.productVersion',
      'processIsolation: PASS71_HF300_DRONE_THERMAL_COVERAGE.processIsolation',
      'pass71Hf300ToolingHashesAtSource(root, expectedSourceSha)',
      'assertPass71Hf300Evidence(record',
    ]) expect(runner).toContain(token);
    expect(playwrightConfig).toContain('PASS71_HF300_EDGE_EXECUTABLE');
    expect(playwrightConfig).toContain('pass71Hf300EdgeExecutable');

    expect(PASS71_HF300_DRONE_THERMAL_SCOPES).toHaveLength(4);
    expect(PASS71_HF300_DRONE_THERMAL_COVERAGE).toMatchObject({
      arenaId: 'atomic-acres',
      renderProfile: 'blender',
      targetKinds: ['bot', 'remote-human'],
      modes: ['solo', 'hosted'],
      renderers: ['webgl2', 'webgpu'],
      phases: ['occluded', 'line-of-sight', 'exit', 'match-end', 'rematch', 'death'],
      browser: 'installed-authenticode-valid-microsoft-edge',
      runtime: 'native-hardware-webgl2-and-fail-closed-webgpu',
    });
    expect(PASS71_HF300_DRONE_THERMAL_EVIDENCE_REGISTRY_ENTRY.descriptor.minimumCount).toBe(0);
    expect(PASS71_HF300_DRONE_THERMAL_EVIDENCE_REGISTRY_ENTRY.closesFeedback).toBe(true);
  });

  it('exposes explicit contract and native runner scripts without touching global acceptance policy', () => {
    const packageJson = JSON.parse(source('package.json')) as { scripts: Record<string, string> };
    expect(packageJson.scripts['qa:pass71:hf300-drone-thermal:contract'])
      .toBe('node --test scripts/qa/pass71-hf300-drone-thermal-evidence-contract.test.mjs');
    expect(packageJson.scripts['qa:pass71:hf300-drone-thermal'])
      .toBe('npm run qa:pass71:hf300-drone-thermal:contract && node scripts/qa/run-pass71-hf300-drone-thermal-evidence.mjs');
  });
});
