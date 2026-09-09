/**
 * HF-382 - the IDLE STANCE selector must be VISIBLE, not just stored.
 *
 * Before this module the menu persisted `atomic-acres-operator-stance` and
 * re-rendered card state, but nothing animated or posed anything: neither the
 * OPERATOR panel's 3D turntable nor the first-person arms changed when the
 * player switched between Weapon Ready / Low Carry / On The Trigger. The
 * owner's words: "i adjust how they carry gun and it doesnt even preview it in
 * third or first person?"
 *
 * Two consumers read this module every frame:
 *   - `src/ui/operator-preview.ts` writes the selected stance onto the preview
 *     operator root (`userData.operatorStanceId`), which the third-person idle
 *     path in `operator-model.ts` consumes to cross-fade the authored idle clip.
 *   - `src/weapon-presentation.ts` reads the presentation profile below and
 *     blends a bounded pose offset into the hip viewmodel.
 *
 * PRESENTATION ONLY. Nothing here may touch hit proxies, movement authority,
 * fire admission, or any replicated gameplay value. Persistence stays with the
 * menu's own click handler in legacy-main.ts (same storage key, single writer);
 * this module only mirrors what is already on disk so both previews agree with
 * the pressed card without a second write path.
 */

import {
  DEFAULT_OPERATOR_STANCE,
  isOperatorStanceId,
  type OperatorStanceId,
} from './operator-appearance-catalog';

/** Same key legacy-main.ts persists under (OPERATOR_STANCE_STORAGE_KEY). */
export const OPERATOR_STANCE_STORAGE_KEY = 'atomic-acres-operator-stance';

let cachedActiveStanceId: OperatorStanceId | null = null;

function readStoredStance(): OperatorStanceId {
  try {
    const raw = globalThis.localStorage?.getItem(OPERATOR_STANCE_STORAGE_KEY) ?? null;
    return raw !== null && isOperatorStanceId(raw) ? raw : DEFAULT_OPERATOR_STANCE;
  } catch {
    // Storage can throw in privacy modes; the default stance still applies.
    return DEFAULT_OPERATOR_STANCE;
  }
}

/** The stance the LOCAL player has selected. Lazily mirrors localStorage. */
export function activeOperatorStance(): OperatorStanceId {
  cachedActiveStanceId ??= readStoredStance();
  return cachedActiveStanceId;
}

/**
 * Updates the in-memory active stance. Returns false for off-catalog values.
 * Deliberately does NOT persist: the menu's document-level click handler in
 * legacy-main.ts already writes this exact key, and two writers to one key is
 * how preferences drift.
 */
export function setActiveOperatorStance(id: string): boolean {
  if (!isOperatorStanceId(id)) return false;
  cachedActiveStanceId = id;
  return true;
}

/** Test isolation only. */
export function resetOperatorStanceForTest(): void {
  cachedActiveStanceId = null;
}

/**
 * Bounded first-person pose offset per stance, applied to the hip viewmodel in
 * `weapon-presentation.ts`. Sign conventions match the viewmodel root:
 *   - pitchRadians positive = muzzle UP (recoil raises rotation.x).
 *   - yawRadians positive = muzzle toward the body's left.
 *   - rollRadians positive = clockwise cant as seen by the player.
 * Everything is scaled by (1 - adsBlend)(1 - sprintBlend)(1 - meleeArc), so ADS,
 * sprint and melee presentations are exactly what they were before HF-382.
 */
export type FirstPersonStancePresentation = Readonly<{
  /** Metres the weapon sits LOWER at rest (positive drops). */
  dropMeters: number;
  pitchRadians: number;
  yawRadians: number;
  rollRadians: number;
  /** Metres of lateral shift, +right. */
  lateralMeters: number;
}>;

const ZERO_PRESENTATION: FirstPersonStancePresentation = Object.freeze({
  dropMeters: 0,
  pitchRadians: 0,
  yawRadians: 0,
  rollRadians: 0,
  lateralMeters: 0,
});

export const FIRST_PERSON_STANCE_PRESENTATIONS: Readonly<
  Record<OperatorStanceId, FirstPersonStancePresentation>
> = Object.freeze({
  // Weapon Ready: the shipped baseline pose, unchanged.
  ready: ZERO_PRESENTATION,
  // Low Carry: muzzle down and relaxed - visibly lowered and canted inward.
  low: Object.freeze({
    dropMeters: 0.055,
    pitchRadians: -0.17,
    yawRadians: 0.1,
    rollRadians: 0.06,
    lateralMeters: -0.008,
  }),
  // On The Trigger: tensed - slightly high, tight to centre, canted the other way.
  alert: Object.freeze({
    dropMeters: -0.007,
    pitchRadians: 0.025,
    yawRadians: -0.035,
    rollRadians: -0.05,
    lateralMeters: 0.009,
  }),
});

export function firstPersonStancePresentation(id: OperatorStanceId): FirstPersonStancePresentation {
  return FIRST_PERSON_STANCE_PRESENTATIONS[id];
}
