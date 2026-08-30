import type { HitZone } from './gameplay';
import type { WeaponId } from './protocol';

export type FireCycleState = {
  flash: number;
  kick: number;
  boltTravel: number;
  smokeScale: number;
  casingReady: boolean;
};

export type HitReactionState = {
  envelope: number;
  pitch: number;
  roll: number;
};

export type ViewmodelObstructionPose = Readonly<{
  retreat: number;
  lift: number;
}>;

export type ViewmodelContactProfile = Readonly<{
  weapon: WeaponId;
  /** Authored camera-forward envelope covering the complete weapon and hands. */
  probeLengthMeters: number;
  /** Distance at which the player capsule is close enough to require a complete stow. */
  fullStowDistanceMeters: number;
  probeHalfWidthMeters: number;
  probeUpperOffsetMeters: number;
  probeLowerOffsetMeters: number;
  maximumSurfaceRetreatMeters: number;
  maximumHighReadyPitchRadians: number;
  maximumYawRadians: number;
  maximumRollRadians: number;
  maximumAdditionalLiftMeters: number;
  maximumWallDropMeters: number;
  minimumScale: number;
}>;

export type ViewmodelContactProbeOffset = Readonly<{
  rightScale: -1 | 0 | 1;
  vertical: 'centre' | 'upper' | 'lower';
}>;

export type ViewmodelContactResponse = Readonly<{
  contract: typeof VIEWMODEL_CONTACT_RESPONSE_CONTRACT;
  profileId: WeaponId;
  active: boolean;
  wallBlend: number;
  floorBlend: number;
  obstructionBlend: number;
  highReadyBlend: number;
  pitchRadians: number;
  yawRadians: number;
  rollRadians: number;
  additionalLiftMeters: number;
  /** Constant presentation lift while prone. Reload/recoil dips ride up to
   * ~5 cm lower than the settled pose; the old full-fold lift absorbed them
   * by accident, the flat-prone baseline does not. Kept OUT of
   * additionalLiftMeters so contact-delta identities stay exact. */
  proneFloorGuardMeters: number;
  additionalDropMeters: number;
  scale: number;
  minimumScale: number;
  aimAuthority: 'camera-forward-unchanged';
}>;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const finite = (value: number, fallback = 0): number => Number.isFinite(value) ? value : fallback;
/** A stable millimetre grid prevents sub-pixel collider jitter from changing the presented pose. */
const quantizeContactMetersDown = (value: number): number => Math.floor(value * 1_000 + 1e-9) / 1_000;
export const ADS_IN_RESPONSE_PER_SECOND = 22;
export const ADS_OUT_RESPONSE_PER_SECOND = 18;
export const VIEWMODEL_CONTACT_RESPONSE_CONTRACT = 'catalog-viewmodel-contact-response-v2';
/**
 * Retained normalized samples for the complete authored weapon envelope.
 * Runtime scales these by the active weapon profile without allocating or
 * changing camera, muzzle, projectile, or character collision authority.
 */
export const VIEWMODEL_CONTACT_PROBE_OFFSETS: readonly ViewmodelContactProbeOffset[] = Object.freeze([
  Object.freeze({ rightScale: 0, vertical: 'centre' }),
  Object.freeze({ rightScale: -1, vertical: 'centre' }),
  Object.freeze({ rightScale: 1, vertical: 'centre' }),
  Object.freeze({ rightScale: 0, vertical: 'upper' }),
  Object.freeze({ rightScale: 0, vertical: 'lower' }),
  Object.freeze({ rightScale: -1, vertical: 'upper' }),
  Object.freeze({ rightScale: 1, vertical: 'upper' }),
  Object.freeze({ rightScale: -1, vertical: 'lower' }),
  Object.freeze({ rightScale: 1, vertical: 'lower' }),
]);
/**
 * The nine envelope probes are padded until neighbouring samples overlap.
 * This turns the former point-ray lattice into one conservative swept volume,
 * so a thin diagonal return or doorjamb cannot pass between samples.
 */
