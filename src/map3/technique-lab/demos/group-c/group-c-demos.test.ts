/**
 * Group-C technique-lab CPU checks.
 *
 * These are deliberately small and deliberately NOT a rendering test. They
 * instantiate every non-blocked demo, advance it, dispose it, and assert the
 * things a CPU can actually know: that the manifest preserves the register's
 * IDs, that metadata agrees with the manifest, that geometry is finite and
 * bounded, that disposal releases what was created, and that each technique's
 * own characteristic number moves the way the method says it should.
 *
 * Pixel validation is OPEN and is root's serialized visual pass. Nothing here
 * is evidence of rendered quality.
 */

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { manifest } from './index';
import { applyBrief } from './source-35';
import { voxelRemesh } from './source-36';
import { convertZupCentimetres } from './source-37';
import { isSolid, litRoomCells, voxelIndex, type VoxelGrid } from './source-40';
import { maskField, splineDensity } from './source-38';
import { OPERATION_LOG, replay } from './source-39';
import { deriveBuilding } from './source-42';
import { fillHoles, voxelToMesh, weldVertices } from './source-45';
import {
  BREAKING_ONSET,
  breakingTurbulence,
  createFoamField,
  gerstnerChop,
  shadeCorrect,
  shadeTintedAfter,
} from './source-46';
import { stepCriticallyDamped } from './source-49';
import {
  CLEARED_OBSTACLES,
  DEFECTIVE_OBSTACLES,
  PLAYER_RADIUS,
  sweepCorridor,
} from './source-50';

const SEED = 20260912;

describe('group-C manifest', () => {
  it('preserves the register IDs exactly and does not invent or drop any', () => {
    const ids = manifest.map((entry) => entry.sourceId);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toBeGreaterThanOrEqual(35);
    for (const id of ids) expect(id).toBeLessThanOrEqual(50);
  });

  it('gives every non-blocked entry a factory and every blocked entry none', () => {
    for (const entry of manifest) {
      if (entry.adaptation === 'blocked') {
        expect(entry.createDemo).toBeUndefined();
        expect(entry.limitation, `blocked ${entry.sourceId} needs a limitation`).toBeTruthy();
      } else {
        expect(typeof entry.createDemo, `entry ${entry.sourceId}`).toBe('function');
      }
    }
  });

  it('names at least one primary source on every entry', () => {
    for (const entry of manifest) {
      expect(entry.sources.length, `entry ${entry.sourceId}`).toBeGreaterThan(0);
    }
  });
});

describe('every non-blocked group-C demo instantiates, advances and disposes', () => {
  const runnable = manifest.filter((entry) => entry.createDemo);

  for (const entry of runnable) {
    it(`source ${entry.sourceId} — ${entry.title}`, () => {
      const demo = entry.createDemo!({ THREE, seed: SEED });

      // Identity: the created metadata must agree with the manifest row, or the
      // lab would label an exhibit with another technique's name.
      expect(demo.metadata.sourceId).toBe(entry.sourceId);
      expect(demo.metadata.adaptation).toBe(entry.adaptation);
      expect(demo.root).toBeInstanceOf(THREE.Group);
      expect(demo.root.children.length).toBeGreaterThan(0);

      // Bounded cost, and no NaN anywhere in the geometry.
      let meshCount = 0;
      let vertexCount = 0;
      demo.root.traverse((object: any) => {
        if (!object.isMesh && !object.isInstancedMesh) return;
        meshCount += 1;
        const position = object.geometry?.getAttribute('position');
        if (!position) return;
        vertexCount += position.count;
        const array = position.array as ArrayLike<number>;
        for (let i = 0; i < array.length; i += 1) {
          expect(Number.isFinite(array[i])).toBe(true);
        }
      });
      expect(meshCount).toBeGreaterThan(0);
      expect(meshCount).toBeLessThanOrEqual(64);
      expect(vertexCount).toBeLessThanOrEqual(400_000);

      // No demo in this group may create lights unless it declared them.
      const declared = demo.metadata.localLights ?? [];
      const actual: string[] = [];
      demo.root.traverse((object: any) => {
        if (object.isLight) actual.push(object.name || object.type);
      });
      expect(actual.length, `undeclared lights in ${entry.sourceId}`).toBe(declared.length);

      // Advancing must not throw and must not poison geometry with NaN.
      if (demo.update) {
        for (let step = 0; step < 12; step += 1) demo.update(step / 60, 1 / 60);
        demo.root.traverse((object: any) => {
          const position = object.geometry?.getAttribute('position');
          if (!position) return;
          const array = position.array as ArrayLike<number>;
          for (let i = 0; i < array.length; i += 1) {
            expect(Number.isFinite(array[i])).toBe(true);
          }
        });
      }

      demo.dispose();
      expect(demo.root.children.length).toBe(0);
    });
  }
});

