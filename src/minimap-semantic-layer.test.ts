/**
 * HF-510 minimap structural budget.
 *
 * Owner: "The mini map also still feels very cluttered on Nuke Town ... and the
 * same on all levels. ... It should be very simple. Just mainly showing where
 * the walls are, not all the tiny components within, like cover."
 *
 * The roster is DERIVED from the arena catalog (`ALL_ARENA_IDS`), so a new
 * arena is gated the day it is registered rather than the day someone
 * remembers to add it to a list here.
 */
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  ALL_ARENA_IDS,
  installHeadlessArenaShims,
  loadArenaFactories,
} from '../scripts/qa/collider-visual-parity-core';
import {
  MINIMAP_ELEMENT_CEILING,
  MINIMAP_MIN_SEGMENT_PX,
  MINIMAP_STRUCTURAL_MIN_HEIGHT_M,
  MINIMAP_STRUCTURAL_MIN_SPAN_M,
  buildMinimapStructuralElements,
  isMinimapRoadSurface,
  isMinimapStructuralCollider,
  type MinimapElement,
} from './minimap';
import type { ArenaMap } from './map';

const SIZE = 256;

/** The arena factories return the map without its catalog id bound. */
type BuiltArena = Omit<ArenaMap, 'id'>;

type Measured = Readonly<{
  arena: BuiltArena;
  elements: readonly MinimapElement[];
  /** What the pre-HF-510 layer drew: one rect per collider + one per cover landmark. */
  before: number;
}>;

const measured = new Map<string, Measured>();

function legacyCoverDrawn(cover: ArenaMap['physicalCover'][number]): boolean {
  return Boolean(cover.performanceVisualKind)
    || cover.id.endsWith('-bus') || cover.id.includes('jetliner') || cover.id.includes('terminal')
    || cover.id.includes('fuel') || cover.id.includes('cargo-stack');
}

beforeAll(async () => {
  installHeadlessArenaShims();
  const factories = await loadArenaFactories();
  for (const arenaId of ALL_ARENA_IDS) {
    const factory = factories[arenaId];
    expect(factory, `arena catalog names ${arenaId} but nothing builds it`).toBeTruthy();
    const arena = factory!.build(new THREE.Scene());
    measured.set(arenaId, {
      arena,
      before: arena.colliders.length + arena.physicalCover.filter(legacyCoverDrawn).length,
      elements: buildMinimapStructuralElements({
        bounds: arena.bounds,
        width: SIZE,
        height: SIZE,
        colliders: arena.colliders,
        cover: arena.physicalCover.map((cover) => cover.bounds),
        houses: arena.houses,
        surfaces: arena.shotSurfaces,
      }),
    });
  }
}, 600_000);

describe('minimap structural rule (HF-510)', () => {
  it('admits a wall and rejects cover, props and interior fixtures', () => {
    // A 6 m run of chest-high wall.
    expect(isMinimapStructuralCollider({ minX: 0, maxX: 6, minZ: 0, maxZ: 0.3, minY: 0, maxY: 2.6 })).toBe(true);
    // Waist-high cover of the same length: excluded on height.
    expect(isMinimapStructuralCollider({ minX: 0, maxX: 6, minZ: 0, maxZ: 0.3, minY: 0, maxY: 1.1 })).toBe(false);
    // A tall but tiny fixture (post, appliance, bin): excluded on span.
    expect(isMinimapStructuralCollider({ minX: 0, maxX: 0.6, minZ: 0, maxZ: 0.6, minY: 0, maxY: 2.4 })).toBe(false);
    // Exactly at both thresholds is admitted; a hair under either is not.
    expect(isMinimapStructuralCollider({
      minX: 0, maxX: MINIMAP_STRUCTURAL_MIN_SPAN_M, minZ: 0, maxZ: 0.2,
      minY: 0, maxY: MINIMAP_STRUCTURAL_MIN_HEIGHT_M,
    })).toBe(true);
    expect(isMinimapStructuralCollider({
      minX: 0, maxX: MINIMAP_STRUCTURAL_MIN_SPAN_M - 0.01, minZ: 0, maxZ: 0.2,
      minY: 0, maxY: MINIMAP_STRUCTURAL_MIN_HEIGHT_M,
    })).toBe(false);
    expect(isMinimapStructuralCollider({
      minX: 0, maxX: MINIMAP_STRUCTURAL_MIN_SPAN_M, minZ: 0, maxZ: 0.2,
      minY: 0, maxY: MINIMAP_STRUCTURAL_MIN_HEIGHT_M - 0.01,
    })).toBe(false);
  });

  it('treats the carriageway as road and its kerbs as trim', () => {
    expect(isMinimapRoadSurface('nuketown2 carriageway stem')).toBe(true);
    expect(isMinimapRoadSurface('atomic-acres-road')).toBe(true);
    expect(isMinimapRoadSurface('skyline-tarmac-apron')).toBe(true);
    expect(isMinimapRoadSurface('nuketown2 carriageway head kerb segment 3')).toBe(false);
    expect(isMinimapRoadSurface('raid2 court kerb north')).toBe(false);
    expect(isMinimapRoadSurface('nuketown2 north yard planter')).toBe(false);
  });

  it('merges abutting wall segments into one silhouette', () => {
    const segment = (minX: number, maxX: number) => ({ minX, maxX, minZ: 0, maxZ: 0.3, minY: 0, maxY: 3 });
    const elements = buildMinimapStructuralElements({
      bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 },
      width: SIZE,
      height: SIZE,
      colliders: [segment(-9, -3), segment(-3, 3), segment(3, 9)],
    });
    expect(elements).toHaveLength(1);
    expect(elements[0]!.sourceCount).toBe(3);
    expect(elements[0]!.bounds.minX).toBe(-9);
    expect(elements[0]!.bounds.maxX).toBe(9);
    expect(elements[0]!.className).toBe('wall');
  });
});

