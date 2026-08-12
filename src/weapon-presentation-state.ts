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
  additionalDropMeters: number;
  scale: number;
  minimumScale: number;
  aimAuthority: 'camera-forward-unchanged';
}>;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const finite = (value: number, fallback = 0): number => Number.isFinite(value) ? value : fallback;
export const ADS_IN_RESPONSE_PER_SECOND = 22;
export const ADS_OUT_RESPONSE_PER_SECOND = 18;
export const VIEWMODEL_CONTACT_RESPONSE_CONTRACT = 'catalog-viewmodel-contact-response-v2';
const VIEWMODEL_PRONE_BASE_RETREAT_METERS = 0.09;
const VIEWMODEL_PRONE_BASE_LIFT_METERS = 0.115;
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
  m4a1: contactProfile('m4a1', 0.84, 0.78, 1.7, 0.25, 0.26, 0.3, 0.82),
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
  const contactRetention = 0.48 + 0.52 * adsRemaining;
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
      // Retain the accepted wall-drop telemetry and response, while a real
      // floor contact counter-lifts ninety-two percent of it. This keeps the
      // connected weapon/hands above the prone plane without weakening the
      // established high-ready/drop gate or changing gameplay authority.
      + wallDropMeters * floorBlend * 0.92,
    additionalDropMeters: wallDropMeters,
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
  const obstruction = distance >= profile.probeLengthMeters
    ? 0
    : (1 - distance / profile.probeLengthMeters)
      * (profile.maximumSurfaceRetreatMeters - (prone ? VIEWMODEL_PRONE_BASE_RETREAT_METERS : 0));
  const floorClearance = floorClearanceMeters === null || !Number.isFinite(floorClearanceMeters)
    ? Number.POSITIVE_INFINITY
    : Math.max(0, floorClearanceMeters);
  const floorPressure = floorClearance >= 0.82 ? 0 : (1 - floorClearance / 0.82);
  const proneGroundedLift = prone && Number.isFinite(floorClearance)
    ? VIEWMODEL_PRONE_FLOOR_LIFT_BUDGET_METERS * 0.88
    : 0;
  return {
    retreat: Math.min(profile.maximumSurfaceRetreatMeters, Math.max(0, obstruction + (prone ? VIEWMODEL_PRONE_BASE_RETREAT_METERS : 0))),
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
