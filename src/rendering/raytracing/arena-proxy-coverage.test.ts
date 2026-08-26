import * as THREE from 'three';
import { describe, expect, it, beforeAll } from 'vitest';
import { extractProxyScene, REFLECTIVE_ROUGHNESS_CEILING } from './analytic-proxy-scene';
import { ARENA_PROXY_EXTRACTION } from './arena-proxy-registration';
import { RAY_TRACED_MAXIMUM_SHAPES } from './raytracing-profile';
import { ALL_ARENA_IDS } from '../../../scripts/qa/collider-visual-parity-core';

/**
 * RAY TRACED preset coverage gate.
 *
 * The preset itself has worked for some time. What it did not have was
 * anything to reflect: measured on the pass79 tree, the proxy extractor
 * classified 3/0/0/0/0/0 meshes as reflective across the six arenas, so on
 * five of six maps a correctly-implemented reflection layer rendered exactly
 * nothing and there was no gate to say so.
 *
 * `arena-proxy-registration.ts` fixed the biggest hole - water, the surface
 * class that is reflective by design, had no registration path at all - but
 * the coverage contract that keeps it fixed was never written. This is it.
 *
 * The gate is deliberately a RATCHET on measured counts rather than a
 * hand-picked target. Reflective coverage is a property of the art, not
 * something a renderer flag can assert into existence, so the only honest
 * contract is "never fewer than we have now, and never zero anywhere".
 *
 * RESOLVED 2026-08-26: atomic-acres sat at two reflective meshes because its
 * `chrome` palette entry - the ramp rails, both garage doors, the irrigation
 * vessel, the entrance canopies - was authored at roughness 0.230 against the
 * 0.22 mirror ceiling. One hundredth outside. The ceiling is combat-tuned and
 * did NOT move; the material was polished to 0.18 instead, which is what a
 * material named `chrome` at metalness 0.76 should have been. Coverage went
 * 2 meshes / 14 m2 -> 7 meshes / 68 m2, and the floors below were re-measured
 * against the polished value.
 */

const EXTRACTION = ARENA_PROXY_EXTRACTION;

/**
 * Measured floors, captured 2026-08-26 on the six shipped arena builders.
 * Raise them when art genuinely adds reflective surface; never lower one to
 * make a build pass.
 */
const COVERAGE_FLOOR: Record<string, { meshes: number; footprintM2: number }> = {
  'atomic-acres': { meshes: 7, footprintM2: 68 },
  'rustworks-1v1': { meshes: 1, footprintM2: 6 },
  'gun-range': { meshes: 6, footprintM2: 4_300 },
  'skyline-terminal': { meshes: 10, footprintM2: 440 },
  farcrysis: { meshes: 3, footprintM2: 300_000 },
  'high-seas': { meshes: 16, footprintM2: 150 },
};

type Coverage = {
  reflectiveMeshCount: number;
  reflectiveFootprintM2: number;
  shapes: number;
  candidatesConsidered: number;
};

const coverage = new Map<string, Coverage>();