describe('minimap per-arena element budget (HF-510)', () => {
  it('covers every arena the catalog can name', () => {
    expect(ALL_ARENA_IDS.length).toBeGreaterThan(0);
    expect([...measured.keys()].sort()).toEqual([...ALL_ARENA_IDS].sort());
  });

  it.each([...ALL_ARENA_IDS])('%s draws only structural elements, under the ceiling', (arenaId) => {
    const entry = measured.get(arenaId);
    expect(entry, `${arenaId} was never measured`).toBeTruthy();
    const { arena, elements, before } = entry!;

    expect(elements.length, `${arenaId}: minimap element count exceeds the derived ceiling`)
      .toBeLessThanOrEqual(MINIMAP_ELEMENT_CEILING);
    expect(elements.length, `${arenaId}: the declutter did not reduce the drawn element count`)
      .toBeLessThan(before);
    expect(elements.length, `${arenaId}: the minimap must still show where the walls are`)
      .toBeGreaterThan(0);

    for (const element of elements) {
      expect(['building', 'wall', 'road'], `${arenaId}/${element.id}: non-structural class`)
        .toContain(element.className);
      const widthPx = ((element.bounds.maxX - element.bounds.minX) / (arena.bounds.maxX - arena.bounds.minX)) * SIZE;
      const heightPx = ((element.bounds.maxZ - element.bounds.minZ) / (arena.bounds.maxZ - arena.bounds.minZ)) * SIZE;
      expect(Math.max(widthPx, heightPx), `${arenaId}/${element.id}: unreadable at HUD size`)
        .toBeGreaterThanOrEqual(MINIMAP_MIN_SEGMENT_PX);
    }
  }, 600_000);

  it.each([...ALL_ARENA_IDS])('%s excludes cover, props and scenery vehicles at the source', (arenaId) => {
    const { arena, elements } = measured.get(arenaId)!;
    // Every authored physical-cover piece is cover by definition, whatever its
    // size, so none of them may survive as a minimap element.
    for (const cover of arena.physicalCover) {
      const inside = elements.some((element) => element.bounds.minX <= cover.bounds.minX + 0.35
        && element.bounds.maxX >= cover.bounds.maxX - 0.35
        && element.bounds.minZ <= cover.bounds.minZ + 0.35
        && element.bounds.maxZ >= cover.bounds.maxZ - 0.35
        && (element.bounds.maxX - element.bounds.minX) <= (cover.bounds.maxX - cover.bounds.minX) + 1
        && (element.bounds.maxZ - element.bounds.minZ) <= (cover.bounds.maxZ - cover.bounds.minZ) + 1);
      expect(inside, `${arenaId}: cover ${cover.id} is drawn as a minimap element`).toBe(false);
    }
    // Sub-threshold colliders - crates, bins, benches, planters, furniture,
    // vegetation - never reach the minimap on any arena.
    const admitted = arena.colliders.filter(isMinimapStructuralCollider);
    expect(admitted.length, `${arenaId}: the structural filter admitted every collider`)
      .toBeLessThan(arena.colliders.length);
  }, 600_000);
});
