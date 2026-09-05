/**
 * Pure helpers extracted verbatim from src/legacy-main.ts (HF-355 round 2).
 *
 * Every function here is a pure move: it reads only its parameters and
 * `THREE.MathUtils` (an imported namespace). No closure capture over module
 * state, no DOM access, no network. Behaviour is unchanged — legacy-main.ts
 * still owns the deletion; this module becomes the canonical home once the
 * orchestrator rewires imports.
 */

import type { PlayerSnapshot } from './protocol';
import type { GameMessage, ShotMessage, MeleeMessage } from './protocol';
import type { StickyAttachmentRecord } from './remote-sticky-attachment-authority';
import type { HostVerifiedStickyAttachment } from './protocol';
import type { MajorDebrisBodyDefinition, MajorDebrisBodySnapshot } from './physics';
import type { HostMatchCheckpoint } from './host-match-checkpoint';

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
