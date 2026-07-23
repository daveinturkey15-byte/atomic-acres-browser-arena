import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Point3 } from './collision';
import { isBlocked, pointInsideBounds } from './collision';
import {
  GUN_RANGE_FIRING_LINE_BARRIER,
  GUN_RANGE_FIRING_LINE_Z,
  RUSTWORKS_TOWER,
  applyAdditionalMapPresentationProfile,
  applyRustworksPresentationProfile,
  buildGunRange,
  buildRustworks1v1,
  buildSkylineTerminal,
  fitCanvasText,
  rustworksDeckTopY,
  updateGunRangePresentation,
} from './additional-maps';
import type { ArenaMap } from './map';
import type { Stance } from './gameplay';
import { CharacterPhysics, STANCE_SHAPES } from './physics';

type RouteAnchor = { id: string; position: [number, number, number] };

function expectRustworksSpawnContract(map: ReturnType<typeof buildRustworks1v1>): void {
  for (const team of [0, 1] as const) {
    expect(map.spawns[team].length).toBeGreaterThanOrEqual(6);
    for (const spawn of map.spawns[team]) {
      expect(Number.isFinite(spawn.x)).toBe(true);
      expect(Number.isFinite(spawn.z)).toBe(true);
      expect(pointInsideBounds({ x: spawn.x, y: spawn.y, z: spawn.z }, map.bounds, 0.5)).toBe(true);
      expect(map.colliders.some((box) => spawn.x > box.minX && spawn.x < box.maxX && spawn.z > box.minZ && spawn.z < box.maxZ)).toBe(false);
      // Keep spawns off the central tower apron so private lobbies open cleanly.
      expect(Math.hypot(spawn.x, spawn.z)).toBeGreaterThan(12);
    }
  }
}

function expectGunRangeSpawnContract(map: ReturnType<typeof buildGunRange>): void {
  for (const team of [0, 1] as const) {
    expect(map.spawns[team].length).toBeGreaterThan(0);
    for (const spawn of map.spawns[team]) {
      expect(Number.isFinite(spawn.x)).toBe(true);
      expect(Number.isFinite(spawn.z)).toBe(true);
      expect(pointInsideBounds({ x: spawn.x, y: spawn.y, z: spawn.z }, map.bounds, 0.5)).toBe(true);
      expect(map.colliders.some((box) => spawn.x > box.minX && spawn.x < box.maxX && spawn.z > box.minZ && spawn.z < box.maxZ)).toBe(false);
    }
  }
}

function namedCount(root: THREE.Object3D, name: string): number {
  let count = 0;
  root.traverse((node) => {
    if (node.name === name) count += 1;
  });
  return count;
}

function namedPrefixCount(root: THREE.Object3D, prefix: string): number {
  let count = 0;
  root.traverse((node) => {
    if (node.name.startsWith(prefix)) count += 1;
  });
  return count;
}

async function walkToward(physics: CharacterPhysics, target: Point3, maxSteps = 2_400): Promise<Point3> {
  for (let step = 0; step < maxSteps; step += 1) {
    const current = physics.eyePosition();
    const dx = target.x - current.x;
    const dz = target.z - current.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.16 && Math.abs(target.y - current.y) < 0.28) return current;
    const amount = Math.min(0.034, distance);
    physics.move({
      x: distance > 0 ? (dx / distance) * amount : 0,
      y: -0.002,
      z: distance > 0 ? (dz / distance) * amount : 0,
    }, 1 / 120);
  }
  return physics.eyePosition();
}

async function traverseRoute(
  map: Pick<ArenaMap, 'physicsColliders' | 'bounds'>,
  anchors: readonly RouteAnchor[],
  reverse = false,
  stance: Stance = 'stand',
): Promise<void> {
  const ordered = reverse ? [...anchors].reverse() : [...anchors];
  const physics = await CharacterPhysics.create(map.physicsColliders, map.bounds);
  try {
    expect(physics.setStance(stance), `${stance} stance transition`).toBe(true);
    const shape = STANCE_SHAPES[stance];
    const stanceEyeHeight = shape.halfHeight + shape.radius + shape.eyeFromCenter;
    const stanceAnchor = ([x, y, z]: [number, number, number]): Point3 => ({
      x,
      y: y - 1.7 + stanceEyeHeight,
      z,
    });
    const start = ordered[0].position;
    physics.teleportEye(stanceAnchor(start));
    for (const anchor of ordered.slice(1)) {
      const target = stanceAnchor(anchor.position);
      const result = await walkToward(physics, target);
      const horizontalError = Math.hypot(result.x - target.x, result.z - target.z);
      expect(
        horizontalError,
        `${anchor.id}:${stance}:horizontal result=${JSON.stringify(result)} target=${JSON.stringify(target)}`,
      ).toBeLessThan(0.55);
      expect(Math.abs(result.y - target.y), `${anchor.id}:${stance}:vertical`).toBeLessThan(0.55);
    }
  } finally {
    physics.dispose();
  }
}

