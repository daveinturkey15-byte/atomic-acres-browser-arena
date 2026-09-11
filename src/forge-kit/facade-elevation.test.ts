/**
 * facade-elevation.test.ts - HF-536 facade ELEVATION assembly.
 *
 * Pins the assembly's contract, not its part counts: the same options give
 * the same parts; every part is finite and stays inside the wall envelope on
 * every facing; pier boards never enter an opening; window liners stay inside
 * their own cut and inside the wall body; a door leaf is parked BESIDE its
 * doorway, never hung in it; two parameter sets give two materially different
 * elevations; malformed options are rejected before any part is authored.
 */
import { describe, expect, it } from 'vitest';

import {
  FACADE_MAX_PROUD,
  type FacadeFacing,
  type FacadePart,
  lapSidingParts,
} from './facade';
import {
  FACADE_LEAF_HEAD_CLEARANCE,
  FACADE_LEAF_PARK_GAP,
  FACADE_LEAF_T,
  type FacadeElevationGroup,
  type FacadeElevationOptions,
  facadeElevationFlatParts,
  facadeElevationParts,
} from './facade-elevation';

const WALL_T = 0.3;

/** Profile A - the Nuke Town house front: two windows, one parked-leaf door. */
const HOUSE: FacadeElevationOptions = {
  id: 'house front',
  extent: [-6.45, 3.95],
  height: 3.0,
  facing: 'z+',
  wallThickness: WALL_T,
  openings: [
    { kind: 'window', along: [-5.6, -3.6], sill: 1.0, head: 2.1 },
    { kind: 'door', along: [-2.15, -0.35], head: 2.4 },
    { kind: 'window', along: [1.4, 3.4], sill: 1.0, head: 2.1 },
  ],
  style: { door: 'parked-leaf', leafRole: 'trim', leafThickness: 0.03 },
};

/** Profile B - the garage front: one vehicle bay under a sectional head band. */
const GARAGE: FacadeElevationOptions = {
  id: 'garage front',
  extent: [4.55, 8.95],
  height: 3.4,
  facing: 'z+',
  wallThickness: WALL_T,
  openings: [{ kind: 'door', along: [5.0, 8.5], head: 2.6, prop: 'garage door panels' }],
  style: { sidingRole: 'garageSiding', door: 'sectional-head' },
};

const FACINGS: readonly FacadeFacing[] = ['z+', 'z-', 'x+', 'x-'];

const alongAxis = (facing: FacadeFacing): 0 | 2 => (facing.startsWith('z') ? 0 : 2);
const outAxis = (facing: FacadeFacing): 0 | 2 => (facing.startsWith('z') ? 2 : 0);
const outSign = (facing: FacadeFacing): 1 | -1 => (facing.endsWith('+') ? 1 : -1);

function span(part: FacadePart, axis: 0 | 1 | 2): [number, number] {
  return [part.offset[axis] - part.size[axis] / 2, part.offset[axis] + part.size[axis] / 2];
}
/** How far the part's outer face stands proud of the wall's outer plane. */
function proud(part: FacadePart, facing: FacadeFacing): number {
  return outSign(facing) * part.offset[outAxis(facing)] + part.size[outAxis(facing)] / 2;
}
/** How far the part's inner face reaches into the wall body. */
function inward(part: FacadePart, facing: FacadeFacing): number {
  return -outSign(facing) * part.offset[outAxis(facing)] + part.size[outAxis(facing)] / 2;
}
const overlaps = (a: readonly [number, number], b: readonly [number, number]): boolean =>
  a[0] < b[1] - 1e-9 && b[0] < a[1] - 1e-9;
const isBoard = (part: FacadePart): boolean => part.suffix.startsWith('board');
const groupsNamed = (groups: readonly FacadeElevationGroup[], word: string): FacadeElevationGroup[] =>
  groups.filter((group) => group.prop.includes(word));