describe('source 35 — the brief is enforced, not merely written down', () => {
  it('admits only the three whitelisted verbs and refuses the rest with a reason', () => {
    const outcome = applyBrief([
      { verb: 'pump', at: [0, 0] },
      { verb: 'door', at: [0, 1] },
      { verb: 'fridge', at: [1, 0] },
      { verb: 'drive', at: [2, 0] },
      { verb: 'craft', at: [3, 0] },
    ]);
    expect(outcome.admitted.map((entry) => entry.verb)).toEqual(['pump', 'door', 'fridge']);
    expect(outcome.refused).toHaveLength(2);
    for (const refusal of outcome.refused) expect(refusal.reason.length).toBeGreaterThan(0);
  });
});

describe('source 36 — the remesh actually reduces, and the bake carries direction', () => {
  it('drops triangle count while keeping a normalised baked normal per output vertex', () => {
    const geometry = new THREE.IcosahedronGeometry(1, 4);
    const positions = geometry.getAttribute('position').array as Float32Array;
    const normals = geometry.getAttribute('normal').array as Float32Array;
    const index = geometry.getIndex();
    const triangles = index
      ? (index.array as ArrayLike<number>)
      : Array.from({ length: geometry.getAttribute('position').count }, (_v, i) => i);

    const coarse = voxelRemesh(positions, normals, triangles, 0.3);
    const fine = voxelRemesh(positions, normals, triangles, 0.12);

    expect(coarse.outputTriangles).toBeGreaterThan(0);
    expect(coarse.outputTriangles).toBeLessThan(coarse.sourceTriangles);
    // The grid spacing is the silhouette control: a finer cell must keep more.
    expect(fine.outputTriangles).toBeGreaterThan(coarse.outputTriangles);

    for (let vertex = 0; vertex < coarse.positions.length / 3; vertex += 1) {
      const length = Math.hypot(
        coarse.bakedNormals[vertex * 3],
        coarse.bakedNormals[vertex * 3 + 1],
        coarse.bakedNormals[vertex * 3 + 2],
      );
      expect(length).toBeGreaterThan(0.99);
      expect(length).toBeLessThan(1.01);
    }
    geometry.dispose();
  });
});

describe('source 37 — the convention conversion is exact', () => {
  it('maps Z-up centimetres onto Y-up metres and keeps the footprint square', () => {
    const converted = convertZupCentimetres({
      name: 'probe',
      position: [250, 400, 180],
      size: [100, 200, 300],
    });
    // Source Z (up, cm) becomes scene Y (up, m).
    expect(converted.position[1]).toBeCloseTo(1.8, 6);
    expect(converted.position[0]).toBeCloseTo(2.5, 6);
    // Handedness is preserved by negating the source Y as it becomes scene Z.
    expect(converted.position[2]).toBeCloseTo(-4.0, 6);
    // Extents follow the same axis swap: source height becomes scene height.
    expect(converted.size[1]).toBeCloseTo(3.0, 6);
    expect(converted.size[2]).toBeCloseTo(2.0, 6);
  });
});

