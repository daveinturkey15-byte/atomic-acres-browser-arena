/**
 * Regression gate: the cavity depth-eraser must not extend beyond the apron hole.
 *
 * The colosseum corridor erases the shared ground's depth buffer inside an
 * elliptical shell so the below-ground excavation becomes visible. A ring of
 * apron ground then repaints normal depth outside the bowl mouth. If the eraser
 * is WIDER than the apron hole, a band of ground has its depth erased but is
 * never repainted — and the player sees straight through the floor.
 *
 * This test constructs the corridor, finds both meshes by name, derives the
 * effective elliptical radii from their tessellated geometry, and asserts the
 * eraser is contained by the apron hole. It also sends an analytic y=1.7 eye
 * grid toward the excavation floor and audits renderOrder sequencing plus
 * depth/color state on every participant.
 *
 * SKILL CITATIONS:
 *   webgpu-tsl-arena-forging §2 and §4   — inventory and separate presentation
 *   browser-game-runtime-debugging §1/§3 — structural and material audit first
 *   realtime-browser-qa §1/§5            — exact contract and analytic trajectory
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { COLOSSEUM_VIEWPOINT, createColosseumCorridor } from './corridor-colosseum';

const corridor = createColosseumCorridor();
const meshes = corridor.group.children.filter(
  (c): c is THREE.Mesh => c instanceof THREE.Mesh,
);

/** Find a mesh by its name. */
function named(name: string): THREE.Mesh {
  const m = meshes.find((c) => c.name === name);
  if (!m) throw new Error(`mesh "${name}" not found in corridor group`);
  return m;
}

/**
 * For a mesh whose geometry is a surface of revolution (ring + cap),
 * compute its maximum XZ extent from the origin. This is the effective
 * elliptical semi-axis: for each vertex, measure distance from (0, CZ).
 *
 * Returns { maxA, maxB } where A is the maximum |x| and B is the maximum
 * |z - CZ| across all vertices.
 */
function ellipticalExtent(
  mesh: THREE.Mesh,
  cz: number,
): { maxA: number; maxB: number } {
  const geo = mesh.geometry;
  const pos = geo.getAttribute('position');
  let maxA = 0;
  let maxB = 0;
  for (let i = 0; i < pos.count; i++) {
    const x = Math.abs(pos.getX(i));
    const z = Math.abs(pos.getZ(i) - cz);
    if (x > maxA) maxA = x;
    if (z > maxB) maxB = z;
  }
  return { maxA, maxB };
}

/** Derive the hole boundary from the real ShapeGeometry vertices. */
function holeBoundary(mesh: THREE.Mesh, cz: number): { a: number; b: number } {
  const pos = mesh.geometry.getAttribute('position');
  let a = 0;
  let b = 0;
  for (let i = 0; i < pos.count; i++) {
    const x = Math.abs(pos.getX(i));
    const z = Math.abs(pos.getZ(i) - cz);
    // The profile boundary has no vertices in either narrow axis band at the
    // bowl centre; those bands therefore select the actual hole ring.
    if (z < 0.75) a = Math.max(a, x);
    if (x < 0.75) b = Math.max(b, z);
  }
  return { a, b };
}

function ellipseDistance(x: number, z: number, a: number, b: number, cz: number): number {
  return (x / a) ** 2 + ((z - cz) / b) ** 2;
}

function ellipseContains(
  x: number,
  z: number,
  a: number,
  b: number,
  cz: number,
): boolean {
  return ellipseDistance(x, z, a, b, cz) <= 1 + 1e-6;
}

function pointAtY(
  eye: { x: number; y: number; z: number },
  target: { x: number; y: number; z: number },
  y: number,
): { x: number; z: number } {
  const t = (eye.y - y) / (eye.y - target.y);
  return {
    x: eye.x + (target.x - eye.x) * t,
    z: eye.z + (target.z - eye.z) * t,
  };
}

