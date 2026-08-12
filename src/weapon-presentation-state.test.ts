import { describe, expect, it } from 'vitest';
import {
  VIEWMODEL_CONTACT_PROFILES,
  VIEWMODEL_CONTACT_RESPONSE_CONTRACT,
  advanceAdsBlend,
  advanceWeaponHeat,
  fireCycleAt,
  hitReactionAt,
  magnifiedFovDegrees,
  viewmodelFloorClearance,
  viewmodelContactResponse,
  viewmodelObstructionPose,
  viewmodelSurfaceRetreat,
} from './weapon-presentation-state';
import { WEAPON_IDS } from './protocol';

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
    expect(viewmodelObstructionPose(null, false, null)).toEqual({ retreat: 0, lift: 0 });
    expect(viewmodelObstructionPose(null, true, 0.61)).toEqual({
      retreat: 0.09,
      lift: expect.any(Number),
    });
    expect(viewmodelObstructionPose(null, true, 0.61).lift).toBeGreaterThanOrEqual(0.13);
    expect(viewmodelObstructionPose(0.2, true, 0.2).retreat).toBeLessThanOrEqual(0.7);
    expect(viewmodelObstructionPose(0.2, true, 0.2).lift).toBeLessThanOrEqual(0.2);
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
      const response = viewmodelContactResponse(weapon, 0.7, 0.2, true, 0);
      expect(profile.weapon).toBe(weapon);
      expect(profile.probeLengthMeters).toBeGreaterThanOrEqual(1.15);
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
      expect(response.pitchRadians).toBeGreaterThan(0.5);
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
    expect(adsContact.pitchRadians).toBeGreaterThan(0.3);
    expect(adsContact.yawRadians).toBeLessThan(0);
    expect(adsContact.rollRadians).toBeGreaterThan(0);
    expect(adsContact.scale).toBeLessThan(1);
    expect(adsContact.additionalLiftMeters).toBeGreaterThan(0);
    expect(adsContact.additionalDropMeters).toBeGreaterThan(0);
  });
});