export function viewmodelContactProbePaddingMeters(profile: ViewmodelContactProfile): number {
  return Math.max(
    0.085,
    profile.probeHalfWidthMeters * 0.52,
    profile.probeUpperOffsetMeters * 0.52,
    profile.probeLowerOffsetMeters * 0.52,
  );
}
const VIEWMODEL_PRONE_BASE_RETREAT_METERS = 0.09;
// Owner 2026-08-30 ("clipping ... or prone, longtime issue"): flat-ground
// prone probes ~0.19 m of floor lift, and with the old 0.115 baseline every
// open-field prone sat at ~0.88 highReadyBlend - the weapon folded ~90
// degrees with the forearm rammed through the camera, which is what the
// prone view has been showing. The baseline is the measured FLAT-GROUND
// value (+1 cm slack), so the fold engages only when clearance is genuinely
// tighter than normal prone (under low cover, muzzle to a wall). The fire
// gate already passed lift as 0 for exactly this reason; presentation now
// matches it.
const VIEWMODEL_PRONE_BASE_LIFT_METERS = 0.2;
const VIEWMODEL_PRONE_FLOOR_LIFT_BUDGET_METERS = 0.085;
const VIEWMODEL_STANDING_FLOOR_LIFT_BUDGET_METERS = 0.04;

const contactProfile = (
  weapon: WeaponId,
  maximumHighReadyPitchRadians: number,
  minimumScale: number,
  probeLengthMeters = 1.65,
  probeHalfWidthMeters = 0.24,
  probeUpperOffsetMeters = 0.25,
  probeLowerOffsetMeters = 0.28,
  maximumSurfaceRetreatMeters = 0.78,
  maximumYawRadians = -0.14,
  maximumRollRadians = 0.09,
  maximumAdditionalLiftMeters = 0.055,
  maximumWallDropMeters = 0.22,
): ViewmodelContactProfile => Object.freeze({
  weapon,
  probeLengthMeters,
  fullStowDistanceMeters: Math.min(0.78, Math.max(0.5, probeLengthMeters * 0.36)),
  probeHalfWidthMeters,
  probeUpperOffsetMeters,
  probeLowerOffsetMeters,
  maximumSurfaceRetreatMeters,
  maximumHighReadyPitchRadians,
  maximumYawRadians,
  maximumRollRadians,
  maximumAdditionalLiftMeters,
  maximumWallDropMeters,
  minimumScale,
});

/**
 * One explicit response for every canonical first-person weapon. Long/heavy
 * families receive a stronger high-ready fold and slightly more foreshortening;
 * compact sidearms retain more of their authored screen size. The complete
 * catalog record prevents a newly added gun from silently reverting to the
 * clipping-prone neutral pose.
 */
