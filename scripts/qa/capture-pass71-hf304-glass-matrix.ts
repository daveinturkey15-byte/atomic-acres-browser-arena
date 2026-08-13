import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import * as THREE from 'three';
import { buildGunRange, buildRustworks1v1, buildSkylineTerminal } from '../../src/additional-maps';
import { WEAPON_CATALOG } from '../../src/combat/weapon-catalog';
import {
  GLASS_CRACK_DAMAGE_Q,
  admitGlassImpact,
  createGlassState,
  glassAuthorityProjection,
} from '../../src/glass-authority';
import { MAX_MAJOR_DEBRIS_BODIES, SHARED_MAJOR_DEBRIS_BUDGET } from '../../src/major-debris-budget';
import { buildArena, type ArenaMap } from '../../src/map';
import { ARENA_SELECTIONS } from '../../src/map-selection';
import {
  MULTIPLAYER_PROTOCOL_VERSION,
  isGameMessage,
  isHostAuthorityMessage,
  type WindowBreakMessage,
} from '../../src/protocol';
import {
  admitProjectileGlassBreak,
} from '../../src/projectile-glass-break-admission';
import {
  WINDOW_GLASS_DEBRIS_MAX_LIFETIME_MS,
  WINDOW_GLASS_DEBRIS_MAX_PHYSICS_MS,
  windowGlassDebrisLifecycleMode,
  type WindowGlassDebrisLifecycleSample,
} from '../../src/window-glass-debris-presentation';
import { WEAPON_GLASS_BREAK_CATALOG } from '../../src/weapon-glass-break-policy';
import {
  PASS71_HF304_ARENAS,
  PASS71_HF304_DEBRIS_SAMPLE_INPUTS,
  PASS71_HF304_MODES,
  PASS71_HF304_PANES,
  PASS71_HF304_WEAPONS,
} from './pass71-hf304-glass-evidence-contract.mjs';

const SHA40 = /^[a-f0-9]{40}$/u;

function parseArgs(argv: readonly string[]): Readonly<Record<string, string>> {
  const values: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (!token.startsWith('--')) throw new Error(`Unexpected HF-304 matrix argument ${token}`);
    const equals = token.indexOf('=');
    if (equals > 2) values[token.slice(2, equals)] = token.slice(equals + 1);
    else {
      const next = argv[index + 1];
      if (!next || next.startsWith('--')) throw new Error(`HF-304 matrix argument ${token} requires a value`);
      values[token.slice(2)] = next;
      index += 1;
    }
  }
  return Object.freeze(values);
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [
    key,
    canonicalValue((value as Record<string, unknown>)[key]),
  ]));
}

function canonicalSha256(value: unknown): string {
  return createHash('sha256').update(`${JSON.stringify(canonicalValue(value))}\n`).digest('hex');
}

function sha256Text(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function git(...args: readonly string[]): string {
  return execFileSync('git', ['-C', process.cwd(), ...args], {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
}

function disposeArena(arena: ArenaMap): void {
  arena.root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    node.geometry?.dispose();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) material?.dispose();
  });
}

function authoredPaneCatalog(): readonly Readonly<{
  arenaId: string;
  paneId: string;
  position: readonly [number, number, number];
}>[] {
  const builders = [
    ['atomic-acres', buildArena],
    ['rustworks-1v1', buildRustworks1v1],
    ['gun-range', buildGunRange],
    ['skyline-terminal', buildSkylineTerminal],
  ] as const;
  const canonicalArenaIds = [...ARENA_SELECTIONS.map((selection) => selection.id)].sort();
  const builderArenaIds = [...builders.map(([arenaId]) => arenaId)].sort();
  const frozenArenaIds = [...PASS71_HF304_ARENAS.map((arena) => arena.id)].sort();
  if (!sameJson(builderArenaIds, canonicalArenaIds) || !sameJson(frozenArenaIds, canonicalArenaIds)) {
    throw new Error('HF-304 arena builder and frozen catalog are not exact-set equal to ARENA_SELECTIONS');
  }
  const rows: Array<{ arenaId: string; paneId: string; position: readonly [number, number, number] }> = [];
  const arenaProjection: Array<{ id: string; paneIds: string[] }> = [];
  for (const [arenaId, builder] of builders) {
    const arena = builder(new THREE.Scene());
    try {
      arena.root.updateMatrixWorld(true);
      const paneIds = arena.breakableWindows.map((pane) => pane.id);
      arenaProjection.push({ id: arenaId, paneIds });
      for (const pane of arena.breakableWindows) {
        const position = pane.mesh.getWorldPosition(new THREE.Vector3());
        rows.push({
          arenaId,
          paneId: pane.id,
          position: Object.freeze([position.x, position.y, position.z] as const),
        });
      }
    } finally {
      disposeArena(arena);
    }
  }
  const expectedArenas = PASS71_HF304_ARENAS.map((arena) => ({ id: arena.id, paneIds: [...arena.paneIds] }));
  if (!sameJson(arenaProjection, expectedArenas)) {
    throw new Error(`HF-304 authored pane catalog drifted: ${JSON.stringify(arenaProjection)}`);
  }
  if (!sameJson(rows.map(({ arenaId, paneId }) => ({ arenaId, paneId })), PASS71_HF304_PANES)) {
    throw new Error('HF-304 flattened authored pane catalog drifted');
  }
  return Object.freeze(rows.map((row) => Object.freeze(row)));
}