describe('source 40 — the light dies with the ceiling because there is no light', () => {
  it('reports fewer lit cells after the ceiling above them is removed', () => {
    const sizeX = 5;
    const sizeY = 6;
    const sizeZ = 5;
    const grid: VoxelGrid = {
      solid: new Uint8Array(sizeX * sizeY * sizeZ),
      sizeX,
      sizeY,
      sizeZ,
    };
    for (let y = 0; y < sizeY; y += 1) {
      for (let z = 0; z < sizeZ; z += 1) {
        for (let x = 0; x < sizeX; x += 1) {
          const shell = x === 0 || z === 0 || x === sizeX - 1 || z === sizeZ - 1;
          const solid = shell ? y % 3 !== 1 : y % 3 === 0;
          grid.solid[voxelIndex(grid, x, y, z)] = solid ? 1 : 0;
        }
      }
    }

    const intact = litRoomCells(grid).length;
    expect(intact).toBeGreaterThan(0);

    // Remove every solid cell above the bottom storey in one shell column.
    for (let y = 1; y < sizeY; y += 1) grid.solid[voxelIndex(grid, 0, y, 2)] = 0;
    const carved = litRoomCells(grid).length;

    expect(carved).toBeLessThan(intact);
    // And the query is genuinely structural: nothing above means nothing lit.
    grid.solid.fill(0);
    expect(litRoomCells(grid)).toHaveLength(0);
    expect(isSolid(grid, 0, 0, 0)).toBe(false);
  });
});

describe('source 46 — where the bubble term is injected changes the colour', () => {
  it('returns brighter and green-shifted only when scattered inside the integral', () => {
    const depth = 2.0;
    const turbulence = 1;
    const correct = shadeCorrect(depth, turbulence);
    const tinted = shadeTintedAfter(depth, turbulence);

    // The physical claim: flat backscatter filtered by absorption emerges green.
    expect(correct.g).toBeGreaterThan(correct.r);
    expect(correct.g).toBeGreaterThan(correct.b);

    // The mistake the source warns about: flat in, flat out. The tint raises
    // every channel by the same amount, so it cannot produce a green shift —
    // its channel spread stays the (small) spread absorption alone gives.
    const correctSpread = correct.g - correct.r;
    const tintedSpread = tinted.g - tinted.r;
    expect(correctSpread).toBeGreaterThan(tintedSpread);

    // Still water has no bubbles, so both models must agree exactly there.
    const calmCorrect = shadeCorrect(depth, 0);
    const calmTinted = shadeTintedAfter(depth, 0);
    expect(calmCorrect.r).toBeCloseTo(calmTinted.r, 12);
    expect(calmCorrect.g).toBeCloseTo(calmTinted.g, 12);
    expect(calmCorrect.b).toBeCloseTo(calmTinted.b, 12);

    // Absorption alone must still darken with depth in the red first.
    const shallow = shadeCorrect(0.2, 0);
    expect(shallow.r).toBeGreaterThan(calmCorrect.r);
  });
});

