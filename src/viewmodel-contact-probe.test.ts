import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildGunRange, buildRustworks1v1, buildSkylineTerminal } from './additional-maps';
import { segmentBoxHitTime, type Box2, type Point3 } from './collision';
import { buildArena, type ArenaMap } from './map';
import { WEAPON_IDS } from './protocol';
import {
  VIEWMODEL_CONTACT_PROBE_OFFSETS,
  VIEWMODEL_CONTACT_PROFILES,
  viewmodelContactProbePaddingMeters,
  viewmodelFloorClearance,
  viewmodelObstructionPose,
} from './weapon-presentation-state';
import {
  VIEWMODEL_CONTACT_PROBE_CONTRACT,
  ViewmodelContactProbe,
} from './viewmodel-contact-probe';

const unrotated = (box: Box2): boolean => !box.rotation?.some((value) => Math.abs(value) > 1e-8);
const height = (box: Box2): number => (box.maxY ?? 8) - (box.minY ?? 0);

function representativeWall(map: ArenaMap): Box2 {
  const wall = map.colliders.find((box) => (
    unrotated(box)
    && height(box) >= 1.5
    && Math.max(box.maxX - box.minX, box.maxZ - box.minZ) >= 1.5
  ));
  if (!wall) throw new Error(`${map.id} has no representative real wall collider`);
  return wall;
}

function representativeFloor(map: ArenaMap): Box2 {
  const floor = map.colliders.find((box) => (
    unrotated(box)
    && height(box) <= 0.6
    && box.maxX - box.minX >= 3
    && box.maxZ - box.minZ >= 3
  ));
  if (!floor) throw new Error(`${map.id} has no representative real floor collider`);
  return floor;
}

function closeWallPose(wall: Box2): { origin: Point3; yaw: number } {
  const y = ((wall.minY ?? 0) + (wall.maxY ?? 8)) / 2;
  if (wall.maxX - wall.minX >= wall.maxZ - wall.minZ) {
    return {
      origin: { x: (wall.minX + wall.maxX) / 2, y, z: wall.maxZ + 0.44 },
      yaw: 0,
    };
  }
  return {
    origin: { x: wall.maxX + 0.44, y, z: (wall.minZ + wall.maxZ) / 2 },
    yaw: Math.PI / 2,
  };
}

function oldParallelEnvelopeMisses(origin: Point3, collider: Box2): boolean {
  const profile = VIEWMODEL_CONTACT_PROFILES.carbine;
  const padding = viewmodelContactProbePaddingMeters(profile);
  for (const offset of VIEWMODEL_CONTACT_PROBE_OFFSETS) {
    const vertical = offset.vertical === 'upper'
      ? profile.probeUpperOffsetMeters
      : offset.vertical === 'lower'
        ? -profile.probeLowerOffsetMeters
        : offset.rightScale === 0 ? 0 : 0.04;
    const start = {
      x: origin.x + offset.rightScale * profile.probeHalfWidthMeters,
      y: origin.y + vertical,
      z: origin.z,
    };
    const end = { ...start, z: start.z - profile.probeLengthMeters };
    if (segmentBoxHitTime(start, end, collider, padding) !== null) return false;
  }
  return true;
}