function hostedRequestEnvelope(
  pane: Readonly<{ paneId: string; position: readonly [number, number, number] }>,
  weapon: typeof WEAPON_CATALOG[number],
  nonce: number,
): WindowBreakMessage {
  const projectile = weapon.fireKind === 'projectile';
  return {
    type: 'window-break',
    protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
    by: 'guest-player',
    windowId: pane.paneId,
    origin: [...pane.position],
    kind: 'shot',
    ...(projectile ? { weapon: weapon.id, actionNonce: nonce } : {}),
    nonce,
  };
}

function canonicalizeHostedEnvelope(message: WindowBreakMessage): WindowBreakMessage {
  const { hostAuthority: _untrustedHostAuthority, ...untrustedMessage } = message;
  return {
    ...untrustedMessage,
    hostAuthority: { hostId: 'host-player', stickyAttachment: null },
  };
}

function lifecycleSamples(): readonly Readonly<WindowGlassDebrisLifecycleSample & { mode: string }>[] {
  return Object.freeze(PASS71_HF304_DEBRIS_SAMPLE_INPUTS.map((sample) => Object.freeze({
    ...sample,
    mode: windowGlassDebrisLifecycleMode(sample),
  })));
}

const args = parseArgs(process.argv.slice(2));
const output = args.output ? resolve(args.output) : null;
const expectedSourceSha = process.env.PASS71_HF304_EXPECTED_SOURCE_SHA;
const releasePass = process.env.PASS71_HF304_RELEASE_PASS;
if (!output) throw new Error('HF-304 mechanical matrix requires --output=<path>');
if (!SHA40.test(expectedSourceSha ?? '')) throw new Error('HF-304 mechanical matrix requires exact source SHA');
if (releasePass !== 'PASS 71') throw new Error(`HF-304 mechanical matrix requires PASS 71, received ${releasePass ?? 'missing'}`);
const checkoutSourceSha = git('rev-parse', 'HEAD');
if (checkoutSourceSha !== expectedSourceSha) {
  throw new Error(`HF-304 matrix source drifted (${checkoutSourceSha} != ${expectedSourceSha})`);
}