describe('source 46 — the breaking estimator is a real Jacobian, not a slope proxy', () => {
  const AMPLITUDE = 1.55;
  const CHOPPINESS = 5.6;

  it('agrees with a finite-difference determinant of the displacement it applies', () => {
    // The claim being checked is that `jacobian` is the derivative of the SAME
    // map that moves the vertices. If the analytic term drifted from the
    // displacement, the foam would appear where the surface is not folding.
    const h = 1e-3;
    for (const [x, z, t] of [[0, 0, 0], [37, -19, 2.5], [-84, 61, 7.25]] as const) {
      const centre = gerstnerChop(x, z, t, AMPLITUDE, CHOPPINESS);
      const px = gerstnerChop(x + h, z, t, AMPLITUDE, CHOPPINESS);
      const mx = gerstnerChop(x - h, z, t, AMPLITUDE, CHOPPINESS);
      const pz = gerstnerChop(x, z + h, t, AMPLITUDE, CHOPPINESS);
      const mz = gerstnerChop(x, z - h, t, AMPLITUDE, CHOPPINESS);

      const numericXX = (px.displacementX - mx.displacementX) / (2 * h);
      const numericXZ = (pz.displacementX - mz.displacementX) / (2 * h);
      const numericZX = (px.displacementZ - mx.displacementZ) / (2 * h);
      const numericZZ = (pz.displacementZ - mz.displacementZ) / (2 * h);

      expect(centre.dXdx).toBeCloseTo(numericXX, 6);
      expect(centre.dXdz).toBeCloseTo(numericXZ, 6);
      expect(centre.dZdx).toBeCloseTo(numericZX, 6);
      expect(centre.dZdz).toBeCloseTo(numericZZ, 6);

      const numericDeterminant = (1 + numericXX) * (1 + numericZZ) - numericXZ * numericZX;
      expect(centre.jacobian).toBeCloseTo(numericDeterminant, 6);
      // The displacement is a gradient field, so the cross terms must match.
      expect(centre.dXdz).toBeCloseTo(centre.dZdx, 12);
    }
  });

  it('is exactly 1 and exactly zero turbulence on water with no wave energy', () => {
    for (const [x, z, t] of [[0, 0, 0], [12.5, -40, 3.5], [-77, 5, 11]] as const) {
      const calm = gerstnerChop(x, z, t, 0, CHOPPINESS);
      expect(calm.displacementX).toBe(0);
      expect(calm.displacementZ).toBe(0);
      expect(calm.jacobian).toBe(1);
      expect(breakingTurbulence(calm.jacobian)).toBe(0);
    }
    // And an undisturbed surface is below onset, so nothing entrains there.
    expect(breakingTurbulence(1)).toBe(0);
    expect(breakingTurbulence(BREAKING_ONSET)).toBe(0);
    expect(breakingTurbulence(0)).toBe(1);
  });

  it('measures that the SHIPPED sea never folds while the exhibit sea does', () => {
    // Shipping choppiness is OCEAN_STEEPNESS_GAIN * OCEAN_CHOP_PRESENTATION_GAIN
    // at the authored amplitude. This is a finding about our forge, and the
    // demo states it in its counters rather than implying otherwise.
    const shipping = 0.42 * 0.22;
    let shippingMin = Number.POSITIVE_INFINITY;
    let exhibitMin = Number.POSITIVE_INFINITY;
    for (let step = 0; step < 24; step += 1) {
      const t = step * 0.5;
      for (let i = 0; i < 40; i += 1) {
        const x = -100 + i * 5;
        for (let j = 0; j < 8; j += 1) {
          const z = -100 + j * 25;
          shippingMin = Math.min(shippingMin, gerstnerChop(x, z, t, 1.55, shipping).jacobian);
          exhibitMin = Math.min(exhibitMin, gerstnerChop(x, z, t, AMPLITUDE, CHOPPINESS).jacobian);
        }
      }
    }
    expect(shippingMin).toBeGreaterThan(BREAKING_ONSET);
    expect(shippingMin).toBeLessThan(1);
    expect(exhibitMin).toBeLessThan(BREAKING_ONSET);
  });

  it('keeps foam as decaying state so it outlives the crest that made it', () => {
    const field = createFoamField(3, { decaySeconds: 2, crestStrength: 1, windwardStrength: 0 });
    const dt = 1 / 60;
    field.deposit(0, 1, 0, dt);
    const deposited = field.energy[0];
    // Float32 storage: the field is a Float32Array, so seven digits is the
    // precision the representation actually carries, not a relaxed bar.
    expect(deposited).toBeCloseTo(dt, 7);

    // The crest has passed: nothing more is entrained anywhere.
    let seconds = 0;
    for (let step = 0; step < 120; step += 1) {
      field.decay(dt);
      seconds += dt;
    }
    // A per-frame threshold would be zero the instant turbulence stopped. This
    // must still be there, and must follow the declared time constant.
    expect(field.energy[0]).toBeGreaterThan(0);
    expect(field.energy[0]).toBeCloseTo(deposited * Math.exp(-seconds / 2), 7);
    expect(field.energy[1]).toBe(0);

    // Accumulation saturates rather than running away.
    for (let step = 0; step < 600; step += 1) field.deposit(2, 1, 0, dt);
    expect(field.energy[2]).toBeLessThanOrEqual(1);
  });

  it('builds an exhibit that actually breaks, and says so in its counters', () => {
    const entry = manifest.find((row) => row.sourceId === 46)!;
    const demo = entry.createDemo!({ THREE, seed: SEED });
    const counters = demo.metadata.counters!;

    // The exhibit must reach the regime it claims to show. A demo whose
    // Jacobian never crossed the onset would be a still life with a caption.
    expect(counters.minJacobianSeen).toBeLessThan(BREAKING_ONSET);
    expect(counters.peakBreakingVertices).toBeGreaterThan(0);
    expect(counters.peakBreakingVertices).toBeLessThan(counters.surfaceVertices);

    // And the measured claim about our own forge: the shipped sea does not.
    expect(counters.shippingJacobianMinimum).toBeGreaterThan(BREAKING_ONSET);
    expect(counters.shippingJacobianMinimum).toBeLessThan(1);

    // The green shift is the whole point, and only the correct model has it.
    expect(counters.peakGreenMinusRed).toBeGreaterThan(counters.tintedGreenMinusRed);

    demo.dispose();
  });

  it('routes one state to both consumers, and foam floats on top of the colour', () => {
    const depth = 3.2;
    // Same bubble state, different consumer: inside the integral it shifts hue,
    // on the surface it whitens. A demo that used two different estimators
    // could show glow with no whitecap; these cannot disagree.
    const glow = shadeCorrect(depth, 0.8, 0);
    const whitened = shadeCorrect(depth, 0.8, 1);
    expect(whitened.r).toBeGreaterThan(glow.r);
    expect(whitened.g).toBeGreaterThan(glow.g);
    // Foam cover is capped, so the water still reads through it rather than
    // becoming the foam colour, and the brightest sample the exhibit can
    // produce — deepest water, saturated bubbles, full foam — must not clip.
    // Clipping is not cosmetic here: white is where the green shift dies.
    expect(whitened.g).toBeLessThan(0.86);
    const brightest = shadeCorrect(3.4, 1, 1);
    for (const channel of [brightest.r, brightest.g, brightest.b]) {
      expect(channel).toBeGreaterThan(0);
      expect(channel).toBeLessThan(1);
    }
  });
});

