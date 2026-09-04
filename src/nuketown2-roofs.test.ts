import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildNuketown2, NUKETOWN2_CARRIAGEWAY_FOOTPRINTS, NUKETOWN2_YARD_STAIR } from './nuketown2-arena';
import {
  NUKETOWN2_HOUSE_CENTRE_X,
  NUKETOWN2_HOUSE_DEPTH,
  NUKETOWN2_HOUSE_FRONT_Z,
  NUKETOWN2_HOUSE_WIDTH,
  NUKETOWN2_UPPER_Y0,
  isNuketown2BayFootprint,
  nuketown2HandedSpan,
  nuketown2HandedX,
} from './nuketown2-layout';
import {
  NUKETOWN2_EXTERIOR_STAIR,
  NUKETOWN2_ROOF_BODY_TABLE,
  NUKETOWN2_ROOF_PLAN_AREA_BY_SIDE,
  NUKETOWN2_ROOF_SYMMETRY_EXCEPTION_NAMES,
  NUKETOWN2_SOLAR_PANEL,
} from './nuketown2-roofs';

const HOUSE_BACK_Z = NUKETOWN2_HOUSE_FRONT_Z - NUKETOWN2_HOUSE_DEPTH;
const HOUSE_MID_Z = (NUKETOWN2_HOUSE_FRONT_Z + HOUSE_BACK_Z) / 2;
const ROOF_PITCH = THREE.MathUtils.degToRad(8);

function build() {
  const scene = new THREE.Scene();
  const map = buildNuketown2(scene);
  scene.updateMatrixWorld(true);
  return map;
}

function roofMesh(map: ReturnType<typeof build>, bodyName: string): THREE.Mesh {
  const mesh = map.root.getObjectByName(`nuketown2 ${bodyName}`);
  expect(mesh instanceof THREE.Mesh, bodyName).toBe(true);
  return mesh as THREE.Mesh;
}