export const VIEWMODEL_CONTACT_PROFILES: Readonly<Record<WeaponId, ViewmodelContactProfile>> = Object.freeze({
  carbine: contactProfile('carbine', 0.82, 0.79),
  smg: contactProfile('smg', 0.68, 0.83, 1.45, 0.22, 0.22, 0.25, 0.72, -0.11, 0.075, 0.045, 0.19),
  lmg: contactProfile('lmg', 0.94, 0.76, 1.9, 0.3, 0.28, 0.34, 0.96, -0.17, 0.1, 0.065, 0.25),
  scattergun: contactProfile('scattergun', 0.9, 0.77, 1.85, 0.29, 0.28, 0.33, 0.92, -0.16, 0.1, 0.06, 0.24),
  sniper: contactProfile('sniper', 0.96, 0.75, 1.95, 0.31, 0.3, 0.35, 0.98, -0.17, 0.1, 0.065, 0.25),
  'mini-uzi': contactProfile('mini-uzi', 0.62, 0.85, 1.25, 0.18, 0.2, 0.22, 0.64, -0.1, 0.07, 0.04, 0.18),
  mp5: contactProfile('mp5', 0.7, 0.82, 1.5, 0.22, 0.23, 0.26, 0.74, -0.12, 0.08, 0.05, 0.2),
  // The generic 22 cm wall drop turned the M4 fold into a low-ready pose and
  // buried the complete firing sleeve. Its 84-degree pitch plus 82 cm retreat
  // already clears the authored envelope; retain the catalog's 17 cm minimum
  // drop and counter it with a physical 12 cm high-ready lift so both hands
  // and the intervening forearms remain visible while the shoulders still
  // continue through the crop.
  m4a1: contactProfile('m4a1', 0.84, 0.86, 1.7, 0.25, 0.26, 0.3, 0.82, -0.14, 0.09, 0.12, 0.17),
  'ak-47': contactProfile('ak-47', 0.86, 0.78, 1.75, 0.26, 0.27, 0.31, 0.86, -0.15),
  minigun: contactProfile('minigun', 1, 0.74, 1.95, 0.36, 0.32, 0.4, 1, -0.18, 0.11, 0.07, 0.27),
  'm14-ebr': contactProfile('m14-ebr', 0.94, 0.76, 1.9, 0.3, 0.29, 0.34, 0.96, -0.16, 0.1, 0.065, 0.25),
  'slug-shotgun': contactProfile('slug-shotgun', 0.92, 0.76, 1.88, 0.29, 0.28, 0.34, 0.94, -0.16, 0.1, 0.065, 0.24),
  pistol: contactProfile('pistol', 0.56, 0.87, 1.15, 0.18, 0.18, 0.2, 0.6, -0.08, 0.06, 0.035, 0.17),
  'machine-pistol': contactProfile('machine-pistol', 0.62, 0.85, 1.3, 0.19, 0.2, 0.22, 0.66, -0.09, 0.065, 0.04, 0.18),
  magnum: contactProfile('magnum', 0.62, 0.84, 1.32, 0.2, 0.21, 0.23, 0.68, -0.09, 0.065, 0.04, 0.18),
  'flashlight-pistol': contactProfile('flashlight-pistol', 0.58, 0.86, 1.2, 0.19, 0.19, 0.21, 0.62, -0.08, 0.06, 0.04, 0.17),
  'explosive-crossbow': contactProfile('explosive-crossbow', 0.78, 0.8, 1.75, 0.32, 0.26, 0.32, 0.86, -0.13, 0.085, 0.055, 0.22),
  railgun: contactProfile('railgun', 0.98, 0.75, 2, 0.34, 0.3, 0.36, 1, -0.18, 0.11, 0.07, 0.26),
  flamethrower: contactProfile('flamethrower', 0.96, 0.75, 1.9, 0.34, 0.3, 0.38, 0.98, -0.18, 0.11, 0.07, 0.26),
  'crimson-flamethrower': contactProfile('crimson-flamethrower', 0.96, 0.75, 1.9, 0.34, 0.3, 0.38, 0.98, -0.18, 0.11, 0.07, 0.26),
  'flare-gun': contactProfile('flare-gun', 0.55, 0.87, 1.2, 0.18, 0.19, 0.21, 0.62, -0.08, 0.06, 0.035, 0.18),
});

/**
 * Presentation-only contact fold. ADS reduces the fold but cannot cancel it:
 * an always-on-top viewmodel would otherwise draw through the wall at the exact
 * moment contact is most likely. Open-space ADS remains byte-for-byte neutral.
 * No camera, projectile or gameplay-ray state is an input or output.
 */