describe('HF-536 facade elevation assembly', () => {
  it('is deterministic and independent of the order the openings were listed in', () => {
    const first = facadeElevationParts(HOUSE);
    const second = facadeElevationParts(HOUSE);
    const reversed = facadeElevationParts({ ...HOUSE, openings: [...HOUSE.openings!].reverse() });
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(JSON.stringify(reversed)).toBe(JSON.stringify(first));
    expect(first.length).toBeGreaterThan(0);
  });

  it('emits finite, positive-sized parts inside the extent and the wall envelope on every facing', () => {
    for (const profile of [HOUSE, GARAGE]) {
      for (const facing of FACINGS) {
        const groups = facadeElevationParts({ ...profile, facing });
        const parts = facadeElevationFlatParts(groups);
        expect(parts.length).toBe(groups.reduce((sum, group) => sum + group.parts.length, 0));
        for (const part of parts) {
          for (const value of [...part.offset, ...part.size]) expect(Number.isFinite(value)).toBe(true);
          for (const value of part.size) expect(value).toBeGreaterThan(0);
          const [a0, a1] = span(part, alongAxis(facing));
          expect(a0, `${part.suffix} along start`).toBeGreaterThanOrEqual(profile.extent[0] - 1e-6);
          expect(a1, `${part.suffix} along end`).toBeLessThanOrEqual(profile.extent[1] + 1e-6);
          const [u0, u1] = span(part, 1);
          expect(u0, `${part.suffix} foot`).toBeGreaterThanOrEqual(-1e-6);
          // A joint reveal laps the head course by up to 24 mm; nothing else may.
          expect(u1, `${part.suffix} head`).toBeLessThanOrEqual(profile.height + 0.03);
          expect(proud(part, facing), `${part.suffix} proud`).toBeLessThanOrEqual(FACADE_MAX_PROUD + 1e-9);
          expect(inward(part, facing), `${part.suffix} inward`).toBeLessThanOrEqual(WALL_T + 1e-9);
        }
      }
    }
  });

  it('sides only the piers: boards never enter an opening and each pier is the kit\'s own run', () => {
    for (const profile of [HOUSE, GARAGE]) {
      const facing = profile.facing;
      const groups = facadeElevationParts(profile);
      const piers = groupsNamed(groups, ' siding ');
      const openings = [...profile.openings!].sort((a, b) => a.along[0] - b.along[0]);
      expect(piers.length).toBe(openings.length + 1);
      let cursor = profile.extent[0];
      piers.forEach((pier, index) => {
        const to = index < openings.length ? openings[index]!.along[0] : profile.extent[1];
        const boards = pier.parts.filter(isBoard);
        expect(boards.length).toBeGreaterThan(0);
        const reference = lapSidingParts({
          run: to - cursor, height: profile.height, facing, role: profile.style?.sidingRole,
        }).filter(isBoard);
        expect(boards.length).toBe(reference.length);
        for (const board of boards) {
          const along = span(board, alongAxis(facing));
          expect(along[0]).toBeCloseTo(cursor, 6);
          expect(along[1]).toBeCloseTo(to, 6);
          expect(board.role).toBe(profile.style?.sidingRole ?? 'siding');
          for (const opening of openings) expect(overlaps(along, opening.along), `board in opening`).toBe(false);
        }
        cursor = index < openings.length ? openings[index]!.along[1] : cursor;
      });
    }
  });

  it('lines each window inside its own cut and wholly inside the wall body, or not at all', () => {
    const groups = facadeElevationParts(HOUSE);
    const reveals = groupsNamed(groups, 'window reveal');
    const windows = HOUSE.openings!.filter((opening) => opening.kind === 'window');
    expect(reveals.length).toBe(windows.length);
    reveals.forEach((group, index) => {
      const opening = windows[index]!;
      expect(group.parts.length).toBe(4);
      for (const part of group.parts) {
        const along = span(part, alongAxis(HOUSE.facing));
        expect(along[0]).toBeGreaterThanOrEqual(opening.along[0] - 1e-9);
        expect(along[1]).toBeLessThanOrEqual(opening.along[1] + 1e-9);
        const up = span(part, 1);
        expect(up[0]).toBeGreaterThanOrEqual(opening.sill! - 1e-9);
        expect(up[1]).toBeLessThanOrEqual(opening.head + 1e-9);
        expect(proud(part, HOUSE.facing)).toBeLessThanOrEqual(1e-9);
        expect(inward(part, HOUSE.facing)).toBeLessThanOrEqual(WALL_T + 1e-9);
      }
    });
    const bare = facadeElevationParts({ ...HOUSE, style: { ...HOUSE.style, windowReveals: false } });
    expect(groupsNamed(bare, 'window reveal')).toHaveLength(0);
    expect(groupsNamed(bare, ' siding ')).toHaveLength(4);
  });

  it('parks a door leaf beside its doorway, bands a sectional head over it, or leaves it bare', () => {
    const door = HOUSE.openings!.find((opening) => opening.kind === 'door')!;
    const width = door.along[1] - door.along[0];

    const parked = groupsNamed(facadeElevationParts(HOUSE), 'door leaf');
    expect(parked).toHaveLength(1);
    const leaf = parked[0]!.parts.find((part) => part.suffix === 'leaf')!;
    expect(leaf.role).toBe('trim');
    expect(leaf.size[alongAxis(HOUSE.facing)]).toBeCloseTo(width, 9);
    for (const part of parked[0]!.parts) {
      const along = span(part, alongAxis(HOUSE.facing));
      expect(overlaps(along, door.along), `${part.suffix} hung in the doorway`).toBe(false);
      expect(along[0]).toBeGreaterThanOrEqual(door.along[1] + FACADE_LEAF_PARK_GAP - 1e-9);
      expect(span(part, 1)[1]).toBeLessThanOrEqual(door.head - FACADE_LEAF_HEAD_CLEARANCE + 1e-9);
    }
    // The default leaf keeps the 50 mm parity promise without the caller saying so.
    const defaulted = groupsNamed(facadeElevationParts({ ...HOUSE, style: { door: 'parked-leaf' } }), 'door leaf')[0]!;
    expect(defaulted.parts.find((part) => part.suffix === 'leaf')!.size[outAxis(HOUSE.facing)]).toBe(FACADE_LEAF_T);
    for (const part of defaulted.parts) expect(proud(part, HOUSE.facing)).toBeLessThanOrEqual(FACADE_MAX_PROUD + 1e-9);

    const bay = GARAGE.openings![0]!;
    const garage = facadeElevationParts(GARAGE);
    const head = garage.filter((group) => group.prop === 'garage door panels');
    expect(head).toHaveLength(1);
    const boards = head[0]!.parts.filter(isBoard);
    expect(boards).toHaveLength(4);
    for (const part of head[0]!.parts) {
      expect(part.role === 'panel' || part.role === 'reveal').toBe(true);
      const along = span(part, alongAxis(GARAGE.facing));
      expect(along[0]).toBeGreaterThanOrEqual(bay.along[0] - 1e-9);
      expect(along[1]).toBeLessThanOrEqual(bay.along[1] + 1e-9);
      expect(span(part, 1)[0]).toBeGreaterThanOrEqual(bay.head - 1e-9);
    }
    for (const board of boards) expect(span(board, 1)[1]).toBeLessThanOrEqual(GARAGE.height + 1e-9);
    expect(groupsNamed(garage, 'door leaf')).toHaveLength(0);

    const bare = facadeElevationParts({ ...GARAGE, style: { sidingRole: 'garageSiding', door: 'bare' } });
    expect(bare.every((group) => group.prop.includes(' siding '))).toBe(true);
  });

  it('turns two parameter sets into two materially different elevations', () => {
    const house = facadeElevationParts(HOUSE);
    const garage = facadeElevationParts(GARAGE);
    const roles = (groups: FacadeElevationGroup[]): string[] =>
      [...new Set(facadeElevationFlatParts(groups).map((part) => part.role))].sort();
    expect(roles(house)).toEqual(['reveal', 'siding', 'trim']);
    expect(roles(garage)).toEqual(['garageSiding', 'panel', 'reveal']);
    expect(house.map((group) => group.prop)).toEqual([
      'house front siding 0', 'house front siding 1', 'house front siding 2', 'house front siding 3',
      'house front window reveal 0', 'house front door leaf', 'house front window reveal 1',
    ]);
    expect(garage.map((group) => group.prop)).toEqual([
      'garage front siding 0', 'garage front siding 1', 'garage door panels',
    ]);
    expect(facadeElevationFlatParts(house).length).not.toBe(facadeElevationFlatParts(garage).length);
  });

  it('rejects malformed options before authoring any part', () => {
    const bad: Array<[string, () => unknown]> = [
      ['empty id', () => facadeElevationParts({ ...HOUSE, id: ' ' })],
      ['descending extent', () => facadeElevationParts({ ...HOUSE, extent: [3.95, -6.45] })],
      ['NaN extent', () => facadeElevationParts({ ...HOUSE, extent: [Number.NaN, 1] })],
      ['zero height', () => facadeElevationParts({ ...HOUSE, height: 0 })],
      ['infinite height', () => facadeElevationParts({ ...HOUSE, height: Number.POSITIVE_INFINITY })],
      ['zero wall', () => facadeElevationParts({ ...HOUSE, wallThickness: 0 })],
      ['negative course', () => facadeElevationParts({ ...HOUSE, style: { courseHeight: -0.2 } })],
      ['zero head course', () => facadeElevationParts({ ...GARAGE, style: { door: 'sectional-head', headCourseHeight: 0 } })],
      ['zero leaf', () => facadeElevationParts({ ...HOUSE, style: { door: 'parked-leaf', leafThickness: 0 } })],
      ['negative leaf gap', () => facadeElevationParts({ ...HOUSE, style: { door: 'parked-leaf', leafGap: -0.1 } })],
      ['unknown door treatment', () => facadeElevationParts({ ...HOUSE, style: { door: 'swing' as never } })],
      ['unknown opening kind', () => facadeElevationParts({ ...HOUSE, openings: [{ kind: 'hatch' as never, along: [0, 1], head: 2 }] })],
      ['opening past extent', () => facadeElevationParts({ ...HOUSE, openings: [{ kind: 'window', along: [3.0, 4.5], sill: 1, head: 2 }] })],
      ['descending opening', () => facadeElevationParts({ ...HOUSE, openings: [{ kind: 'window', along: [1, 0], sill: 1, head: 2 }] })],
      ['overlapping openings', () => facadeElevationParts({ ...HOUSE, openings: [
        { kind: 'window', along: [0, 2], sill: 1, head: 2 }, { kind: 'door', along: [1.5, 3], head: 2.4 },
      ] })],
      ['head above storey', () => facadeElevationParts({ ...HOUSE, openings: [{ kind: 'door', along: [0, 1], head: 3.5 }] })],
      ['sill at head', () => facadeElevationParts({ ...HOUSE, openings: [{ kind: 'window', along: [0, 1], sill: 2, head: 2 }] })],
      ['negative sill', () => facadeElevationParts({ ...HOUSE, openings: [{ kind: 'window', along: [0, 1], sill: -0.1, head: 2 }] })],
      ['leaf parked past extent', () => facadeElevationParts({ ...HOUSE, openings: [{ kind: 'door', along: [2.0, 3.8], head: 2.4 }] })],
    ];
    for (const [label, call] of bad) expect(call, label).toThrow(/facadeElevationParts/);
  });
});
