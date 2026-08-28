import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ARENA_BOUNDS, STREET_HALF_WIDTH } from './arena-layout';
import { classifyFootstepSurface } from './combat-feedback';

/**
 * Pass 81 / HF-383c binding gate.
 *
 * The Quality (default) render profile hides the entire procedural arena root
 * and draws the baked Blender GLB instead (src/blender-environment.ts:263), so
 * the checked-in spec below IS the arena the owner looks at. Nothing used to
 * tie it to the arena the code collides with: src/blender-environment.test.ts
 * pins mesh, material and image counts, none of which move when the arena
 * resizes. HF-383 grew ARENA_BOUNDS from 62 x 60 to 62 x 63 m and widened
 * STREET_HALF_WIDTH from 5 to 6.5, and the spec silently kept the old numbers
 * for two days - the owner saw the pre-HF-383 map and reported the size fix as
 * "the same as 2 days ago".
 *
 * These assertions are geometric, not numeric: they compare the drawn surfaces
 * against the layout constants and against classifyFootstepSurface, so they
 * fail whenever either side moves without the other, instead of needing a
 * hand-updated literal.
 */

type Box = { position: [number, number, number]; size: [number, number, number] };
type Spec = {
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  roadway: { ground: Box; road: Box; curbs: Box[]; sidewalks: Box[] };
  boundaries: Array<{ id: string } & Box>;
};

const spec = JSON.parse(
  readFileSync(new URL('../source-assets/blender/atomic-acres-arena-spec.json', import.meta.url), 'utf8'),
) as Spec;

/** Sample lanes chosen clear of both house footprints (x = +/-4) and their decks. */
const STREET_SAMPLE_X = [-28, -22, 0, 22, 28];
const near = (edge: number, inward: number) => edge - inward;

describe('Blender arena spec tracks the arena-layout constants', () => {
  it('carries the same bounds the collision arena uses', () => {
    expect(spec.bounds).toEqual({
      minX: ARENA_BOUNDS.minX, maxX: ARENA_BOUNDS.maxX,
      minZ: ARENA_BOUNDS.minZ, maxZ: ARENA_BOUNDS.maxZ,
    });
  });

  it('draws the carriageway at exactly STREET_HALF_WIDTH', () => {
    expect(spec.roadway.road.size[2] / 2).toBeCloseTo(STREET_HALF_WIDTH, 6);
    // The asphalt runs past both end fences so no seam shows at either mouth.
    expect(spec.roadway.road.size[0] / 2).toBeGreaterThan(ARENA_BOUNDS.maxX);
  });

  it('tiles kerb and pavement across the concrete band with no gap or overlap', () => {
    const [curb] = spec.roadway.curbs.filter((box) => box.position[2] > 0);
    const [sidewalk] = spec.roadway.sidewalks.filter((box) => box.position[2] > 0);
    const curbInner = curb.position[2] - curb.size[2] / 2;
    const curbOuter = curb.position[2] + curb.size[2] / 2;
    const sidewalkInner = sidewalk.position[2] - sidewalk.size[2] / 2;
    const sidewalkOuter = sidewalk.position[2] + sidewalk.size[2] / 2;
    // Kerb starts where the asphalt stops; pavement starts where the kerb stops.
    expect(curbInner).toBeCloseTo(STREET_HALF_WIDTH, 6);
    expect(sidewalkInner).toBeCloseTo(curbOuter, 6);
    expect(sidewalk.size[2]).toBeGreaterThan(0);
    // And the far edge is the classifier's own concrete/soil boundary.
    expect(classifyFootstepSurface({ x: 0, y: 0, z: near(sidewalkOuter, 0.01) })).toBe('concrete');
    expect(classifyFootstepSurface({ x: 0, y: 0, z: sidewalkOuter + 0.01 })).toBe('soil');
  });

  it('never reports asphalt over drawn kerb, pavement or grass', () => {
    const [curb] = spec.roadway.curbs.filter((box) => box.position[2] > 0);
    const [sidewalk] = spec.roadway.sidewalks.filter((box) => box.position[2] > 0);
    const roadEdge = spec.roadway.road.size[2] / 2;
    for (const x of STREET_SAMPLE_X) {
      for (const sign of [-1, 1]) {
        // Drawn asphalt must sound like asphalt, right out to its painted edge.
        expect(classifyFootstepSurface({ x, y: 0, z: sign * near(roadEdge, 0.01) })).toBe('asphalt');
        // Drawn kerb and pavement must sound like concrete, not asphalt.
        expect(classifyFootstepSurface({ x, y: 0, z: sign * curb.position[2] })).toBe('concrete');
        expect(classifyFootstepSurface({ x, y: 0, z: sign * sidewalk.position[2] })).toBe('concrete');
      }
    }
  });

  it('puts the boundary fences on the bound lines, leaving no walkable ground outside', () => {
    const byId = new Map(spec.boundaries.map((boundary) => [boundary.id, boundary]));
    expect([...byId.keys()].sort()).toEqual(['east', 'north', 'south', 'west']);
    const west = byId.get('west')!;
    const east = byId.get('east')!;
    const north = byId.get('north')!;
    const south = byId.get('south')!;
    // Inner faces land exactly on ARENA_BOUNDS: the fence the owner sees is the
    // wall the movement clamp stops him at, with no strip of ground beyond it.
    expect(west.position[0] + west.size[0] / 2).toBeCloseTo(ARENA_BOUNDS.minX, 6);
    expect(east.position[0] - east.size[0] / 2).toBeCloseTo(ARENA_BOUNDS.maxX, 6);
    expect(north.position[2] + north.size[2] / 2).toBeCloseTo(ARENA_BOUNDS.minZ, 6);
    expect(south.position[2] - south.size[2] / 2).toBeCloseTo(ARENA_BOUNDS.maxZ, 6);
  });

  it('closes all four fence corners', () => {
    const byId = new Map(spec.boundaries.map((boundary) => [boundary.id, boundary]));
    // A corner is sealed when the two runs meeting there actually intersect, in
    // both axes. Reaching past the other run's outer face is not required and
    // never was: the runs lap, the end run butting into the side run's flank.
    const overlaps = (a: Box, b: Box, axis: 0 | 2) => {
      const aMin = a.position[axis] - a.size[axis] / 2;
      const aMax = a.position[axis] + a.size[axis] / 2;
      const bMin = b.position[axis] - b.size[axis] / 2;
      const bMax = b.position[axis] + b.size[axis] / 2;
      return Math.min(aMax, bMax) - Math.max(aMin, bMin);
    };
    for (const sideId of ['west', 'east'] as const) {
      for (const endId of ['north', 'south'] as const) {
        const side = byId.get(sideId)!;
        const end = byId.get(endId)!;
        expect(overlaps(side, end, 0)).toBeGreaterThan(0);
        expect(overlaps(side, end, 2)).toBeGreaterThan(0);
      }
    }
  });

  it('keeps the ground plane under every boundary fence', () => {
    const ground = spec.roadway.ground;
    const halfX = ground.size[0] / 2;
    const halfZ = ground.size[2] / 2;
    for (const boundary of spec.boundaries) {
      expect(Math.abs(boundary.position[0]) + boundary.size[0] / 2).toBeLessThanOrEqual(halfX);
      expect(Math.abs(boundary.position[2]) + boundary.size[2] / 2).toBeLessThanOrEqual(halfZ);
    }
  });
});