beforeAll(async () => {
  // environment-assets reads window.location.search at call time and several
  // builders draw signage through a 2D context; the same offscreen shims the
  // collider-parity audit installs are enough here (texture CONTENT does not
  // affect which surfaces are smooth).
  const globals = globalThis as Record<string, unknown>;
  globals.window ??= { location: { search: '' } };
  globals.document ??= (() => {
    const context = new Proxy({}, {
      get(_target, property) {
        if (property === 'createImageData') {
          return (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
        }
        if (property === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
        if (property === 'createLinearGradient' || property === 'createRadialGradient') {
          return () => ({ addColorStop: () => undefined });
        }
        if (property === 'measureText') return () => ({ width: 10 });
        return () => undefined;
      },
      set() { return true; },
    });
    return {
      createElement: () => ({
        width: 0, height: 0, style: {}, getContext: () => context,
        setAttribute: () => undefined, appendChild: () => undefined, remove: () => undefined,
      }),
      createElementNS: () => ({
        width: 0, height: 0, style: {}, src: '',
        setAttribute: () => undefined, removeAttribute: () => undefined,
        addEventListener: () => undefined, removeEventListener: () => undefined,
      }),
      getElementById: () => null,
      documentElement: { dataset: { renderBackend: 'webgpu' } },
      body: { appendChild: () => undefined },
    };
  })();
  globals.HTMLCanvasElement ??= class {};

  const [
    { buildArena },
    { buildGunRange, buildRustworks1v1, buildSkylineTerminal },
    { buildFarcrysis },
    { buildHighSeas },
    { addNeighbourhoodLife, loadArenaArt },
  ] = await Promise.all([
    import('../../map'),
    import('../../additional-maps'),
    import('../../farcrysis'),
    import('../../high-seas'),
    import('../../environment-assets'),
  ]);

  const factories: Record<string, (scene: THREE.Scene) => unknown> = {
    'atomic-acres': buildArena,
    'rustworks-1v1': buildRustworks1v1,
    'gun-range': buildGunRange,
    'skyline-terminal': buildSkylineTerminal,
    farcrysis: buildFarcrysis,
    'high-seas': (scene: THREE.Scene) => buildHighSeas(scene),
  };

  for (const id of ALL_ARENA_IDS) {
    const scene = new THREE.Scene();
    const arena = factories[id](scene) as { root?: THREE.Object3D };
    // atomic-acres' street dressing and arena art are separate passes; the
    // reflective surfaces they add are part of what the preset sees live.
    if (id === 'atomic-acres') {
      addNeighbourhoodLife(scene, false);
      await loadArenaArt(scene, undefined, false);
    }
    const proxy = extractProxyScene(arena.root ?? scene, THREE, EXTRACTION);
    coverage.set(id, {
      reflectiveMeshCount: proxy.reflectiveMeshCount,
      reflectiveFootprintM2: proxy.reflectiveFootprintM2,
      shapes: proxy.shapes.length,
      candidatesConsidered: proxy.candidatesConsidered,
    });
  }
}, 600_000);

describe('RAY TRACED arena proxy coverage', () => {
  it('gives the tracer something to reflect on every arena', () => {
    const empty = ALL_ARENA_IDS.filter((id) => (coverage.get(id)?.reflectiveMeshCount ?? 0) === 0);
    // The exact pass79 defect: five of six arenas at zero, with the preset
    // reporting itself healthy the whole time.
    expect(empty, `arenas with nothing reflective: ${empty.join(', ')}`).toEqual([]);
  });

  it('never drops below the measured per-arena coverage floor', () => {
    for (const id of ALL_ARENA_IDS) {
      const measured = coverage.get(id)!;
      const floor = COVERAGE_FLOOR[id];
      expect(
        measured.reflectiveMeshCount,
        `${id} reflective meshes (measured ${measured.reflectiveMeshCount}, floor ${floor.meshes})`,
      ).toBeGreaterThanOrEqual(floor.meshes);
      expect(
        measured.reflectiveFootprintM2,
        `${id} reflective footprint m2 (measured ${measured.reflectiveFootprintM2.toFixed(1)}, floor ${floor.footprintM2})`,
      ).toBeGreaterThanOrEqual(floor.footprintM2);
    }
  });

  it('keeps every arena inside the shader-cost shape budget', () => {
    for (const id of ALL_ARENA_IDS) {
      const measured = coverage.get(id)!;
      // The proxy set is packed into a fixed-size uniform array. Overrunning
      // it does not degrade gracefully - it silently drops shapes past the
      // end, or writes out of bounds.
      expect(measured.shapes, `${id} packed proxy shapes`).toBeLessThanOrEqual(RAY_TRACED_MAXIMUM_SHAPES);
      expect(measured.shapes, `${id} packed proxy shapes`).toBeGreaterThan(0);
    }
  });

  it('holds the combat-tuned mirror ceiling where the registration says it is', () => {
    // arena-proxy-registration.ts states the ceiling must not move and that
    // coverage is bought with art edits instead. If this number ever changes,
    // every floor above was measured against a different rule.
    expect(REFLECTIVE_ROUGHNESS_CEILING).toBe(0.22);
    // The registration must not widen the cost bounds either.
    expect(EXTRACTION.maximumShapes).toBe(RAY_TRACED_MAXIMUM_SHAPES);
  });
});
