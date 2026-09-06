/**
 * forge-kit/eaves/eaves.test.ts - HF-536 NIGHT-MUSE-EAVES proof.
 *
 * Mechanical proof for the roof-edge kit (critic interim-6 gap #4): fascia
 * length against the eave perimeter, the relief table (fascia vs roof edge,
 * gutter vs fascia, downpipe vs wall), bracket spacing, per-building
 * downpipe counts, triangle budgets, presentation-only authority, and
 * north/south symmetry through pair().
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { ArenaMap } from '../../map';
import { buildNuketown2 } from '../../nuketown2-arena';
import {
  EAVES_BRACKET_SPACING,
  EAVES_FASCIA_PROUD,
  EAVES_FASCIA_T,
  EAVES_GARAGE_BOXES,
  EAVES_GARAGE_PIPES,
  EAVES_GARAGE_TRIANGLES,
  EAVES_GUTTER_PROUD,
  EAVES_HOUSE_BOXES,
  EAVES_HOUSE_TRIANGLES,
  EAVES_PIPE_R,
  EAVES_PIPE_SEGMENTS,
  EAVES_PIPE_STANDOFF_MIN,
  EAVES_PIPE_TRIANGLES,
  EAVES_SHOE_BASE_Y,
  EAVES_TRIS_PER_BOX,
  eavesBandOuter,
  eavesBracketXs,
  fasciaLength,
  fasciaParts,
  garageGutterParts,
  houseRetroBracketParts,
  soffitParts,
} from './index';
import type { EavesPart } from './index';

const HOUSE_FRAME = { width: 11, depth: 13, slabTop: 0.15, overhang: 0.25 } as const;
const GARAGE_FRAME = { width: 4.8, depth: 7, slabTop: 0.15, overhang: 0.2 } as const;
const HOUSE_RUN = 11.06;
const GARAGE_RUN = 5.0;

const find = (parts: readonly EavesPart[], suffix: string): EavesPart => {
  const part = parts.find((p) => p.suffix === suffix);
  expect(part, suffix).toBeTruthy();
  return part!;
};

const assertKitContract = (parts: readonly EavesPart[], label: string): void => {
  expect(parts.length, `${label} emits parts`).toBeGreaterThan(0);
  for (const part of parts) {
    expect(part.role === 'trim' || part.role === 'painted-metal', `${label}/${part.suffix} role`).toBe(true);
    for (const size of part.size) {
      expect(size, `${label}/${part.suffix} min dimension`).toBeGreaterThanOrEqual(0.02 - 1e-9);
      expect(size, `${label}/${part.suffix} max dimension`).toBeLessThanOrEqual(36);
    }
  }
  expect(new Set(parts.map((p) => p.suffix)).size, `${label} suffixes unique`).toBe(parts.length);
};

describe('eaves prefab dimensions', () => {
  it('runs fascia the full eave perimeter within 0.05 m', () => {
    const house = fasciaParts(HOUSE_FRAME);
    const garage = fasciaParts(GARAGE_FRAME);
    expect(house).toHaveLength(8);
    expect(garage).toHaveLength(8);
    assertKitContract(house, 'house fascia');
    assertKitContract(garage, 'garage fascia');
    // Eave perimeter = 2 x ((W+2O) + (D+2O)).
    expect(fasciaLength(HOUSE_FRAME)).toBeCloseTo(2 * (11.5 + 13.5) - 0.02, 6);
    expect(Math.abs(fasciaLength(HOUSE_FRAME) - 2 * (11.5 + 13.5))).toBeLessThanOrEqual(0.05);
    expect(Math.abs(fasciaLength(GARAGE_FRAME) - 2 * (5.2 + 7.4))).toBeLessThanOrEqual(0.05);
    for (const part of house) {
      if (!part.suffix.startsWith('fascia')) continue;
      expect(part.size[1], `${part.suffix} height`).toBeCloseTo(0.18, 6);
      expect(part.size[part.suffix.includes('front') || part.suffix.includes('back') ? 2 : 0], `${part.suffix} thickness`).toBeCloseTo(EAVES_FASCIA_T, 6);
    }
  });

  it('holds the relief table: fascia vs roof edge 0.01, gutter vs fascia 0.035, all never coplanar', () => {
    // Fascia front stands PROUD of the band face; the back beds into the band.
    const band = eavesBandOuter(HOUSE_FRAME);
    const front = find(fasciaParts(HOUSE_FRAME), 'fascia front');
    const fasciaFront = front.offset[2]! + front.size[2]! / 2;
    expect(fasciaFront - band.z).toBeCloseTo(EAVES_FASCIA_PROUD, 6);
    expect(fasciaFront - band.z).toBeGreaterThanOrEqual(0.01 - 1e-9);
    const fasciaBack = front.offset[2]! - front.size[2]! / 2;
    expect(fasciaBack, 'fascia back beds into the band').toBeLessThan(band.z);
    // New garage trough back stands PROUD of the fascia face (the anchor plane).
    const gutter = garageGutterParts({ run: GARAGE_RUN, facing: 1, overhang: 0.2, shoeBaseY: -3.4 });
    const trough = gutter.boxes.find((p) => p.suffix === 'gutter trough')!;
    const troughBack = trough.offset[2]! - trough.size[2]! / 2;
    expect(troughBack).toBeCloseTo(EAVES_GUTTER_PROUD, 6);
    expect(troughBack).toBeGreaterThanOrEqual(0.01 - 1e-9);
    // Trough top hangs below the fascia bottom (fascia bottom = -0.09 here).
    const troughTop = trough.offset[1]! + trough.size[1]! / 2;
    expect(-0.09 - troughTop).toBeCloseTo(0.02, 6);
    // Pipe backs stand further off the wall than the brief's 0.02 minimum.
    // Facing +1: wall plane at wallZ < 0, pipe back outboard of it.
    const wallZ = -(0.2 + 0.02);
    for (const pipe of gutter.pipes) {
      const pipeBack = pipe.offset[2]! - EAVES_PIPE_R;
      expect(pipeBack - wallZ, `${pipe.suffix} standoff`).toBeGreaterThanOrEqual(EAVES_PIPE_STANDOFF_MIN - 1e-9);
    }
    // Soffit: top 0.01 below the band underside, inner end bedded in the wall.
    const soffit = find(soffitParts(HOUSE_FRAME), 'soffit front');
    const bandBottom = 0.05 - 0.08;
    const soffitTop = soffit.offset[1]! + soffit.size[1]! / 2;
    expect(bandBottom - soffitTop).toBeCloseTo(0.01, 6);
    const soffitInner = soffit.offset[2]! - soffit.size[2]! / 2;
    expect(6.5 - soffitInner, 'soffit inner beds into the wall face at 6.5').toBeCloseTo(0.01, 6);
  });

  it('spaces gutter brackets 0.9 +/- 0.05 m on both runs', () => {
    for (const run of [HOUSE_RUN, GARAGE_RUN]) {
      const xs = eavesBracketXs(run + 0.06);
      expect(xs.length, `run ${run} bracket count`).toBeGreaterThanOrEqual(6);
      for (let index = 1; index < xs.length; index += 1) {
        const spacing = xs[index]! - xs[index - 1]!;
        expect(spacing, `run ${run} bracket ${index} spacing`).toBeGreaterThanOrEqual(EAVES_BRACKET_SPACING - 0.05 - 1e-9);
        expect(spacing, `run ${run} bracket ${index} spacing`).toBeLessThanOrEqual(EAVES_BRACKET_SPACING + 0.05 + 1e-9);
      }
      expect(xs[0], `run ${run} end inset`).toBeCloseTo(-((run + 0.06) / 2 - 0.2), 6);
    }
    expect(eavesBracketXs(HOUSE_RUN + 0.06)).toHaveLength(13);
    expect(eavesBracketXs(GARAGE_RUN + 0.06)).toHaveLength(6);
  });

  it('costs 504 tris per house and 680 per garage, existing roles only', () => {
    const houseBoxes =
      fasciaParts(HOUSE_FRAME).length +
      soffitParts(HOUSE_FRAME).length +
      2 * houseRetroBracketParts({ run: HOUSE_RUN, facing: 1 }).length;
    expect(houseRetroBracketParts({ run: HOUSE_RUN, facing: 1 })).toHaveLength(15);
    expect(houseBoxes).toBe(EAVES_HOUSE_BOXES);
    expect(EAVES_HOUSE_TRIANGLES).toBe(EAVES_HOUSE_BOXES * EAVES_TRIS_PER_BOX);
    expect(EAVES_HOUSE_TRIANGLES).toBeLessThanOrEqual(2400);
    const garage = garageGutterParts({ run: GARAGE_RUN, facing: 1, overhang: 0.2, shoeBaseY: -3.4 });
    expect(garage.boxes).toHaveLength(17);
    expect(garage.pipes).toHaveLength(2);
    const garageBoxes = fasciaParts(GARAGE_FRAME).length + soffitParts(GARAGE_FRAME).length + 2 * garage.boxes.length;
    expect(garageBoxes).toBe(EAVES_GARAGE_BOXES);
    expect(EAVES_GARAGE_TRIANGLES).toBe(680);
    expect(EAVES_GARAGE_TRIANGLES).toBeLessThanOrEqual(900);
    // A closed 8-gon pipe really is 32 tris (16 side + 16 cap).
    const probe = new THREE.CylinderGeometry(EAVES_PIPE_R, EAVES_PIPE_R, 1, EAVES_PIPE_SEGMENTS);
    expect(probe.index!.count / 3).toBe(EAVES_PIPE_TRIANGLES);
    for (const pipe of garage.pipes) {
      expect(pipe.radius).toBeCloseTo(0.04, 6);
      expect(pipe.segments).toBe(8);
      expect(pipe.height).toBeGreaterThan(2);
      expect(pipe.role).toBe('painted-metal');
    }
    assertKitContract(garage.boxes, 'garage gutter');
    assertKitContract(houseRetroBracketParts({ run: HOUSE_RUN, facing: 1 }), 'house retrofit');
    assertKitContract(soffitParts(HOUSE_FRAME), 'house soffit');
  });
});
describe('eaves in the composed arena', () => {
  const build = (): ArenaMap => buildNuketown2(new THREE.Scene());
  const EAVES_PROP_IDS = [
    'house eaves fascia',
    'house eaves soffit',
    'house front eaves retrofit',
    'house back eaves retrofit',
    'garage eaves fascia',
    'garage eaves soffit',
    'garage front eaves gutter',
    'garage back eaves gutter',
  ];

  const eavesMeshes = (arena: ArenaMap): THREE.Mesh[] => {
    const found: THREE.Mesh[] = [];
    arena.root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      if (EAVES_PROP_IDS.some((id) => o.name.includes(` ${id} `))) found.push(o);
    });
    return found;
  };
  it('emits 42 boxes per house and 46 boxes + 4 pipes per garage, houses identical', () => {
    const arena = build();
    const north = eavesMeshes(arena).filter((m) => m.name.includes(' north '));
    const south = eavesMeshes(arena).filter((m) => m.name.includes(' south '));
    const northHouse = north.filter((m) => m.name.includes(' house '));
    const northGarage = north.filter((m) => m.name.includes(' garage '));
    expect(northHouse).toHaveLength(EAVES_HOUSE_BOXES);
    expect(northGarage).toHaveLength(EAVES_GARAGE_BOXES + EAVES_GARAGE_PIPES);
    expect(south).toHaveLength(north.length);
    const strip = (n: string): string => n.replace(' north ', ' ').replace(' south ', ' ');
    expect(north.map((m) => strip(m.name)).sort()).toEqual(south.map((m) => strip(m.name)).sort());
    // Every 8-gon pipe is a closed 8-segment cylinder in painted-metal.
    const pipes = northGarage.filter((m) => m.name.includes('eaves pipe'));
    expect(pipes).toHaveLength(4);
    for (const pipe of pipes) {
      const params = (pipe.geometry as THREE.CylinderGeometry).parameters;
      expect(params?.radialSegments, pipe.name).toBe(8);
      expect(params?.openEnded, pipe.name).toBe(false);
    }
  });

  it('keeps existing house downpipes and adds exactly four 8-gon pipes per garage', () => {
    const arena = build();
    arena.root.updateMatrixWorld(true);
    const boxOf = (name: string): THREE.Box3 => {
      const mesh = arena.root.getObjectByName(name);
      expect(mesh, name).toBeTruthy();
      return new THREE.Box3().setFromObject(mesh!);
    };
    // Pre-existing box-runs: front 2 + back 2 per house, untouched.
    for (const run of ['house front gutter', 'house back gutter']) {
      for (const index of [0, 1]) {
        expect(arena.root.getObjectByName(`nuketown2 north ${run} gutter downpipe ${index}`), `${run} pipe ${index}`).toBeTruthy();
        expect(arena.root.getObjectByName(`nuketown2 north ${run} gutter shoe ${index}`), `${run} shoe ${index}`).toBeTruthy();
      }
    }
    // New garage pipes: 0.08 across, standoff >= 0.02 off the wall, shoes at 0.15.
    for (const run of ['garage front eaves gutter', 'garage back eaves gutter']) {
      for (const index of [0, 1]) {
        const pipe = boxOf(`nuketown2 north ${run} eaves pipe ${index}`);
        expect(pipe.max.x - pipe.min.x, `${run} pipe width`).toBeCloseTo(0.08, 2);
        const shoe = boxOf(`nuketown2 north ${run} gutter shoe ${index}`);
        expect(shoe.min.y, `${run} shoe base`).toBeCloseTo(EAVES_SHOE_BASE_Y, 2);
      }
    }
    const frontPipe = boxOf('nuketown2 north garage front eaves gutter eaves pipe 0');
    expect(frontPipe.min.z - -16, 'front pipe vs garage front wall').toBeGreaterThanOrEqual(EAVES_PIPE_STANDOFF_MIN - 1e-6);
    const backPipe = boxOf('nuketown2 north garage back eaves gutter eaves pipe 0');
    expect(-23 - backPipe.max.z, 'back pipe vs garage back wall').toBeGreaterThanOrEqual(EAVES_PIPE_STANDOFF_MIN - 1e-6);
  });

  it('measures the relief table on real meshes: fascia 0.01, gutter 0.035, never coplanar', () => {
    const arena = build();
    arena.root.updateMatrixWorld(true);
    const boxOf = (name: string): THREE.Box3 => {
      const mesh = arena.root.getObjectByName(name);
      expect(mesh, name).toBeTruthy();
      return new THREE.Box3().setFromObject(mesh!);
    };
    // Fascia front 0.01 proud of the eave-band face, both houses and garages.
    const band = boxOf('nuketown2 north house roof shingles eaves front');
    const fascia = boxOf('nuketown2 north house eaves fascia fascia front');
    expect(fascia.max.z - band.max.z).toBeCloseTo(0.01, 2);
    const garageBand = boxOf('nuketown2 north garage roof shingles eaves front');
    const garageFascia = boxOf('nuketown2 north garage eaves fascia fascia front');
    expect(garageFascia.max.z - garageBand.max.z).toBeCloseTo(0.01, 2);
    // New trough back 0.035 proud of the fascia face.
    const trough = boxOf('nuketown2 north garage front eaves gutter gutter trough');
    expect(trough.min.z - garageFascia.max.z).toBeCloseTo(0.035, 2);
  });

  it('adds presentation only: no raycast, shot, or collider registration, houses symmetric', () => {
    const arena = build();
    const raycast = new Set(arena.raycastMeshes.map((m) => (m as THREE.Mesh).name));
    const shots = new Set(arena.shotSurfaces.map((s) => s.name));
    const meshes = eavesMeshes(arena);
    expect(meshes.length).toBe(2 * (EAVES_HOUSE_BOXES + EAVES_GARAGE_BOXES + EAVES_GARAGE_PIPES));
    for (const mesh of meshes) {
      expect(mesh.userData.presentationOnly, `${mesh.name} presentationOnly`).toBe(true);
      expect(mesh.userData.presentationBatchCandidate, `${mesh.name} batch candidate`).toBe(true);
      expect(mesh.userData.ballisticSurfaceId, `${mesh.name} no ballistic id`).toBeUndefined();
      expect(raycast.has(mesh.name), `${mesh.name} not raycast`).toBe(false);
      expect([...shots].some((n) => n.endsWith(`:${mesh.name}`) || n === mesh.name), `${mesh.name} not shot`).toBe(false);
    }
  });
});
