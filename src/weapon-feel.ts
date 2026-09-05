/**
 * HF-510 weapon feel: the measurable half of "every weapon feels excellent".
 *
 * "Feels good" is not a test. This module turns per-weapon recoil and spread
 * into quantities with units, measured THROUGH the shipped combat functions
 * (`computeSpread`, `computeRecoilImpulse`, `recoverRecoilImpulse`) rather than
 * by re-deriving the maths, so a change to those functions moves these numbers.
 *
 * Everything here is a READ of host-authoritative catalog values. Nothing in
 * this module is consulted by the shot path, so it can never become a second
 * balance authority: it can only observe the one that exists and redden a gate
 * when a class drifts out of its band.
 *
 * CLAIM-STATE. The band EDGES are an inference from the BO2-class reference and
 * from what the shipped values already produce; they are not measurements of
 * any shipped product. The values inside them are measured from this tree.
 */

import { LEGACY_WEAPONS, type LegacyWeaponSpec } from './combat/legacy-weapon-adapter';
import { WEAPON_CATALOG } from './combat/weapon-catalog';
import type { WeaponFamily } from './combat/weapon-schema';
import { computeRecoilImpulse, computeSpread, recoverRecoilImpulse } from './gameplay';
import type { WeaponId } from './protocol';

/** Reference range for every cone figure. A 30 m lane is the mid-map duel. */
export const FEEL_REFERENCE_RANGE_M = 30;

/** Burst length every climb figure is measured over. */
export const FEEL_BURST_SHOTS = 10;

/** Recoil recovery is exponential and never reaches zero; 95 % is the settle. */
export const FEEL_RECOVERY_FRACTION = 0.95;

/**
 * Shipped clamp from the fire path in `src/legacy-main.ts`: accumulated camera
 * pitch is `Math.min(0.16, ...)`. Mirrored here so a burst measurement reports
 * what the player's camera actually does, not an unclamped sum.
 */
export const CAMERA_RECOIL_PITCH_CLAMP = 0.16;

/**
 * HF-511 (OPEN, documented divergence - NOT fixed in this pass).
 *
 * `computeSpread` multiplies EVERY weapon's prone cone by this one constant,
 * while the catalog has authored a per-weapon `spread.proneMultiplier` since
 * Pass 64 (0.50 on the M14 EBR through 0.82 on the flamethrower) that nothing
 * reads. Prone RECOIL does read its authored per-weapon multiplier, so the two
 * halves of the same stance disagree on the same gun.
 *
 * This is deliberately left alone here. The value is frozen by the Pass 64
 * behaviour fixture `src/combat/fixtures/pass64-legacy-weapons.json`
 * (`universalProneSpreadMultiplier`) and asserted by
 * `src/combat/legacy-weapon-adapter.test.ts` - "preserves hardcoded prone
 * spread" - which exists precisely so the Pass 65 catalog refactor could not
 * silently change gameplay. Adopting the authored values is a BALANCE change
 * for the owner to approve with a `gameplay-contract` baseline change id, not
 * something a feel pass may take by editing that contract to green.
 *
 * `proneSpreadDivergence()` measures the size of the gap so the decision has a
 * number attached, and the gate below fails if the divergence changes shape
 * without anyone noticing.
 */
export const UNIVERSAL_PRONE_SPREAD_MULTIPLIER = 0.62;

/** Cone radius in centimetres at the reference range for a cone half-angle. */
export function coneRadiusCm(angleRadians: number, rangeM = FEEL_REFERENCE_RANGE_M): number {
  return Math.tan(Math.max(0, angleRadians)) * rangeM * 100;
}