describe('additional authored maps', () => {
  it('shrinks long world-sign copy until it fits the drawable panel width', () => {
    let currentFont = '';
    const context = {
      get font() { return currentFont; },
      set font(value: string) { currentFont = value; },
      measureText(text: string) {
        const size = Number.parseInt(currentFont.match(/900 (\d+)px/)?.[1] ?? '0', 10);
        return { width: text.length * size * 0.58 };
      },
    } as unknown as CanvasRenderingContext2D;
    const layout = fitCanvasText(context, 'WALLBANG TEST · MATERIAL / THICKNESS', 120, 620, 18);
    expect(layout.measuredWidth).toBeLessThanOrEqual(layout.availableWidth);
    expect(layout.fontSize).toBeLessThan(120);
  });

  it('builds an original compact collision-backed industrial 1v1 arena', () => {
    const map = buildRustworks1v1(new THREE.Scene());
    expect(map.id).toBe('rustworks-1v1');
    expect(map.label).toBe('Rustworks');
    expect(map.root.name).toContain('Rustworks');
    expect(map.colliders.length).toBeGreaterThanOrEqual(25);
    expect(map.raycastMeshes.length).toBeGreaterThanOrEqual(25);
    expect(map.patrolPoints.length).toBeGreaterThanOrEqual(8);
    expect(map.targets).toHaveLength(0);
    expect(map.root.getObjectByName('rustworks-lower-deck')).toBeTruthy();
    expect(map.root.getObjectByName('rustworks-upper-deck')).toBeTruthy();
    expect(map.root.getObjectByName('rustworks-lower-ramp')).toBeTruthy();
    expect(map.root.getObjectByName('rustworks-upper-deck')?.position.y).toBe(RUSTWORKS_TOWER.upperDeckCenterY);
    const towerLeg = map.root.getObjectByName('rustworks-tower-leg') as THREE.Mesh;
    towerLeg.geometry.computeBoundingBox();
    expect(towerLeg.geometry.boundingBox?.max.y).toBeCloseTo(5.4);
    expect(map.root.getObjectByName('rustworks-derrick-service-platform')?.position.y).toBeCloseTo(11.23);
    expect(map.root.getObjectByName('rustworks-derrick-beacon')?.position.y).toBe(15.78);
    expect(map.root.getObjectByName('rustworks-canopy-roof')).toBeUndefined();
    expect(map.root.getObjectByName('rustworks-crane-boom')).toBeUndefined();
    expect(map.root.getObjectByName('rustworks-crane-cable')).toBeUndefined();
    expect(map.root.getObjectByName('rustworks-crane-hook')).toBeUndefined();
    expectRustworksSpawnContract(map);
  });


  it('shows only the quality derrick details under the blender profile', () => {
    const map = buildRustworks1v1(new THREE.Scene());
    const servicePlatform = map.root.getObjectByName('rustworks-derrick-service-platform');
    const derrickLeg = map.root.getObjectByName('rustworks-derrick-leg');
    expect(servicePlatform).toBeTruthy();
    expect(derrickLeg).toBeTruthy();
    applyRustworksPresentationProfile(map.root, 'performance');
    expect(servicePlatform?.visible).toBe(false);
    expect(derrickLeg?.userData.staticBatchRendered).toBe(true);
    expect(map.root.children.some((node) => node.name.startsWith('rustworks-presentation-batch-') && node.visible)).toBe(true);
    expect(map.root.getObjectByName('rustworks-lower-ramp')?.visible).not.toBe(false);
    applyRustworksPresentationProfile(map.root, 'blender');
    expect(servicePlatform?.visible).toBe(true);
  });

  it('exposes clean access, undercroft, trench, and four-container perimeter rows', () => {
    const map = buildRustworks1v1(new THREE.Scene());
    const required = [
      'rustworks-lower-ramp',
      'rustworks-lower-ramp-landing',
      'rustworks-upper-access',
      'rustworks-ship-ladder',
      'rustworks-ship-ladder-lower-landing',
      'rustworks-ship-ladder-upper-landing',
      'rustworks-ship-ladder-rail-east',
      'rustworks-ship-ladder-rail-west',
      'rustworks-ship-ladder-rung-0',
      'rustworks-structural-brace',
      'rustworks-undercroft-module',
      'rustworks-undercroft-portal-header',
      'rustworks-service-trench-wall',
      'rustworks-derrick-leg',
      'rustworks-tower-hardstand',
      'rustworks-shipping-container',
      'rustworks-open-container-wall-a',
      'rustworks-rig-deck-top',
      'rustworks-rig-leg',
      'rustworks-perimeter-rail',
    ];
    for (const name of required) {
      expect(map.root.getObjectByName(name), name).toBeTruthy();
    }
    expect(namedPrefixCount(map.root, 'rustworks-ship-ladder-rung-')).toBeGreaterThanOrEqual(8);
    expect(namedCount(map.root, 'rustworks-structural-brace')).toBeGreaterThanOrEqual(12);
    expect(namedCount(map.root, 'rustworks-freight-crate')).toBe(0);
    expect(namedCount(map.root, 'rustworks-container-placement')).toBe(24);
    expect(namedCount(map.root, 'rustworks-shipping-container')).toBe(18);
    expect(namedCount(map.root, 'rustworks-open-container-wall-a')).toBe(6);
    expect(namedCount(map.root, 'rustworks-barrier-low')).toBe(0);
    expect(namedCount(map.root, 'rustworks-tank-collider')).toBe(0);
    expect(namedCount(map.root, 'rustworks-horizontal-process-tank')).toBe(0);
    expect(namedCount(map.root, 'rustworks-pallet-stack')).toBe(0);
    expect(namedCount(map.root, 'rustworks-process-riser')).toBe(0);
    expect(namedCount(map.root, 'rustworks-process-pipe-run')).toBe(0);
    expect(namedCount(map.root, 'rustworks-rig-leg')).toBeGreaterThanOrEqual(8);
    const batches = map.root.userData.rustworksPresentationBatches as {
      sourceMeshes: number;
      batches: number;
      savedDrawCalls: number;
    };
    expect(batches.sourceMeshes).toBeGreaterThanOrEqual(40);
    expect(batches.batches).toBeGreaterThan(0);
    expect(batches.savedDrawCalls).toBeGreaterThanOrEqual(35);
    expect(map.root.children.filter((node) => node.userData.staticBatchRendered === true && node.visible).length)
      .toBe(batches.batches);
    expect(map.root.userData.rustworksRoutes?.['ground-to-lower']).toBeTruthy();
    expect(map.root.userData.rustworksRoutes?.['lower-to-upper']).toBeTruthy();
    expect(map.root.userData.rustworksRoutes?.['undercroft-east-west']).toBeTruthy();
    expect(map.root.userData.rustworksRoutes?.['undercroft-north-south']).toBeTruthy();
    expect(map.root.userData.rustworksRoutes?.['west-service-trench']).toBeTruthy();
  });

  it('uses only shipping-container yard cover at the exact 75/25 and open-end distributions', async () => {
    const map = buildRustworks1v1(new THREE.Scene());
    const placements: THREE.Group[] = [];
    const closed: THREE.Mesh[] = [];
    const openShells: THREE.Mesh[] = [];
    const oneEndWalls: THREE.Mesh[] = [];
    map.root.traverse((node) => {
      if (node instanceof THREE.Group && node.name === 'rustworks-container-placement') placements.push(node);
      if (node instanceof THREE.Mesh && node.name === 'rustworks-shipping-container') closed.push(node);
      if (node instanceof THREE.Mesh && node.name.startsWith('rustworks-open-container-') && !node.name.includes('-floor-')) openShells.push(node);
      if (node instanceof THREE.Mesh && node.name === 'rustworks-open-one-container-closed-end') oneEndWalls.push(node);
    });
    expect(placements).toHaveLength(24);
    expect(closed).toHaveLength(18);
    expect(openShells).toHaveLength(18);
    expect(oneEndWalls).toHaveLength(3);
    expect(placements.filter((placement) => placement.userData.rustworksContainerType === 'closed')).toHaveLength(18);
    expect(placements.filter((placement) => placement.userData.rustworksContainerType === 'open-both')).toHaveLength(3);
    expect(placements.filter((placement) => placement.userData.rustworksContainerType === 'open-one')).toHaveLength(3);
    for (const side of ['north', 'south', 'west', 'east']) {
      const row = placements.filter((placement) => placement.userData.rustworksContainerSide === side);
      expect(row, `${side} container row`).toHaveLength(6);
      const offsets = row
        .map((placement) => side === 'north' || side === 'south' ? placement.position.x : placement.position.z)
        .sort((a, b) => a - b);
      expect(offsets).toEqual([-18, -10.8, -3.6, 3.6, 10.8, 18]);
      for (let index = 1; index < offsets.length; index += 1) {
        expect(offsets[index] - offsets[index - 1] - 5.8).toBeGreaterThanOrEqual(1.4 - 1e-6);
      }
    }

    const authoritativeMeshes = [...closed, ...openShells, ...oneEndWalls];
    for (const mesh of authoritativeMeshes) {
      const geometry = mesh.geometry as THREE.BoxGeometry;
      const { width, height, depth } = geometry.parameters;
      const expected = {
        minX: mesh.position.x - width / 2,
        maxX: mesh.position.x + width / 2,
        minY: mesh.position.y - height / 2,
        maxY: mesh.position.y + height / 2,
        minZ: mesh.position.z - depth / 2,
        maxZ: mesh.position.z + depth / 2,
      };
      const matches = (box: (typeof map.colliders)[number]) =>
        Math.abs(box.minX - expected.minX) < 1e-6
        && Math.abs(box.maxX - expected.maxX) < 1e-6
        && Math.abs((box.minY ?? -Infinity) - expected.minY) < 1e-6
        && Math.abs((box.maxY ?? Infinity) - expected.maxY) < 1e-6
        && Math.abs(box.minZ - expected.minZ) < 1e-6
        && Math.abs(box.maxZ - expected.maxZ) < 1e-6;
      expect(map.colliders.some(matches), `${mesh.name} player collider`).toBe(true);
      expect(map.physicsColliders.some(matches), `${mesh.name} physics collider`).toBe(true);
      expect(map.raycastMeshes).toContain(mesh);
    }

    const layout = map.root.userData.rustworksContainerLayout as {
      total: number;
      closed: number;
      open: number;
      openBothEnds: number;
      openOneEnd: number;
      closedPercent: number;
      openPercent: number;
      perSide: number;
      minimumEndGap: number;
      onlyShippingContainers: boolean;
    };
    expect(layout).toMatchObject({
      total: 24,
      closed: 18,
      open: 6,
      openBothEnds: 3,
      openOneEnd: 3,
      closedPercent: 75,
      openPercent: 25,
      perSide: 6,
      onlyShippingContainers: true,
    });
    expect(layout.minimumEndGap).toBeCloseTo(1.4);
    expect(RUSTWORKS_TOWER.openContainerClearWidth).toBeGreaterThan(0.38 * 2 + 1.4);
    expect(RUSTWORKS_TOWER.openContainerClearHeight).toBeGreaterThan(1.82 + 0.5);
    const openRoutes = map.root.userData.rustworksOpenContainerRoutes as Array<{
      id: string; anchors: [number, number, number][];
    }>;
    expect(openRoutes).toHaveLength(3);
    for (const route of openRoutes) {
      for (const [x, y, z] of route.anchors) {
        expect(isBlocked({ x, y, z }, map.colliders, 0.38), `${route.id}@${x},${z}`).toBe(false);
      }
      for (const stance of ['stand', 'crouch', 'prone'] as const) {
        const anchors = route.anchors.map((position, index) => ({ id: `${route.id}-${index}`, position }));
        await traverseRoute(map, anchors, false, stance);
        await traverseRoute(map, anchors, true, stance);
      }
    }
    expectRustworksSpawnContract(map);
  }, 20_000);

  it('keeps ramp and ship-ladder surfaces at or under the 50 degree climb limit with coherent landings', () => {
    const map = buildRustworks1v1(new THREE.Scene());
    const access = map.root.userData.rustworksAccess as {
      lowerRampAngleDegrees: number;
      shipLadderAngleDegrees: number;
      lowerRamp: {
        position: [number, number, number];
        size: [number, number, number];
        rotation: [number, number, number];
        landingPosition: [number, number, number];
        landingSize: [number, number, number];
      };
      shipLadder: {
        position: [number, number, number];
        size: [number, number, number];
        rotation: [number, number, number];
        lowerLandingPosition: [number, number, number];
        lowerLandingSize: [number, number, number];
        upperLandingPosition: [number, number, number];
        upperLandingSize: [number, number, number];
      };
    };
    expect(access.lowerRampAngleDegrees).toBeLessThanOrEqual(RUSTWORKS_TOWER.maxClimbDegrees);
    expect(access.shipLadderAngleDegrees).toBeLessThanOrEqual(RUSTWORKS_TOWER.maxClimbDegrees);
    expect(access.lowerRampAngleDegrees).toBeLessThanOrEqual(18);
    expect(access.shipLadderAngleDegrees).toBeLessThanOrEqual(38);
    expect(access.lowerRamp.size[0]).toBeGreaterThanOrEqual(4.8);
    expect(access.shipLadder.size[0]).toBeGreaterThanOrEqual(2.6);

    const lowerAngle = Math.abs(access.lowerRamp.rotation[0]);
    const lowerHalfRun = Math.cos(lowerAngle) * access.lowerRamp.size[2] / 2;
    const lowerTopZ = access.lowerRamp.position[2] + lowerHalfRun; // negative X-rot → uphill +Z
    const landingDownhillZ = access.lowerRamp.landingPosition[2] - access.lowerRamp.landingSize[2] / 2;
    const lowerOverlap = Math.abs(landingDownhillZ - lowerTopZ);
    const lowerTopSurface = access.lowerRamp.position[1]
      + Math.sin(lowerAngle) * access.lowerRamp.size[2] / 2
      + Math.cos(lowerAngle) * access.lowerRamp.size[1] / 2;
    const lowerRampLandingTop = rustworksDeckTopY(access.lowerRamp.landingPosition[1], access.lowerRamp.landingSize[1]);
    const lowerLip = lowerRampLandingTop - (lowerTopSurface - Math.tan(lowerAngle) * lowerOverlap);
    expect(lowerOverlap, 'lower-ramp landing overlap').toBeLessThanOrEqual(RUSTWORKS_TOWER.maxLandingOverlap);
    expect(Math.abs(lowerLip), 'lower-ramp landing lip').toBeLessThan(RUSTWORKS_TOWER.maxTransitionLip);

    const shipAngle = Math.abs(access.shipLadder.rotation[0]);
    const shipHalfRun = Math.cos(shipAngle) * access.shipLadder.size[2] / 2;
    // Positive X rotation: local +Z downhill, local -Z uphill.
    const shipLowZ = access.shipLadder.position[2] + shipHalfRun;
    const shipHighZ = access.shipLadder.position[2] - shipHalfRun;
    const lowerLandingInnerZ = access.shipLadder.lowerLandingPosition[2] - access.shipLadder.lowerLandingSize[2] / 2;
    const upperLandingOuterZ = access.shipLadder.upperLandingPosition[2] + access.shipLadder.upperLandingSize[2] / 2;
    const lowOverlap = Math.abs(lowerLandingInnerZ - shipLowZ);
    const highOverlap = Math.abs(upperLandingOuterZ - shipHighZ);
    const shipHighSurface = access.shipLadder.position[1]
      + Math.sin(shipAngle) * access.shipLadder.size[2] / 2
      + Math.cos(shipAngle) * access.shipLadder.size[1] / 2;
    const shipLowSurface = access.shipLadder.position[1]
      - Math.sin(shipAngle) * access.shipLadder.size[2] / 2
      + Math.cos(shipAngle) * access.shipLadder.size[1] / 2;
    const upperLandingTop = rustworksDeckTopY(access.shipLadder.upperLandingPosition[1], access.shipLadder.upperLandingSize[1]);
    const shipLowerLandingTop = rustworksDeckTopY(access.shipLadder.lowerLandingPosition[1], access.shipLadder.lowerLandingSize[1]);
    const highLip = upperLandingTop - (shipHighSurface - Math.tan(shipAngle) * highOverlap);
    const lowLip = shipLowerLandingTop - (shipLowSurface - Math.tan(shipAngle) * lowOverlap);
    expect(lowOverlap, 'ship-ladder lower overlap').toBeLessThanOrEqual(RUSTWORKS_TOWER.maxLandingOverlap + 0.02);
    expect(highOverlap, 'ship-ladder upper overlap').toBeLessThanOrEqual(RUSTWORKS_TOWER.maxLandingOverlap + 0.02);
    expect(Math.abs(highLip), 'ship-ladder upper lip').toBeLessThan(RUSTWORKS_TOWER.maxTransitionLip);
    expect(Math.abs(lowLip), 'ship-ladder lower lip').toBeLessThan(RUSTWORKS_TOWER.maxTransitionLip);
  });

  it('walks tower climbs, both undercroft tunnels, and the west trench bidirectionally', async () => {
    const map = buildRustworks1v1(new THREE.Scene());
    const routes = map.root.userData.rustworksRoutes as Record<string, RouteAnchor[]>;
    await traverseRoute(map, routes['ground-to-lower']);
    await traverseRoute(map, routes['ground-to-lower'], true);
    await traverseRoute(map, routes['lower-to-upper']);
    await traverseRoute(map, routes['lower-to-upper'], true);
    for (const id of ['undercroft-east-west', 'undercroft-north-south', 'west-service-trench'] as const) {
      for (const stance of ['stand', 'crouch', 'prone'] as const) {
        await traverseRoute(map, routes[id], false, stance);
        await traverseRoute(map, routes[id], true, stance);
      }
    }
  }, 20_000);

  it('keeps the undercroft portals and trench exit gaps clear for every stance capsule', () => {
    const map = buildRustworks1v1(new THREE.Scene());
    const undercroft = map.root.userData.rustworksUndercroft as {
      passageWidth: number; clearHeight: number; portals: string[];
    };
    expect(undercroft.portals).toEqual(['north', 'south', 'west', 'east']);
    expect(undercroft.passageWidth).toBeGreaterThan(0.38 * 2 + 2.2);
    expect(undercroft.clearHeight).toBeGreaterThan(1.82 + 0.8);
    for (const stance of ['stand', 'crouch', 'prone'] as const) {
      const shape = STANCE_SHAPES[stance];
      const eyeHeight = shape.halfHeight + shape.radius + shape.eyeFromCenter;
      for (const [x, z] of [[-4.1, 0], [4.1, 0], [0, -4.1], [0, 4.1], [0, 0]] as const) {
        expect(isBlocked({ x, y: eyeHeight, z }, map.colliders, shape.radius), `${stance} undercroft ${x},${z}`).toBe(false);
      }
    }

    const trench = map.root.userData.rustworksTrench as {
      side: string; x: number; width: number; lateralExitGaps: number;
    };
    expect(trench).toMatchObject({ side: 'west', x: -13.8, width: 3.4, lateralExitGaps: 4 });
    for (const stance of ['stand', 'crouch', 'prone'] as const) {
      const shape = STANCE_SHAPES[stance];
      const eyeHeight = shape.halfHeight + shape.radius + shape.eyeFromCenter;
      for (const z of [-17, -6, 6, 17]) {
        expect(isBlocked({ x: trench.x, y: eyeHeight, z }, map.colliders, shape.radius), `${stance} trench centre ${z}`).toBe(false);
      }
      for (const z of [-6, 6]) {
        expect(isBlocked({ x: trench.x - 2.4, y: eyeHeight, z }, map.colliders, shape.radius), `${stance} trench west exit ${z}`).toBe(false);
        expect(isBlocked({ x: trench.x + 2.4, y: eyeHeight, z }, map.colliders, shape.radius), `${stance} trench east exit ${z}`).toBe(false);
      }
    }
  });

  it('keeps thin split rails clear of both authored access corridors', () => {
    const map = buildRustworks1v1(new THREE.Scene());
    const access = map.root.userData.rustworksAccess as {
      lowerRamp: { landingPosition: [number, number, number]; landingSize: [number, number, number] };
      shipLadder: {
        upperLandingPosition: [number, number, number];
        upperLandingSize: [number, number, number];
        bridgePosition: [number, number, number];
        bridgeSize: [number, number, number];
      };
    };
    const solidMeshes: THREE.Mesh[] = [];
    map.root.traverse((node) => {
      if (node instanceof THREE.Mesh && /deck-rail|rail-post/i.test(node.name) && !node.name.includes('ship-ladder')) {
        solidMeshes.push(node);
      }
    });
    expect(solidMeshes.length).toBeGreaterThanOrEqual(10);
    const corridors = [
      {
        minX: access.lowerRamp.landingPosition[0] - access.lowerRamp.landingSize[0] / 2,
        maxX: access.lowerRamp.landingPosition[0] + access.lowerRamp.landingSize[0] / 2,
        minY: rustworksDeckTopY(access.lowerRamp.landingPosition[1], access.lowerRamp.landingSize[1]),
        maxY: rustworksDeckTopY(access.lowerRamp.landingPosition[1], access.lowerRamp.landingSize[1]) + 2.0,
        minZ: access.lowerRamp.landingPosition[2] - access.lowerRamp.landingSize[2] / 2,
        maxZ: access.lowerRamp.landingPosition[2] + access.lowerRamp.landingSize[2] / 2,
      },
      {
        minX: access.shipLadder.upperLandingPosition[0] - access.shipLadder.upperLandingSize[0] / 2,
        maxX: access.shipLadder.upperLandingPosition[0] + access.shipLadder.upperLandingSize[0] / 2,
        minY: rustworksDeckTopY(access.shipLadder.upperLandingPosition[1], access.shipLadder.upperLandingSize[1]),
        maxY: rustworksDeckTopY(access.shipLadder.upperLandingPosition[1], access.shipLadder.upperLandingSize[1]) + 2.0,
        minZ: access.shipLadder.upperLandingPosition[2] - access.shipLadder.upperLandingSize[2] / 2,
        maxZ: access.shipLadder.upperLandingPosition[2] + access.shipLadder.upperLandingSize[2] / 2,
      },
      {
        minX: access.shipLadder.bridgePosition[0] - access.shipLadder.bridgeSize[0] / 2,
        maxX: access.shipLadder.bridgePosition[0] + access.shipLadder.bridgeSize[0] / 2,
        minY: rustworksDeckTopY(access.shipLadder.bridgePosition[1], access.shipLadder.bridgeSize[1]),
        maxY: rustworksDeckTopY(access.shipLadder.bridgePosition[1], access.shipLadder.bridgeSize[1]) + 2.0,
        minZ: access.shipLadder.bridgePosition[2] - access.shipLadder.bridgeSize[2] / 2,
        maxZ: access.shipLadder.bridgePosition[2] + access.shipLadder.bridgeSize[2] / 2,
      },
    ];
    for (const mesh of solidMeshes) {
      mesh.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(mesh);
      for (const corridor of corridors) {
        const overlaps = box.max.x > corridor.minX + 0.05
          && box.min.x < corridor.maxX - 0.05
          && box.max.y > corridor.minY + 0.05
          && box.min.y < corridor.maxY - 0.05
          && box.max.z > corridor.minZ + 0.05
          && box.min.z < corridor.maxZ - 0.05;
        expect(overlaps, `${mesh.name}@${mesh.position.toArray().join(',')} blocks access corridor`).toBe(false);
      }
    }
  });

  it('builds an untimed three-distance score range with reusable targets', () => {
    const map = buildGunRange(new THREE.Scene());
    expect(map.id).toBe('gun-range');
    expect(map.label).toBe('Acres Indoor Gun Range');
    expect(map.targets).toHaveLength(14);
    expect(map.targets.filter((target) => target.distanceBand === 'near')).toHaveLength(7);
    expect(map.targets.filter((target) => target.distanceBand === 'mid')).toHaveLength(4);
    expect(map.targets.filter((target) => target.distanceBand === 'far')).toHaveLength(3);
    expect(map.targets.map((target) => target.scoreValue).sort((a, b) => a - b)).toEqual([
      50, 50, 50, 50, 100, 100, 100, 200, 200, 200, 300, 300, 300, 500,
    ]);
    expect(map.targets.every((target) => target.root.userData.scoreValue === target.scoreValue)).toBe(true);
    expect(map.targets.filter((target) => target.kind === 'plate').every((target) => target.maxHealth === 500 && target.health === 500)).toBe(true);
    expect(map.targets.filter((target) => target.kind === 'plate').every((target) => target.root.getObjectByName('range-bullseye')?.userData.hitZone === 'head')).toBe(true);
    expect(map.targets.filter((target) => target.kind === 'plate').every((target) => target.root.children.some((child) => /point-range-plate/.test(child.name) && child.userData.hitZone === 'body'))).toBe(true);
    const cat = map.targets.find((target) => target.id === 'flying-black-cat');
    expect(cat).toMatchObject({ kind: 'flying-cat', maxHealth: 100, health: 100, scoreValue: 500, respawnDelayMs: 30_000, alwaysCritical: true });
    expect(map.root.getObjectByName('gun-range-flying-black-cat')).toBeTruthy();
    expect(map.root.children.find((child) => child.name === 'gun-range-flying-black-cat')?.children.filter((child) => child.name === 'flying-black-cat-trail-star')).toHaveLength(8);
    expect(map.root.getObjectByName('gun-range-firing-line')).toBeTruthy();
    expect(map.root.getObjectByName('gun-range-firing-line')?.position.z).toBe(GUN_RANGE_FIRING_LINE_Z);
    expect(map.physicsColliders).toContainEqual(GUN_RANGE_FIRING_LINE_BARRIER);
    expect(map.colliders).not.toContainEqual(GUN_RANGE_FIRING_LINE_BARRIER);
    expect(map.raycastMeshes.some((mesh) => mesh.name === 'gun-range-firing-line')).toBe(false);
    expect(GUN_RANGE_FIRING_LINE_BARRIER.maxY).toBeGreaterThan(5);
    expect(map.root.getObjectByName('gun-range-backstop')).toBeTruthy();
    expect(map.root.getObjectByName('gun-range-ceiling')).toBeTruthy();
    expect(map.root.getObjectByName('gun-range-left-wall')).toBeTruthy();
    expect(map.root.getObjectByName('gun-range-right-wall')).toBeTruthy();
    expect(map.root.getObjectByName('gun-range-control-room')).toBeTruthy();
    expect(map.root.getObjectByName('gun-range-acoustic-baffle')).toBeTruthy();
    expect(map.root.getObjectByName('gun-range-wallbang-panel-glass')).toBeTruthy();
    const wallbangSurfaces = map.shotSurfaces.filter((surface) => surface.name.startsWith('gun-range-wallbang-panel-'));
    expect(wallbangSurfaces.map((surface) => surface.material)).toEqual(['glass', 'wood', 'interior-wall', 'brick']);
    expect(wallbangSurfaces.map((surface) => Number((surface.bounds.maxZ - surface.bounds.minZ).toFixed(2)))).toEqual([0.08, 0.24, 0.42, 0.7]);
    expect(map.root.children.filter((child) => child.name === 'gun-range-interior-light')).toHaveLength(7);
    expect(map.root.children.filter((child) => child.name === 'gun-range-cycling-neon-light')).toHaveLength(4);
    expect(map.root.children.filter((child) => child.name === 'gun-range-cycling-neon-strip')).toHaveLength(8);
    expect(map.root.getObjectByName('gun-range-moderate-ambient')).toBeInstanceOf(THREE.HemisphereLight);
    const wallMaterial = (map.root.getObjectByName('gun-range-left-wall') as THREE.Mesh).material as THREE.MeshStandardMaterial;
    const ceilingMaterial = (map.root.getObjectByName('gun-range-ceiling') as THREE.Mesh).material as THREE.MeshStandardMaterial;
    expect(wallMaterial.userData.gunRangeShell).toBe('white-silver-wall');
    expect(ceilingMaterial.userData.gunRangeShell).toBe('white-silver-ceiling');
    expect(wallMaterial.color.getHex()).toBe(0xb8c1c4);
    expect(ceilingMaterial.color.getHex()).toBe(0xd7dbdc);
    const neon = map.root.children.find((child) => child.name === 'gun-range-cycling-neon-light') as THREE.PointLight;
    const before = neon.color.getHex();
    updateGunRangePresentation(map.root, 9_000);
    expect(neon.color.getHex()).not.toBe(before);
    const boothDividers = map.root.children.filter((child) => child.name === 'gun-range-booth-divider');
    expect(boothDividers.map((divider) => divider.position.x)).toEqual([-15, -9, -3, 3, 9, 15]);
    expect(boothDividers.every((divider) => Math.abs(divider.position.x) > 0.08)).toBe(true);
    const stations = map.root.children.filter((child) => child.name.startsWith('gun-range-weapon-station-'));
    expect(stations).toHaveLength(5);
    expect(stations.map((station) => station.userData.weapon)).toEqual(['carbine', 'smg', 'lmg', 'scattergun', 'sniper']);
    expect(map.bounds.maxX - map.bounds.minX).toBeGreaterThanOrEqual(40);
    expect(map.bounds.maxZ - map.bounds.minZ).toBeGreaterThanOrEqual(67);
    expectGunRangeSpawnContract(map);
  });

  it('physically contains the Gun Range player at all four map edges', async () => {
    const map = buildGunRange(new THREE.Scene());
    const physics = await CharacterPhysics.create(map.physicsColliders, map.bounds);
    try {
      for (const direction of [
        { x: 0.3, z: 0 }, { x: -0.3, z: 0 }, { x: 0, z: 0.3 }, { x: 0, z: -0.3 },
      ]) {
        physics.teleportEye({ x: 0, y: 1.7, z: -17 });
        let position = physics.eyePosition();
        for (let step = 0; step < 240; step += 1) {
          position = physics.move({ x: direction.x, y: -0.01, z: direction.z }, 1 / 120).position;
        }
        expect(position.x).toBeGreaterThan(map.bounds.minX);
        expect(position.x).toBeLessThan(map.bounds.maxX);
        expect(position.z).toBeGreaterThan(map.bounds.minZ);
        expect(position.z).toBeLessThan(map.bounds.maxZ);
        expect(position.y).toBeGreaterThan(1.5);
      }
    } finally {
      physics.dispose();
    }
  });

  it('builds an original airport-terminal arena with concourse, jet bridge, fuselage, and tarmac apron', () => {
    const map = buildSkylineTerminal(new THREE.Scene());
    expect(map.id).toBe('skyline-terminal');
    expect(map.label).toBe('Skyline Terminal');
    expect(map.root.name).toContain('Skyline Terminal');
    expect(map.colliders.length).toBeGreaterThanOrEqual(15);
    expect(map.raycastMeshes.length).toBeGreaterThanOrEqual(15);
    expect(map.spawns[0].length).toBeGreaterThanOrEqual(6);
    expect(map.spawns[1].length).toBeGreaterThanOrEqual(6);
    expect(map.patrolPoints.length).toBeGreaterThanOrEqual(12);
    expect(map.breakableWindows.length).toBeGreaterThanOrEqual(4);
    expect(map.physicalCover.length).toBeGreaterThanOrEqual(5);
    expect(map.root.getObjectByName('skyline-tarmac-apron')).toBeTruthy();
    expect(map.root.getObjectByName('skyline-concourse-floor')).toBeTruthy();
    expect(map.root.getObjectByName('skyline-jetbridge-floor')).toBeTruthy();
    expect(map.root.getObjectByName('skyline-jetliner-fuselage-top')).toBeTruthy();
  });

  it('exposes coherent terminal-story clusters and presentation batching', () => {
    const map = buildSkylineTerminal(new THREE.Scene());
    const mainSign = map.root.getObjectByName('skyline-terminal-main-sign');
    expect(mainSign).toBeTruthy();
    expect(mainSign?.userData.label).toBe('SKYLINE TERMINAL - GATES 1-12');

    const flightDisplay = map.root.getObjectByName('skyline-flight-display-board');
    expect(flightDisplay).toBeTruthy();
    expect(flightDisplay?.userData.label).toBe('DEPARTURES - FLIGHT AERO 86');

    expect(map.root.getObjectByName('skyline-baggage-claim-carousel')).toBeTruthy();
    expect(map.root.getObjectByName('skyline-fuel-trailer')).toBeTruthy();
    expect(map.root.getObjectByName('skyline-fuel-trailer-tank')).toBeTruthy();
    expect(map.root.getObjectByName('skyline-jetliner-cockpit-partition')).toBeTruthy();

    const clusterIds = [
      'floor-language',
      'wall-structure',
      'escalator-detail',
      'window-frame',
      'aircraft-skin',
      'apron-marking',
      'terminal-story',
      'concourse-cover',
      'boarding-route',
      'quality-aircraft',
      'service-equipment',
    ];
    expect(map.root.userData.skylineDetailClusters).toEqual(clusterIds);
    for (const clusterId of clusterIds) {
      let semanticNodes = 0;
      map.root.traverse((node) => {
        if (node.userData.skylineCluster === clusterId) semanticNodes += 1;
      });
      expect(semanticNodes, clusterId).toBeGreaterThan(0);
    }

    const batches = map.root.userData.skylinePresentationBatches as {
      sourceMeshes: number;
      batches: number;
      savedDrawCalls: number;
    };
    expect(batches.sourceMeshes).toBeGreaterThanOrEqual(30);
    expect(batches.batches).toBeGreaterThan(0);
    expect(batches.savedDrawCalls).toBeGreaterThanOrEqual(24);
  });

  it('ships the Pass 60 white-silver terminal reskin as an obvious authored environment', () => {
    const map = buildSkylineTerminal(new THREE.Scene());
    expect(map.root.userData.skylineReskin).toEqual({
      version: 'pass-60-total-overhaul',
      palette: 'white-silver-cyan-magenta',
      routeGeometryChanged: false,
      authoritativeCeiling: true,
    });

    for (const name of [
      'skyline-terminal-silver-ceiling',
      'skyline-floor-cyan-runner-west',
      'skyline-floor-magenta-crossing',
      'skyline-mezzanine-coffer-0',
      'skyline-mezzanine-coffer-light-0',
      'skyline-overhead-gate-sign--18',
      'skyline-overhead-gate-sign-18',
      'skyline-airside-roof-crown',
      'skyline-airside-identity--18',
      'skyline-airside-identity-18',
      'skyline-roof-sculptural-fin-0',
      'skyline-apron-cyan-guidance-west',
      'skyline-apron-magenta-guidance-east',
      'skyline-aircraft-livery-cyan-north',
      'skyline-aircraft-livery-magenta-south',
    ]) expect(map.root.getObjectByName(name), name).toBeTruthy();

    const ceiling = map.root.getObjectByName('skyline-terminal-silver-ceiling') as THREE.Mesh;
    expect(map.raycastMeshes).toContain(ceiling);
    expect(ceiling.userData.ballisticSurfaceId).toEqual(expect.any(String));
    expect((ceiling.material as THREE.MeshStandardMaterial).color.getHex()).toBe(0xf2f5f1);

    const cyan = map.root.getObjectByName('skyline-floor-cyan-runner-west') as THREE.Mesh;
    const magenta = map.root.getObjectByName('skyline-floor-magenta-crossing') as THREE.Mesh;
    expect((cyan.material as THREE.MeshStandardMaterial).emissiveIntensity).toBeGreaterThan(1);
    expect((magenta.material as THREE.MeshStandardMaterial).emissiveIntensity).toBeGreaterThan(1);
  });

  it('keeps six breakable facade panes independent from the added mullion frames', () => {
    const map = buildSkylineTerminal(new THREE.Scene());
    expect(map.breakableWindows.map((window) => window.id)).toEqual([
      'skyline-window--22',
      'skyline-window--14',
      'skyline-window--6',
      'skyline-window-6',
      'skyline-window-14',
      'skyline-window-22',
    ]);
    for (const window of map.breakableWindows) {
      expect(window.mesh.userData.dynamic).toBe(true);
      expect(window.mesh.userData.breakableWindowId).toBe(window.id);
    }
    for (const winX of [-22, -14, -6, 6, 14, 22]) {
      expect(map.root.getObjectByName(`skyline-window-frame-top-${winX}`)?.userData.breakableWindowId).toBeUndefined();
      expect(map.root.getObjectByName(`skyline-window-mullion-${winX}`)?.userData.breakableWindowId).toBeUndefined();
    }
  });

  it('keeps every authored Skyline spawn clear, separated, and inside the playable bounds', () => {
    const map = buildSkylineTerminal(new THREE.Scene());
    for (const team of [0, 1] as const) {
      expect(map.spawns[team]).toHaveLength(6);
      for (const spawn of map.spawns[team]) {
        expect(pointInsideBounds(spawn, map.bounds, 0.5)).toBe(true);
        expect(isBlocked(spawn, map.colliders, 0.44), `${team}:${spawn.toArray().join(',')}`).toBe(false);
      }
      for (let first = 0; first < map.spawns[team].length; first += 1) {
        for (let second = first + 1; second < map.spawns[team].length; second += 1) {
          expect(map.spawns[team][first].distanceTo(map.spawns[team][second])).toBeGreaterThanOrEqual(6);
        }
      }
    }
  });

  it('applies the Performance/Quality split to Skyline instead of rendering Quality props on low-spec profiles', () => {
    const map = buildSkylineTerminal(new THREE.Scene());
    const performanceSign = map.root.getObjectByName('skyline-terminal-main-sign');
    const qualityBoard = map.root.getObjectByName('skyline-flight-display-board');
    const qualityNacelles = map.root.getObjectByName('skyline-aircraft-engine-nacelles');
    const qualityShell = map.root.getObjectByName('skyline-quality-fuselage-shell');
    const fuselagePlaceholder = map.root.getObjectByName('skyline-jetliner-fuselage-top') as THREE.Mesh;
    const coreFloor = map.root.getObjectByName('skyline-concourse-floor');
    expect(performanceSign).toBeTruthy();
    expect(qualityBoard).toBeTruthy();
    expect(qualityNacelles).toBeTruthy();
    expect(qualityShell).toBeTruthy();
    expect(qualityShell?.userData.assetOwner).toBe('skyline-terminal');
    applyAdditionalMapPresentationProfile(map.root, 'performance');
    expect(performanceSign?.visible).toBe(true);
    expect(qualityBoard?.visible).toBe(false);
    expect(qualityNacelles?.visible).toBe(false);
    expect(qualityShell?.visible).toBe(false);
    expect((fuselagePlaceholder.material as THREE.Material).colorWrite).toBe(true);
    expect(coreFloor?.visible).not.toBe(false);
    applyAdditionalMapPresentationProfile(map.root, 'blender');
    expect(performanceSign?.visible).toBe(true);
    expect(qualityBoard?.visible).toBe(true);
    expect(qualityNacelles?.visible).toBe(true);
    expect(qualityShell?.visible).toBe(true);
    expect((fuselagePlaceholder.material as THREE.Material).colorWrite).toBe(false);
  });

  it('authors a visible boarding door and a cabin aisle wider than the player controller', () => {
    const map = buildSkylineTerminal(new THREE.Scene());
    for (const name of [
      'skyline-aircraft-door-jamb-left',
      'skyline-aircraft-door-jamb-right',
      'skyline-aircraft-door-header',
      'skyline-aircraft-door-threshold-seal',
      'skyline-aircraft-open-door-leaf',
      'skyline-aircraft-boarding-sign',
    ]) expect(map.root.getObjectByName(name), name).toBeTruthy();
    const clearance = map.root.userData.skylineCabinClearance as {
      aisleMetres: number;
      physicsPlayerDiameterMetres: number;
      clearanceProbeDiameterMetres: number;
      doorVisibleApertureMetres: number;
    };
    expect(clearance.aisleMetres).toBeGreaterThanOrEqual(1.15);
    expect(clearance.physicsPlayerDiameterMetres).toBe(0.76);
    expect(clearance.clearanceProbeDiameterMetres).toBe(0.88);
    expect(clearance.aisleMetres).toBeGreaterThan(clearance.clearanceProbeDiameterMetres);
    expect(clearance.doorVisibleApertureMetres).toBeGreaterThanOrEqual(1.8);
  });

  it('adds deliberate concourse cover while preserving centre and flank lanes', () => {
    const map = buildSkylineTerminal(new THREE.Scene());
    expect(map.physicalCover.map((cover) => cover.id)).toEqual(expect.arrayContaining([
      'concourse-seating-west',
      'concourse-seating-east',
      'concourse-planter-west',
      'concourse-planter-east',
    ]));
    for (const [x, z] of [[0, -16.7], [-18, -16.7], [18, -16.7]] as const) {
      expect(isBlocked({ x, y: 0, z }, map.colliders, 0.44), `${x}:${z}`).toBe(false);
    }
  });

  it('walks every Skyline route in both directions with Rapier-backed collision', async () => {
    const map = buildSkylineTerminal(new THREE.Scene());
    const routes = map.root.userData.skylineRoutes as Record<string, RouteAnchor[]>;
    for (const id of ['concourse-to-mezzanine', 'mezzanine-to-jetbridge', 'fuselage-to-tarmac', 'cabin-through-aisle']) {
      await traverseRoute(map, routes[id]);
      await traverseRoute(map, routes[id], true);
    }
  }, 30_000);

  it('provides climbable access angles and coherent route anchors across terminal zones', () => {
    const map = buildSkylineTerminal(new THREE.Scene());
    const access = map.root.userData.skylineAccess as {
      escalatorAngleDegrees: number;
      airstairAngleDegrees: number;
      maxClimbDegrees: number;
    };
    expect(access.escalatorAngleDegrees).toBeLessThanOrEqual(access.maxClimbDegrees);
    expect(access.airstairAngleDegrees).toBeLessThanOrEqual(access.maxClimbDegrees);

    const routes = map.root.userData.skylineRoutes as Record<string, RouteAnchor[]>;
    expect(routes['concourse-to-mezzanine']).toHaveLength(3);
    expect(routes['mezzanine-to-jetbridge']).toHaveLength(5);
    expect(routes['fuselage-to-tarmac']).toHaveLength(4);
    expect(routes['cabin-through-aisle']).toHaveLength(3);
  });
});