describe('retained viewmodel contact probe', () => {
  it('fans beyond the old parallel-ray lattice to catch a thin doorjamb beside the weapon', () => {
    const probe = new ViewmodelContactProbe();
    const origin = { x: 0, y: 1.7, z: 0 };
    const doorjamb: Box2 = {
      minX: 0.42,
      maxX: 0.49,
      minY: 0.2,
      maxY: 2.8,
      minZ: -1.05,
      maxZ: -0.95,
    };
    expect(oldParallelEnvelopeMisses(origin, doorjamb)).toBe(true);

    const sample = probe.sample(origin, 0, 0, [doorjamb], VIEWMODEL_CONTACT_PROFILES.carbine);
    expect(sample.contract).toBe(VIEWMODEL_CONTACT_PROBE_CONTRACT);
    expect(sample.nearestForwardSurfaceMeters).not.toBeNull();
    expect(sample.nearestForwardSurfaceMeters!).toBeLessThan(1.2);
    expect(sample.probesTested).toBeGreaterThan(1);
  });

  it('detects an oblique corner return across the complete retained envelope', () => {
    const probe = new ViewmodelContactProbe();
    const obliqueReturn: Box2 = {
      minX: 0.34,
      maxX: 0.46,
      minY: 0.1,
      maxY: 2.9,
      minZ: -1.28,
      maxZ: -0.42,
      rotation: [0, -Math.PI / 5, 0],
    };
    const sample = probe.sample(
      { x: 0, y: 1.7, z: 0 },
      0,
      0,
      [obliqueReturn],
      VIEWMODEL_CONTACT_PROFILES.railgun,
    );
    expect(sample.nearestForwardSurfaceMeters).not.toBeNull();
    expect(sample.nearestForwardSurfaceMeters!).toBeLessThan(
      VIEWMODEL_CONTACT_PROFILES.railgun.probeLengthMeters,
    );
  });

  it('saturates close-cover response for every weapon against real walls from every shipped arena', () => {
    const maps = [
      buildArena(new THREE.Scene()),
      buildRustworks1v1(new THREE.Scene()),
      buildGunRange(new THREE.Scene()),
      buildSkylineTerminal(new THREE.Scene()),
    ];
    const probe = new ViewmodelContactProbe();
    for (const map of maps) {
      const wall = representativeWall(map);
      const pose = closeWallPose(wall);
      for (const weapon of WEAPON_IDS) {
        const profile = VIEWMODEL_CONTACT_PROFILES[weapon];
        const sample = probe.sample(pose.origin, 0, pose.yaw, [wall], profile);
        expect(sample.saturated, `${map.id}/${weapon}: real wall saturation`).toBe(true);
        const obstruction = viewmodelObstructionPose(
          sample.nearestForwardSurfaceMeters,
          false,
          null,
          weapon,
        );
        expect(obstruction.retreat, `${map.id}/${weapon}: complete wall fold`)
          .toBeCloseTo(profile.maximumSurfaceRetreatMeters, 3);
      }
    }
  }, 15_000);

  it('derives prone floor clearance from real floor colliders across every shipped arena', () => {
    const maps = [
      buildArena(new THREE.Scene()),
      buildRustworks1v1(new THREE.Scene()),
      buildGunRange(new THREE.Scene()),
      buildSkylineTerminal(new THREE.Scene()),
    ];
    const probe = new ViewmodelContactProbe();
    for (const map of maps) {
      const floor = representativeFloor(map);
      const origin = {
        x: (floor.minX + floor.maxX) / 2,
        y: (floor.maxY ?? 8) + 0.61,
        z: (floor.minZ + floor.maxZ) / 2,
      };
      for (const weapon of WEAPON_IDS) {
        const profile = VIEWMODEL_CONTACT_PROFILES[weapon];
        const sample = probe.sample(origin, 0, 0, [floor], profile);
        expect(sample.floorSurfaceMeters, `${map.id}/${weapon}: real floor`).not.toBeNull();
        const floorClearance = viewmodelFloorClearance(sample.floorSurfaceMeters, true, 0.61);
        const obstruction = viewmodelObstructionPose(
          sample.nearestForwardSurfaceMeters,
          true,
          floorClearance,
          weapon,
        );
        expect(obstruction.lift, `${map.id}/${weapon}: prone lift`).toBeGreaterThanOrEqual(0.18);
        expect(obstruction.retreat, `${map.id}/${weapon}: prone floor tuck`).toBeGreaterThanOrEqual(0.09);
      }
    }
  }, 15_000);

  it('reuses retained sample storage and bounds every catalog envelope beyond its inner probes', () => {
    const probe = new ViewmodelContactProbe();
    const first = probe.sample({ x: 0, y: 1.7, z: 0 }, 0, 0, [], VIEWMODEL_CONTACT_PROFILES.carbine);
    const second = probe.sample({ x: 1, y: 1.7, z: 0 }, 0, 0, [], VIEWMODEL_CONTACT_PROFILES.railgun);
    expect(second).toBe(first);
    expect(second.probesTested).toBe(VIEWMODEL_CONTACT_PROBE_OFFSETS.length);
    for (const weapon of WEAPON_IDS) {
      const profile = VIEWMODEL_CONTACT_PROFILES[weapon];
      expect(profile.envelopeHalfWidthMeters, weapon).toBeGreaterThan(profile.probeHalfWidthMeters);
      expect(profile.envelopeUpperOffsetMeters, weapon).toBeGreaterThan(profile.probeUpperOffsetMeters);
      expect(profile.envelopeLowerOffsetMeters, weapon).toBeGreaterThan(profile.probeLowerOffsetMeters);
    }
  });
});
