/**
 * forge-kit prefab pins - HF-536 (night-kit).
 *
 * Every prefab in `src/forge-kit/` is a pure function from dimensions to
 * parts, so its triangle cost, its material roles and its authority can all be
 * asserted without building an arena. That is the point of the shape: the
 * budget conversation happens here, in a test that names the number, rather
 * than in a capture that reports a total.
 */
import { describe, expect, it } from 'vitest';
import {
  GUTTER_RUN_TRIANGLES,
  KERB_CHAMFER,
  KERB_STONE_LENGTH,
  LANTERN_HEAD_TRIANGLES,
  gutterRunParts,
  kerbCourseParts,
  kerbCourseTriangles,
  lanternHeadParts,
} from './index';
import type { ForgeKitBox } from './index';

const TRIS_PER_BOX = 12;
const ROLES = new Set(['trim', 'chrome', 'warmLight', 'block', 'kerb']);

const triangles = (parts: readonly ForgeKitBox[]): number => parts.length * TRIS_PER_BOX;

const assertKitContract = (parts: readonly ForgeKitBox[], label: string): void => {
  expect(parts.length, `${label} emits parts`).toBeGreaterThan(0);
  for (const part of parts) {
    // A prefab may only ask for a role the arena already owns. A new role
    // means a new material graph, which is a decision made in the brief
    // (Amendment B3), never a side effect of a prop.
    expect(ROLES.has(part.role), `${label}/${part.suffix} role ${part.role}`).toBe(true);
    // Real millimetres or nothing (R16/R17): nothing thinner than 2 mm (which
    // no depth buffer at these ranges can separate) and nothing longer than
    // the map's own stem.
    for (const [axis, size] of part.size.entries()) {
      expect(size, `${label}/${part.suffix} axis ${axis} is a real dimension`).toBeGreaterThan(0.002);
      expect(size, `${label}/${part.suffix} axis ${axis} is not a wall`).toBeLessThan(30);
    }
    expect(part.suffix.trim(), `${label} suffix is non-empty`).not.toBe('');
  }
  // Suffixes are the arena's mesh names: two identical suffixes would collide
  // in every name-keyed gate on the map.
  expect(new Set(parts.map((part) => part.suffix)).size, `${label} suffixes are unique`).toBe(parts.length);
};

describe('forge-kit prefabs', () => {
  it('lantern head: 7 boxes, 84 triangles, one emissive face aimed at the road', () => {
    const parts = lanternHeadParts();
    assertKitContract(parts, 'lantern head');
    expect(parts).toHaveLength(7);
    expect(triangles(parts)).toBe(LANTERN_HEAD_TRIANGLES);
    expect(LANTERN_HEAD_TRIANGLES).toBe(84);
    // Exactly ONE part is lit, and it hangs BELOW the anchor: a diffuser that
    // faces the sky lights nothing a player standing in the road can see.
    const lit = parts.filter((part) => part.role === 'warmLight');
    expect(lit).toHaveLength(1);
    expect(lit[0]!.offset[1]).toBeLessThan(0);
    // The hood is four walls, not one box: that is what gives the head a
    // sun-side and a shade-side flank (R21).
    expect(parts.filter((part) => part.suffix.startsWith('hood'))).toHaveLength(4);
  });

  it('gutter run: 8 boxes, 96 triangles, downpipes inboard of the wall ends', () => {
    const run = 11.06;
    const parts = gutterRunParts({ run, drop: 5.86, facing: 1 });
    assertKitContract(parts, 'gutter run');
    expect(parts).toHaveLength(8);
    expect(triangles(parts)).toBe(GUTTER_RUN_TRIANGLES);
    expect(GUTTER_RUN_TRIANGLES).toBe(96);
    const pipes = parts.filter((part) => part.suffix.includes('downpipe'));
    expect(pipes).toHaveLength(2);
    for (const pipe of pipes) {
      // Inside the wall it hangs on, never past the corner.
      expect(Math.abs(pipe.offset[0])).toBeLessThan(run / 2);
      expect(pipe.size[1]).toBeCloseTo(5.86, 6);
    }
    // The bead stands proud of the trough, or there is no lit line under the
    // eaves and the prefab has done nothing.
    const trough = parts.find((part) => part.suffix === 'gutter trough')!;
    const bead = parts.find((part) => part.suffix === 'gutter bead')!;
    expect(bead.offset[2]).toBeGreaterThan(trough.offset[2]);
    // Facing flips the whole run to the other elevation.
    const back = gutterRunParts({ run, drop: 5.86, facing: -1 });
    expect(back.find((part) => part.suffix === 'gutter bead')!.offset[2])
      .toBeCloseTo(-bead.offset[2], 6);
  });

  it('kerb course: one 45-degree chamfer plus a joint every 915 mm', () => {
    const run = 25.6;
    const parts = kerbCourseParts({ run, height: 0.24, tread: 0.3, roadSide: 1 });
    assertKitContract(parts, 'kerb course');
    const stones = Math.round(run / KERB_STONE_LENGTH);
    expect(parts.filter((part) => part.suffix.startsWith('kerb joint'))).toHaveLength(stones);
    expect(triangles(parts)).toBe(kerbCourseTriangles(stones));
    // THE CHAMFER IS ROTATED, and that is the whole mechanism: an axis-aligned
    // strip on an axis-aligned kerb shares its normals and returns the same
    // value, so it would be invisible at every station.
    const chamfer = parts.find((part) => part.suffix === 'kerb chamfer')!;
    expect(chamfer.rotation, 'the chamfer must be a real arris, not a flat strip').toBeDefined();
    expect(Math.abs(chamfer.rotation![0])).toBeCloseTo(Math.PI / 4, 6);
    expect(chamfer.size[1]).toBeCloseTo(KERB_CHAMFER, 6);
    expect(chamfer.size[0]).toBeCloseTo(run, 6);
    // The road side flips the arris to the other kerb.
    const other = kerbCourseParts({ run, height: 0.24, tread: 0.3, roadSide: -1 });
    expect(other.find((part) => part.suffix === 'kerb chamfer')!.rotation![0])
      .toBeCloseTo(-chamfer.rotation![0], 6);
    // A long run cannot blow the budget by accident.
    const capped = kerbCourseParts({ run: 400, height: 0.24, tread: 0.3, roadSide: 1, maxStones: 40 });
    expect(capped.filter((part) => part.suffix.startsWith('kerb joint'))).toHaveLength(40);
  });

  it('costs what the arena claims: 4 heads + 2 copings + 4 gutters + 2 kerb courses', () => {
    // The night-kit pass's own triangle bill, written where it can be checked.
    const heads = 4 * LANTERN_HEAD_TRIANGLES;                 // 2 posts x 2 halves
    const coping = 4 * 4 * TRIS_PER_BOX;                      // 4 bars x 2 planters x 2 halves
    const gutters = 4 * GUTTER_RUN_TRIANGLES;                 // front + back x 2 halves
    const kerbs = 2 * kerbCourseTriangles(28);                // 2 stem sides
    expect(heads).toBe(336);
    expect(coping).toBe(192);
    expect(gutters).toBe(384);
    expect(kerbs).toBe(2 * 12 * (1 + 28 + 14));
    // The head REPLACES a box each, so the net is 336 - 48.
    expect(heads - 4 * TRIS_PER_BOX + coping + gutters + kerbs).toBeLessThan(3000);
  });
});
