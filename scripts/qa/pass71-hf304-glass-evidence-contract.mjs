import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const PASS71_HF304_GLASS_EVIDENCE = Object.freeze({
  schemaVersion: 1,
  evidenceId: 'HF-304',
  kind: 'pass71-hf304-glass-full-mechanical-component',
  contract: 'atomic-acres/pass71-hf304-glass-full-mechanical-component@1',
  feedbackId: 'HF-304',
  status: 'passed',
  coverageDisposition: 'full-cartesian-mechanical-and-served-solo-runtime-non-closing',
  closesFeedback: false,
  closingAuthority: false,
});

export const PASS71_HF304_GLASS_EVIDENCE_DESCRIPTOR = Object.freeze({
  evidenceId: PASS71_HF304_GLASS_EVIDENCE.evidenceId,
  kind: PASS71_HF304_GLASS_EVIDENCE.kind,
  minimumCount: 0,
  maximumCount: 1,
});

export const PASS71_HF304_WEAPONS = Object.freeze([
  'carbine', 'smg', 'lmg', 'scattergun', 'sniper', 'railgun', 'pistol', 'magnum',
  'machine-pistol', 'mini-uzi', 'mp5', 'm4a1', 'ak-47', 'minigun', 'm14-ebr',
  'slug-shotgun', 'flashlight-pistol', 'explosive-crossbow', 'flamethrower', 'flare-gun',
]);

export const PASS71_HF304_WEAPON_FIRE_KINDS = Object.freeze([
  'hitscan', 'hitscan', 'hitscan', 'pellet', 'hitscan', 'hitscan', 'hitscan', 'hitscan',
  'hitscan', 'hitscan', 'hitscan', 'hitscan', 'hitscan', 'hitscan', 'hitscan', 'slug',
  'hitscan', 'projectile', 'hitscan', 'projectile',
]);

export const PASS71_HF304_ARENAS = Object.freeze([
  Object.freeze({
    id: 'atomic-acres',
    paneIds: Object.freeze([
      'aqua-irrigation-workshop:rear-ground-window-glass',
      'aqua-irrigation-workshop:ground-window-glass',
      'aqua-irrigation-workshop:upper-window-glass',
      'coral-orchard-conservatory:rear-ground-window-glass',
      'coral-orchard-conservatory:ground-window-glass',
      'coral-orchard-conservatory:upper-window-glass',
    ]),
  }),
  Object.freeze({ id: 'rustworks-1v1', paneIds: Object.freeze([]) }),
  Object.freeze({ id: 'gun-range', paneIds: Object.freeze([]) }),
  Object.freeze({
    id: 'skyline-terminal',
    paneIds: Object.freeze([
      'skyline-window--22', 'skyline-window--14', 'skyline-window--6',
      'skyline-window-6', 'skyline-window-14', 'skyline-window-22',
    ]),
  }),
]);

export const PASS71_HF304_PANES = Object.freeze(PASS71_HF304_ARENAS.flatMap((arena) => (
  arena.paneIds.map((paneId) => Object.freeze({ arenaId: arena.id, paneId }))
)));

export const PASS71_HF304_MODES = Object.freeze(['solo', 'hosted']);

export const PASS71_HF304_DEBRIS_SAMPLE_INPUTS = Object.freeze([
  Object.freeze({ ageMs: 0, positionY: 2, restY: 0, physicsActive: true, sleeping: false, receivedPhysicsPose: false, noProgressMs: 0, fallbackSettled: false }),
  Object.freeze({ ageMs: 240, positionY: 1.7, restY: 0, physicsActive: true, sleeping: false, receivedPhysicsPose: true, noProgressMs: 0, fallbackSettled: false }),
  Object.freeze({ ageMs: 1_800, positionY: 1.2, restY: 0, physicsActive: true, sleeping: false, receivedPhysicsPose: true, noProgressMs: 450, fallbackSettled: false }),
  Object.freeze({ ageMs: 2_600, positionY: 0, restY: 0, physicsActive: false, sleeping: false, receivedPhysicsPose: false, noProgressMs: 0, fallbackSettled: true }),
  Object.freeze({ ageMs: 4_500, positionY: 0, restY: 0, physicsActive: false, sleeping: false, receivedPhysicsPose: false, noProgressMs: 0, fallbackSettled: true }),
]);

export const PASS71_HF304_DEBRIS_SAMPLE_MODES = Object.freeze([
  'physics-active', 'physics-active', 'presentation-fall', 'settled', 'expired',
]);

export const PASS71_HF304_BROWSER_CASES = Object.freeze([
  ...['quality', 'performance'].flatMap((profile) => (
    ['bullet', 'knife', 'grenade', 'flare-gun', 'explosive-crossbow'].map((path) => `${profile}/${path}`)
  )),
]);

export const PASS71_HF304_COVERAGE = Object.freeze({
  authoredArenaCount: 4,
  authoredBreakablePaneCount: 12,
  canonicalWeaponCount: 20,
  authorityModes: PASS71_HF304_MODES,
  fullCartesianCellCount: 480,
  hostedLayer: 'mechanical-guest-host-client-protocol-simulation-and-authorized-replica-convergence',
  colliderBallisticsLayer: 'one-glass-authority-projection',
  debrisLayer: 'per-pane-authority-mode-factorization-plus-served-distinct-path-runtime',
  debrisLifecycleCount: 24,
  debrisLifecycle: Object.freeze(['physics-active', 'presentation-fall', 'settled', 'expired']),
  servedRuntimeProfiles: Object.freeze(['quality', 'performance']),
  servedRuntimeRenderer: 'webgl2',
  servedRuntimeDistinctPaths: Object.freeze(['bullet', 'knife', 'grenade', 'flare-gun', 'explosive-crossbow']),
  servedRuntimeCaseCount: 10,
  servedRuntimeAuthorityMode: 'solo',
  liveTwoPeerHostedBrowserObserved: false,
  ownerSubjectiveInspectionPerformed: false,
});

