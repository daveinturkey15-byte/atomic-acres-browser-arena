/**
 * vehicle-forge gates.
 *
 * These assert the PROPERTIES the method depends on, not the numbers a critic
 * happens to like today: ring closure and exact mirror symmetry, the belt
 * clamp that stops the skin folding over the hood, arch station density and
 * monotonic arch legs, watertightness of the loft, the glass cut staying
 * inside its authored span, attribute parity across every emitted geometry
 * (the merge trap), determinism, and the presentation-only contract.
 *
 * Every one of them fails LOUDLY on the mistake it exists for. None of them
 * may be relaxed to make a spec edit pass: a spec that violates one is a spec
 * that will read as a cartoon or render as a black panel.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  ARCH_STATIONS,
  RING_POINTS,
  SHUT_LINE_CHAMFER,
  SHUT_LINE_DEPTH,
  SHUT_LINE_HALF,
  archLowerEdge,
  buildForgedVehicle,
  classifyQuad,
  collectStations,
  createForgeMaterialSet,
  createForgePaintMaterial,
  FORGED_VEHICLE_TRIANGLE_BUDGETS,
  flankHalfWidth,
  latheGeometry,
  loftBody,
  stationRing,
} from './index';
import { COACH_SPEC, FORGED_VEHICLE_SPECS, SEDAN_SPEC, TRUCK_CAB_SPEC } from './specs';
import type { VehicleSpec } from './geometry';
import type { VehicleDressing } from './build';

function positionsOf(geometry: THREE.BufferGeometry): Float32Array {
  return (geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
}

describe('vehicle-forge station rings', () => {
  it('emits exactly 24 ordered points that are an exact mirror in x', () => {
    for (const spec of FORGED_VEHICLE_SPECS) {
      for (const z of collectStations(spec)) {
        const ring = stationRing(spec, z);
        expect(ring.points, `${spec.id} @ ${z}`).toHaveLength(RING_POINTS);
        // Bottom and top centres are ON the centre plane, or the two halves
        // meet in a crack down the middle of the roof.
        expect(ring.points[0]![0]).toBe(0);
        expect(ring.points[12]![0]).toBe(0);
        for (let k = 1; k <= 11; k += 1) {
          const right = ring.points[12 - k]!;
          const left = ring.points[12 + k]!;
          expect(left[0], `${spec.id} @ ${z} mirror x ${k}`).toBe(-right[0]);
          expect(left[1], `${spec.id} @ ${z} mirror y ${k}`).toBe(right[1]);
        }
        // The right flank rises monotonically from the sill to the belt. A
        // shut-line ring is displaced along each point's OWN normal, so it may
        // dip by at most the groove depth and no more.
        const slack = ring.inset + 1e-9;
        for (let k = 1; k <= 7; k += 1) {
          expect(ring.points[k]![1], `${spec.id} @ ${z} rise ${k}`)
            .toBeGreaterThanOrEqual(ring.points[k - 1]![1] - slack);
        }
      }
    }
  });

  it('clamps the belt below the top on a spec that would otherwise fold the skin', () => {
    // A deck line 20 mm under the belt: unclamped, the belt ring sits ABOVE
    // the top ring, the skin folds outward, and its underside reads as a black
    // lip along the far edge of the hood.
    const folding: VehicleSpec = {
      ...SEDAN_SPEC,
      id: 'fold-probe',
      beltY: 1.4,
      top: [
        { z: 0, yTop: 1.38, halfWidthTop: 0.7, topRadius: 0.1 },
        { z: 4.4, yTop: 1.38, halfWidthTop: 0.7, topRadius: 0.1 },
      ],
    };
    for (const z of collectStations(folding)) {
      const ring = stationRing(folding, z);
      const belt = ring.points[7]![1];
      const top = ring.points[12]![1];
      expect(top - belt, `belt clamp @ ${z}`).toBeGreaterThanOrEqual(0.03 - ring.inset - 1e-9);
    }
  });

  it('reads the flank profile from ONE global anchor, not from the station', () => {
    // The whole reason the skin does not breathe around a wheel cut-out: the
    // half width at a given height is the same over an arch as it is between
    // two arches.
    const overArch = stationRing(SEDAN_SPEC, SEDAN_SPEC.wheelZ[0]!);
    const clear = stationRing(SEDAN_SPEC, 2.4);
    const height = SEDAN_SPEC.beltY - 0.1;
    expect(flankHalfWidth(SEDAN_SPEC, height)).toBeCloseTo(flankHalfWidth(SEDAN_SPEC, height), 12);
    expect(overArch.points[7]![0]).toBeCloseTo(clear.points[7]![0], 9);
  });
});

describe('vehicle-forge wheel arches', () => {
  it('lays at least 33 stations across every arch', () => {
    for (const spec of FORGED_VEHICLE_SPECS) {
      const stations = collectStations(spec);
      const halfSpan = spec.wheelRadius + 0.095;
      for (const axle of spec.wheelZ) {
        const inside = stations.filter((z) => Math.abs(z - axle) <= halfSpan + 1e-9);
        expect(inside.length, `${spec.id} arch @ ${axle}`).toBeGreaterThanOrEqual(ARCH_STATIONS);
      }
    }
  });

  it('rises monotonically to the crown, lands on the sill, and is never faceted', () => {
    // Two failures at once. p = 4 drops the legs almost vertically over the
    // last 5 cm and reads as a flap with a void behind it. Equal-ANGLE station
    // placement produces the same flap from the other direction, by spending
    // almost every station on the crown and walking each leg in one 8 cm
    // chord. The gate is therefore on the CHORD between consecutive stations,
    // measured in the arch's own plane, plus monotonicity and the sill landing.
    const MAX_CHORD_M = 0.09;
    for (const spec of FORGED_VEHICLE_SPECS) {
      const halfSpan = spec.wheelRadius + 0.095;
      const crown = 2 * spec.wheelRadius + spec.archGap;
      for (const axle of spec.wheelZ) {
        // The legs land exactly on the sill, so the arch never ends in a step.
        expect(archLowerEdge(spec, axle - halfSpan - 1e-6), `${spec.id} leg`).toBeCloseTo(spec.sillY, 9);
        expect(archLowerEdge(spec, axle), `${spec.id} crown`).toBeCloseTo(crown, 9);
        const stations = collectStations(spec).filter((z) => Math.abs(z - axle) <= halfSpan + 1e-9);
        for (let i = 1; i < stations.length; i += 1) {
          const z0 = stations[i - 1]!;
          const z1 = stations[i]!;
          const y0 = archLowerEdge(spec, z0);
          const y1 = archLowerEdge(spec, z1);
          expect(Math.hypot(z1 - z0, y1 - y0), `${spec.id} arch chord @ ${z1.toFixed(3)}`)
            .toBeLessThanOrEqual(MAX_CHORD_M);
          // Monotonic toward the crown on each leg.
          if (z1 <= axle) expect(y1, `${spec.id} rise @ ${z1.toFixed(3)}`).toBeGreaterThanOrEqual(y0 - 1e-9);
          if (z0 >= axle) expect(y1, `${spec.id} fall @ ${z1.toFixed(3)}`).toBeLessThanOrEqual(y0 + 1e-9);
        }
      }
    }
  });
});

describe('vehicle-forge loft', () => {
  it('is watertight: every loft edge is shared by exactly two triangles', () => {
    for (const spec of FORGED_VEHICLE_SPECS) {
      const loft = loftBody(spec);
      // The skin is split across three buckets by material; watertightness is
      // a property of their UNION, which is what a silhouette actually shows.
      const shell = [loft.body, loft.glass, loft.groove].filter((entry): entry is THREE.BufferGeometry => entry !== null);
      const edges = new Map<string, number>();
      const key = (a: number[], b: number[]): string => {
        const ka = a.map((v) => Math.round(v * 1e5)).join(',');
        const kb = b.map((v) => Math.round(v * 1e5)).join(',');
        return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      };
      for (const geometry of shell) {
        const p = positionsOf(geometry);
        for (let i = 0; i < p.length; i += 9) {
          const v = [
            [p[i]!, p[i + 1]!, p[i + 2]!],
            [p[i + 3]!, p[i + 4]!, p[i + 5]!],
            [p[i + 6]!, p[i + 7]!, p[i + 8]!],
          ];
          for (let e = 0; e < 3; e += 1) {
            const id = key(v[e]!, v[(e + 1) % 3]!);
            edges.set(id, (edges.get(id) ?? 0) + 1);
          }
        }
      }
      // Degenerate slivers (a fan triangle at a centre point, a zero-width
      // quad at a pole) collapse to a repeated edge; everything else must be
      // shared by exactly two faces or the body has a hole in it.
      const open = [...edges.entries()].filter(([, count]) => count === 1);
      expect(open.length, `${spec.id} open edges`).toBe(0);
    }
  });

  it('cuts glass ONLY inside its authored spans, and cuts some', () => {
    for (const spec of FORGED_VEHICLE_SPECS) {
      const loft = loftBody(spec);
      expect(loft.quadCounts.glass, `${spec.id} glass quads`).toBeGreaterThan(0);
      expect(loft.glass, `${spec.id} glass geometry`).not.toBeNull();
      const spans = [...spec.sideGlass, ...spec.screens];
      const low = spec.noseGlass ? 0 : Math.min(...spans.map((span) => Math.min(span.z0, span.z1)));
      const high = Math.max(...spans.map((span) => Math.max(span.z0, span.z1)));
      const p = positionsOf(loft.glass!);
      for (let i = 0; i < p.length; i += 3) {
        const z = p[i + 2]!;
        expect(z, `${spec.id} glass z`).toBeGreaterThanOrEqual(low - 1e-3);
        expect(z, `${spec.id} glass z`).toBeLessThanOrEqual(high + 1e-3);
        // The NOSE band is the only glass allowed forward of the authored
        // spans, and it must stay inside its own height band - a windscreen
        // that leaks below it becomes a hole through the front bumper.
        if (spec.noseGlass && z < Math.min(...spans.map((span) => Math.min(span.z0, span.z1))) - 1e-3) {
          expect(p[i + 1]!, `${spec.id} nose glass y`).toBeGreaterThanOrEqual(spec.noseGlass.yMin - 1e-3);
          expect(p[i + 1]!, `${spec.id} nose glass y`).toBeLessThanOrEqual(spec.noseGlass.yMax + 1e-3);
        }
      }
      if (spec.noseGlass) {
        const noseVerts = [...Array(p.length / 3).keys()].filter((k) => p[k * 3 + 2]! < 1e-3);
        expect(noseVerts.length, `${spec.id} has a windscreen in its nose`).toBeGreaterThan(0);
      }
      // And the lining exists behind it, or a pane is a hole in the world.
      expect(loft.lining, `${spec.id} lining`).not.toBeNull();
    }
  });

  it('sinks every shut line to its authored depth and keeps the arch stations', () => {
    for (const spec of FORGED_VEHICLE_SPECS) {
      if (spec.shutLines.length === 0) continue;
      const loft = loftBody(spec);
      expect(loft.quadCounts.groove, `${spec.id} groove quads`).toBeGreaterThan(0);
      for (const cut of spec.shutLines) {
        const sunk = loft.rings.filter((ring) => ring.inset > 0 && Math.abs(ring.z - cut) <= 0.004);
        expect(sunk.length, `${spec.id} shut line stations @ ${cut}`).toBeGreaterThanOrEqual(2);
        for (const ring of sunk) {
          const surface = stationRing({ ...spec, shutLines: [] }, ring.z);
          // PERPENDICULAR depth, not depth in x: the groove is sunk along each
          // point's own surface normal, so at the belt corner - where the
          // normal leans - the x component alone is legitimately shallower.
          for (const index of [4, 7, 10]) {
            const drop = Math.hypot(
              surface.points[index]![0] - ring.points[index]![0],
              surface.points[index]![1] - ring.points[index]![1],
            );
            expect(drop, `${spec.id} shut line depth @ ${cut} pt ${index}`).toBeCloseTo(SHUT_LINE_DEPTH, 6);
          }
        }
        // The CHAMFER stations either side must NOT be sunk, or the pair of
        // opposite-facing chamfers disappears and the cut goes back to being a
        // dark line that anti-aliases away at four metres.
        for (const side of [-1, 1]) {
          const chamferZ = cut + side * (SHUT_LINE_HALF + SHUT_LINE_CHAMFER);
          const chamfer = loft.rings.find((ring) => Math.abs(ring.z - chamferZ) < 1e-6);
          expect(chamfer, `${spec.id} chamfer station @ ${chamferZ}`).toBeDefined();
          expect(chamfer!.inset, `${spec.id} chamfer not sunk @ ${chamferZ}`).toBe(0);
        }
      }
      // A shut-line filter written as "drop everything between the two
      // stations" once deleted a whole wheel arch and still lofted closed.
      const halfSpan = spec.wheelRadius + 0.095;
      for (const axle of spec.wheelZ) {
        const inside = loft.rings.filter((ring) => Math.abs(ring.z - axle) <= halfSpan + 1e-9);
        expect(inside.length, `${spec.id} arch survives shut lines @ ${axle}`).toBeGreaterThanOrEqual(ARCH_STATIONS);
      }
    }
  });

  it('never emits NaN, and carries position AND normal AND uv everywhere', () => {
    // `mergeGeometries` drops the WHOLE bucket if one geometry lacks an
    // attribute the others have - silently, returning a body that is simply
    // not in the scene.
    for (const spec of FORGED_VEHICLE_SPECS) {
      const loft = loftBody(spec);
      const geometries = [loft.body, loft.glass, loft.groove, loft.lining, latheGeometry([[0.2, 0], [0.3, 0.1]], 12)];
      for (const geometry of geometries) {
        if (!geometry) continue;
        for (const attribute of ['position', 'normal', 'uv']) {
          const data = geometry.getAttribute(attribute) as THREE.BufferAttribute | undefined;
          expect(data, `${spec.id} ${geometry.name} ${attribute}`).toBeDefined();
          const array = data!.array as ArrayLike<number>;
          for (let i = 0; i < array.length; i += 1) {
            if (Number.isFinite(array[i]!)) continue;
            throw new Error(`${spec.id} ${geometry.name} ${attribute}[${i}] is ${array[i]}`);
          }
        }
        const normals = (geometry.getAttribute('normal') as THREE.BufferAttribute).array as ArrayLike<number>;
        for (let i = 0; i < normals.length; i += 3) {
          const length = Math.hypot(normals[i]!, normals[i + 1]!, normals[i + 2]!);
          expect(length, `${spec.id} ${geometry.name} normal ${i / 3}`).toBeCloseTo(1, 4);
        }
      }
    }
  });

  it('is deterministic: two builds produce byte-identical arrays', () => {
    for (const spec of FORGED_VEHICLE_SPECS) {
      const first = loftBody(spec);
      const second = loftBody(spec);
      expect(Array.from(positionsOf(second.body))).toEqual(Array.from(positionsOf(first.body)));
      expect(Array.from(positionsOf(second.glass!))).toEqual(Array.from(positionsOf(first.glass!)));
    }
  });

  it('classifies a quad the same way whichever ring pair it is asked about', () => {
    const loft = loftBody(SEDAN_SPEC);
    const a = loft.rings[0]!;
    const b = loft.rings[1]!;
    expect(classifyQuad(SEDAN_SPEC, a, b, 7)).toBe(classifyQuad(SEDAN_SPEC, a, b, 7));
  });
});

describe('vehicle-forge proportions', () => {
  // Real proportions matter more than detail, and they are measurable off the
  // spec. A 41 % axle-to-cowl reads as a cartoon no matter how good the paint.
  it('keeps the sedan inside the bands the reference brief states', () => {
    const wheelbase = SEDAN_SPEC.wheelZ[1]! - SEDAN_SPEC.wheelZ[0]!;
    expect(wheelbase).toBeCloseTo(3.0, 6);
    const frontOverhang = SEDAN_SPEC.wheelZ[0]!;
    expect(frontOverhang / wheelbase).toBeGreaterThan(0.18);
    expect(frontOverhang / wheelbase).toBeLessThan(0.34);
    const cowl = SEDAN_SPEC.top.find((vertex) => vertex.crease === true)!.z;
    const axleToCowl = (cowl - SEDAN_SPEC.wheelZ[0]!) / wheelbase;
    expect(axleToCowl).toBeGreaterThan(0.12);
    expect(axleToCowl).toBeLessThan(0.30);
  });

  it('keeps every body inside the arena box it dresses', () => {
    const envelopes: ReadonlyArray<readonly [VehicleSpec, number, number]> = [
      [COACH_SPEC, 1.3, 3.3],
      [TRUCK_CAB_SPEC, 1.3, 2.9],
      [SEDAN_SPEC, 0.95, 1.88],
    ];
    for (const [spec, halfWidth, height] of envelopes) {
      const loft = loftBody(spec);
      loft.body.computeBoundingBox();
      const bounds = loft.body.boundingBox!;
      expect(bounds.max.x, `${spec.id} +x`).toBeLessThanOrEqual(halfWidth + 1e-6);
      expect(bounds.min.x, `${spec.id} -x`).toBeGreaterThanOrEqual(-halfWidth - 1e-6);
      expect(bounds.max.y, `${spec.id} height`).toBeLessThanOrEqual(height + 1e-6);
      expect(bounds.min.z, `${spec.id} nose`).toBeGreaterThanOrEqual(-1e-6);
      expect(bounds.max.z, `${spec.id} tail`).toBeLessThanOrEqual(spec.length + 1e-6);
      // Tumblehome: the roof is narrower than the belt, or the body is a box.
      expect(spec.top.every((vertex) => vertex.halfWidthTop <= spec.halfWidth), `${spec.id} tumblehome`).toBe(true);
    }
  });
});

describe('vehicle-forge assembly', () => {
  it('merges a whole vehicle into at most nine draw calls', () => {
    const materials = createForgeMaterialSet(0xb8442f, 'test-paint');
    const built = buildForgedVehicle(
      SEDAN_SPEC,
      {
        wheelStyle: 'cover',
        headLamps: { x: 0.66, y: 0.86, radius: 0.11 },
        tailLamps: { x: 0.68, y: 0.9, radius: 0.1 },
        bumperY: 0.5,
        stripe: { y: 0.9, bucket: 'accent', z0: 0.4, z1: 4.0, height: 0.06, proud: 0.008 },
      },
      materials,
    );
    expect(built.drawCalls).toBeLessThanOrEqual(9);
    expect(built.drawCalls).toBeGreaterThan(4);
    expect(built.triangles).toBeGreaterThan(0);
    expect(built.group.children.length).toBe(built.drawCalls);
  });

  it('is presentation only: no mesh claims collision, and none is a BoxGeometry', () => {
    // `solidMeshes` in the arena fidelity gate selects on `.parameters !== undefined`
    // and `userData.presentationOnly !== true`; a forged mesh must fail BOTH
    // tests, or the arena's enumerated asymmetric-vehicle list silently grows.
    const materials = createForgeMaterialSet(0xd8cdb4, 'test-paint-2');
    const built = buildForgedVehicle(COACH_SPEC, { wheelStyle: 'cover' }, materials);
    expect(built.group.userData.presentationOnly).toBe(true);
    built.group.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      expect(node.userData.presentationOnly, node.name).toBe(true);
      expect((node.geometry as THREE.BoxGeometry).parameters, node.name).toBeUndefined();
      expect(node.userData.ballisticSurfaceId, node.name).toBeUndefined();
      expect(node.userData.breakableWindowId, node.name).toBeUndefined();
    });
  });

  it('keeps dressed silhouettes inside their collider envelopes and triangle fences', () => {
    const shared = {
      wheelStyle: 'cover' as const,
      bumperY: 0.34,
      surfaceBands: [{ y0: 1.78, y1: 2.46, bucket: 'accent' as const, z0: 0.75, z1: 8.35, proud: 0.01 }],
      stripe: { y: 1.75, bucket: 'chrome' as const, z0: 0.55, z1: 8.55, height: 0.045, proud: 0.014 },
      grille: { y: 1.08, width: 1.36, height: 0.34, depth: 0.10, barCount: 5 },
    };
    const truck = {
      wheelStyle: 'steel' as const,
      bumperY: 0.42,
      grille: { y: 0.92, width: 1.46, height: 0.38, depth: 0.11, barCount: 6 },
      mirrors: [{ x: 1.15, y: 2.03, z: 0.72 }],
      panelSeams: [
        ...[-1, 1].flatMap((x) => [5.82, 7.44, 9.06, 10.68].map((z) => ({ x: x * 1.31, y: 1.62, z, height: 2.38 }))),
      ],
    };
    const saloon = { wheelStyle: 'whitewall' as const, bumperY: 0.46 };
    const cases: ReadonlyArray<readonly [VehicleSpec, VehicleDressing, number, number, number, number]> = [
      [COACH_SPEC, shared, 2.6, 3.3, 9.1, FORGED_VEHICLE_TRIANGLE_BUDGETS.coach],
      [TRUCK_CAB_SPEC, truck, 2.6, 2.9, 11.7, FORGED_VEHICLE_TRIANGLE_BUDGETS.truck],
      [SEDAN_SPEC, saloon, 1.9, 1.88, 4.4, FORGED_VEHICLE_TRIANGLE_BUDGETS.saloon],
    ];
    for (const [spec, dressing, width, height, length, budget] of cases) {
      const built = buildForgedVehicle(spec, dressing, createForgeMaterialSet(0x173451, `bounds-${spec.id}`));
      const bounds = new THREE.Box3().setFromObject(built.group);
      expect(bounds.max.x - bounds.min.x, `${spec.id} width`).toBeLessThanOrEqual(width + 0.15 + 1e-5);
      expect(bounds.max.y - bounds.min.y, `${spec.id} height`).toBeLessThanOrEqual(height + 0.15 + 1e-5);
      expect(bounds.max.z - bounds.min.z, `${spec.id} length`).toBeLessThanOrEqual(length + 0.15 + 1e-5);
      expect(bounds.min.z, `${spec.id} nose`).toBeGreaterThanOrEqual(-0.15 - 1e-5);
      expect(built.triangles, `${spec.id} triangles`).toBeLessThanOrEqual(budget);
    }
  });

  it('routes bumpers and saloon whitewalls through the existing chrome role', () => {
    const materials = createForgeMaterialSet(0x173451, 'chrome-role-check', 0xf4eee0);
    const built = buildForgedVehicle(SEDAN_SPEC, { wheelStyle: 'whitewall', bumperY: 0.46 }, materials);
    const chrome = built.group.children.find((child) => child.name.endsWith(' chrome')) as THREE.Mesh | undefined;
    expect(chrome, 'whitewall and bumper geometry share a chrome bucket').toBeDefined();
    expect((chrome!.material as THREE.Material).userData.forgeRole).toBe('chrome');
    expect(chrome!.name).not.toMatch(/purple/i);
  });

  it('exports nothing that returns a collider and registers no side effect', async () => {
    const forge = await import('./index');
    for (const [name, value] of Object.entries(forge)) {
      if (typeof value !== 'function') continue;
      expect(/collider|physics|spawn|navmesh|shot/i.test(name), name).toBe(false);
    }
    // Importing twice must not accumulate anything.
    const again = await import('./index');
    expect(Object.keys(again).sort()).toEqual(Object.keys(forge).sort());
  });
});

describe('vehicle-forge paint batch contract', () => {
  // Candidate 21efd6c1 quality captures: every vehicle WHITE (navy saloons,
  // cream/maroon coach, white/dark truck, red coupe). The node graphs were
  // correct - the pipeline-budget gate proves the uniform values - but the
  // colour lived ONLY in the TSL uniform while material.color stayed default
  // white. Every colour-reading path (art-kit batchDisplayColor and
  // materialBatchKey, the fidelity gates, the WebGL2 compat route) therefore
  // saw white, and all liveries shared one batch key. The factory must mirror
  // the authored swatch onto material.color, exactly like every Nuke Town
  // material family already does.
  const PASS95_LIVERIES = [0x173451, 0xe7dec6, 0xa8382c, 0xf2ede2, 0x2b3138, 0x9e1c1c] as const;

  it('mirrors the authored swatch onto material.color without touching the graph', () => {
    for (const hex of PASS95_LIVERIES) {
      const material = createForgePaintMaterial({ color: hex, name: `batch-probe-${hex.toString(16)}` });
      const expected = new THREE.Color().setHex(hex, THREE.SRGBColorSpace);
      const tag = hex.toString(16);
      expect(material.color.r, tag).toBeCloseTo(expected.r, 10);
      expect(material.color.g, tag).toBeCloseTo(expected.g, 10);
      expect(material.color.b, tag).toBeCloseTo(expected.b, 10);
      // The WebGPU path is untouched: the colour still rides the uniform graph.
      expect(material.colorNode, tag).toBeTruthy();
      expect(material.userData.forgePaintUniform, tag).toBe(true);
      expect(material.userData.forgePaintSrgb, tag).toBe(hex);
      expect(material.userData.forgeRole, tag).toBe('paint');
    }
  });

  it('keeps distinct liveries distinct under the batch key colour read', () => {
    const reads = PASS95_LIVERIES.map((hex) =>
      createForgePaintMaterial({ color: hex, name: `batch-key-${hex.toString(16)}` }).color.getHexString(),
    );
    expect(new Set(reads).size).toBe(PASS95_LIVERIES.length);
  });
});

describe('vehicle-forge HF-536 detail pass', () => {
  // The fenced dressings: the module's canonical dressings with the full
  // detail set (mirrors, handles, pillars, plates, indicators, hubcaps, stack,
  // vents, gutters, boot and luggage seams). The fences hold for THESE; the
  // arena dressings carry extra lamps, rails and bogie axles and are measured
  // against the same fences in REPORT.md, not here.
  const coachDressing: VehicleDressing = {
    wheelStyle: 'cover',
    bumperY: 0.34,
    surfaceBands: [{ y0: 1.78, y1: 2.46, bucket: 'accent', z0: 0.75, z1: 8.35, proud: 0.01 }],
    stripe: { y: 1.75, bucket: 'chrome', z0: 0.55, z1: 8.55, height: 0.045, proud: 0.014 },
    grille: { y: 1.08, width: 1.36, height: 0.34, depth: 0.1, barCount: 5 },
    mirrors: [{ x: 1.13, y: 2.1, z: 1.2 }],
    doorHandles: { y: 1.2, z: [2.0, 6.4] },
    pillars: { z: [3.2, 4.95, 6.7], y0: 1.78, y1: 2.6 },
    panelSeams: [
      { x: -1.24, y: 1.15, z: 6.4, height: 0.9 },
      { x: 1.24, y: 1.15, z: 6.4, height: 0.9 },
    ],
    plates: { y: 0.62 },
    indicators: { y: 0.96, x: 0.94 },
  };
  const truckDressing: VehicleDressing = {
    wheelStyle: 'steel',
    bumperY: 0.42,
    surfaceBands: [{ y0: 2.02, y1: 2.88, bucket: 'accent', z0: 0.5, z1: 4.7, proud: 0.01 }],
    stripe: { y: 1.99, bucket: 'chrome', z0: 0.4, z1: 4.8, height: 0.05, proud: 0.014 },
    grille: { y: 0.92, width: 1.46, height: 0.38, depth: 0.11, barCount: 6 },
    mirrors: [{ x: 1.15, y: 2.03, z: 0.72 }],
    panelSeams: [...[-1, 1].flatMap((x) => [5.82, 7.44, 9.06, 10.68].map((z) => ({ x: x * 1.31, y: 1.62, z, height: 2.38 })))],
    doorHandles: { y: 1.3, z: [2.1] },
    hubcaps: true,
    vents: { x: 0.45, z: [3.0] },
    stack: { z: 5.0, y0: 1.0, y1: 2.82 },
    plates: { y: 0.62 },
    indicators: { y: 0.95, x: 0.92 },
  };
  const saloonDressing: VehicleDressing = {
    wheelStyle: 'whitewall',
    bumperY: 0.46,
    mirrors: [{ x: 0.8, y: 1.25, z: 1.35 }],
    doorHandles: { y: 0.95, z: [1.9, 3.0] },
    wheelNuts: true,
    plates: { y: 0.55 },
    indicators: { y: 0.84, x: 0.66 },
    gutters: { x: 0.78, y: 1.78, z0: 1.9, z1: 3.0 },
    bootSeam: { y: 1.22, z: 3.55, halfWidth: 0.7 },
  };
  const FENCED: ReadonlyArray<readonly [VehicleSpec, VehicleDressing, number]> = [
    [COACH_SPEC, coachDressing, FORGED_VEHICLE_TRIANGLE_BUDGETS.coach],
    [TRUCK_CAB_SPEC, truckDressing, FORGED_VEHICLE_TRIANGLE_BUDGETS.truck],
    [SEDAN_SPEC, saloonDressing, FORGED_VEHICLE_TRIANGLE_BUDGETS.saloon],
  ];

  it('keeps every fenced vehicle under its triangle fence', () => {
    for (const [spec, dressing, budget] of FENCED) {
      const built = buildForgedVehicle(spec, dressing, createForgeMaterialSet(0x173451, `fence-${spec.id}`));
      // The test prints the counts: this line is the headroom ledger.
      console.log(`${spec.id}: ${Math.round(built.triangles)} / ${budget} tris in ${built.drawCalls} draws`);
      expect(built.triangles, `${spec.id} triangles`).toBeLessThanOrEqual(budget);
    }
  });

  it('merges detail into the existing buckets: part counts per bucket, draws flat', () => {
    const expected: Readonly<Record<string, Readonly<Record<string, number>>>> = {
      'nuketown2-coach': { paint: 1, accent: 3, glass: 1, lining: 1, groove: 9, chrome: 21, tyre: 8, headLamp: 2, tailLamp: 2 },
      'nuketown2-truck-cab': { paint: 1, accent: 3, glass: 1, lining: 1, groove: 9, chrome: 24, tyre: 4, headLamp: 2, tailLamp: 2 },
      'nuketown2-sedan': { paint: 1, accent: 2, glass: 1, lining: 1, groove: 2, chrome: 26, tyre: 8, headLamp: 2, tailLamp: 2 },
    };
    for (const [spec, dressing] of FENCED) {
      const built = buildForgedVehicle(spec, dressing, createForgeMaterialSet(0x9e1c1c, `buckets-${spec.id}`));
      expect(built.partCounts, `${spec.id} part counts`).toEqual(expected[spec.id]);
      expect(built.drawCalls, `${spec.id} draws`).toBeLessThanOrEqual(9);
      expect(built.group.children.length, `${spec.id} meshes`).toBe(built.drawCalls);
    }
  });

  it('emits no NaN in any position, normal or uv', () => {
    for (const [spec, dressing] of FENCED) {
      const built = buildForgedVehicle(spec, dressing, createForgeMaterialSet(0xe7dec6, `nan-${spec.id}`));
      built.group.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return;
        for (const attribute of ['position', 'normal', 'uv'] as const) {
          const array = (node.geometry.getAttribute(attribute) as THREE.BufferAttribute | undefined)?.array as Float32Array | undefined;
          expect(array, `${spec.id} ${node.name} ${attribute}`).toBeDefined();
          for (let index = 0; index < array!.length; index += 1) {
            expect(Number.isFinite(array![index]), `${spec.id} ${node.name} ${attribute}[${index}]`).toBe(true);
          }
        }
      });
    }
  });

  it('keeps every part AABB inside the collider envelope (+0.05 proud trim)', () => {
    // The truck's cargo-box ribs live over the authored box behind the cab, so
    // its z span is the whole 11.7 m vehicle the older fence test uses - the
    // cab loft itself never leaves z 0..5.2.
    const spans: Readonly<Record<string, number>> = { 'nuketown2-truck-cab': 11.7 };
    for (const [spec, dressing] of FENCED) {
      const height = Math.max(...spec.top.map((vertex) => vertex.yTop)) + (spec.roofCrownM ?? 0);
      const length = spans[spec.id] ?? spec.length;
      const built = buildForgedVehicle(spec, dressing, createForgeMaterialSet(0xf2ede2, `envelope-${spec.id}`));
      let worst = 0;
      for (const part of built.partBounds) {
        const overX = Math.max(Math.abs(part.min[0]), Math.abs(part.max[0])) - spec.halfWidth;
        const overY = Math.max(-part.min[1], part.max[1] - height);
        const overZ = Math.max(-part.min[2], part.max[2] - length);
        worst = Math.max(worst, overX, overY, overZ);
        expect(overX, `${spec.id} ${part.bucket} x`).toBeLessThanOrEqual(0.05);
        expect(overY, `${spec.id} ${part.bucket} y`).toBeLessThanOrEqual(0.05);
        expect(overZ, `${spec.id} ${part.bucket} z`).toBeLessThanOrEqual(0.05);
      }
      console.log(`${spec.id}: worst part overhang ${worst.toFixed(4)} m`);
    }
  });

  it('mirrors every bucket exactly about the centre plane', () => {
    // Unique-vertex multisets, so triangulation diagonals (a plate's two tris
    // share one diagonal or the other after mirroring) cannot fail it - only
    // real mirrored-pair drift can.
    for (const [spec, dressing] of FENCED) {
      const built = buildForgedVehicle(spec, dressing, createForgeMaterialSet(0x2b3138, `mirror-${spec.id}`));
      for (const child of built.group.children) {
        if (!(child instanceof THREE.Mesh)) continue;
        const array = (child.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
        const forward = new Set<string>();
        const mirrored = new Set<string>();
        for (let index = 0; index < array.length; index += 3) {
          forward.add(`${Math.round(array[index]! * 1e4)},${Math.round(array[index + 1]! * 1e4)},${Math.round(array[index + 2]! * 1e4)}`);
          mirrored.add(`${Math.round(-array[index]! * 1e4)},${Math.round(array[index + 1]! * 1e4)},${Math.round(array[index + 2]! * 1e4)}`);
        }
        expect(forward.size, `${spec.id} ${child.name} unique verts`).toBeGreaterThan(0);
        expect([...forward].filter((key) => !mirrored.has(key)), `${spec.id} ${child.name} unmatched`).toEqual([]);
        expect([...mirrored].filter((key) => !forward.has(key)), `${spec.id} ${child.name} unmatched mirror`).toEqual([]);
      }
    }
  });
});