export function viewmodelContactResponse(
  weapon: WeaponId,
  surfaceRetreatMeters: number,
  surfaceLiftMeters: number,
  prone: boolean,
  adsBlend: number,
): ViewmodelContactResponse {
  const profile = VIEWMODEL_CONTACT_PROFILES[weapon];
  const retreat = Math.max(0, finite(surfaceRetreatMeters));
  const lift = Math.max(0, finite(surfaceLiftMeters));
  const wallBlend = clamp01(
    (retreat - (prone ? VIEWMODEL_PRONE_BASE_RETREAT_METERS : 0))
      / Math.max(0.01, profile.maximumSurfaceRetreatMeters - (prone ? VIEWMODEL_PRONE_BASE_RETREAT_METERS : 0)),
  );
  const floorBlend = clamp01(
    (lift - (prone ? VIEWMODEL_PRONE_BASE_LIFT_METERS : 0))
      / (prone ? VIEWMODEL_PRONE_FLOOR_LIFT_BUDGET_METERS : VIEWMODEL_STANDING_FLOOR_LIFT_BUDGET_METERS),
  );
  const obstructionBlend = Math.max(wallBlend, floorBlend);
  const adsRemaining = 1 - clamp01(finite(adsBlend));
  // Contact is a physical presentation constraint, not an aim preference.
  // Settled ADS therefore retains eighty-two percent of the high-ready fold;
  // the old forty-eight percent left long receivers visibly inside cover.
  const contactRetention = 0.82 + 0.18 * adsRemaining;
  const highReadyBlend = obstructionBlend * contactRetention;
  const wallDropMeters = profile.maximumWallDropMeters
    * wallBlend
    * (0.72 + 0.28 * adsRemaining);
  return Object.freeze({
    contract: VIEWMODEL_CONTACT_RESPONSE_CONTRACT,
    profileId: weapon,
    active: obstructionBlend > 0.001,
    wallBlend,
    floorBlend,
    obstructionBlend,
    highReadyBlend,
    pitchRadians: highReadyBlend === 0 ? 0 : profile.maximumHighReadyPitchRadians * highReadyBlend,
    yawRadians: highReadyBlend === 0 ? 0 : profile.maximumYawRadians * highReadyBlend,
    rollRadians: highReadyBlend === 0 ? 0 : profile.maximumRollRadians * highReadyBlend,
    additionalLiftMeters: profile.maximumAdditionalLiftMeters
      * Math.max(wallBlend, floorBlend)
      * (0.72 + 0.28 * adsRemaining)
      // The probe's measured floor pressure is real world-space clearance.
      // Carry it into the camera-space root so the complete skinned sleeves and
      // receiver remain above the prone floor instead of only reporting lift.
      + lift * floorBlend
      // Retain the accepted wall-drop telemetry and response, while floor
      // contact counter-lifts ninety-two percent of it. PRONE keys the
      // counter-lift directly: lying down, the floor plane is always 0.61 m
      // below the eye, so a wall-contact drop must be countered even when the
      // floor-lift blend reads zero (the 2026-08-30 baseline re-measure made
      // flat-ground prone read zero, and the anatomy gate caught the muzzle
      // digging 3.6 cm through the prone floor at full wall retreat).
      + wallDropMeters * Math.max(prone ? 1 : 0, floorBlend) * 0.92,
    additionalDropMeters: wallDropMeters,
    proneFloorGuardMeters: prone ? 0.1 : 0,
    scale: 1 - (1 - profile.minimumScale) * highReadyBlend,
    minimumScale: profile.minimumScale,
    aimAuthority: 'camera-forward-unchanged',
  });
}

/**
 * A number of authored floors are raycast planes rather than movement boxes.
 * When the player is grounded, stance eye height is the exact presentation
 * clearance even if the downward box probe has no hit. Airborne poses retain
 * null so a jump/fall cannot invent a floor underneath the camera.
 */
export function viewmodelFloorClearance(
  probedMeters: number | null,
  grounded: boolean,
  stanceEyeHeightMeters: number,
): number | null {
  if (probedMeters !== null && Number.isFinite(probedMeters)) return Math.max(0, probedMeters);
  if (!grounded || !Number.isFinite(stanceEyeHeightMeters) || stanceEyeHeightMeters <= 0) return null;
  return stanceEyeHeightMeters;
}

/** Converts a base vertical field of view into a true angular magnification. */
export function magnifiedFovDegrees(baseFovDegrees: number, magnification: number): number {
  const safeBase = Math.min(120, Math.max(10, finite(baseFovDegrees, 76)));
  const safeMagnification = Math.min(12, Math.max(1, finite(magnification, 1)));
  const baseRadians = safeBase * Math.PI / 180;
  return 2 * Math.atan(Math.tan(baseRadians / 2) / safeMagnification) * 180 / Math.PI;
}

/** Sniper aim is deliberately binary; every other family retains authored easing. */
export function advanceAdsBlend(current: number, ads: boolean, dt: number, weapon: WeaponId): number {
  if (weapon === 'sniper') return ads ? 1 : 0;
  const safeCurrent = clamp01(finite(current));
  const safeDt = Math.max(0, finite(dt));
  const blend = 1 - Math.exp(-(ads ? ADS_IN_RESPONSE_PER_SECOND : ADS_OUT_RESPONSE_PER_SECOND) * safeDt);
  return clamp01(safeCurrent + ((ads ? 1 : 0) - safeCurrent) * blend);
}

// ---------------------------------------------------------------------------
// HF-388 arms-animation polish: authored motion curves.
//
// All three are PURE, deterministic functions of (time | blend) so focused
// tests can pin the exact trajectory; the live update loop only advances
// clocks and reads these. None of them touches camera-space Z, gameplay rays,
// recoil authority or multiplayer state - presentation only.
// ---------------------------------------------------------------------------