export const PASS71_HF304_UNKNOWNS = Object.freeze([
  'live-two-peer-hosted-browser-topology-not-observed',
  'non-projectile-private-runtime-spatial-action-ledgers-not-executed-by-cartesian-capture',
  'owner-subjective-inspection-not-performed',
]);

export const PASS71_HF304_MACHINE_HOSTNAME_SHA256 = createHash('sha256')
  .update('desktop-vi3cr5q', 'utf8')
  .digest('hex');

export const PASS71_HF304_TOOL_PATHS = Object.freeze({
  runner: 'scripts/qa/run-pass71-hf304-glass-evidence.mjs',
  contract: 'scripts/qa/pass71-hf304-glass-evidence-contract.mjs',
  contractTest: 'scripts/qa/pass71-hf304-glass-evidence-contract.test.mjs',
  contractTypes: 'scripts/qa/pass71-hf304-glass-evidence-contract.d.mts',
  matrixCapture: 'scripts/qa/capture-pass71-hf304-glass-matrix.ts',
  browserSpec: 'tests/e2e/pass71-glass-lifecycle-matrix.spec.ts',
  weaponCatalog: 'src/combat/weapon-catalog.ts',
  glassWeaponPolicy: 'src/weapon-glass-break-policy.ts',
  glassAuthority: 'src/glass-authority.ts',
  projectileAdmission: 'src/projectile-glass-break-admission.ts',
  hostedBotAdmission: 'src/hosted-bot-glass-authority.ts',
  debrisLifecycle: 'src/window-glass-debris-presentation.ts',
  physics: 'src/physics.ts',
  majorDebrisBudget: 'src/major-debris-budget.ts',
  atomicMap: 'src/map.ts',
  additionalMaps: 'src/additional-maps.ts',
  mapSelection: 'src/map-selection.ts',
  runtime: 'src/legacy-main.ts',
  protocol: 'src/protocol.ts',
  playwrightConfig: 'playwright.config.ts',
  topologyRunner: 'scripts/qa/run-playwright-with-topology.mjs',
  topologyStager: 'scripts/release/stage-release-topology.mjs',
  edgeIdentity: 'scripts/qa/pass71-edge-executable-identity.mjs',
  releaseChannels: 'release-channels.json',
  viteConfig: 'vite.config.ts',
  packageManifest: 'package.json',
  packageLock: 'package-lock.json',
  lockVerifier: 'scripts/qa/verify-npm10-lockfile.mjs',
});

const RUNTIME_FRAGMENTS = Object.freeze([
  'const glassBreakPolicy = weaponGlassBreakPolicy(player.weapon);',
  'const result = admitGlassImpact(state, {',
  'const projection = glassAuthorityProjection(result.state);',
  '? glassAuthorityProjection(pane.glassState).movementSolid',
  'pane.glassState ? glassAuthorityProjection(pane.glassState).apertureOpen : pane.broken',
  'spawnPersistentWindowDebris(window, normal);',
  'scheduleWindowGlassPhysicsSync();',
  'hostedBotBallisticGlassActions.admit({',
  'admitProjectileGlassBreak({',
  'entry.fallbackVelocity.y -= 9.81 * fallbackDt;',
  'entry.root.position.addScaledVector(entry.fallbackVelocity, fallbackDt);',
  'entry.root.position.y = entry.fallbackRestY;',
  'persistentWindowDebris.delete(id);',
  'characterPhysics.prewarmMajorDebrisBodies(arena.breakableWindows.map((window) => {',
]);

const SHA40 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!object(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
}

function sameJson(left, right) {
  return JSON.stringify(canonicalValue(left)) === JSON.stringify(canonicalValue(right));
}