describe('source 38 — the mask gates admissibility independently of density', () => {
  it('keeps the clearing clear however high the spline density goes there', () => {
    const curve = [[-1, -1], [0, 0], [1, -1]] as const;
    expect(splineDensity(0, 0, curve)).toBeGreaterThan(splineDensity(0, 1.2, curve));
    // Dense by the spline field, and still inadmissible by the mask.
    expect(splineDensity(0.7, 0.5, curve, 10)).toBeGreaterThan(0.5);
    expect(maskField(0.7, 0.5)).toBe(false);
    expect(maskField(-1.2, -1.2)).toBe(true);
  });
});

describe('source 39 — the replayer refuses an operation whose precondition is unmet', () => {
  it('rejects the scatter that arrives before its terrain, with a reason', () => {
    const state = replay(OPERATION_LOG, 7);
    expect(state.rejected).toHaveLength(1);
    expect(state.rejected[0].op).toBe('scatter_props');
    expect(state.rejected[0].reason).toContain('terrain');
    expect(state.applied).toBe(OPERATION_LOG.length - 1);
    const clearing = state.clearings[0];
    for (const prop of state.props) {
      expect(Math.hypot(prop.x - clearing.x, prop.z - clearing.z))
        .toBeGreaterThanOrEqual(clearing.radius);
    }
  });
});