export type WeaponFeelMetrics = Readonly<{
  id: WeaponId;
  displayName: string;
  family: WeaponFamily;
  rpm: number;
  /** Seconds between shots at the authored cadence. */
  shotIntervalSeconds: number;
  /** Standing, still, first shot of a trigger pull. */
  hipConeCm: number;
  /** Standing, still, settled ADS, first shot of a trigger pull. */
  adsConeCm: number;
  /** adsConeCm / hipConeCm. Lower means ADS buys more. */
  adsTighteningRatio: number;
  crouchConeRatio: number;
  /** What the RUNTIME actually applies prone. See `UNIVERSAL_PRONE_SPREAD_MULTIPLIER`. */
  proneConeRatio: number;
  /** What the CATALOG authors prone for this weapon. Currently unread by the shot path. */
  authoredProneConeRatio: number;
  movingConeRatio: number;
  /** Shots of one held trigger before the cone saturates at `maximumSpread`. */
  sustainedShotsToMaximumCone: number;
  /** Wall-clock cost of that saturation at the authored cadence. */
  secondsToMaximumCone: number;
  /** Cone at saturation, in cm at the reference range. */
  maximumConeCm: number;
  /** First-shot vertical impulse, hip, standing (milliradians). */
  firstShotPitchMrad: number;
  /** Same shot with the sights settled. */
  adsFirstShotPitchMrad: number;
  adsRecoilRatio: number;
  /** Camera pitch reached after a 10-shot hip burst at the authored cadence. */
  burstClimbMrad: number;
  /** That climb expressed as vertical drift in cm at the reference range. */
  burstClimbCm: number;
  /** Same burst with the sights settled. */
  adsBurstClimbMrad: number;
  /** Seconds for an impulse to decay to 5 % of its value. */
  recovery95Seconds: number;
  /** Rounds the weapon puts out inside one 95 % recovery window. */
  shotsPerRecoveryWindow: number;
}>;

function burstClimbRadians(weapon: LegacyWeaponSpec, ads: boolean): number {
  const dt = 60 / Math.max(1, weapon.rpm);
  let pitch = 0;
  for (let shot = 0; shot < FEEL_BURST_SHOTS; shot += 1) {
    // random = 0.5 is the centred yaw sample; it leaves pitch untouched.
    const impulse = computeRecoilImpulse(weapon, shot, 0.5, { ads, crouched: false });
    pitch = Math.min(CAMERA_RECOIL_PITCH_CLAMP, pitch + impulse.pitch);
    if (shot < FEEL_BURST_SHOTS - 1) {
      pitch = recoverRecoilImpulse({ pitch, yaw: 0 }, weapon, dt).pitch;
    }
  }
  return pitch;
}

function sustainedShotsToMaximumCone(weapon: LegacyWeaponSpec): number {
  const context = { ads: false, moving: false, crouched: false, prone: false };
  for (let shots = 0; shots <= 200; shots += 1) {
    if (computeSpread(weapon, { ...context, sustainedShots: shots }) >= weapon.maximumSpread - 1e-9) {
      return shots;
    }
  }
  return Number.POSITIVE_INFINITY;
}

export function weaponFeelMetrics(id: WeaponId): WeaponFeelMetrics {
  const weapon = LEGACY_WEAPONS[id];
  const definition = WEAPON_CATALOG.find((entry) => entry.id === id);
  if (!weapon || !definition) throw new Error(`weapon-feel: unknown weapon ${JSON.stringify(id)}`);
  const still = { moving: false, crouched: false, prone: false, sustainedShots: 0 };
  const hip = computeSpread(weapon, { ...still, ads: false });
  const ads = computeSpread(weapon, { ...still, ads: true });
  const crouch = computeSpread(weapon, { ...still, ads: false, crouched: true });
  const prone = computeSpread(weapon, { ...still, ads: false, prone: true });
  const moving = computeSpread(weapon, { ...still, ads: false, moving: true });
  const shotsToMax = sustainedShotsToMaximumCone(weapon);
  const hipImpulse = computeRecoilImpulse(weapon, 0, 0.5, { ads: false, crouched: false });
  const adsImpulse = computeRecoilImpulse(weapon, 0, 0.5, { ads: true, crouched: false });
  const recovery95 = Math.log(1 / (1 - FEEL_RECOVERY_FRACTION)) / weapon.recoilRecovery;
  const burstHip = burstClimbRadians(weapon, false);
  const burstAds = burstClimbRadians(weapon, true);
  return Object.freeze({
    id,
    displayName: weapon.name,
    family: definition.family,
    rpm: weapon.rpm,
    shotIntervalSeconds: 60 / weapon.rpm,
    hipConeCm: coneRadiusCm(hip),
    adsConeCm: coneRadiusCm(ads),
    adsTighteningRatio: ads / hip,
    crouchConeRatio: crouch / hip,
    proneConeRatio: prone / hip,
    authoredProneConeRatio: definition.spread.proneMultiplier,
    movingConeRatio: moving / hip,
    sustainedShotsToMaximumCone: shotsToMax,
    secondsToMaximumCone: shotsToMax * (60 / weapon.rpm),
    maximumConeCm: coneRadiusCm(weapon.maximumSpread),
    firstShotPitchMrad: hipImpulse.pitch * 1000,
    adsFirstShotPitchMrad: adsImpulse.pitch * 1000,
    adsRecoilRatio: hipImpulse.pitch === 0 ? 1 : adsImpulse.pitch / hipImpulse.pitch,
    burstClimbMrad: burstHip * 1000,
    burstClimbCm: coneRadiusCm(burstHip),
    adsBurstClimbMrad: burstAds * 1000,
    recovery95Seconds: recovery95,
    shotsPerRecoveryWindow: recovery95 * (weapon.rpm / 60),
  });
}