function canonicalSha256(value) {
  return createHash('sha256').update(`${JSON.stringify(canonicalValue(value))}\n`).digest('hex');
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function sha256Text(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function exactKeys(value, keys, label, failures) {
  if (!object(value) || !sameJson(Object.keys(value).sort(), [...keys].sort())) {
    failures.push(`${label}:schema-fields`);
    return false;
  }
  return true;
}

function isoTimestamp(value) {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value;
}

export function pass71Hf304CanonicalBytes(record) {
  if (!object(record)) throw new Error('Pass 71 HF-304 evidence must be an object');
  const unsigned = Object.fromEntries(Object.entries(record).filter(([key]) => key !== 'receiptSha256'));
  return Buffer.from(`${JSON.stringify(canonicalValue(unsigned))}\n`, 'utf8');
}

export function pass71Hf304RecordSha256(record) {
  return createHash('sha256').update(pass71Hf304CanonicalBytes(record)).digest('hex');
}

export function pass71Hf304ToolingHashes(repositoryRoot) {
  return Object.freeze(Object.fromEntries(Object.entries(PASS71_HF304_TOOL_PATHS).map(
    ([name, path]) => [`${name}Sha256`, sha256File(resolve(repositoryRoot, path))],
  )));
}

export function pass71Hf304ToolingHashesAtSource(repositoryRoot, sourceSha) {
  if (!SHA40.test(sourceSha ?? '')) throw new Error('Pass 71 HF-304 tooling source must be a full SHA');
  return Object.freeze(Object.fromEntries(Object.entries(PASS71_HF304_TOOL_PATHS).map(
    ([name, path]) => [`${name}Sha256`, createHash('sha256').update(execFileSync(
      'git', ['-C', repositoryRoot, 'show', `${sourceSha}:${path}`],
      { windowsHide: true, maxBuffer: 64 * 1024 * 1024 },
    )).digest('hex')],
  )));
}

export function pass71Hf304SourceTreeAtSource(repositoryRoot, sourceSha) {
  if (!SHA40.test(sourceSha ?? '')) throw new Error('Pass 71 HF-304 source tree requires a full SHA');
  return execFileSync('git', ['-C', repositoryRoot, 'rev-parse', `${sourceSha}^{tree}`], {
    encoding: 'utf8', windowsHide: true,
  }).trim();
}

function validateSource(source, expected, failures) {
  exactKeys(source, [
    'expectedSourceSha', 'checkoutSourceSha', 'endingCheckoutSourceSha', 'sourceTreeSha',
    'releasePass', 'cleanBefore', 'cleanAfter',
  ], 'source', failures);
  if (!object(source) || !SHA40.test(source.expectedSourceSha ?? '')
    || source.expectedSourceSha !== expected?.sourceSha
    || source.checkoutSourceSha !== expected?.sourceSha
    || source.endingCheckoutSourceSha !== expected?.sourceSha
    || !SHA40.test(source.sourceTreeSha ?? '') || source.sourceTreeSha !== expected?.sourceTreeSha
    || source.releasePass !== 'PASS 71' || source.cleanBefore !== true || source.cleanAfter !== true) {
    failures.push('exact-candidate-a-source');
  }
}

function validateServedCandidate(candidate, expected, failures, label = 'servedCandidate') {
  exactKeys(candidate, [
    'schemaVersion', 'channel', 'releasePass', 'sourceSha', 'path', 'exactRootFileCount', 'treeSha256',
  ], label, failures);
  if (!object(candidate) || candidate.schemaVersion !== 4 || candidate.channel !== 'the-big-one'
    || candidate.releasePass !== 'PASS 71' || candidate.sourceSha !== expected?.sourceSha
    || candidate.path !== 'channels/the-big-one'
    || !Number.isSafeInteger(candidate.exactRootFileCount) || candidate.exactRootFileCount < 2
    || !SHA256.test(candidate.treeSha256 ?? '')) failures.push(`${label}:provenance`);
}

function expectedPolicy(weapon) {
  return weapon === 'explosive-crossbow'
    ? { profile: 'explosion', timing: 'detonation', phase: 'detached' }
    : { profile: 'bullet', timing: 'impact', phase: 'breached' };
}

function validateMechanicalComponent(component, record, failures) {
  exactKeys(component, [
    'schemaVersion', 'contract', 'status', 'sourceSha', 'sourceTreeSha', 'releasePass',
    'catalog', 'catalogDigestSha256', 'matrix', 'matrixDigestSha256', 'debris',
    'debrisDigestSha256', 'runtimeIntegration', 'faults',
  ], 'mechanical', failures);
  const expectedCatalog = {
    arenas: PASS71_HF304_ARENAS,
    panes: PASS71_HF304_PANES,
    weapons: PASS71_HF304_WEAPONS,
    modes: PASS71_HF304_MODES,
  };
  if (!object(component) || component.schemaVersion !== 1
    || component.contract !== 'atomic-acres/pass71-hf304-glass-mechanical-component@1'
    || component.status !== 'PASS' || component.sourceSha !== record.source?.expectedSourceSha
    || component.sourceTreeSha !== record.source?.sourceTreeSha || component.releasePass !== 'PASS 71'
    || !sameJson(component.catalog, expectedCatalog)
    || component.catalogDigestSha256 !== canonicalSha256(expectedCatalog)) failures.push('mechanical:identity-or-catalog');
  if (!Array.isArray(component?.matrix) || component.matrix.length !== 480
    || component.matrixDigestSha256 !== canonicalSha256(component.matrix)) {
    failures.push('mechanical:matrix-count-or-digest');
  } else {
    let index = 0;
    for (const mode of PASS71_HF304_MODES) {
      for (const pane of PASS71_HF304_PANES) {
        for (const [weaponIndex, weaponId] of PASS71_HF304_WEAPONS.entries()) {
          const cell = component.matrix[index++];
          const policy = expectedPolicy(weaponId);
          const projection = {
            phase: policy.phase,
            paneVisible: false,
            crackOverlayVisible: false,
            apertureOpen: true,
            movementSolid: false,
            ballisticSolid: false,
            aiLineOfSightSolid: false,
          };
          const initialProjection = {
            phase: 'intact',
            paneVisible: true,
            crackOverlayVisible: false,
            apertureOpen: false,
            movementSolid: true,
            ballisticSolid: true,
            aiLineOfSightSolid: true,
          };
          const crackProjection = {
            phase: 'cracked',
            paneVisible: true,
            crackOverlayVisible: true,
            apertureOpen: false,
            movementSolid: true,
            ballisticSolid: true,
            aiLineOfSightSolid: true,
          };
          exactKeys(cell, [
            'id', 'mode', 'arenaId', 'paneId', 'weaponId', 'fireKind', 'policy',
            'authority', 'hostedEnvelope', 'debrisRequired', 'debrisLifecycleId',
          ], `mechanical:cell:${index - 1}`, failures);
          if (cell?.id !== `${mode}/${pane.arenaId}/${pane.paneId}/${weaponId}`
            || cell.mode !== mode || cell.arenaId !== pane.arenaId || cell.paneId !== pane.paneId
            || cell.weaponId !== weaponId || cell.fireKind !== PASS71_HF304_WEAPON_FIRE_KINDS[weaponIndex]
            || !sameJson(cell.policy, { profile: policy.profile, timing: policy.timing })
            || cell.debrisRequired !== true
            || cell.debrisLifecycleId !== `${mode}/${pane.arenaId}/${pane.paneId}`
            || !sameJson(cell.authority, {
              crackProbe: {
                hostAccepted: true,
                replicaAccepted: true,
                hostProjection: crackProjection,
                replicaProjection: crackProjection,
                stateEqual: true,
                projectionEqual: true,
              },
              hostAccepted: true,
              replicaAccepted: true,
              initialStateEqual: true,
              hostInitialProjection: initialProjection,
              replicaInitialProjection: initialProjection,
              hostPhase: policy.phase,
              replicaPhase: policy.phase,
              hostProjection: projection,
              replicaProjection: projection,
              stateEqual: true,
              projectionEqual: true,
            })) failures.push(`mechanical:cell:${index - 1}:authority`);
          const projectile = weaponId === 'explosive-crossbow' || weaponId === 'flare-gun';
          const expectedEnvelope = mode === 'hosted' ? {
            protocolVersion: 20,
            wireWeapon: projectile ? weaponId : null,
            actionNonce: projectile ? cell.hostedEnvelope?.actionNonce : null,
            hostAuthorityId: 'host-player',
            hostRequestDecoded: true,
            hostRequestUntrusted: true,
            forgedAuthorityStripped: true,
            canonicalized: true,
            clientDecoded: true,
            clientHostAuthority: true,
            wrongHostDetected: true,
            duplicateNonceDetected: true,
            projectileReceiverAdmission: projectile ? { accepted: true, reason: 'accepted' } : null,
          } : null;
          if (!sameJson(cell.hostedEnvelope, expectedEnvelope)
            || projectile && mode === 'hosted' && (!Number.isSafeInteger(cell.hostedEnvelope?.actionNonce)
              || cell.hostedEnvelope.actionNonce < 0)) failures.push(`mechanical:cell:${index - 1}:hosted-envelope`);
        }
      }
    }
  }
  if (!Array.isArray(component?.debris) || component.debris.length !== 24
    || component.debrisDigestSha256 !== canonicalSha256(component.debris)) {
    failures.push('mechanical:debris-count-or-digest');
  } else {
    let index = 0;
    for (const mode of PASS71_HF304_MODES) {
      for (const pane of PASS71_HF304_PANES) {
        const debris = component.debris[index++];
        const expectedLifecycle = PASS71_HF304_DEBRIS_SAMPLE_INPUTS.map((sample, sampleIndex) => ({
          ...sample, mode: PASS71_HF304_DEBRIS_SAMPLE_MODES[sampleIndex],
        }));
        if (debris?.id !== `${mode}/${pane.arenaId}/${pane.paneId}` || debris.mode !== mode
          || debris.arenaId !== pane.arenaId || debris.paneId !== pane.paneId
          || debris.persistentDebrisId !== `window-debris:${pane.paneId}`
          || !sameJson(debris.lifecycle, expectedLifecycle)
          || !sameJson(debris.bounds, {
            maximumPhysicsMs: 1_800,
            maximumLifetimeMs: 4_500,
            sharedBodyMaximum: 18,
            windowBodyMaximum: 2,
            overflowPolicy: 'bounded-presentation-fall',
          })) failures.push(`mechanical:debris:${index - 1}`);
      }
    }
  }
  exactKeys(component?.runtimeIntegration, ['sourcePath', 'sourceSha256', 'checks'], 'mechanical:runtime', failures);
  const expectedRuntimeChecks = RUNTIME_FRAGMENTS.map((fragment) => ({
    fragmentSha256: sha256Text(fragment), present: true,
  }));
  if (component?.runtimeIntegration?.sourcePath !== 'src/legacy-main.ts'
    || component.runtimeIntegration.sourceSha256 !== record.tooling?.runtimeSha256
    || !sameJson(component.runtimeIntegration.checks, expectedRuntimeChecks)) failures.push('mechanical:runtime-integration');
  if (!Array.isArray(component?.faults) || component.faults.length !== 0) failures.push('mechanical:faults');
}

function validateRetiredReceipt(receipt, label, failures, arenaId, expectedBrokenPaneIndexes) {
  const expectedPaneIds = PASS71_HF304_ARENAS.find((arena) => arena.id === arenaId)?.paneIds ?? [];
  const expectedBrokenIndexes = new Set(expectedBrokenPaneIndexes);
  if (!object(receipt) || !Array.isArray(receipt.panes) || receipt.panes.length !== 6
    || !sameJson(receipt.panes.map((pane) => pane?.id), expectedPaneIds)
    || receipt.panes.some((pane, index) => {
      const broken = expectedBrokenIndexes.has(index);
      return pane?.broken !== broken || pane?.apertureOpen !== broken
        || pane?.activeWorldColliderPresent !== !broken;
    })
    || receipt.pool?.retained !== 6 || receipt.pool.currentArenaRetained !== 6
    || receipt.pool.visibleRetained !== 0 || receipt.pool.active !== 0
    || receipt.pool.activePhysics !== 0 || receipt.pool.prewarmedPhysicsBodies !== 6
    || receipt.pool.lifecycle?.maxPhysicsMs !== 1_800
    || receipt.pool.lifecycle?.maxLifetimeMs !== 4_500
    || receipt.pool.lifecycle?.missingPrewarm !== 0
    || receipt.rapierMajorBodies !== 0
    || !Array.isArray(receipt.persistentWindowDebris)
    || receipt.persistentWindowDebris.length !== 0) failures.push(`${label}:retired-receipt`);
}

function finitePosition(value) {
  return Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
}

function validateLifecycleReceipt(lifecycle, label, failures) {
  const initial = lifecycle?.initial;
  const moving = lifecycle?.moving;
  const settled = lifecycle?.settled;
  const initialPosition = initial?.position;
  const movingPosition = moving?.position;
  const settledPosition = settled?.position;
  const displacement = finitePosition(initialPosition) && finitePosition(movingPosition)
    ? Math.hypot(...movingPosition.map((coordinate, index) => coordinate - initialPosition[index]))
    : Number.NaN;
  if (!object(lifecycle) || !object(initial) || !object(moving) || !object(settled)
    || !finitePosition(initialPosition) || !finitePosition(movingPosition) || !finitePosition(settledPosition)
    || initial.physical !== true || initial.physicsActive !== true
    || initial.receivedPhysicsPose !== true || initial.fallbackSettled !== false
    || movingPosition[1] > initialPosition[1] - 0.025 || displacement < 0.04
    || settled.visible !== true || settled.physical !== false
    || settled.physicsActive !== false || settled.fallbackSettled !== true
    || !Number.isFinite(settled.support?.restY)
    || Math.abs(settledPosition[1] - settled.support.restY) > 0.04) {
    failures.push(`${label}:lifecycle`);
  }
}

function validateBrowserComponent(component, record, failures) {
  exactKeys(component, [
    'schemaVersion', 'contract', 'status', 'sourceSha', 'servedCandidate', 'browser',
    'renderer', 'coverage', 'cases', 'faults',
  ], 'browser', failures);
  if (!object(component) || component.schemaVersion !== 1
    || component.contract !== 'atomic-acres/pass71-hf304-glass-browser-component@1'
    || component.status !== 'PASS' || component.sourceSha !== record.source?.expectedSourceSha) {
    failures.push('browser:identity');
  }
  validateServedCandidate(component?.servedCandidate, { sourceSha: record.source?.expectedSourceSha }, failures, 'browser:servedCandidate');
  if (!object(component?.browser) || component.browser.channel !== 'msedge'
    || typeof component.browser.userAgent !== 'string' || !/Edg\//u.test(component.browser.userAgent)) {
    failures.push('browser:installed-edge-identity');
  }
  if (!sameJson(component?.renderer, { requested: 'webgl2', actual: 'webgl2' })
    || !sameJson(component?.coverage, {
      profiles: ['quality', 'performance'],
      arenas: ['atomic-acres', 'skyline-terminal'],
      paneCountPerArena: 6,
      paths: ['bullet', 'knife', 'grenade', 'flare-gun', 'explosive-crossbow'],
      caseCount: 10,
      authorityMode: 'solo',
      hostedRuntimeTopologyObserved: false,
    })) failures.push('browser:coverage');
  if (!Array.isArray(component?.cases) || component.cases.length !== PASS71_HF304_BROWSER_CASES.length) {
    failures.push('browser:case-matrix');
  } else {
    for (const [index, expectedId] of PASS71_HF304_BROWSER_CASES.entries()) {
      const entry = component.cases[index];
      const [profile, path] = expectedId.split('/');
      const arenaId = path === 'flare-gun' ? 'skyline-terminal' : 'atomic-acres';
      if (entry?.id !== expectedId || entry.profile !== profile || entry.path !== path
        || entry.arenaId !== arenaId || entry.status !== 'PASS' || entry.paneCount !== 6
        || !Array.isArray(entry.faults) || entry.faults.length !== 0) {
        failures.push(`browser:case:${expectedId}:identity`);
        continue;
      }
      validateLifecycleReceipt(entry.receipt?.lifecycle, `browser:case:${expectedId}`, failures);
      if (path === 'flare-gun' || path === 'explosive-crossbow') {
        const expectedPaneIds = PASS71_HF304_ARENAS.find((arena) => arena.id === arenaId)?.paneIds ?? [];
        const expectedPhase = path === 'explosive-crossbow' ? 'detached' : 'breached';
        if (!Array.isArray(entry.receipt?.paneReceipts) || entry.receipt.paneReceipts.length !== 6
          || !sameJson(entry.receipt.paneReceipts.map((pane) => pane?.id), expectedPaneIds)
          || entry.receipt.paneReceipts.some((pane) => pane?.phase !== expectedPhase)) {
          failures.push(`browser:case:${expectedId}:lifecycle`);
        }
        validateRetiredReceipt(
          entry.receipt?.retired,
          `browser:case:${expectedId}`,
          failures,
          arenaId,
          [5],
        );
      } else validateRetiredReceipt(
        entry.receipt?.retired,
        `browser:case:${expectedId}`,
        failures,
        arenaId,
        [0, 1, 2, 3, 4, 5],
      );
    }
  }
  if (!Array.isArray(component?.faults) || component.faults.length !== 0) failures.push('browser:faults');
}

function validateComponents(components, record, failures) {
  if (!Array.isArray(components) || components.length !== 2) {
    failures.push('component-matrix');
    return;
  }
  const definitions = [
    ['mechanical-full-cartesian', 'unit', 'scripts/qa/capture-pass71-hf304-glass-matrix.ts'],
    ['installed-edge-runtime-distinct-paths', 'browser', 'tests/e2e/pass71-glass-lifecycle-matrix.spec.ts'],
  ];
  for (const [index, [id, kind, sourcePath]] of definitions.entries()) {
    const component = components[index];
    exactKeys(component, [
      'id', 'kind', 'status', 'sourcePath', 'receiptPath', 'receiptSha256',
      'receiptByteLength', 'embedded',
    ], `component:${id}`, failures);
    if (component?.id !== id || component.kind !== kind || component.status !== 'passed'
      || component.sourcePath !== sourcePath
      || component.receiptPath !== `artifacts/pass71/hf304-glass-evidence/components/${index + 1}-${id}.json`
      || !SHA256.test(component.receiptSha256 ?? '')
      || !Number.isSafeInteger(component.receiptByteLength) || component.receiptByteLength < 2
      || component.receiptSha256 !== createHash('sha256').update(`${JSON.stringify(component.embedded, null, 2)}\n`).digest('hex')
      || component.receiptByteLength !== Buffer.byteLength(`${JSON.stringify(component.embedded, null, 2)}\n`)) {
      failures.push(`component:${id}:identity-or-bytes`);
    }
  }
  validateMechanicalComponent(components[0]?.embedded, record, failures);
  validateBrowserComponent(components[1]?.embedded, record, failures);
}

export function pass71Hf304EvidenceFailures(record, expected = {}) {
  const failures = [];
  if (!object(record) || record.schemaVersion !== PASS71_HF304_GLASS_EVIDENCE.schemaVersion
    || record.evidenceId !== PASS71_HF304_GLASS_EVIDENCE.evidenceId
    || record.kind !== PASS71_HF304_GLASS_EVIDENCE.kind
    || record.contract !== PASS71_HF304_GLASS_EVIDENCE.contract
    || record.feedbackId !== PASS71_HF304_GLASS_EVIDENCE.feedbackId
    || record.status !== PASS71_HF304_GLASS_EVIDENCE.status
    || record.coverageDisposition !== PASS71_HF304_GLASS_EVIDENCE.coverageDisposition) {
    return ['hf304-identity-or-status'];
  }
  exactKeys(record, [
    'schemaVersion', 'evidenceId', 'kind', 'contract', 'feedbackId', 'status',
    'coverageDisposition', 'closesFeedback', 'closingAuthority', 'startedAt', 'completedAt',
    'source', 'servedCandidate', 'environment', 'browser', 'tooling', 'coverage',
    'unknowns', 'components', 'faults', 'receiptSha256',
  ], 'record', failures);
  if (record.closesFeedback !== false || record.closingAuthority !== false) failures.push('non-closing-authority');
  validateSource(record.source, expected, failures);
  validateServedCandidate(record.servedCandidate, expected, failures);
  exactKeys(record.environment, ['machine', 'hostnameSha256', 'platform', 'arch'], 'environment', failures);
  if (record.environment?.machine !== 'dave-gaming-pc' || record.environment?.platform !== 'win32'
    || record.environment?.arch !== 'x64'
    || record.environment?.hostnameSha256 !== PASS71_HF304_MACHINE_HOSTNAME_SHA256) {
    failures.push('release-machine-environment');
  }
  exactKeys(record.browser, [
    'channel', 'installed', 'executableName', 'executableSha256', 'executableVersion',
    'authenticodeStatus', 'authenticodeSigner', 'userAgent', 'isolation',
  ], 'browserIdentity', failures);
  if (record.browser?.channel !== 'msedge' || record.browser.installed !== true
    || record.browser.executableName !== 'msedge.exe' || !SHA256.test(record.browser.executableSha256 ?? '')
    || !/^\d+(?:\.\d+){3}$/u.test(record.browser.executableVersion ?? '')
    || record.browser.authenticodeStatus !== 'Valid'
    || !/Microsoft Corporation/iu.test(record.browser.authenticodeSigner ?? '')
    || !/Edg\//u.test(record.browser.userAgent ?? '')
    || record.browser.isolation !== 'one-installed-edge-process-one-fresh-context-per-test') {
    failures.push('installed-edge-executable-identity');
  }
  const toolingFields = Object.keys(PASS71_HF304_TOOL_PATHS).map((name) => `${name}Sha256`).sort();
  if (!object(record.tooling) || !object(expected.tooling)
    || !sameJson(Object.keys(record.tooling).sort(), toolingFields)
    || !sameJson(Object.keys(expected.tooling).sort(), toolingFields)
    || !sameJson(record.tooling, expected.tooling)
    || Object.values(record.tooling).some((value) => !SHA256.test(value ?? ''))) {
    failures.push('candidate-a-tooling-hashes');
  }
  if (!sameJson(record.coverage, PASS71_HF304_COVERAGE)) failures.push('full-coverage-contract');
  if (!sameJson(record.unknowns, PASS71_HF304_UNKNOWNS)) failures.push('known-unknowns-contract');
  validateComponents(record.components, record, failures);
  if (!sameJson(record.servedCandidate, record.components?.[1]?.embedded?.servedCandidate)) {
    failures.push('served-candidate-cross-receipt');
  }
  if (record.browser?.userAgent !== record.components?.[1]?.embedded?.browser?.userAgent) {
    failures.push('browser-cross-receipt');
  }
  if (!Array.isArray(record.faults) || record.faults.length !== 0) failures.push('aggregate-faults');
  if (!isoTimestamp(record.startedAt) || !isoTimestamp(record.completedAt)
    || Date.parse(record.startedAt) > Date.parse(record.completedAt)) failures.push('run-timestamps');
  if (!SHA256.test(record.receiptSha256 ?? '')
    || record.receiptSha256 !== pass71Hf304RecordSha256(record)) failures.push('receipt-sha256');
  return [...new Set(failures)].sort();
}

export function assertPass71Hf304Evidence(record, expected) {
  const failures = pass71Hf304EvidenceFailures(record, expected);
  if (failures.length > 0) throw new Error(`Pass 71 HF-304 glass evidence failed: ${failures.join(', ')}`);
  return record;
}

export function createPass71Hf304EvidenceRegistryEntry() {
  return Object.freeze({
    descriptor: PASS71_HF304_GLASS_EVIDENCE_DESCRIPTOR,
    validate(record, context) {
      try {
        return pass71Hf304EvidenceFailures(record, {
          sourceSha: context?.sourceSha,
          sourceTreeSha: context?.options?.pass71Hf304SourceTreeSha
            ?? pass71Hf304SourceTreeAtSource(context?.repositoryRoot, context?.sourceSha),
          tooling: context?.options?.pass71Hf304Tooling
            ?? pass71Hf304ToolingHashesAtSource(context?.repositoryRoot, context?.sourceSha),
        });
      } catch (error) {
        return [`hf304-tooling-unavailable:${error instanceof Error ? error.message : String(error)}`];
      }
    },
  });
}

export const PASS71_HF304_GLASS_EVIDENCE_REGISTRY_ENTRY = createPass71Hf304EvidenceRegistryEntry();

function fixtureProjection(weaponId) {
  const phase = expectedPolicy(weaponId).phase;
  return {
    phase,
    paneVisible: false,
    crackOverlayVisible: false,
    apertureOpen: true,
    movementSolid: false,
    ballisticSolid: false,
    aiLineOfSightSolid: false,
  };
}

function fixtureRetiredReceipt(arenaId, expectedBrokenPaneIndexes) {
  const expectedBrokenIndexes = new Set(expectedBrokenPaneIndexes);
  const arena = PASS71_HF304_ARENAS.find((candidate) => candidate.id === arenaId);
  return {
    panes: arena.paneIds.map((paneId, index) => ({
      id: paneId,
      broken: expectedBrokenIndexes.has(index),
      apertureOpen: expectedBrokenIndexes.has(index),
      activeWorldColliderPresent: !expectedBrokenIndexes.has(index),
    })),
    pool: {
      retained: 6, currentArenaRetained: 6, visibleRetained: 0, active: 0, activePhysics: 0,
      prewarmedPhysicsBodies: 6,
      lifecycle: { maxPhysicsMs: 1_800, maxLifetimeMs: 4_500, missingPrewarm: 0 },
    },
    rapierDynamicColliders: 0,
    rapierMajorBodies: 0,
    persistentWindowDebris: [],
  };
}

function fixtureLifecycleReceipt() {
  return {
    initial: {
      position: [0, 2, 0], visible: true, physical: true, physicsActive: true,
      receivedPhysicsPose: true, fallbackSettled: false,
    },
    moving: { position: [0.05, 1.7, 0] },
    settled: {
      position: [0.1, 0.02, 0], visible: true, physical: false, physicsActive: false,
      receivedPhysicsPose: false, fallbackSettled: true, support: { source: 'ground', restY: 0 },
    },
  };
}

export function createPass71Hf304EvidenceFixture(options = {}) {
  const sourceSha = options.sourceSha ?? 'a'.repeat(40);
  const sourceTreeSha = options.sourceTreeSha ?? 'b'.repeat(40);
  const tooling = options.tooling
    ? { ...options.tooling }
    : Object.fromEntries(Object.keys(PASS71_HF304_TOOL_PATHS).map(
      (name, index) => [`${name}Sha256`, ((index % 15) + 1).toString(16).repeat(64)],
    ));
  const catalog = { arenas: PASS71_HF304_ARENAS, panes: PASS71_HF304_PANES, weapons: PASS71_HF304_WEAPONS, modes: PASS71_HF304_MODES };
  let nonce = 304_000;
  const matrix = PASS71_HF304_MODES.flatMap((mode) => PASS71_HF304_PANES.flatMap((pane) => (
    PASS71_HF304_WEAPONS.map((weaponId, weaponIndex) => {
      nonce += 1;
      const policy = expectedPolicy(weaponId);
      const projection = fixtureProjection(weaponId);
      const projectile = weaponId === 'explosive-crossbow' || weaponId === 'flare-gun';
      return {
        id: `${mode}/${pane.arenaId}/${pane.paneId}/${weaponId}`,
        mode, arenaId: pane.arenaId, paneId: pane.paneId, weaponId,
        fireKind: PASS71_HF304_WEAPON_FIRE_KINDS[weaponIndex],
        policy: { profile: policy.profile, timing: policy.timing },
        authority: {
          crackProbe: {
            hostAccepted: true, replicaAccepted: true,
            hostProjection: {
              phase: 'cracked', paneVisible: true, crackOverlayVisible: true, apertureOpen: false,
              movementSolid: true, ballisticSolid: true, aiLineOfSightSolid: true,
            },
            replicaProjection: {
              phase: 'cracked', paneVisible: true, crackOverlayVisible: true, apertureOpen: false,
              movementSolid: true, ballisticSolid: true, aiLineOfSightSolid: true,
            },
            stateEqual: true, projectionEqual: true,
          },
          hostAccepted: true, replicaAccepted: true, hostPhase: policy.phase, replicaPhase: policy.phase,
          initialStateEqual: true,
          hostInitialProjection: {
            phase: 'intact', paneVisible: true, crackOverlayVisible: false, apertureOpen: false,
            movementSolid: true, ballisticSolid: true, aiLineOfSightSolid: true,
          },
          replicaInitialProjection: {
            phase: 'intact', paneVisible: true, crackOverlayVisible: false, apertureOpen: false,
            movementSolid: true, ballisticSolid: true, aiLineOfSightSolid: true,
          },
          hostProjection: projection, replicaProjection: projection, stateEqual: true, projectionEqual: true,
        },
        hostedEnvelope: mode === 'hosted' ? {
          protocolVersion: 20, wireWeapon: projectile ? weaponId : null,
          actionNonce: projectile ? nonce : null, hostAuthorityId: 'host-player',
          hostRequestDecoded: true, hostRequestUntrusted: true, forgedAuthorityStripped: true,
          canonicalized: true, clientDecoded: true, clientHostAuthority: true,
          wrongHostDetected: true, duplicateNonceDetected: true,
          projectileReceiverAdmission: projectile ? { accepted: true, reason: 'accepted' } : null,
        } : null,
        debrisRequired: true,
        debrisLifecycleId: `${mode}/${pane.arenaId}/${pane.paneId}`,
      };
    })
  )));
  const debris = PASS71_HF304_MODES.flatMap((mode) => PASS71_HF304_PANES.map((pane) => ({
    id: `${mode}/${pane.arenaId}/${pane.paneId}`, mode, arenaId: pane.arenaId, paneId: pane.paneId,
    persistentDebrisId: `window-debris:${pane.paneId}`,
    lifecycle: PASS71_HF304_DEBRIS_SAMPLE_INPUTS.map((sample, index) => ({ ...sample, mode: PASS71_HF304_DEBRIS_SAMPLE_MODES[index] })),
    bounds: { maximumPhysicsMs: 1_800, maximumLifetimeMs: 4_500, sharedBodyMaximum: 18, windowBodyMaximum: 2, overflowPolicy: 'bounded-presentation-fall' },
  })));
  const mechanical = {
    schemaVersion: 1, contract: 'atomic-acres/pass71-hf304-glass-mechanical-component@1', status: 'PASS',
    sourceSha, sourceTreeSha, releasePass: 'PASS 71', catalog, catalogDigestSha256: canonicalSha256(catalog),
    matrix, matrixDigestSha256: canonicalSha256(matrix), debris, debrisDigestSha256: canonicalSha256(debris),
    runtimeIntegration: {
      sourcePath: 'src/legacy-main.ts', sourceSha256: tooling.runtimeSha256,
      checks: RUNTIME_FRAGMENTS.map((fragment) => ({ fragmentSha256: sha256Text(fragment), present: true })),
    },
    faults: [],
  };
  const servedCandidate = {
    schemaVersion: 4, channel: 'the-big-one', releasePass: 'PASS 71', sourceSha,
    path: 'channels/the-big-one', exactRootFileCount: 500, treeSha256: 'c'.repeat(64),
  };
  const browserCases = PASS71_HF304_BROWSER_CASES.map((id) => {
    const [profile, path] = id.split('/');
    const projectile = path === 'flare-gun' || path === 'explosive-crossbow';
    const arenaId = path === 'flare-gun' ? 'skyline-terminal' : 'atomic-acres';
    const arena = PASS71_HF304_ARENAS.find((candidate) => candidate.id === arenaId);
    const retired = fixtureRetiredReceipt(
      arenaId,
      projectile ? [5] : [0, 1, 2, 3, 4, 5],
    );
    const receipt = {
      lifecycle: fixtureLifecycleReceipt(),
      retired,
      ...(projectile ? {
      paneReceipts: arena.paneIds.map((paneId) => ({ id: paneId, phase: path === 'explosive-crossbow' ? 'detached' : 'breached' })),
      } : {}),
    };
    return { id, profile, path, arenaId, status: 'PASS', paneCount: 6, receipt, faults: [] };
  });
  const browserComponent = {
    schemaVersion: 1, contract: 'atomic-acres/pass71-hf304-glass-browser-component@1', status: 'PASS',
    sourceSha, servedCandidate, browser: { channel: 'msedge', userAgent: 'Mozilla/5.0 Edg/140.0.0.0' },
    renderer: { requested: 'webgl2', actual: 'webgl2' },
    coverage: {
      profiles: ['quality', 'performance'], arenas: ['atomic-acres', 'skyline-terminal'],
      paneCountPerArena: 6,
      paths: ['bullet', 'knife', 'grenade', 'flare-gun', 'explosive-crossbow'],
      caseCount: 10, authorityMode: 'solo', hostedRuntimeTopologyObserved: false,
    },
    cases: browserCases, faults: [],
  };
  const componentDefinitions = [
    ['mechanical-full-cartesian', 'unit', 'scripts/qa/capture-pass71-hf304-glass-matrix.ts', mechanical],
    ['installed-edge-runtime-distinct-paths', 'browser', 'tests/e2e/pass71-glass-lifecycle-matrix.spec.ts', browserComponent],
  ];
  const components = componentDefinitions.map(([id, kind, sourcePath, embedded], index) => {
    const bytes = `${JSON.stringify(embedded, null, 2)}\n`;
    return {
      id, kind, status: 'passed', sourcePath,
      receiptPath: `artifacts/pass71/hf304-glass-evidence/components/${index + 1}-${id}.json`,
      receiptSha256: createHash('sha256').update(bytes).digest('hex'), receiptByteLength: Buffer.byteLength(bytes), embedded,
    };
  });
  const record = {
    ...PASS71_HF304_GLASS_EVIDENCE,
    startedAt: options.startedAt ?? '2026-08-13T20:00:00.000Z',
    completedAt: options.completedAt ?? '2026-08-13T20:20:00.000Z',
    source: { expectedSourceSha: sourceSha, checkoutSourceSha: sourceSha, endingCheckoutSourceSha: sourceSha, sourceTreeSha, releasePass: 'PASS 71', cleanBefore: true, cleanAfter: true },
    servedCandidate,
    environment: {
      machine: 'dave-gaming-pc', hostnameSha256: PASS71_HF304_MACHINE_HOSTNAME_SHA256,
      platform: 'win32', arch: 'x64',
    },
    browser: { channel: 'msedge', installed: true, executableName: 'msedge.exe', executableSha256: 'd'.repeat(64), executableVersion: '140.0.0.0', authenticodeStatus: 'Valid', authenticodeSigner: 'Microsoft Corporation', userAgent: browserComponent.browser.userAgent, isolation: 'one-installed-edge-process-one-fresh-context-per-test' },
    tooling,
    coverage: PASS71_HF304_COVERAGE,
    unknowns: PASS71_HF304_UNKNOWNS,
    components,
    faults: [],
  };
  record.receiptSha256 = pass71Hf304RecordSha256(record);
  return record;
}