describe('source 42 — the grammar derives rather than authors', () => {
  it('tiles the mass exactly and derives bay count from face width', () => {
    const parameters = {
      storeys: 9,
      storeyHeight: 0.26,
      podiumStoreys: 2,
      crownStoreys: 2,
      bayWidth: 0.3,
    };
    const shapes = deriveBuilding({ width: 1.2, depth: 0.9 }, parameters);
    const massHeight = shapes
      .filter((shape) => shape.rule !== 'bay' && shape.rule !== 'roof')
      .reduce((sum, shape) => sum + shape.size[1], 0);
    expect(massHeight).toBeCloseTo(parameters.storeys * parameters.storeyHeight, 9);

    const bays = shapes.filter((shape) => shape.rule === 'bay');
    const shaftStoreys = parameters.storeys - parameters.podiumStoreys - parameters.crownStoreys;
    expect(bays).toHaveLength(Math.floor(1.2 / parameters.bayWidth) * shaftStoreys * 2);

    // A wider building gets MORE bays of the same size, not wider bays.
    const wider = deriveBuilding({ width: 2.4, depth: 0.9 }, parameters)
      .filter((shape) => shape.rule === 'bay');
    expect(wider.length).toBeGreaterThan(bays.length);
    expect(wider[0].size[0]).toBeCloseTo(bays[0].size[0], 6);
  });
});

describe('source 45 — the chain is ordered, and the order is what makes it work', () => {
  it('welds duplicates, fills the boundary loops, and leaves no single-use edge', () => {
    const size = 8;
    const centre = (size - 1) / 2;
    const occupied = (x: number, y: number, z: number) => {
      if (x < 0 || y < 0 || z < 0 || x >= size || y >= size || z >= size) return false;
      const radius = Math.hypot(x - centre, y - centre, z - centre);
      return radius <= centre * 0.95 && radius >= centre * 0.5;
    };
    const raw = voxelToMesh(occupied, size, 0.1);
    const welded = weldVertices(raw);

    // VoxelToMesh emits four vertices per quad; welding must collapse them
    // without changing the surface, which is why triangle count is unchanged.
    expect(raw.positions.length / 3).toBe((raw.indices.length / 6) * 4);
    expect(welded.positions.length).toBeLessThan(raw.positions.length);
    expect(welded.indices.length).toBe(raw.indices.length);

    const filled = fillHoles(welded);
    expect(filled.mesh.indices.length).toBeGreaterThanOrEqual(welded.indices.length);

    const useCount = new Map<string, number>();
    for (let i = 0; i < filled.mesh.indices.length; i += 3) {
      for (const [a, b] of [[0, 1], [1, 2], [2, 0]] as const) {
        const x = filled.mesh.indices[i + a];
        const y = filled.mesh.indices[i + b];
        const key = x < y ? `${x}:${y}` : `${y}:${x}`;
        useCount.set(key, (useCount.get(key) ?? 0) + 1);
      }
    }
    expect([...useCount.values()].filter((count) => count === 1)).toHaveLength(0);
  });
});

describe('source 49 — critically damped means it converges without overshoot', () => {
  it('reaches the target and never crosses it', () => {
    let state = { value: 0, velocity: 0 };
    let overshoot = 0;
    for (let step = 0; step < 400; step += 1) {
      state = stepCriticallyDamped(state, 1, 0.2, 1 / 120);
      overshoot = Math.max(overshoot, state.value - 1);
    }
    expect(state.value).toBeCloseTo(1, 3);
    expect(overshoot).toBeLessThan(1e-3);
  });
});

describe('source 50 — the sweep fails the blocked corridor and passes the cleared one', () => {
  it('reports blocked runs where no player-radius disc fits', () => {
    const defective = sweepCorridor(9, 2.2, DEFECTIVE_OBSTACLES);
    const cleared = sweepCorridor(9, 2.2, CLEARED_OBSTACLES);

    expect(defective.blocked).toBeGreaterThan(0);
    expect(defective.blockedRuns.length).toBeGreaterThan(0);
    expect(cleared.blocked).toBe(0);
    expect(cleared.passableFraction).toBe(1);
    expect(defective.stations).toHaveLength(7);

    // A corridor narrower than the disc's diameter must fail at every station.
    const pinched = sweepCorridor(9, PLAYER_RADIUS, []);
    expect(pinched.blocked).toBe(pinched.stations.length);
  });
});