export function allWeaponFeelMetrics(): readonly WeaponFeelMetrics[] {
  return WEAPON_CATALOG.map((definition) => weaponFeelMetrics(definition.id as WeaponId));
}

export type FeelBand = Readonly<{ min: number; max: number }>;

export type WeaponFeelBand = Readonly<{
  /** Hip cone radius at 30 m, cm. */
  hipConeCm: FeelBand;
  /** ADS cone as a fraction of hip. */
  adsTighteningRatio: FeelBand;
  /** First-shot vertical impulse, hip, milliradians. */
  firstShotPitchMrad: FeelBand;
  /** Camera pitch after a 10-shot hip burst, milliradians. */
  burstClimbMrad: FeelBand;
  /** Seconds to 95 % recoil settle. */
  recovery95Seconds: FeelBand;
}>;

/**
 * Per-family bands. Each family is a promise to the player about what the gun
 * costs to hold on target; the band is the width of that promise. A weapon
 * deliberately outside its family's fighting envelope is listed in
 * `FEEL_BAND_EXEMPTIONS` with its reason, never accommodated by widening the
 * family band and hiding the outlier among its siblings.
 */
export const WEAPON_FEEL_BANDS: Readonly<Record<WeaponFamily, WeaponFeelBand>> = Object.freeze({
  'assault-rifle': {
    hipConeCm: { min: 20, max: 70 },
    adsTighteningRatio: { min: 0.2, max: 0.45 },
    firstShotPitchMrad: { min: 8, max: 26 },
    burstClimbMrad: { min: 5, max: 40 },
    recovery95Seconds: { min: 0.16, max: 0.36 },
  },
  smg: {
    hipConeCm: { min: 30, max: 90 },
    adsTighteningRatio: { min: 0.25, max: 0.6 },
    firstShotPitchMrad: { min: 6, max: 20 },
    burstClimbMrad: { min: 4, max: 34 },
    recovery95Seconds: { min: 0.14, max: 0.3 },
  },
  lmg: {
    hipConeCm: { min: 40, max: 130 },
    adsTighteningRatio: { min: 0.25, max: 0.78 },
    firstShotPitchMrad: { min: 6, max: 26 },
    burstClimbMrad: { min: 4, max: 50 },
    recovery95Seconds: { min: 0.16, max: 0.42 },
  },
  shotgun: {
    hipConeCm: { min: 60, max: 320 },
    adsTighteningRatio: { min: 0.1, max: 0.85 },
    firstShotPitchMrad: { min: 30, max: 100 },
    burstClimbMrad: { min: 25, max: 140 },
    recovery95Seconds: { min: 0.25, max: 0.62 },
  },
  marksman: {
    hipConeCm: { min: 60, max: 260 },
    adsTighteningRatio: { min: 0.02, max: 0.25 },
    firstShotPitchMrad: { min: 20, max: 95 },
    burstClimbMrad: { min: 20, max: 160 },
    recovery95Seconds: { min: 0.3, max: 0.62 },
  },
  sidearm: {
    hipConeCm: { min: 40, max: 130 },
    adsTighteningRatio: { min: 0.1, max: 0.55 },
    firstShotPitchMrad: { min: 8, max: 60 },
    burstClimbMrad: { min: 5, max: 80 },
    recovery95Seconds: { min: 0.16, max: 0.58 },
  },
  launcher: {
    hipConeCm: { min: 40, max: 220 },
    adsTighteningRatio: { min: 0.02, max: 0.9 },
    firstShotPitchMrad: { min: 2, max: 100 },
    burstClimbMrad: { min: 1, max: 140 },
    recovery95Seconds: { min: 0.1, max: 0.75 },
  },
});

/**
 * A weapon may sit outside its family band only with a reason recorded here.
 * The exemption names the exact weapon AND metric, so drift on any other
 * metric of the same weapon still reddens the gate.
 */
