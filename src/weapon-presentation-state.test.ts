import { describe, expect, it } from 'vitest';
import {
  VIEWMODEL_CONTACT_HIGH_READY_PITCH_CAP_RADIANS,
  VIEWMODEL_CONTACT_PROBE_OFFSETS,
  VIEWMODEL_CONTACT_PROFILES,
  VIEWMODEL_CONTACT_RESPONSE_CONTRACT,
  VIEWMODEL_FIRE_ADMISSION_CONTRACT,
  VIEWMODEL_FIRE_BLOCK_HIGH_READY_BLEND,
  VIEWMODEL_FIRE_MAXIMUM_SPREAD_PENALTY_RADIANS,
  advanceAdsBlend,
  advanceWeaponHeat,
  fireCycleAt,
  hitReactionAt,
  magnifiedFovDegrees,
  viewmodelContactResponse,
  viewmodelFireAdmission,
  viewmodelFireAdmissionFromResponse,
  viewmodelFloorClearance,
  viewmodelContactProbePaddingMeters,
  viewmodelObstructionPose,
  viewmodelSurfaceRetreat,
} from './weapon-presentation-state';
import { WEAPON_IDS } from './protocol';
import { firstSegmentBoxHit } from './collision';

describe('weapon presentation state', () => {
  it('accumulates and cools bounded weapon heat', () => {
    expect(advanceWeaponHeat(0, true, 0, 'carbine')).toBeCloseTo(0.17);
    expect(advanceWeaponHeat(0.8, false, 1, 'carbine')).toBeCloseTo(0.56);
    expect(advanceWeaponHeat(0.95, true, 0, 'scattergun')).toBe(1);
    expect(advanceWeaponHeat(Number.NaN, false, Number.NaN, 'carbine')).toBe(0);
  });

  it('authors a finite carbine flash, bolt cycle and casing marker', () => {
    const start = fireCycleAt('carbine', 0, 0.5);
    const middle = fireCycleAt('carbine', 31, 0.5);
    const end = fireCycleAt('carbine', 70, 0.5);
    expect(start.flash).toBe(1);
    expect(start.kick).toBe(1);
    expect(middle.kick).toBeGreaterThan(0.2);
    expect(middle.kick).toBeLessThan(start.kick);
    expect(middle.boltTravel).toBeGreaterThan(0.95);
    expect(middle.casingReady).toBe(false);
    expect(end.flash).toBe(0);
    expect(end.kick).toBe(0);
    expect(end.boltTravel).toBe(0);
    expect(end.casingReady).toBe(true);
    expect(start.smokeScale).toBeGreaterThan(1);
  });

  it('converts the player FOV into a true 3x angular scope FOV', () => {
    const baseFov = 76;
    const scopedFov = magnifiedFovDegrees(baseFov, 3);
    const angularRatio = Math.tan(baseFov * Math.PI / 360) / Math.tan(scopedFov * Math.PI / 360);
    expect(scopedFov).toBeCloseTo(29.15, 1);
    expect(angularRatio).toBeCloseTo(3, 8);
    expect(magnifiedFovDegrees(Number.NaN, Number.NaN)).toBeCloseTo(76, 8);
  });

  it('snaps sniper ADS both ways while preserving eased ADS for other weapons', () => {
    expect(advanceAdsBlend(0.15, true, 1 / 120, 'sniper')).toBe(1);
    expect(advanceAdsBlend(0.85, false, 1 / 120, 'sniper')).toBe(0);
    expect(advanceAdsBlend(0, true, 1 / 120, 'carbine')).toBeGreaterThan(0);
    expect(advanceAdsBlend(0, true, 1 / 120, 'carbine')).toBeLessThan(1);
  });

  it('settles ordinary ADS past ninety percent within 120ms and exits within 140ms', () => {
    let inBlend = 0;
    for (let frame = 0; frame < 8; frame += 1) inBlend = advanceAdsBlend(inBlend, true, 0.015, 'carbine');
    expect(inBlend).toBeGreaterThan(0.9);
    let outBlend = 1;
    for (let frame = 0; frame < 10; frame += 1) outBlend = advanceAdsBlend(outBlend, false, 0.014, 'carbine');
    expect(outBlend).toBeLessThan(0.1);
  });

  it('returns bounded presentation-only hit reactions', () => {
    expect(hitReactionAt(0, 'body').envelope).toBe(0);
    expect(hitReactionAt(140, 'head').envelope).toBeGreaterThan(0.5);
    expect(hitReactionAt(400, 'limb')).toEqual({ envelope: 0, pitch: 0, roll: 0 });
    for (const value of Object.values(hitReactionAt(Number.NaN, 'body'))) expect(Number.isFinite(value)).toBe(true);
  });

  it('pulls the viewmodel back near walls and floors while leaving open space unchanged', () => {
    expect(viewmodelSurfaceRetreat(null, false)).toBe(0);
    expect(viewmodelSurfaceRetreat(2, false)).toBe(0);
    expect(viewmodelSurfaceRetreat(0.5, false)).toBeGreaterThan(0.25);
    expect(viewmodelSurfaceRetreat(0, true)).toBeCloseTo(
      VIEWMODEL_CONTACT_PROFILES.carbine.maximumSurfaceRetreatMeters,
      8,
    );
    expect(viewmodelSurfaceRetreat(2, true)).toBeCloseTo(0.09);
  });

  it('adds bounded prone and floor clearance without moving gameplay authority', () => {
    // contactDepthMeters is null from this reducer BY CONSTRUCTION: it only
    // ever sees the authored probe distance, and the presentation fold must be
    // handed the measured envelope depth instead (filled in by
    // systems/viewmodel-contact-probe.ts). Pinned so a future caller cannot
    // quietly start feeding the fold an authored guess again.
    expect(viewmodelObstructionPose(null, false, null))
      .toEqual({ retreat: 0, lift: 0, contactDepthMeters: null });
    expect(viewmodelObstructionPose(null, true, 0.61)).toEqual({
      retreat: 0.09,
      lift: expect.any(Number),
      contactDepthMeters: null,
    });
    expect(viewmodelObstructionPose(null, true, 0.61).lift).toBeGreaterThanOrEqual(0.13);
    expect(viewmodelObstructionPose(0.2, true, 0.2).retreat).toBeLessThanOrEqual(
      VIEWMODEL_CONTACT_PROFILES.carbine.maximumSurfaceRetreatMeters,
    );
    expect(viewmodelObstructionPose(0.2, true, 0.2).lift).toBeLessThanOrEqual(0.2);
    const m4JitterBoundary = viewmodelObstructionPose(0.278, true, 0.2, 'm4a1').retreat;
    expect(Number.isInteger(m4JitterBoundary * 1_000)).toBe(true);
    expect(m4JitterBoundary).toBeLessThanOrEqual(
      VIEWMODEL_CONTACT_PROFILES.m4a1.maximumSurfaceRetreatMeters,
    );
  });

  it('uses grounded stance height when an authored floor is a raycast plane', () => {
    expect(viewmodelFloorClearance(null, true, 0.61)).toBeCloseTo(0.61, 8);
    expect(viewmodelFloorClearance(0.42, true, 0.61)).toBeCloseTo(0.42, 8);
    expect(viewmodelFloorClearance(null, false, 0.61)).toBeNull();
    expect(viewmodelObstructionPose(null, true, viewmodelFloorClearance(null, true, 0.61)).lift)
      .toBeGreaterThanOrEqual(0.13);
  });

  it('owns a bounded contact response for every canonical weapon', () => {
    expect(Object.keys(VIEWMODEL_CONTACT_PROFILES).sort()).toEqual([...WEAPON_IDS].sort());
    for (const weapon of WEAPON_IDS) {
      const profile = VIEWMODEL_CONTACT_PROFILES[weapon];
      // 2026-08-30 re-pin: the prone floor-lift baseline moved to the
      // measured flat-ground value (0.2), so this deep-contact fixture uses a
      // lift genuinely past it (under-cover squeeze), not open-field prone -
      // which must no longer fold at all.
      const response = viewmodelContactResponse(weapon, 0.7, 0.29, true, 0);
      expect(profile.weapon).toBe(weapon);
      expect(profile.probeLengthMeters).toBeGreaterThanOrEqual(1.15);
      expect(profile.fullStowDistanceMeters).toBeGreaterThanOrEqual(0.5);
      expect(profile.fullStowDistanceMeters).toBeLessThan(profile.probeLengthMeters);
      expect(profile.maximumSurfaceRetreatMeters).toBeGreaterThanOrEqual(0.6);
      expect(profile.probeHalfWidthMeters).toBeGreaterThanOrEqual(0.18);
      expect(profile.minimumScale).toBeGreaterThanOrEqual(0.7);
      expect(profile.minimumScale).toBeLessThanOrEqual(0.9);
      expect(profile.maximumWallDropMeters).toBeGreaterThanOrEqual(0.17);
      expect(response).toMatchObject({
        contract: VIEWMODEL_CONTACT_RESPONSE_CONTRACT,
        profileId: weapon,
        active: true,
        aimAuthority: 'camera-forward-unchanged',
      });
      expect(response.obstructionBlend).toBeGreaterThan(0.85);
      // RE-PINNED FOR HF-410 (owner asked for the "holding it up" pose to be
      // reworked out). The blend is still asserted, so the response is still
      // live; only its visible amplitude is capped by
      // VIEWMODEL_CONTACT_HIGH_READY_PITCH_CAP_RADIANS, because the rig no
      // longer sits outside the body it is carried in.
      expect(response.pitchRadians).toBeCloseTo(VIEWMODEL_CONTACT_HIGH_READY_PITCH_CAP_RADIANS, 9);
      expect(response.scale).toBeGreaterThanOrEqual(profile.minimumScale);
      expect(response.scale).toBeLessThan(1);
      expect([
        response.pitchRadians,
        response.yawRadians,
        response.rollRadians,
        response.additionalLiftMeters,
        response.additionalDropMeters,
        response.scale,
      ].every(Number.isFinite)).toBe(true);
    }
    expect(VIEWMODEL_CONTACT_PROFILES.railgun.probeLengthMeters)
      .toBeGreaterThan(VIEWMODEL_CONTACT_PROFILES.pistol.probeLengthMeters);
    expect(VIEWMODEL_CONTACT_PROFILES.minigun.maximumSurfaceRetreatMeters)
      .toBeGreaterThan(VIEWMODEL_CONTACT_PROFILES['flare-gun'].maximumSurfaceRetreatMeters);
  });

  it('catches diagonal corners, oblique walls and doorjamb returns that the old five-ray cross missed', () => {
    type Point = readonly [number, number];
    for (const weapon of WEAPON_IDS) {
      const profile = VIEWMODEL_CONTACT_PROFILES[weapon];
      const samples: Point[] = VIEWMODEL_CONTACT_PROBE_OFFSETS.map((offset) => [
        offset.rightScale * profile.probeHalfWidthMeters,
        offset.vertical === 'upper'
          ? profile.probeUpperOffsetMeters
          : offset.vertical === 'lower' ? -profile.probeLowerOffsetMeters : offset.rightScale === 0 ? 0 : 0.04,
      ]);
      const oldCross = samples.slice(0, 5);
      const fixtures: ReadonlyArray<Readonly<{
        name: string;
        intersects: (sample: Point) => boolean;
      }>> = [
        {
          name: 'narrow lower-right diagonal corner',
          intersects: ([x, y]) => (
            x >= profile.probeHalfWidthMeters * 0.94
            && y <= -profile.probeLowerOffsetMeters * 0.94
          ),
        },
        {
          name: 'upper-right oblique wall edge',
          // Camera-plane cross-section of a wall whose leading edge reaches
          // only the weapon envelope corner over the tested forward span.
          intersects: ([x, y]) => (
            x > 0 && y > 0
            && x / profile.probeHalfWidthMeters + y / profile.probeUpperOffsetMeters >= 1.9
          ),
        },
        {
          name: 'recessed upper-left doorjamb return',
          intersects: ([x, y]) => (
            x <= -profile.probeHalfWidthMeters * 0.94
            && y >= profile.probeUpperOffsetMeters * 0.94
          ),
        },
      ];

      expect(samples, weapon).toHaveLength(9);
      for (const fixture of fixtures) {
        expect(oldCross.filter(fixture.intersects), `${weapon}: old cross: ${fixture.name}`).toHaveLength(0);
        expect(samples.filter(fixture.intersects), `${weapon}: full envelope: ${fixture.name}`).toHaveLength(1);
      }
    }
  });

  it('turns the probe lattice into one overlapping swept envelope', () => {
    for (const weapon of WEAPON_IDS) {
      const profile = VIEWMODEL_CONTACT_PROFILES[weapon];
      const padding = viewmodelContactProbePaddingMeters(profile);
      expect(padding, weapon).toBeGreaterThanOrEqual(profile.probeHalfWidthMeters * 0.5);
      expect(padding, weapon).toBeGreaterThanOrEqual(profile.probeUpperOffsetMeters * 0.5);
      expect(padding, weapon).toBeGreaterThanOrEqual(profile.probeLowerOffsetMeters * 0.5);
      expect(padding, weapon).toBeLessThanOrEqual(0.21);
    }
  });

  it('detects a thin oblique doorjamb between the old point-ray samples', () => {
    const profile = VIEWMODEL_CONTACT_PROFILES.carbine;
    const doorjamb = Object.freeze({
      minX: 0.112,
      maxX: 0.128,
      minY: 0.117,
      maxY: 0.133,
      minZ: -0.76,
      maxZ: -0.64,
      rotation: [0, Math.PI / 5, 0] as [number, number, number],
    });
    const anyProbeHits = (padding: number): boolean => VIEWMODEL_CONTACT_PROBE_OFFSETS.some((offset) => {
      const y = offset.vertical === 'upper'
        ? profile.probeUpperOffsetMeters
        : offset.vertical === 'lower' ? -profile.probeLowerOffsetMeters : 0;
      const start = { x: offset.rightScale * profile.probeHalfWidthMeters, y, z: 0 };
      return firstSegmentBoxHit(
        start,
        { x: start.x, y: start.y, z: -profile.probeLengthMeters },
        [doorjamb],
        padding,
      ) !== null;
    });
    expect(anyProbeHits(0.075)).toBe(false);
    expect(anyProbeHits(viewmodelContactProbePaddingMeters(profile))).toBe(true);
  });

  it('reaches the complete stow at a real capsule-to-cover distance in hip and ADS', () => {
    for (const weapon of WEAPON_IDS) {
      const profile = VIEWMODEL_CONTACT_PROFILES[weapon];
      const capsuleContact = viewmodelObstructionPose(0.42, false, 1.7, weapon);
      const hip = viewmodelContactResponse(weapon, capsuleContact.retreat, capsuleContact.lift, false, 0);
      const ads = viewmodelContactResponse(weapon, capsuleContact.retreat, capsuleContact.lift, false, 1);
      expect(capsuleContact.retreat, weapon).toBeCloseTo(profile.maximumSurfaceRetreatMeters, 8);
      expect(hip.wallBlend, weapon).toBe(1);
      expect(hip.highReadyBlend, weapon).toBe(1);
      expect(ads.wallBlend, weapon).toBe(1);
      expect(ads.highReadyBlend, weapon).toBeGreaterThanOrEqual(0.82);
      expect(ads.scale, weapon).toBeLessThan(0.9);
    }
  });

  it('uses each authored weapon envelope for standing, crouch-equivalent and prone wall/floor contact', () => {
    for (const weapon of WEAPON_IDS) {
      const profile = VIEWMODEL_CONTACT_PROFILES[weapon];
      const open = viewmodelObstructionPose(profile.probeLengthMeters + 0.01, false, 1.7, weapon);
      const standingWall = viewmodelObstructionPose(0, false, 1.7, weapon);
      const crouchedWall = viewmodelObstructionPose(0, false, 1.16, weapon);
      const proneWallFloor = viewmodelObstructionPose(0, true, 0.61, weapon);
      expect(open.retreat, weapon).toBe(0);
      expect(standingWall.retreat, weapon).toBeCloseTo(profile.maximumSurfaceRetreatMeters, 8);
      expect(crouchedWall.retreat, weapon).toBeCloseTo(profile.maximumSurfaceRetreatMeters, 8);
      expect(proneWallFloor.retreat, weapon).toBeCloseTo(profile.maximumSurfaceRetreatMeters, 8);
      expect(proneWallFloor.lift, weapon).toBeGreaterThanOrEqual(0.18);
    }
  });

  it('leaves open-space hip pose neutral and retains a bounded contact stow at settled ADS', () => {
    expect(viewmodelContactResponse('carbine', 0, 0, false, 0)).toMatchObject({
      active: false,
      obstructionBlend: 0,
      highReadyBlend: 0,
      pitchRadians: 0,
      yawRadians: 0,
      rollRadians: 0,
      additionalLiftMeters: 0,
      additionalDropMeters: 0,
      scale: 1,
    });
    const adsContact = viewmodelContactResponse('carbine', 0.7, 0.2, true, 1);
    expect(adsContact).toMatchObject({
      active: true,
      aimAuthority: 'camera-forward-unchanged',
    });
    expect(adsContact.highReadyBlend).toBeGreaterThan(0.4);
    // RE-PINNED FOR HF-410: capped, for the reason above.
    expect(adsContact.pitchRadians).toBeCloseTo(VIEWMODEL_CONTACT_HIGH_READY_PITCH_CAP_RADIANS, 9);
    expect(adsContact.yawRadians).toBeLessThan(0);
    expect(adsContact.rollRadians).toBeGreaterThan(0);
    expect(adsContact.scale).toBeLessThan(1);
    expect(adsContact.additionalLiftMeters).toBeGreaterThan(0);
    expect(adsContact.additionalDropMeters).toBeGreaterThan(0);
  });

  // HF-343: the near-wall raise must gate firing, presentation-only no more.
  it('recommends a typed fire policy from the contact response without touching aim authority', () => {
    const open = viewmodelFireAdmission('carbine', 0, 0, false, 0);
    expect(open).toMatchObject({
      contract: VIEWMODEL_FIRE_ADMISSION_CONTRACT,
      weapon: 'carbine',
      policy: 'block-full-stow-graduate-partial-v1',
      aimAuthority: 'camera-forward-unchanged',
      obstructionBlend: 0,
      highReadyBlend: 0,
      fireBlocked: false,
      blockReason: 'open-space',
      spreadPenaltyRadians: 0,
    });

    // Fully raised against cover (retreat clamped at the profile maximum, the
    // wall blend saturating) must block with the full-stow reason.
    const profile = VIEWMODEL_CONTACT_PROFILES.carbine;
    const raised = viewmodelFireAdmission('carbine', profile.maximumSurfaceRetreatMeters, 0, false, 0);
    expect(raised.fireBlocked).toBe(true);
    expect(raised.blockReason).toBe('full-stow');
    expect(raised.spreadPenaltyRadians).toBe(VIEWMODEL_FIRE_MAXIMUM_SPREAD_PENALTY_RADIANS);

    // A forward probe hit inside the authored full-stow distance blocks even
    // when the smoothed retreat has not saturated yet.
    const stow = viewmodelFireAdmissionFromResponse(
      'carbine',
      viewmodelContactResponse('carbine', 0.2, 0, false, 0),
      profile.fullStowDistanceMeters,
    );
    expect(stow.fireBlocked).toBe(true);
    expect(stow.blockReason).toBe('full-stow');

    // Partially raised: graduated penalty, never blocked below the threshold.
    const partial = viewmodelFireAdmission('carbine', profile.maximumSurfaceRetreatMeters * 0.5, 0, false, 0);
    expect(partial.fireBlocked).toBe(false);
    expect(partial.blockReason).toBe('open-space');
    expect(partial.highReadyBlend).toBeGreaterThan(0);
    expect(partial.highReadyBlend).toBeLessThan(VIEWMODEL_FIRE_BLOCK_HIGH_READY_BLEND);
    expect(partial.spreadPenaltyRadians).toBeGreaterThan(0);
    expect(partial.spreadPenaltyRadians).toBeLessThan(VIEWMODEL_FIRE_MAXIMUM_SPREAD_PENALTY_RADIANS);
    // Monotonic graduation: raising further never reduces the penalty.
    const moreRaised = viewmodelFireAdmission('carbine', profile.maximumSurfaceRetreatMeters * 0.75, 0, false, 0);
    expect(moreRaised.spreadPenaltyRadians).toBeGreaterThan(partial.spreadPenaltyRadians);

    // The high-ready threshold itself blocks with the dedicated reason when
    // the wall blend alone has not saturated (floor-driven raise).
    const floorRaised = viewmodelFireAdmissionFromResponse(
      'carbine',
      viewmodelContactResponse('carbine', 0, 1.7, false, 0),
      5,
    );
    expect(floorRaised.highReadyBlend).toBeGreaterThanOrEqual(VIEWMODEL_FIRE_BLOCK_HIGH_READY_BLEND);
    expect(floorRaised.fireBlocked).toBe(true);
    expect(floorRaised.blockReason).toBe('high-ready');

    // Settled ADS against cover still cannot fire through the wall.
    const adsCover = viewmodelFireAdmission('carbine', profile.maximumSurfaceRetreatMeters, 0.2, true, 1);
    expect(adsCover.fireBlocked).toBe(true);

    for (const value of [raised.highReadyBlend, raised.spreadPenaltyRadians, partial.spreadPenaltyRadians]) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('keeps every canonical weapon blockable at close cover and free in open space', () => {
    for (const weapon of WEAPON_IDS) {
      const profile = VIEWMODEL_CONTACT_PROFILES[weapon];
      expect(viewmodelFireAdmission(weapon, 0, 0, false, 0).fireBlocked, weapon).toBe(false);
      const blocked = viewmodelFireAdmission(weapon, profile.maximumSurfaceRetreatMeters, 0.2, true, 1);
      expect(blocked.fireBlocked, weapon).toBe(true);
      expect(blocked.spreadPenaltyRadians, weapon).toBe(VIEWMODEL_FIRE_MAXIMUM_SPREAD_PENALTY_RADIANS);
    }
  });
});