const weaponIds = WEAPON_CATALOG.map((weapon) => weapon.id);
const glassWeaponIds = WEAPON_GLASS_BREAK_CATALOG.map((policy) => policy.weapon);
if (!sameJson(weaponIds, PASS71_HF304_WEAPONS) || !sameJson(glassWeaponIds, PASS71_HF304_WEAPONS)) {
  throw new Error('HF-304 canonical weapon and glass-policy catalogs are not exact-set equal');
}
const paneCatalog = authoredPaneCatalog();
const policies = new Map(WEAPON_GLASS_BREAK_CATALOG.map((policy) => [policy.weapon, policy]));
const matrix: Record<string, unknown>[] = [];
let nonce = 304_000;
for (const mode of PASS71_HF304_MODES) {
  for (const pane of paneCatalog) {
    for (const weapon of WEAPON_CATALOG) {
      nonce += 1;
      const policy = policies.get(weapon.id);
      if (!policy) throw new Error(`HF-304 weapon ${weapon.id} has no glass policy`);
      const impactId = `${mode}:${pane.arenaId}:${pane.paneId}:${weapon.id}:${nonce}`;
      const hostBefore = createGlassState(pane.paneId, 71);
      const replicaBefore = createGlassState(pane.paneId, 71);
      const request = {
        isHost: true,
        matchEpoch: 71,
        expectedRevision: 0,
        impactId,
        tick: nonce,
        profile: policy.profile,
      } as const;
      const crackRequest = {
        ...request,
        impactId: `${impactId}:crack-probe`,
        damageQ: GLASS_CRACK_DAMAGE_Q,
      } as const;
      const hostCrackAdmission = admitGlassImpact(hostBefore, crackRequest);
      const replicaCrackAdmission = admitGlassImpact(replicaBefore, crackRequest);
      const hostAdmission = admitGlassImpact(hostBefore, request);
      const hostProjection = glassAuthorityProjection(hostAdmission.state);
      const hostedRequest = mode === 'hosted' ? hostedRequestEnvelope(pane, weapon, nonce) : null;
      const hostRequestDecoded = hostedRequest !== null
        && isGameMessage(hostedRequest)
        && !isHostAuthorityMessage(hostedRequest);
      const hostRequestUntrusted = hostedRequest !== null
        && hostedRequest.hostAuthority === undefined;
      const canonicalEnvelope = hostedRequest && hostRequestDecoded
        ? canonicalizeHostedEnvelope(hostedRequest)
        : null;
      const forgedAuthorityStripped = hostedRequest !== null
        && canonicalizeHostedEnvelope({
          ...hostedRequest,
          hostAuthority: { hostId: 'forged-host', stickyAttachment: null },
        }).hostAuthority?.hostId === 'host-player';
      const clientEnvelope: WindowBreakMessage | null = canonicalEnvelope
        ? JSON.parse(JSON.stringify(canonicalEnvelope))
        : null;
      const clientHostAuthority = clientEnvelope?.hostAuthority?.hostId === 'host-player';
      const clientDecoded = clientEnvelope !== null
        && isGameMessage(clientEnvelope)
        && isHostAuthorityMessage(clientEnvelope)
        && clientHostAuthority;
      const wrongHostEnvelope = clientEnvelope ? {
        ...clientEnvelope,
        hostAuthority: { hostId: 'forged-host', stickyAttachment: null },
      } : null;
      const wrongHostDetected = wrongHostEnvelope !== null
        && isGameMessage(wrongHostEnvelope)
        && isHostAuthorityMessage(wrongHostEnvelope)
        && wrongHostEnvelope.hostAuthority?.hostId !== 'host-player';
      const processedNonces = new Set<number>();
      const firstNonceAccepted = clientEnvelope !== null && !processedNonces.has(clientEnvelope.nonce);
      if (clientEnvelope && firstNonceAccepted) processedNonces.add(clientEnvelope.nonce);
      const duplicateNonceDetected = clientEnvelope !== null && processedNonces.has(clientEnvelope.nonce);
      if (hostedRequest && (!hostRequestDecoded || !hostRequestUntrusted
        || !forgedAuthorityStripped || !clientDecoded || !wrongHostDetected || !duplicateNonceDetected)) {
        throw new Error(`HF-304 hosted envelope path rejected ${pane.paneId}/${weapon.id}`);
      }
      const projectileReceiverAdmission = clientEnvelope?.weapon ? admitProjectileGlassBreak({
        receiverRole: 'client',
        hostAuthorityValid: true,
        weapon: clientEnvelope.weapon,
        fireKind: weapon.fireKind,
        actionNonce: clientEnvelope.actionNonce!,
        actionCurrent: true,
        actionWeapon: clientEnvelope.weapon,
        actionNonceObserved: clientEnvelope.actionNonce!,
        eventReplay: false,
        paneAlreadyAdmittedForAction: false,
        originInsideArena: true,
        paneDistanceM: 0,
        maximumPaneDistanceM: 1,
      }) : null;
      if (projectileReceiverAdmission && !projectileReceiverAdmission.accepted) {
        throw new Error(`HF-304 hosted projectile receiver rejected ${pane.paneId}/${weapon.id}`);
      }
      const replicaAuthorized = mode === 'solo'
        || clientDecoded && firstNonceAccepted && (projectileReceiverAdmission?.accepted ?? true);
      const replicaAdmission = admitGlassImpact(replicaBefore, { ...request, isHost: replicaAuthorized });
      if (!hostAdmission.accepted || !replicaAdmission.accepted) {
        throw new Error(`HF-304 authority rejected ${mode}/${pane.paneId}/${weapon.id}`);
      }
      const replicaProjection = glassAuthorityProjection(replicaAdmission.state);
      matrix.push(Object.freeze({
        id: `${mode}/${pane.arenaId}/${pane.paneId}/${weapon.id}`,
        mode,
        arenaId: pane.arenaId,
        paneId: pane.paneId,
        weaponId: weapon.id,
        fireKind: weapon.fireKind,
        policy: Object.freeze({ profile: policy.profile, timing: policy.timing }),
        authority: Object.freeze({
          crackProbe: Object.freeze({
            hostAccepted: hostCrackAdmission.accepted,
            replicaAccepted: replicaCrackAdmission.accepted,
            hostProjection: glassAuthorityProjection(hostCrackAdmission.state),
            replicaProjection: glassAuthorityProjection(replicaCrackAdmission.state),
            stateEqual: sameJson(hostCrackAdmission.state, replicaCrackAdmission.state),
            projectionEqual: sameJson(
              glassAuthorityProjection(hostCrackAdmission.state),
              glassAuthorityProjection(replicaCrackAdmission.state),
            ),
          }),
          hostAccepted: hostAdmission.accepted,
          replicaAccepted: replicaAdmission.accepted,
          initialStateEqual: sameJson(hostBefore, replicaBefore),
          hostInitialProjection: glassAuthorityProjection(hostBefore),
          replicaInitialProjection: glassAuthorityProjection(replicaBefore),
          hostPhase: hostAdmission.state.phase,
          replicaPhase: replicaAdmission.state.phase,
          hostProjection,
          replicaProjection,
          stateEqual: sameJson(hostAdmission.state, replicaAdmission.state),
          projectionEqual: sameJson(hostProjection, replicaProjection),
        }),
        hostedEnvelope: clientEnvelope ? Object.freeze({
          protocolVersion: clientEnvelope.protocolVersion,
          wireWeapon: clientEnvelope.weapon ?? null,
          actionNonce: clientEnvelope.actionNonce ?? null,
          hostAuthorityId: clientEnvelope.hostAuthority?.hostId ?? null,
          hostRequestDecoded,
          hostRequestUntrusted,
          forgedAuthorityStripped,
          canonicalized: canonicalEnvelope !== null,
          clientDecoded,
          clientHostAuthority,
          wrongHostDetected,
          duplicateNonceDetected,
          projectileReceiverAdmission,
        }) : null,
        debrisRequired: hostProjection.apertureOpen,
        debrisLifecycleId: `${mode}/${pane.arenaId}/${pane.paneId}`,
      }));
    }
  }
}