/**
 * Shared underdamped second-order remainder: 1 at t=0 with ZERO initial
 * slope, decaying through one bounded reverse excursion before settling.
 * `1 - remainder` is therefore a step response that rises, overshoots rest by
 * exp(-pi*zeta/sqrt(1-zeta^2)) and settles - the shape of an equip settle.
 */
const underdampedRestFraction = (seconds: number, zeta: number, omegaNatural: number): number => {
  const damping = zeta * omegaNatural;
  const omegaDamped = omegaNatural * Math.sqrt(1 - zeta * zeta);
  return Math.exp(-damping * seconds)
    * (Math.cos(omegaDamped * seconds) + (damping / omegaDamped) * Math.sin(omegaDamped * seconds));
};

export const VIEWMODEL_EQUIP_SETTLE_CONTRACT = 'hf388-underdamped-equip-settle-v1';
/** Seconds until the rising blend first crosses rest (remainder's first zero). */
export const VIEWMODEL_EQUIP_RISE_SECONDS =
  (Math.PI - Math.atan(Math.sqrt(1 - 0.75 * 0.75) / 0.75)) / (15.2 * Math.sqrt(1 - 0.75 * 0.75));
export const VIEWMODEL_EQUIP_SETTLED_SECONDS = 0.6;
/** Authored follow-through: fraction of the drop that rebounds past rest once. */
export const VIEWMODEL_EQUIP_OVERSHOOT = Math.exp(-Math.PI * 0.75 / Math.sqrt(1 - 0.75 * 0.75));

/**
 * Equip/holster settle for the weapon-switch drop. Returns the settledness
 * blend (0 = fully holstered, 1 = at rest) along an underdamped timeline:
 * soft attack, first crossing of rest at VIEWMODEL_EQUIP_RISE_SECONDS, one
 * bounded ~2.8% rebound above rest, then exact rest. Never negative, never
 * further above rest than twice the authored overshoot.
 */
export function viewmodelEquipBlendAt(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  if (seconds >= VIEWMODEL_EQUIP_SETTLED_SECONDS) return 1;
  const blend = 1 - underdampedRestFraction(seconds, 0.75, 15.2);
  // Clamp the microscopic reverse tail so the applied drop never exceeds its
  // authored -0.52 m bound, and cap the rebound headroom explicitly.
  return Math.min(1 + 2 * VIEWMODEL_EQUIP_OVERSHOOT, Math.max(0, blend));
}

export const FIRST_PERSON_LAND_DIP_METERS = 0.075;
export const VIEWMODEL_LAND_DIP_ONSET_SECONDS = 0.06;
export const VIEWMODEL_LAND_DIP_SETTLE_SECONDS = 0.5;
/** Rebound fraction of the dip amplitude, derived from the shared remainder. */
export const VIEWMODEL_LAND_DIP_REBOUND = Math.exp(-Math.PI * 0.4557 / Math.sqrt(1 - 0.4557 * 0.4557));
const LAND_DIP_ZETA = 0.4557;
const LAND_DIP_OMEGA_NATURAL = 22;

/**
 * Landing envelope shape in [0, 1]: fast-but-finite attack over the onset
 * window (the old code snapped to full depth inside ONE frame), then a C1
 * continuous damped release whose single rebound carries
 * VIEWMODEL_LAND_DIP_REBOUND (~20%) of the dip ABOVE rest before settling.
 */
export function viewmodelLandDipShapeAt(ageSeconds: number): number {
  if (!Number.isFinite(ageSeconds) || ageSeconds <= 0) return 0;
  if (ageSeconds >= VIEWMODEL_LAND_DIP_SETTLE_SECONDS) return 0;
  const onset = Math.min(1, Math.max(0, ageSeconds / VIEWMODEL_LAND_DIP_ONSET_SECONDS));
  const attack = onset * onset * (3 - 2 * onset);
  if (ageSeconds <= VIEWMODEL_LAND_DIP_ONSET_SECONDS) return attack;
  return attack * underdampedRestFraction(ageSeconds - VIEWMODEL_LAND_DIP_ONSET_SECONDS, LAND_DIP_ZETA, LAND_DIP_OMEGA_NATURAL);
}