describe('Pass 59 map mechanical audits', () => {
  it('removes the mixed Rustworks centre debris and retains only grounded container yard cover', () => {
    const map = buildRustworks1v1(new THREE.Scene());
    const audit = map.root.userData.rustworksCentreCoverAudit as {
      styles: string[];
      count: number;
      minimumTowerDistance: null;
      removedMixedCover: boolean;
    };
    expect(audit).toMatchObject({
      styles: [],
      count: 0,
      minimumTowerDistance: null,
      removedMixedCover: true,
    });
    const forbidden: THREE.Object3D[] = [];
    map.root.traverse((node) => {
      if (/centre-cover|freight-crate|pallet-stack|service-trench-crossover/i.test(node.name)) forbidden.push(node);
    });
    expect(forbidden).toEqual([]);
    expect(map.root.getObjectByName('rustworks-quality-welsh-flag')).toBeTruthy();
    expect(map.root.userData.rustworksFlagAudit).toMatchObject({
      nation: 'Wales',
      animated: true,
      width: 6,
      height: 3.6,
    });
  });

  it('keeps the former centre-cover quadrants open in Rapier', async () => {
    const map = buildRustworks1v1(new THREE.Scene());
    const physics = await CharacterPhysics.create(map.physicsColliders, map.bounds);
    try {
      physics.teleportEye({ x: 9.2, y: 1.7, z: -13.2 });
      const lane = await walkToward(physics, { x: 9.2, y: 1.7, z: -9.4 }, 500);
      expect(Math.abs(lane.z + 9.4)).toBeLessThan(0.55);
    } finally {
      physics.dispose();
    }
  });
  it('preserves container collision and Welsh flag visibility across all profiles', () => {
    const map = buildRustworks1v1(new THREE.Scene());
    const colliderCount = map.colliders.length;
    for (const profile of ['compat', 'performance', 'blender'] as const) {
      applyRustworksPresentationProfile(map.root, profile);
      expect(map.colliders).toHaveLength(colliderCount);
      expect(map.root.getObjectByName('rustworks-quality-welsh-flag-cloth')?.visible).toBe(true);
      expect(isBlocked({ x: -18, y: 1.7, z: -21.5 }, map.colliders, 0.44)).toBe(true);
    }
  });
  it('labels Skyline open passages and mechanically closed staff doors coherently', () => {
    const map = buildSkylineTerminal(new THREE.Scene());
    const audit = map.root.userData.skylineDoorAudit as Array<{ id: string; state: string; mechanicalAuthority: string; clearWidth: number }>;
    expect(audit).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'terminal-gate', state: 'open', clearWidth: 3.5 }),
      expect.objectContaining({ id: 'aircraft-boarding', state: 'open', clearWidth: 2.68 }),
      expect.objectContaining({ id: 'staff-west', state: 'closed', mechanicalAuthority: 'skyline-terminal-backwall' }),
      expect.objectContaining({ id: 'staff-east', state: 'closed', mechanicalAuthority: 'skyline-terminal-backwall' }),
    ]));
    for (const name of ['skyline-terminal-gate-jamb-left', 'skyline-terminal-gate-jamb-right', 'skyline-terminal-gate-header', 'skyline-staff-door-west', 'skyline-staff-door-east']) {
      expect(map.root.getObjectByName(name), name).toBeTruthy();
    }
    expect(isBlocked({ x: 0, y: 5.02, z: -11.8 }, map.colliders, 0.35)).toBe(false);
    expect(isBlocked({ x: -22, y: 1.25, z: -34 }, map.colliders, 0.35)).toBe(true);
    expect(isBlocked({ x: 22, y: 1.25, z: -34 }, map.colliders, 0.35)).toBe(true);
  });
});