describe('Nuke Town rooflines and exterior stair source tables', () => {
  it('derives the House A butterfly rakes from the house footprint', () => {
    const map = build();
    const rakes = NUKETOWN2_ROOF_BODY_TABLE.filter((body) => body.kind === 'rake');
    expect(rakes).toHaveLength(2);

    const front = rakes.find((body) => body.id === 'house-a-front-rake')!;
    const rear = rakes.find((body) => body.id === 'house-a-rear-rake')!;
    expect(front.position[0]).toBe(NUKETOWN2_HOUSE_CENTRE_X);
    expect(front.size).toEqual([NUKETOWN2_HOUSE_WIDTH + 0.3, 0.18, 7.1]);
    expect(rear.size).toEqual([NUKETOWN2_HOUSE_WIDTH + 0.3, 0.18, 8.7]);
    expect(front.position[2]).toBeCloseTo((HOUSE_MID_Z - 9.4) / 2, 10);
    expect(rear.position[2]).toBeCloseTo((HOUSE_MID_Z - 25.2) / 2, 10);
    expect(front.rotation).toEqual([-ROOF_PITCH, 0, 0]);
    expect(rear.rotation).toEqual([ROOF_PITCH, 0, 0]);

    const frontMesh = roofMesh(map, `${front.side} ${front.name}`);
    const rearMesh = roofMesh(map, `${rear.side} ${rear.name}`);
    const frontValley = new THREE.Vector3(0, -front.size[1] / 2, -front.size[2] / 2)
      .applyMatrix4(frontMesh.matrixWorld);
    const rearValley = new THREE.Vector3(0, -rear.size[1] / 2, rear.size[2] / 2)
      .applyMatrix4(rearMesh.matrixWorld);
    expect(frontValley.y).toBeCloseTo(6.55, 8);
    expect(rearValley.y).toBeCloseTo(6.55, 8);
    expect(frontMesh.position.z - front.size[2] / 2).toBeCloseTo(HOUSE_MID_Z, 8);
    expect(rearMesh.position.z + rear.size[2] / 2).toBeCloseTo(HOUSE_MID_Z, 8);

    expect(front.position[2] + front.size[2] / 2).toBeCloseTo(-9.4, 8);
    expect(rear.position[2] - rear.size[2] / 2).toBeCloseTo(-25.2, 8);
    expect(Math.abs(frontMesh.rotation.x)).toBeCloseTo(ROOF_PITCH, 10);
    expect(Math.abs(rearMesh.rotation.x)).toBeCloseTo(ROOF_PITCH, 10);
  });

  it('places six House A panels and two eight-band House B capsules', () => {
    const map = build();
    const panels = NUKETOWN2_ROOF_BODY_TABLE.filter((body) => body.kind === 'solar-panel');
    const capsules = NUKETOWN2_ROOF_BODY_TABLE.filter((body) => body.kind === 'capsule-band');
    expect(panels).toHaveLength(6);
    expect(capsules).toHaveLength(16);
    expect(panels.every((body) => body.side === 'north')).toBe(true);
    expect(panels.every((body) => body.material === 'solarPanel')).toBe(true);
    expect(capsules.every((body) => body.side === 'south')).toBe(true);
    expect(panels.every((body) => body.size.join(',') === NUKETOWN2_SOLAR_PANEL.size.join(','))).toBe(true);
    expect(capsules.filter((body) => body.material === 'roofGlazing')).toHaveLength(4);
    expect(capsules.filter((body) => body.material === 'roof')).toHaveLength(12);
    expect(capsules.every((body) => body.size[1] === 0.2)).toBe(true);

    for (const body of [...panels, ...capsules]) {
      expect(roofMesh(map, `${body.side} ${body.name}`).userData.nuketown2RoofBody).toBe(true);
    }
  });

  it('keeps the roof exception identity-only and above the existing deck', () => {
    const map = build();
    const tableNames = NUKETOWN2_ROOF_BODY_TABLE.map((body) => `nuketown2 ${body.side} ${body.name}`);
    expect(NUKETOWN2_ROOF_SYMMETRY_EXCEPTION_NAMES).toEqual(tableNames);
    expect(NUKETOWN2_ROOF_PLAN_AREA_BY_SIDE.north).toBe(NUKETOWN2_HOUSE_WIDTH * NUKETOWN2_HOUSE_DEPTH);
    expect(NUKETOWN2_ROOF_PLAN_AREA_BY_SIDE.south).toBe(NUKETOWN2_HOUSE_WIDTH * NUKETOWN2_HOUSE_DEPTH);

    const roofBodies = NUKETOWN2_ROOF_BODY_TABLE.map((body) => roofMesh(map, `${body.side} ${body.name}`));
    const deck = roofMesh(map, 'north house roof deck');
    for (const body of NUKETOWN2_ROOF_BODY_TABLE.filter((entry) => entry.kind === 'rake')) {
      expect(roofMesh(map, `${body.side} ${body.name}`).userData.impactSurface)
        .toBe(deck.userData.impactSurface);
    }
    expect(roofBodies.every((mesh) => mesh.userData.nuketown2RoofSolid === false)).toBe(true);
    expect(roofBodies.every((mesh) => mesh.userData.nuketown2RoofWalkable === false)).toBe(true);
    expect(roofBodies.filter((mesh) => mesh.userData.ballisticSurfaceId !== undefined)).toHaveLength(2);
    const emittedPlanAreaBySide = Object.fromEntries((['north', 'south'] as const).map((side) => [
      side,
      NUKETOWN2_ROOF_BODY_TABLE
        .filter((body) => body.side === side)
        .reduce((total, body) => total + body.planArea, 0),
    ]));
    expect(emittedPlanAreaBySide.north).toBeCloseTo(188.77, 8);
    expect(emittedPlanAreaBySide.south).toBeCloseTo(202.0279636, 8);
    const apexYBySide = Object.fromEntries((['north', 'south'] as const).map((side) => {
      const bounds = new THREE.Box3();
      for (const body of NUKETOWN2_ROOF_BODY_TABLE.filter((entry) => entry.side === side)) {
        bounds.expandByObject(roofMesh(map, `${body.side} ${body.name}`));
      }
      return [side, bounds.max.y];
    }));
    expect(apexYBySide.north).toBeCloseTo(7.9390542, 7);
    expect(apexYBySide.south).toBeCloseTo(8.15, 7);
    for (const mesh of roofBodies) {
      const bounds = new THREE.Box3().setFromObject(mesh);
      expect(bounds.min.y, mesh.name).toBeGreaterThanOrEqual(6.5);
    }
    expect(NUKETOWN2_UPPER_Y0).toBe(3.3);
  });

  it('rebuilds both exterior flights at the fixed 4.2 m envelope', () => {
    const map = build();
    const stair = NUKETOWN2_EXTERIOR_STAIR;
    expect(stair.risers).toBe(17);
    expect(stair.rise).toBeCloseTo(3.3 / 17, 12);
    expect(stair.going).toBeCloseTo(4.2 / 16, 12);
    expect(stair.going * (stair.risers - 1)).toBeCloseTo(4.2, 12);
    expect(stair.stringerLength).toBeCloseTo(Math.hypot(4.2, 3.3), 12);
    expect(NUKETOWN2_YARD_STAIR.riser * NUKETOWN2_YARD_STAIR.risers).toBeCloseTo(3.3, 12);
    expect(NUKETOWN2_YARD_STAIR.going * (NUKETOWN2_YARD_STAIR.risers - 1)).toBeCloseTo(4.2, 12);
    expect(NUKETOWN2_YARD_STAIR.footX).toBe(-9.4);

    const stairMeshes = map.root.children.filter((node): node is THREE.Mesh => (
      node instanceof THREE.Mesh && node.name.includes('exterior stair')
    ));
    expect(stairMeshes.filter((mesh) => mesh.name.includes('stringer'))).toHaveLength(4);
    expect(stairMeshes.filter((mesh) => mesh.name.includes('closed riser'))).toHaveLength(32);
    expect(stairMeshes.filter((mesh) => mesh.name.includes('tread'))).toHaveLength(32);
    expect(stairMeshes.filter((mesh) => mesh.name.includes('handrail'))).toHaveLength(2);
    expect(stairMeshes.filter((mesh) => mesh.name.includes('rail post'))).toHaveLength(4);
    expect(stairMeshes.every((mesh) => mesh.userData.nuketown2ExteriorStairSolid === false)).toBe(true);
    expect(stairMeshes.every((mesh) => mesh.userData.nuketown2ExteriorStairWalkable === false)).toBe(true);

    const rampMeshes = map.root.children.filter((node): node is THREE.Mesh => (
      node instanceof THREE.Mesh && node.name.includes('yard stair ramp')
    ));
    expect(rampMeshes).toHaveLength(2);
    expect(rampMeshes.every((mesh) => mesh.userData.collisionOnly === true)).toBe(true);
    expect(map.shotSurfaces.filter((surface) => surface.name.includes('exterior stair'))).toHaveLength(6);
  });

  // ---- GEOMETRY-2 MERGE RECONCILIATION -------------------------------------
  // Four lanes authored `nuketown2-arena.ts` against each other's absence. The
  // three properties below only exist where two of them MEET, so no single lane
  // could have gated them and none of them is implied by the lane tests above.
  it('reconciles the merged lanes: paved cuts are disjoint, roofs stay ghosts, the standoff holds', () => {
    const map = build();

    // (1) THE PAVED CUTS DO NOT OVERLAP. The turning-head lane cut a circular
    //     bulb, the layout lane cut roadside bays and the accuracy lane cut the
    //     third house's drive - three separate paved cuts authored in three
    //     branches. Two paved cuts sharing plan area are a coplanar race AND a
    //     double ground cut, and the grass keep-out then fires twice on one
    //     patch and not at all on another. The disc is tested with the SAME
    //     nearest-point predicate the ground cut and the coplanar instrument
    //     use, so all three agree on where the road is.
    const head = NUKETOWN2_CARRIAGEWAY_FOOTPRINTS.find((piece) => piece.id === 'turning-head');
    expect(head, 'the authored turning-head footprint').toBeDefined();
    expect(head!.shape, 'the head is a disc, not its bounding square').toBe('circle');
    if (head!.shape !== 'circle') throw new Error('turning-head footprint lost its circle shape');
    const discCentreX = nuketown2HandedX(head!.centreX);

    const worldBays = NUKETOWN2_CARRIAGEWAY_FOOTPRINTS
      .filter(isNuketown2BayFootprint)
      .map((bay) => {
        const [x0, x1] = nuketown2HandedSpan(bay.x0, bay.x1);
        return { id: bay.id, x0, x1, z0: bay.z0, z1: bay.z1 };
      });
    expect(worldBays.length, 'the bays are still authored').toBeGreaterThan(0);

    const driveMesh = map.root.getObjectByName('nuketown2 beyond-bounds third house drive');
    expect(driveMesh, 'the third house keeps its drive').toBeDefined();
    const driveBox = new THREE.Box3().setFromObject(driveMesh!);
    const drive = { id: 'third house drive', x0: driveBox.min.x, x1: driveBox.max.x, z0: driveBox.min.z, z1: driveBox.max.z };

    const discOverlapsRect = (rect: { x0: number; x1: number; z0: number; z1: number }): boolean => {
      const nearestX = Math.max(rect.x0, Math.min(discCentreX, rect.x1));
      const nearestZ = Math.max(rect.z0, Math.min(head!.centreZ, rect.z1));
      return (nearestX - discCentreX) ** 2 + (nearestZ - head!.centreZ) ** 2 < head!.radius ** 2;
    };
    for (const rect of [...worldBays, drive]) {
      expect(discOverlapsRect(rect), `the bulb disc laps ${rect.id}`).toBe(false);
    }
    for (const bay of worldBays) {
      const overlap = Math.max(0, Math.min(bay.x1, drive.x1) - Math.max(bay.x0, drive.x0))
        * Math.max(0, Math.min(bay.z1, drive.z1) - Math.max(bay.z0, drive.z0));
      expect(overlap, `${bay.id} laps the third house drive`).toBe(0);
    }

    // (2) THE RAKE PLANES ARE STILL BALLISTIC GHOSTS OVER THE DECK AND BALCONY.
    //     `collider-visual-parity-core` direction C has NO above-reach
    //     exclusion, so a 1.16 m rake at y 6.5+ is unexplainable unless it is
    //     rated directly. It is rated by NAME - `classifyImpactSurface` reads
    //     the name first - so a rename is the failure mode this pins, and a
    //     later lane adding a collider to a roof skin is the other.
    for (const rake of NUKETOWN2_ROOF_BODY_TABLE.filter((body) => body.kind === 'rake')) {
      expect(rake.solid, `${rake.name} must not be solid`).toBe(false);
      expect(rake.shots, `${rake.name} must stay shot-rated`).toBe(true);
      expect(rake.name.includes('roof'), `${rake.name} must classify as roof by name`).toBe(true);
    }
    const rakeSurfaces = map.shotSurfaces.filter((surface) => surface.name.includes('rake'));
    expect(rakeSurfaces, "both houses keep their rakes on the shot roster").toHaveLength(2);

    // (3) THE 1.2 m SPAWN STANDOFF SURVIVES THE NEW CARPENTRY. The rooflines
    //     lane put stringers, a handrail and rail posts at z = -24.35 / -24.4,
    //     which is 0.6-0.65 m from the |z| = 25 spawn line - INSIDE the 1.2 m
    //     floor. They are legal only because they add no collider, exactly as
    //     the two balcony corner posts in HF-477 were not. Stated as the
    //     conditional it actually is, so a later lane that makes one solid to
    //     "fix" a walk probe fails here instead of at spawn time.
    const SPAWN_LINE_Z = 25;
    const STANDOFF_M = 1.2;
    const stairBodies = map.root.children.filter((node): node is THREE.Mesh => (
      node instanceof THREE.Mesh && node.userData.nuketown2ExteriorStairBody === true
    ));
    expect(stairBodies.length, 'the merged carpentry is present').toBeGreaterThan(0);
    let insideStandoff = 0;
    for (const mesh of stairBodies) {
      const box = new THREE.Box3().setFromObject(mesh);
      const nearestToLine = Math.min(
        SPAWN_LINE_Z - Math.abs(box.min.z),
        SPAWN_LINE_Z - Math.abs(box.max.z),
      );
      if (nearestToLine >= STANDOFF_M) continue;
      insideStandoff += 1;
      expect(mesh.userData.nuketown2ExteriorStairSolid,
        `${mesh.name} stands ${nearestToLine.toFixed(2)} m from the spawn line and must not be solid`).toBe(false);
    }
    expect(insideStandoff, 'the flight really does reach inside the standoff band').toBeGreaterThan(0);
  });
});
