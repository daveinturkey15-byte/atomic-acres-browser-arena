import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildNuketown2, NUKETOWN2_YARD_STAIR } from './nuketown2-arena';
import {
  NUKETOWN2_HOUSE_CENTRE_X,
  NUKETOWN2_HOUSE_DEPTH,
  NUKETOWN2_HOUSE_FRONT_Z,
  NUKETOWN2_HOUSE_WIDTH,
  NUKETOWN2_UPPER_Y0,
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
    expect(roofBodies.every((mesh) => mesh.userData.nuketown2RoofSolid === false)).toBe(true);
    expect(roofBodies.every((mesh) => mesh.userData.nuketown2RoofWalkable === false)).toBe(true);
    expect(roofBodies.filter((mesh) => mesh.userData.ballisticSurfaceId !== undefined)).toHaveLength(2);
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
});