/**
 * Signed vertical landing offset in metres: negative below rest while dipping,
 * positive during the rebound. `impulse01` is the clamped impact strength the
 * movement loop already scaled by the accessibility motion setting.
 */
export function viewmodelLandDropMetersAt(ageSeconds: number, impulse01: number): number {
  if (!Number.isFinite(impulse01)) return 0;
  return -FIRST_PERSON_LAND_DIP_METERS * Math.min(1, Math.max(0, impulse01)) * viewmodelLandDipShapeAt(ageSeconds);
}

export const VIEWMODEL_SPRINT_POSE_EASE_CONTRACT = 'hf388-smoothstep-sprint-pose-v1';
/**
 * S-curve applied to the VISUAL sprint terms only (drop, yaw, roll). The raw
 * sprintBlend keeps feeding action contracts and stance gating byte-identically;
 * easing here removes the instantaneous lurch at sprint key-down/key-up while
 * preserving both endpoints exactly.
 */
export function viewmodelSprintPoseEase(blend: number): number {
  if (!Number.isFinite(blend)) return 0;
  const b = Math.min(1, Math.max(0, blend));
  return b * b * (3 - 2 * b);
}

/** Bounded heat accumulator used only for original presentation smoke/flash layering. */
export function advanceWeaponHeat(current: number, fired: boolean, dt: number, weapon: WeaponId): number {
  const safeCurrent = clamp01(finite(current));
  const safeDt = Math.max(0, finite(dt));
  const perShot = weapon === 'scattergun' ? 0.32 : weapon === 'sniper' ? 0.26 : weapon === 'lmg' ? 0.14 : weapon === 'smg' || weapon === 'machine-pistol' ? 0.1 : 0.17;
  const cooled = Math.max(0, safeCurrent - safeDt * 0.24);
  return clamp01(cooled + (fired ? perShot : 0));
}

/**
 * Keeps camera-attached geometry inside the player's free-space envelope.
 * This is presentation-only: it never changes the camera, gameplay ray, or
 * authoritative character capsule.
 */
export function viewmodelObstructionPose(
  nearestForwardSurfaceMeters: number | null,
  prone: boolean,
  floorClearanceMeters: number | null = null,
  weapon: WeaponId = 'carbine',
): ViewmodelObstructionPose {
  const profile = VIEWMODEL_CONTACT_PROFILES[weapon];
  const distance = nearestForwardSurfaceMeters === null || !Number.isFinite(nearestForwardSurfaceMeters)
    ? Number.POSITIVE_INFINITY
    : Math.max(0, nearestForwardSurfaceMeters);
  // The camera can never reach zero metres from a wall because the player
  // capsule owns authoritative movement. Saturate at the real close-cover
  // distance instead of reserving the complete fold for an impossible pose.
  const contactRangeMeters = Math.max(0.01, profile.probeLengthMeters - profile.fullStowDistanceMeters);
  const contactBlend = clamp01((profile.probeLengthMeters - distance) / contactRangeMeters);
  const obstruction = contactBlend
    * (profile.maximumSurfaceRetreatMeters - (prone ? VIEWMODEL_PRONE_BASE_RETREAT_METERS : 0));
  const floorClearance = floorClearanceMeters === null || !Number.isFinite(floorClearanceMeters)
    ? Number.POSITIVE_INFINITY
    : Math.max(0, floorClearanceMeters);
  const floorPressure = floorClearance >= 0.82 ? 0 : (1 - floorClearance / 0.82);
  const proneGroundedLift = prone && Number.isFinite(floorClearance)
    ? VIEWMODEL_PRONE_FLOOR_LIFT_BUDGET_METERS * 0.88
    : 0;
  return {
    retreat: quantizeContactMetersDown(Math.min(
      profile.maximumSurfaceRetreatMeters,
      Math.max(0, obstruction + (prone ? VIEWMODEL_PRONE_BASE_RETREAT_METERS : 0)),
    )),
    lift: Math.min(0.2, Math.max(0, (prone ? VIEWMODEL_PRONE_BASE_LIFT_METERS : 0)
      + Math.max(proneGroundedLift, floorPressure * (prone ? VIEWMODEL_PRONE_FLOOR_LIFT_BUDGET_METERS : VIEWMODEL_STANDING_FLOOR_LIFT_BUDGET_METERS)))),
  };
}