const debris = PASS71_HF304_MODES.flatMap((mode) => paneCatalog.map((pane) => Object.freeze({
  id: `${mode}/${pane.arenaId}/${pane.paneId}`,
  mode,
  arenaId: pane.arenaId,
  paneId: pane.paneId,
  persistentDebrisId: `window-debris:${pane.paneId}`,
  lifecycle: lifecycleSamples(),
  bounds: Object.freeze({
    maximumPhysicsMs: WINDOW_GLASS_DEBRIS_MAX_PHYSICS_MS,
    maximumLifetimeMs: WINDOW_GLASS_DEBRIS_MAX_LIFETIME_MS,
    sharedBodyMaximum: MAX_MAJOR_DEBRIS_BODIES,
    windowBodyMaximum: SHARED_MAJOR_DEBRIS_BUDGET.window,
    overflowPolicy: 'bounded-presentation-fall',
  }),
})));

const runtimeSource = readFileSync(resolve('src/legacy-main.ts'), 'utf8');
const requiredRuntimeFragments = Object.freeze([
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
const runtimeChecks = requiredRuntimeFragments.map((fragment) => Object.freeze({
  fragmentSha256: sha256Text(fragment),
  present: runtimeSource.includes(fragment),
}));
if (runtimeChecks.some((check) => !check.present)) throw new Error('HF-304 runtime integration fragment is missing');

const catalog = Object.freeze({
  arenas: PASS71_HF304_ARENAS,
  panes: PASS71_HF304_PANES,
  weapons: PASS71_HF304_WEAPONS,
  modes: PASS71_HF304_MODES,
});
const component = {
  schemaVersion: 1,
  contract: 'atomic-acres/pass71-hf304-glass-mechanical-component@1',
  status: 'PASS',
  sourceSha: expectedSourceSha,
  sourceTreeSha: git('rev-parse', `${expectedSourceSha}^{tree}`),
  releasePass,
  catalog,
  catalogDigestSha256: canonicalSha256(catalog),
  matrix,
  matrixDigestSha256: canonicalSha256(matrix),
  debris,
  debrisDigestSha256: canonicalSha256(debris),
  runtimeIntegration: {
    sourcePath: 'src/legacy-main.ts',
    sourceSha256: sha256Text(runtimeSource),
    checks: runtimeChecks,
  },
  faults: [],
};

mkdirSync(dirname(output), { recursive: true });
const temporary = `${output}.tmp`;
writeFileSync(temporary, `${JSON.stringify(component, null, 2)}\n`, 'utf8');
renameSync(temporary, output);
console.log(JSON.stringify({
  status: component.status,
  sourceSha: component.sourceSha,
  paneCount: paneCatalog.length,
  weaponCount: weaponIds.length,
  modeCount: PASS71_HF304_MODES.length,
  matrixCellCount: matrix.length,
  debrisLifecycleCount: debris.length,
  output,
}, null, 2));