describe('Colosseum cavity-eraser depth contract', () => {
  // The bowl centre z-coordinate. CZ = -122 in the source.
  // We derive it from the eraser geometry's centroid rather than
  // hard-coding, so the test survives retuning.
  const eraser = named('map3-colosseum-cavity-depth-eraser');
  const apron = named('map3-colosseum-apron-ground');

  // Derive CZ from the eraser cap (the lowest y vertices form a disc
  // whose centre-of-mass z is CZ).
  const eraserPos = eraser.geometry.getAttribute('position');
  let minY = Infinity;
  for (let i = 0; i < eraserPos.count; i++) {
    const y = eraserPos.getY(i);
    if (y < minY) minY = y;
  }
  // Collect z of all vertices at the floor level (within 0.5m)
  let czSum = 0;
  let czCount = 0;
  for (let i = 0; i < eraserPos.count; i++) {
    if (Math.abs(eraserPos.getY(i) - minY) < 0.5) {
      // The centre vertex of the cap fan has x≈0, z≈CZ
      if (Math.abs(eraserPos.getX(i)) < 0.1) {
        czSum += eraserPos.getZ(i);
        czCount++;
      }
    }
  }
  const CZ = czCount > 0 ? czSum / czCount : -122;

  it('eraser does not extend beyond the apron hole — the see-through-floor gate', () => {
    const eraserExtent = ellipticalExtent(eraser, CZ);
    const hole = holeBoundary(apron, CZ);

    // THE GATE: the eraser must fit INSIDE the apron hole.
    // If the eraser extends beyond the hole, ground depth is erased but
    // never repainted, and the floor becomes transparent.
    expect(eraserExtent.maxA).toBeLessThanOrEqual(hole.a + 1e-4);
    expect(eraserExtent.maxB).toBeLessThanOrEqual(hole.b + 1e-4);
  });

  it('keeps shared ground as the first hit outside the mouth across an eye grid', () => {
    const eraserExtent = ellipticalExtent(eraser, CZ);
    const hole = holeBoundary(apron, CZ);
    const target = { x: 0, y: -17, z: CZ };
    const groundY = -0.35;
    const eyes = [] as Array<{ x: number; y: number; z: number }>;
    for (let x = -120; x <= 120; x += 10) {
      for (let z = -100; z <= 40; z += 10) eyes.push({ x, y: 1.7, z });
    }

    let eraserWins = 0;
    let groundWins = 0;
    const leaks: Array<{ eye: { x: number; y: number; z: number }; distance: number }> = [];
    for (const eye of eyes) {
      const ground = pointAtY(eye, target, groundY);
      const eraserHit = ellipseContains(
        ground.x, ground.z, eraserExtent.maxA, eraserExtent.maxB, CZ,
      );
      const mouthHit = ellipseContains(ground.x, ground.z, hole.a, hole.b, CZ);
      if (eraserHit) {
        eraserWins++;
        if (!mouthHit) leaks.push({
          eye,
          distance: ellipseDistance(ground.x, ground.z, hole.a, hole.b, CZ),
        });
      } else {
        groundWins++;
      }
    }

    // `eraserWins` models the depth override at the y=-0.35 crossing: the
    // shell wins only where that crossing lies inside its silhouette.
    expect(eraserWins).toBeGreaterThan(0);
    expect(groundWins).toBeGreaterThan(0);
    expect(leaks).toEqual([]);

    const authoredGround = pointAtY(COLOSSEUM_VIEWPOINT, target, groundY);
    expect(ellipseContains(
      authoredGround.x, authoredGround.z, eraserExtent.maxA, eraserExtent.maxB, CZ,
    )).toBe(true);
  });

  it('eraser has correct depth state: depthTest off, depthWrite on, colorWrite off', () => {
    const mat = eraser.material as THREE.Material;
    expect(mat.depthTest).toBe(false);
    expect(mat.depthWrite).toBe(true);
    expect(mat.colorWrite).toBe(false);
  });

  it('eraser renderOrder < bowl renderOrder < apron renderOrder', () => {
    const bowl = named('map3-colosseum-cavea-terrain');
    expect(eraser.renderOrder).toBeLessThan(bowl.renderOrder);
    expect(bowl.renderOrder).toBeLessThanOrEqual(apron.renderOrder);
  });

  it('does not tie different depth strategies at one render order', () => {
    const strategies = new Map<number, string>();
    const mismatches: string[] = [];
    for (const mesh of meshes) {
      const material = mesh.material as THREE.Material;
      const strategy = `${material.depthTest}/${material.depthWrite}/${material.colorWrite}`;
      const prior = strategies.get(mesh.renderOrder);
      if (prior && prior !== strategy) mismatches.push(`${mesh.name}@${mesh.renderOrder}`);
      strategies.set(mesh.renderOrder, strategy);
    }
    expect(mismatches).toEqual([]);
    expect(meshes.filter((mesh) => mesh.renderOrder === eraser.renderOrder)).toEqual([eraser]);
  });
});
