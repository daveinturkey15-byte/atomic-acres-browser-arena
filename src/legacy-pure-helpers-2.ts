/**
 * Self-contained helpers extracted verbatim from src/legacy-main.ts (HF-355).
 *
 * These helpers use their arguments and imported dependencies, without capturing
 * legacy-main state. worldVertex updates its supplied scratch target, and
 * recoveryRemainingMs defaults to the current clock when no time is supplied.
 * The caller retains ownership of game state and lifecycle side effects.
 */

import type { PlayerSnapshot } from './protocol';
import type { GameMessage, ShotMessage, MeleeMessage } from './protocol';
import type { StickyAttachmentRecord } from './remote-sticky-attachment-authority';
import type { HostVerifiedStickyAttachment } from './protocol';
import type { MajorDebrisBodyDefinition, MajorDebrisBodySnapshot } from './physics';
import type { HostMatchCheckpoint } from './host-match-checkpoint';
import type * as THREE from 'three';
import { shortestYaw } from './network-sync';
import {
  TIMED_MAP_WEAPON_IDS,
  createTimedMapWeaponAuthority,
  type TimedMapWeaponAuthorityState,
  type TimedMapWeaponId,
} from './timed-map-weapon-authority';

/**
 * REJECTED FROM THIS MODULE: disposeDetachedRootResources.
 *
 * It was moved here as part of round two and it was neither pure nor verbatim.
 * The moved copy collected geometries and materials into Sets and then returned
 * without disposing anything - it dropped the array-material branch, the light
 * shadow-map disposal, BOTH dispose loops and the final root.clear(). Rewiring
 * legacy-main to it would have leaked every geometry, material and shadow map on
 * each arena switch, silently, while tsc stayed clean.
 *
 * It was never eligible regardless: disposing GPU resources is a side effect, and
 * the original consults isSharedMeshGeometry, which is module state. It stays in
 * legacy-main.ts, unchanged.
 */

/**
 * legacy-main.ts:9698-9700 — stance eye height.
 */
export function stanceEyeHeight(stance: PlayerSnapshot['stance']): number {
  return stance === 'prone' ? 0.61 : stance === 'crouch' ? 1.16 : 1.7;
}

/**
 * legacy-main.ts:9858-9864 — timed combat message type guard.
 */
export function isTimedCombatMessage(message: GameMessage): message is ShotMessage | MeleeMessage | Extract<GameMessage, {
  type: 'grenade-throw' | 'hit' | 'support-activate' | 'killstreak-activate-intent' | 'killstreak-control-intent' | 'killstreak-care-capture-intent';
}> {
  return message.type === 'shot' || message.type === 'melee' || message.type === 'grenade-throw' || message.type === 'hit'
    || message.type === 'support-activate' || message.type === 'killstreak-activate-intent'
    || message.type === 'killstreak-control-intent' || message.type === 'killstreak-care-capture-intent';
}

/**
 * legacy-main.ts:9961-9963 — verified sticky attachment.
 */
export function verifiedStickyAttachment(record: StickyAttachmentRecord): HostVerifiedStickyAttachment {
  return Object.freeze({ targetId: record.targetId, targetLifeId: record.targetLifeId });
}


/**
 * legacy-main.ts:3639-3651 — major debris definition from snapshot.
 */
export function majorDebrisDefinitionFromSnapshot(
  definition: MajorDebrisBodyDefinition,
  snapshot: MajorDebrisBodySnapshot,
): MajorDebrisBodyDefinition {
  return Object.freeze({
    ...definition,
    position: snapshot.position,
    rotation: snapshot.rotation,
    linearVelocity: snapshot.linearVelocity,
    angularVelocity: snapshot.angularVelocity,
    sleeping: snapshot.sleeping,
  });
}

/**
 * legacy-main.ts:7394-7396 — recovery remaining milliseconds.
 * Note: the default argument for `nowEpochMs` uses `Date.now()`, which is impure.
 * The function body is pure if `nowEpochMs` is provided by the caller.
 */
export function recoveryRemainingMs(value: number, checkpoint: HostMatchCheckpoint, nowEpochMs = Date.now()): number {
  return Math.max(0, value - Math.max(0, nowEpochMs - checkpoint.savedAtEpochMs));
}

/**
 * HF-509 pure move out of `src/legacy-main.ts`, which sits exactly on its size
 * ratchet. Behaviour unchanged: special weapons start with no stored capacity
 * (they are granted with an explicit magazine and reserve), everything else
 * starts at its catalog capacity.
 */
export function createWeaponCapacityRegistry(
  kind: 'mag' | 'reserve',
  weaponIds: readonly string[],
  specialWeaponIds: readonly string[],
  weapons: Readonly<Record<string, Readonly<Record<'mag' | 'reserve', number>>>>,
): Record<string, number> {
  return Object.fromEntries(weaponIds.map((weapon) => [
    weapon,
    specialWeaponIds.includes(weapon) ? 0 : weapons[weapon][kind],
  ]));
}