/** Backwards-compatible scalar used by non-runtime presentation tests/tools. */
export function viewmodelSurfaceRetreat(nearestSurfaceMeters: number | null, prone: boolean, weapon: WeaponId = 'carbine'): number {
  return viewmodelObstructionPose(nearestSurfaceMeters, prone, null, weapon).retreat;
}

/** Deterministic visual fire-cycle envelope. Gameplay recoil and hit rays remain authoritative elsewhere. */
export function fireCycleAt(weapon: WeaponId, rawAgeMs: number, heat: number): FireCycleState {
  const ageMs = Math.max(0, finite(rawAgeMs));
  const fastAuto = weapon === 'smg' || weapon === 'machine-pistol';
  const cycleMs = fastAuto ? 44 : weapon === 'scattergun' ? 620 : weapon === 'sniper' ? 920 : weapon === 'lmg' ? 84 : 62;
  const flashDuration = weapon === 'scattergun' ? 82 : weapon === 'sniper' ? 78 : weapon === 'lmg' ? 62 : fastAuto ? 36 : 52;
  const flashProgress = clamp01(ageMs / flashDuration);
  const flash = (1 - flashProgress) ** 2;
  const kickDuration = weapon === 'scattergun' ? 170 : weapon === 'sniper' ? 310 : weapon === 'magnum' ? 150 : weapon === 'lmg' ? 105 : fastAuto ? 50 : weapon === 'pistol' ? 58 : 62;
  const kickProgress = clamp01(ageMs / kickDuration);
  const kick = kickProgress >= 1 ? 0 : (1 - kickProgress) ** 1.35;
  const actionAge = weapon === 'scattergun' ? Math.max(0, ageMs - 180) : weapon === 'sniper' ? Math.max(0, ageMs - 130) : ageMs;
  const actionDuration = weapon === 'scattergun' ? 440 : weapon === 'sniper' ? 700 : cycleMs;
  const actionProgress = clamp01(actionAge / actionDuration);
  const boltTravel = actionProgress >= 1 ? 0 : Math.sin(actionProgress * Math.PI);
  return {
    flash,
    kick,
    boltTravel,
    smokeScale: 0.72 + clamp01(finite(heat)) * 1.28,
    casingReady: ageMs >= (weapon === 'scattergun' ? 230 : weapon === 'sniper' ? 150 : fastAuto ? 24 : 34),
  };
}

// HF-343: the near-wall high-ready raise was presentation-only with zero
// effect on firing ("when behind cover gun moves up but can still shoot like
// crosshair"). This typed admission is the handoff seam: the viewmodel contact
// response already measures how far the weapon is raised, so gameplay (the
// legacy-main tryFire gate) can consume one frozen record instead of
// re-deriving blends. Presentation still applies nothing itself — the
// authoritative shot ray, hit timing and recoil stay exactly where they are;
// aimAuthority records that contract on every record.
export const VIEWMODEL_FIRE_ADMISSION_CONTRACT = 'viewmodel-fire-admission-hf343-v1';
/**
 * Block firing once the weapon is fully raised against cover: either the
 * forward probe hit within the authored full-stow distance, or the high-ready
 * blend reached ~0.9 (the owner asked for "a balance", not a hair trigger).
 */
export const VIEWMODEL_FIRE_BLOCK_HIGH_READY_BLEND = 0.9;
/**
 * Graduated accuracy penalty while partially raised. 0.014 rad (~0.8 degrees)
 * is comparable to the carbine's authored hip spread (0.012 rad): a half
 * raised weapon shoots roughly like strafing, a fully raised one is blocked,
 * and open space is untouched.
 */
export const VIEWMODEL_FIRE_MAXIMUM_SPREAD_PENALTY_RADIANS = 0.014;

export type ViewmodelFireBlockReason = 'open-space' | 'full-stow' | 'high-ready';

export type ViewmodelFireAdmission = Readonly<{
  contract: typeof VIEWMODEL_FIRE_ADMISSION_CONTRACT;
  weapon: WeaponId;
  /** Typed obstruction/high-ready blends mirrored from the contact response. */
  obstructionBlend: number;
  highReadyBlend: number;
  /** Recommended policy: true when the trigger should be refused this frame. */
  fireBlocked: boolean;
  blockReason: ViewmodelFireBlockReason;
  /** Additive radians the host should add to the sampled spread cone. */
  spreadPenaltyRadians: number;
  policy: 'block-full-stow-graduate-partial-v1';
  aimAuthority: 'camera-forward-unchanged';
}>;

