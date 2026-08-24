/**
 * HF-395 relational mid-map composition — contract tests.
 *
 * The owner's complaint: mid-map assets "feel thrown together / not very
 * well coordinated". The fix composes the mid map into four quadrant
 * landmarks whose every prop derives from shared frames
 * (farcrysis-midmap-landmarks.ts). These tests pin the NEW behaviour:
 *
 *   1. Placement is pure/deterministic (no RNG streams — peers must agree).
 *   2. Frames sit ON the spawn diagonals and grove colliders actually block
 *      both spawn-to-spawn sightlines (the job the old scattered canopy list
 *      existed for).
 *   3. Landmark colliders never intersect unrelated colliders (the old
 *      layout could drift into overlaps silently because nothing related).
 *   4. Every landmark collider seats on the terrain authority surface.
 *   5. The art layer's wordmark plaques coincide with the builder's crate
 *      covers — one source of placement truth, proven through the BUILT
 *      arena, not through either module alone.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { buildFarcrysis } from './farcrysis';
import {
  FARCRYSIS_LANDMARKS,
  landmarkByTag,
  landmarkCratePlacements,
  landmarkFernPositions,
  landmarkHedgePositions,
  landmarkRubblePositions,
  landmarkTreePositions,
  landmarkWallSpecs,
  landmarkWordmarkAnchor,
} from './farcrysis-midmap-landmarks';
import { farcrysisTerrainHeight } from './farcrysis-terrain-authority';
import { FARCRYSIS_BOUNDS } from './farcrysis-constants';

// --- canvas-free document stub (same shape the other farcrysis suites use) --
function fakeCanvasContext() {
  const gradient = () => ({ addColorStop: vi.fn() });
  const state: Record<PropertyKey, unknown> = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '10px sans-serif',
  };
  return new Proxy(state, {
    get(target, prop) {
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => gradient();
      if (typeof prop === 'string' && !(prop in target)) target[prop] = vi.fn();
      return target[prop];
    },
  }) as unknown as CanvasRenderingContext2D;
}

function stubCanvasDocument(): void {
  const context = fakeCanvasContext();
  vi.stubGlobal('document', {
    createElement: () => ({ getContext: () => context }),
    getElementById: () => null,
  });
}

type Box2ish = { minX: number; maxX: number; minZ: number; maxZ: number };

function boxesIntersect(a: Box2ish, b: Box2ish, epsilon = 0.02): boolean {
  return (
    a.minX < b.maxX - epsilon && b.minX < a.maxX - epsilon &&
    a.minZ < b.maxZ - epsilon && b.minZ < a.maxZ - epsilon
  );
}

describe('farcrysis mid-map landmarks (HF-395)', () => {
  beforeEach(() => stubCanvasDocument());
  afterEach(() => vi.unstubAllGlobals());

  it('places every landmark frame on a spawn diagonal at the ring radius', () => {
    expect(FARCRYSIS_LANDMARKS.map((f) => f.tag)).toEqual(['nw', 'ne', 'sw', 'se']);
    for (const frame of FARCRYSIS_LANDMARKS) {
      // On a diagonal: |x| == |z|.
      expect(Math.abs(Math.abs(frame.center[0]) - Math.abs(frame.center[1]))).toBeLessThan(1e-9);
      // Unit frame vectors.
      expect(Math.hypot(frame.outward[0], frame.outward[1])).toBeCloseTo(1, 9);
      expect(Math.hypot(frame.tangent[0], frame.tangent[1])).toBeCloseTo(1, 9);
      // Outward points away from the arena centre.
      expect(frame.center[0] * frame.outward[0] + frame.center[1] * frame.outward[1]).toBeGreaterThan(0);
    }
    expect(landmarkByTag('nw').center[0]).toBeLessThan(0);
  });

  it('is deterministic — identical calls produce identical placements', () => {
    const frame = FARCRYSIS_LANDMARKS[0];
    expect(landmarkTreePositions(frame)).toEqual(landmarkTreePositions(frame));
    expect(landmarkWallSpecs(frame)).toEqual(landmarkWallSpecs(frame));
    expect(landmarkCratePlacements(frame)).toEqual(landmarkCratePlacements(frame));
    expect(landmarkHedgePositions(frame)).toEqual(landmarkHedgePositions(frame));
    expect(landmarkFernPositions(frame)).toEqual(landmarkFernPositions(frame));
    expect(landmarkRubblePositions(frame)).toEqual(landmarkRubblePositions(frame));
    expect(landmarkWordmarkAnchor(frame)).toEqual(landmarkWordmarkAnchor(frame));
  });

  it('keeps every landmark placement inside the arena bounds with margin', () => {
    for (const frame of FARCRYSIS_LANDMARKS) {
      const points = [
        ...landmarkTreePositions(frame),
        ...landmarkWallSpecs(frame).map((w) => w.pos),
        ...landmarkCratePlacements(frame).map((c) => c.pos),
        ...landmarkHedgePositions(frame),
        ...landmarkFernPositions(frame),
        ...landmarkRubblePositions(frame),
      ];
      for (const [x, z] of points) {
        expect(x).toBeGreaterThanOrEqual(FARCRYSIS_BOUNDS.minX + 2);
        expect(x).toBeLessThanOrEqual(FARCRYSIS_BOUNDS.maxX - 2);
        expect(z).toBeGreaterThanOrEqual(FARCRYSIS_BOUNDS.minZ + 2);
        expect(z).toBeLessThanOrEqual(FARCRYSIS_BOUNDS.maxZ - 2);
      }
    }
  });

  it('blocks both spawn-to-spawn diagonals with grove trunk colliders', () => {
    const { arena } = (() => {
      const scene = new THREE.Scene();
      return { arena: buildFarcrysis(scene) };
    })();
    const audit = arena.root.userData.farcrysisColliderAudit as ReadonlyArray<{ id: string; bounds: Box2ish }>;
    const trunks = audit.filter((entry) => entry.id.startsWith('farcrysis-canopy-trunk-'));
    expect(trunks.length).toBe(FARCRYSIS_LANDMARKS.length * 3);

    // Each spawn pair sits on ±the main or anti-diagonal; a grove must sit
    // near each line so no full-length sniper lane survives.
    for (const sign of [1, -1] as const) {
      // Distance from a point (x,z) to the line z = sign*x is |z - sign*x|/sqrt2.
      const blockers = trunks.filter(({ bounds }) => {
        const cx = (bounds.minX + bounds.maxX) / 2;
        const cz = (bounds.minZ + bounds.maxZ) / 2;
        const radial = Math.hypot(cx, cz);
        const offLine = Math.abs(cz - sign * cx) / Math.SQRT2;
        return radial > 16 && radial < 36 && offLine < 3;
      });
      expect(blockers.length, `diagonal sign=${sign} has no grove blocker`).toBeGreaterThanOrEqual(2);
    }
  });

  it('never intersects a landmark collider with an unrelated collider', () => {
    const scene = new THREE.Scene();
    const arena = buildFarcrysis(scene);
    const audit = arena.root.userData.farcrysisColliderAudit as ReadonlyArray<{ id: string; bounds: Box2ish }>;
    const landmarkIds = audit
      .filter(({ id }) => /^farcrysis-(ruined-wall-(nw|ne|sw|se)-[ab]|canopy-trunk-(nw|ne|sw|se)-\d|crate-(nw|ne|sw|se)(-solo)?)$/.test(id));

    for (const entry of landmarkIds) {
      for (const other of audit) {
        if (other === entry) continue;
        // Designed contact: each crate abuts ITS OWN landmark's wall inner
        // face (stack_shapes against the ruin). Nothing else may touch.
        const crateMatch = entry.id.match(/^farcrysis-crate-(nw|ne|sw|se)/);
        const wallOfSameLandmark = crateMatch
          && other.id.startsWith(`farcrysis-ruined-wall-${crateMatch[1]}-`);
        if (wallOfSameLandmark) continue;
        const clash = boxesIntersect(entry.bounds, other.bounds)
          ? `${entry.id} intersects ${other.id}`
          : null;
        expect(clash, clash ?? '').toBeNull();
      }
    }
  });

  it('seats every landmark wall and crate on the terrain authority', () => {
    const scene = new THREE.Scene();
    const arena = buildFarcrysis(scene);
    const audit = arena.root.userData.farcrysisColliderAudit as ReadonlyArray<{ id: string; bounds: Box2ish & { minY?: number; maxY?: number } }>;
    for (const entry of audit) {
      if (!/^farcrysis-(ruined-wall-(nw|ne|sw|se)|crate-(nw|ne|sw|se))/.test(entry.id)) continue;
      const cx = (entry.bounds.minX + entry.bounds.maxX) / 2;
      const cz = (entry.bounds.minZ + entry.bounds.maxZ) / 2;
      const seat = entry.bounds.minY ?? Number.NaN;
      expect(Math.abs(seat - farcrysisTerrainHeight(cx, cz)), `${entry.id} seating`)
        .toBeLessThanOrEqual(0.06);
    }
  });

  it('anchors each wordmark plaque on its landmark crate cover in the built arena', () => {
    const scene = new THREE.Scene();
    const arena = buildFarcrysis(scene);
    const audit = arena.root.userData.farcrysisColliderAudit as ReadonlyArray<{ id: string; bounds: Box2ish }>;

    for (const frame of FARCRYSIS_LANDMARKS) {
      const anchor = landmarkWordmarkAnchor(frame);
      const plaque = arena.root.getObjectByName(`farcrysis-art-crate-stamp-${frame.tag}`);
      expect(plaque, `missing stamp plaque for ${frame.tag}`).toBeTruthy();

      // The plaque must agree EXACTLY with the shared module's anchor —
      // this is the proof the duplicated coordinate table is gone.
      expect(plaque!.position.x).toBeCloseTo(anchor.position[0], 5);
      expect(plaque!.position.y).toBeCloseTo(anchor.position[1], 5);
      expect(plaque!.position.z).toBeCloseTo(anchor.position[2], 5);

      // And the anchor must physically ride the matching builder cover.
      const coverEntry = audit.find((entry) => entry.id === `farcrysis-crate-${frame.tag}`);
      expect(coverEntry, `missing stack-base cover for ${frame.tag}`).toBeTruthy();
      const { bounds } = coverEntry!;
      expect(anchor.position[0]).toBeGreaterThanOrEqual(bounds.minX - 1.0);
      expect(anchor.position[0]).toBeLessThanOrEqual(bounds.maxX + 1.0);
      expect(anchor.position[2]).toBeGreaterThanOrEqual(bounds.minZ - 1.0);
      expect(anchor.position[2]).toBeLessThanOrEqual(bounds.maxZ + 1.0);
    }
  });

  it('composes each landmark from the full prop set (grove, wall pair, rubble, crates, hedge, ferns)', () => {
    for (const frame of FARCRYSIS_LANDMARKS) {
      expect(landmarkTreePositions(frame)).toHaveLength(3);
      expect(landmarkWallSpecs(frame)).toHaveLength(2);
      expect(landmarkRubblePositions(frame)).toHaveLength(2);
      expect(landmarkCratePlacements(frame)).toHaveLength(3);
      expect(landmarkHedgePositions(frame)).toHaveLength(4);
      expect(landmarkFernPositions(frame)).toHaveLength(6);
    }
  });
});