/** HF-509 pure move: Domination zone tints, previously inline in legacy-main. */
export const DOMINATION_TEAM_COLORS: Readonly<Record<'aqua' | 'coral' | 'neutral', number>> = Object.freeze({
  aqua: 0x37d6d6, coral: 0xe4574f, neutral: 0xcccccc,
});

/** HF-509 pure move: rigged-evidence sentinel joints, previously inline. */
export const DEBUG_RIGGED_EVIDENCE_SENTINEL_DEFINITIONS = Object.freeze([
  Object.freeze({ name: 'head', aliases: Object.freeze(['Head']) }),
  Object.freeze({ name: 'shoulder-left', aliases: Object.freeze(['UpperArmL', 'UpperArm.L']) }),
  Object.freeze({ name: 'shoulder-right', aliases: Object.freeze(['UpperArmR', 'UpperArm.R']) }),
  Object.freeze({ name: 'pelvis', aliases: Object.freeze(['Hips']) }),
  Object.freeze({ name: 'wrist-left', aliases: Object.freeze(['WristL', 'Wrist.L']) }),
  Object.freeze({ name: 'wrist-right', aliases: Object.freeze(['WristR', 'Wrist.R']) }),
] as const);

// ---------------------------------------------------------------------------
// HF-355 round 3 (2026-09-11): five self-contained helpers moved from
// src/legacy-main.ts at d885af5. Each reads only its parameters and the
// imported constants/helpers above; no closure over legacy-main state, no
// global DOM/scene/network state. worldVertex mutates its supplied target.
// Line refs are the pre-move legacy-main lines.
// ---------------------------------------------------------------------------

/**
 * legacy-main.ts:5015-5022 - FNV-1a seed for the shared weather stream.
 */
export function deriveWeatherMatchSeed(hostIdentity: string, matchEpochMs: number): number {
  let hash = 0x811c9dc5;
  for (const character of `${hostIdentity}:${matchEpochMs}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * legacy-main.ts:6069-6074 - every timed map weapon in the disabled state.
 */
export function disabledTimedMapWeaponStates(generation = 0): Readonly<Record<TimedMapWeaponId, TimedMapWeaponAuthorityState>> {
  return Object.freeze(Object.fromEntries(TIMED_MAP_WEAPON_IDS.map((weaponId) => [
    weaponId,
    createTimedMapWeaponAuthority(weaponId, 'disabled', 0, 0, generation),
  ])) as Record<TimedMapWeaponId, TimedMapWeaponAuthorityState>);
}

/**
 * legacy-main.ts:6078-6090 - zeroed timed-map-weapon audit counters.
 */
export const createTimedMapWeaponAudit = () => ({
  claimsReceived: 0,
  claimsAccepted: 0,
  claimsRejected: 0,
  shotsAccepted: 0,
  shotsRejected: 0,
  announcements: 0,
  drops: 0,
  flareImpacts: 0,
  flareBurnPulses: 0,
  flareDamage: 0,
  lastReason: null as string | null,
});

/**
 * One mesh vertex in WORLD space, honouring skinning.
 *
 * THE ARMS ARE A SKINNED MESH, and reading their position attribute directly is
 * meaningless: those are BIND-POSE vertices, and the pose the player sees is
 * produced by the skeleton at draw time. Measuring the raw attribute reported
 * arm geometry 2.17 m below the camera on flat ground - anatomy that does not
 * exist - and made the arms look like the worst offender in every wall
 * measurement. `applyBoneTransform` is what the GPU does, so it is what a
 * measurement of what the player sees has to do too.
 */
export function worldVertex(
  mesh: THREE.Mesh,
  position: THREE.BufferAttribute,
  index: number,
  target: THREE.Vector3,
): THREE.Vector3 {
  target.fromBufferAttribute(position, index);
  const skinned = mesh as THREE.SkinnedMesh;
  if ((skinned as { isSkinnedMesh?: boolean }).isSkinnedMesh && skinned.skeleton) {
    skinned.applyBoneTransform(index, target);
  }
  return target.applyMatrix4(mesh.matrixWorld);
}

/**
 * legacy-main.ts:12339-12349 - snapshot lerp used by SnapshotInterpolationBuffer.
 */
export function interpolatePlayerSnapshot(before: PlayerSnapshot, after: PlayerSnapshot, alpha: number): PlayerSnapshot {
  return {
    ...after,
    x: before.x + (after.x - before.x) * alpha,
    y: before.y + (after.y - before.y) * alpha,
    z: before.z + (after.z - before.z) * alpha,
    yaw: shortestYaw(before.yaw, after.yaw, alpha),
    pitch: before.pitch + (after.pitch - before.pitch) * alpha,
    stance: alpha < 0.5 ? before.stance : after.stance,
  };
}