/**
 * HF-343 recommended fire policy from one contact response. Full stow is
 * detected two equivalent ways: an explicit forward-probe distance at or
 * inside the profile's full-stow range, or the wall blend saturating (the
 * retreat already clamped to its maximum, which the obstruction pose only
 * produces at that same distance). The spread penalty ramps linearly with the
 * high-ready blend and saturates at the block threshold so blocked shots
 * report the maximum penalty rather than an arbitrary one.
 */
export function viewmodelFireAdmissionFromResponse(
  weapon: WeaponId,
  response: ViewmodelContactResponse,
  nearestForwardSurfaceMeters: number | null = null,
): ViewmodelFireAdmission {
  const profile = VIEWMODEL_CONTACT_PROFILES[weapon];
  const distance = nearestForwardSurfaceMeters === null || !Number.isFinite(nearestForwardSurfaceMeters)
    ? null
    : Math.max(0, nearestForwardSurfaceMeters);
  const fullStow = (distance !== null && distance <= profile.fullStowDistanceMeters)
    || response.wallBlend >= 1;
  const highReadyBlend = clamp01(finite(response.highReadyBlend));
  const raisedPastThreshold = highReadyBlend >= VIEWMODEL_FIRE_BLOCK_HIGH_READY_BLEND;
  const fireBlocked = fullStow || raisedPastThreshold;
  const blockReason: ViewmodelFireBlockReason = !fireBlocked
    ? 'open-space'
    : fullStow ? 'full-stow' : 'high-ready';
  const raiseRamp = clamp01(highReadyBlend / VIEWMODEL_FIRE_BLOCK_HIGH_READY_BLEND);
  return Object.freeze({
    contract: VIEWMODEL_FIRE_ADMISSION_CONTRACT,
    weapon,
    obstructionBlend: clamp01(finite(response.obstructionBlend)),
    highReadyBlend,
    fireBlocked,
    blockReason,
    spreadPenaltyRadians: fireBlocked
      ? VIEWMODEL_FIRE_MAXIMUM_SPREAD_PENALTY_RADIANS
      : VIEWMODEL_FIRE_MAXIMUM_SPREAD_PENALTY_RADIANS * raiseRamp,
    policy: 'block-full-stow-graduate-partial-v1',
    aimAuthority: 'camera-forward-unchanged',
  });
}

/**
 * HF-343 convenience wrapper mirroring viewmodelContactResponse's signature,
 * so the host can gate firing from the same per-frame obstruction inputs the
 * presentation consumes (plus the raw forward-probe distance when it has one).
 */
export function viewmodelFireAdmission(
  weapon: WeaponId,
  surfaceRetreatMeters: number,
  surfaceLiftMeters: number,
  prone: boolean,
  adsBlend: number,
  nearestForwardSurfaceMeters: number | null = null,
): ViewmodelFireAdmission {
  return viewmodelFireAdmissionFromResponse(
    weapon,
    viewmodelContactResponse(weapon, surfaceRetreatMeters, surfaceLiftMeters, prone, adsBlend),
    nearestForwardSurfaceMeters,
  );
}

/** Presentation-only reaction envelope; authoritative operator hit meshes do not consume these rotations. */
export function hitReactionAt(rawAgeMs: number, zone: HitZone): HitReactionState {
  const ageMs = Math.max(0, finite(rawAgeMs));
  const duration = zone === 'head' ? 260 : 320;
  const progress = clamp01(ageMs / duration);
  if (progress >= 1) return { envelope: 0, pitch: 0, roll: 0 };
  const envelope = Math.sin(progress * Math.PI) * (1 - progress * 0.32);
  const strength = zone === 'head' ? 1 : zone === 'limb' ? 0.62 : 0.78;
  return {
    envelope: progress >= 1 ? 0 : envelope * strength,
    pitch: (zone === 'head' ? -0.2 : 0.12) * envelope * strength,
    roll: (zone === 'limb' ? 0.18 : 0.1) * envelope * strength,
  };
}