export const FEEL_BAND_EXEMPTIONS: Readonly<Record<string, string>> = Object.freeze({
  'ak-47:burstClimbMrad':
    'The AK-47 is the assault-rifle class high-recoil member: lowest rpm (600), highest base damage, loosest hip cone (45.0 cm at 30 m against the M4A1 33.0). Its 45.8 mrad 10-shot climb is 62 % above the M4A1 and is the reason to carry either of the other two. Exempted by name so the band stays tight on the HK416 and M4A1 rather than being widened until the outlier hides among its siblings.',
  'railgun:adsTighteningRatio':
    'The railgun collapses its cone to exactly zero under ADS (authored adsMultiplier 0) because it is a single-shot charged rail with a special-authority optic, not a marksman rifle that must still miss.',
});

export type FeelFinding = Readonly<{
  id: WeaponId;
  family: WeaponFamily;
  metric: keyof WeaponFeelBand;
  value: number;
  band: FeelBand;
}>;

/** Every weapon whose measured feel leaves its family band without an exemption. */
export function weaponFeelFindings(): readonly FeelFinding[] {
  const findings: FeelFinding[] = [];
  for (const metrics of allWeaponFeelMetrics()) {
    const bands = WEAPON_FEEL_BANDS[metrics.family];
    for (const metric of Object.keys(bands) as (keyof WeaponFeelBand)[]) {
      if (FEEL_BAND_EXEMPTIONS[`${metrics.id}:${metric}`]) continue;
      const band = bands[metric];
      const value = metrics[metric];
      if (value < band.min || value > band.max) {
        findings.push({ id: metrics.id, family: metrics.family, metric, value, band });
      }
    }
  }
  return findings;
}

/** Markdown table used by the evidence report. */
export function weaponFeelTable(): string {
  const rows = allWeaponFeelMetrics().map((m) => [
    m.displayName,
    m.family,
    String(m.rpm),
    m.hipConeCm.toFixed(1),
    m.adsConeCm.toFixed(1),
    m.adsTighteningRatio.toFixed(2),
    m.crouchConeRatio.toFixed(2),
    m.proneConeRatio.toFixed(2),
    m.firstShotPitchMrad.toFixed(1),
    m.adsFirstShotPitchMrad.toFixed(1),
    m.burstClimbMrad.toFixed(1),
    m.recovery95Seconds.toFixed(3),
    m.shotsPerRecoveryWindow.toFixed(1),
    Number.isFinite(m.sustainedShotsToMaximumCone) ? String(m.sustainedShotsToMaximumCone) : 'never',
  ].join(' | '));
  return [
    '| weapon | family | rpm | hip cm@30m | ADS cm@30m | ADS/hip | crouch/hip | prone/hip | 1st mrad | ADS mrad | 10-shot climb mrad | 95% settle s | shots/settle | shots to max cone |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map((row) => `| ${row} |`),
  ].join('\n');
}

export type ProneSpreadDivergence = Readonly<{
  id: WeaponId;
  displayName: string;
  /** What the catalog authors. */
  authored: number;
  /** What the runtime applies (the universal constant). */
  effective: number;
  /** effective / authored - above 1 means prone is LOOSER than authored. */
  ratio: number;
  /** Prone cone radius error at 30 m, cm (effective minus authored). */
  errorCm: number;
}>;

/**
 * Every weapon whose authored prone spread multiplier disagrees with the
 * universal constant the runtime actually applies. This is a MEASUREMENT of a
 * known, frozen divergence, not an assertion that it is wrong.
 */
export function proneSpreadDivergence(): readonly ProneSpreadDivergence[] {
  const rows: ProneSpreadDivergence[] = [];
  for (const definition of WEAPON_CATALOG) {
    const authored = definition.spread.proneMultiplier;
    if (Math.abs(authored - UNIVERSAL_PRONE_SPREAD_MULTIPLIER) < 1e-9) continue;
    const weapon = LEGACY_WEAPONS[definition.id as WeaponId];
    rows.push(Object.freeze({
      id: definition.id as WeaponId,
      displayName: weapon.name,
      authored,
      effective: UNIVERSAL_PRONE_SPREAD_MULTIPLIER,
      ratio: UNIVERSAL_PRONE_SPREAD_MULTIPLIER / authored,
      errorCm: coneRadiusCm(weapon.hipSpread * UNIVERSAL_PRONE_SPREAD_MULTIPLIER)
        - coneRadiusCm(weapon.hipSpread * authored),
    }));
  }
  return rows;
}
