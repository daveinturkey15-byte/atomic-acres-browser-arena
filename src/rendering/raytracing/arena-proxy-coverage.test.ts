import * as THREE from 'three';
import { describe, expect, it, beforeAll } from 'vitest';
import { extractProxyScene, REFLECTIVE_ROUGHNESS_CEILING } from './analytic-proxy-scene';
import { ARENA_PROXY_EXTRACTION, ARENA_WATER_SURFACES } from './arena-proxy-registration';
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
 * did NOT move; the material was polished to 0.18 instead.
 *
 * PASS 81 - THE GATE WAS MEASURING A SCENE THE PLAYER NEVER SEES. Three ways,
 * all of which made the floors below smaller than the truth and left the parts
 * most likely to break uncovered:
 *
 *   1. It extracted from `arena.root`. Production extracts from the camera's
 *      TOPMOST ANCESTOR (`raytraced-light-node.ts` sceneRoot()), i.e. the whole
 *      THREE.Scene, so everything a builder parents to the scene rather than to
 *      its own root - the atomic-acres street dressing and arena art this file
 *      already went to the trouble of loading - contributed nothing.
 *   2. It never called `updateMatrixWorld`. Every proxy was therefore fitted to
 *      LOCAL bounds: a mesh authored at the origin and moved into place by its
 *      parent measured its own size at the wrong scale and rotation. Turning
 *      world matrices on moved atomic-acres 7 -> 11 reflective meshes and
 *      farcrysis 3 -> 4 before a single other change.
 *   3. It built arena geometry only. On the WebGPU route - the ONLY route the
 *      RAY TRACED preset exists on - `createPass64TslSceneSystems` adds the
 *      shared sky, grass and perimeter ocean to the same scene. That ocean,
 *      `Pass 64 TSL perimeter water`, is the single surface class
 *      `arena-proxy-registration.ts` was written for, and it was never once
 *      exercised here. It is worth 921,600 m2 on rustworks-1v1 and high-seas.
 *
 * A fourth defect fell out of fixing the third: every registered sea plane is
 * zero-thickness by construction, and only survived the extractor's degeneracy
 * guard because cos(-PI/2) is 6.12e-17. See `analytic-proxy-scene.test.ts`.
 */

const EXTRACTION = ARENA_PROXY_EXTRACTION;

/**
 * Measured floors, RE-MEASURED 2026-08-28 against the production traversal
 * (whole scene, world matrices updated, Pass 64 TSL presentation systems
 * present). Every one of them rose. Raise them when art genuinely adds
 * reflective surface; never lower one to make a build pass.
 *
 *                    2026-08-26 (arena.root)   2026-08-28 (production root)
 *   atomic-acres        7 /        68 m2         13 /       200.6 m2
 *   rustworks-1v1       1 /         6 m2          2 /   921,606.4 m2
 *   gun-range           6 /     4,300 m2          6 /     4,307.2 m2
 *   skyline-terminal   10 /       440 m2         10 /       447.4 m2
 *   farcrysis           3 /   300,000 m2          4 /   326,176.0 m2
 *   high-seas          16 /       150 m2         17 /   921,753.4 m2
 */
const COVERAGE_FLOOR: Record<string, { meshes: number; footprintM2: number }> = {
  // DECLUTTER 2026-08-29: the chrome vessel, greenhouse glass and solar
  // hardware left the map (owner-called clutter), taking three reflective
  // proxies with them - floor re-measured at 10.
  'atomic-acres': { meshes: 10, footprintM2: 142 },
  'rustworks-1v1': { meshes: 2, footprintM2: 921_600 },
  'gun-range': { meshes: 6, footprintM2: 4_300 },
  'skyline-terminal': { meshes: 10, footprintM2: 447 },
  farcrysis: { meshes: 4, footprintM2: 326_000 },
  'high-seas': { meshes: 17, footprintM2: 921_700 },
  // Owner 2026-08-30: measured on the authored builds - test1 tower glazing
  // (extraction admits the large north pane), test2 pool water + car glass.
  test1: { meshes: 1, footprintM2: 3 },
  // TEST2 RE-PINNED UPWARD 2026-08-31, because the layout rebuild
  // (docs/TEST2_RAID_LAYOUT_SPEC_2026-08-31.md) demolished the villa wings and
  // the motor-court orangeries and took their glazing with them: the rebuild
  // first measured 2 meshes against this floor of 3, i.e. the preset lost half
  // its reflective coverage on this arena. The fix was to author the windows
  // back - a glazed door recessed into the living room's south wall, one into
  // the kitchen's, and one into the gallery's north wall, each set inside its
  // wall's own thickness so the ballistic and movement censuses still explain
  // it. Re-measured at 5 meshes / 280.9 m2, and the floor is raised to the new
  // measurement rather than left at the old one, so this coverage cannot be
  // silently spent later.
  test2: { meshes: 5, footprintM2: 280 },
  // MAP3 (owner 2026-09-02, HF-405 then HF-409). RE-MEASURED after the arena
  // became the corridor showcase: the two authored basins of the stone gallery
  // are gone and what replaced them is the real thing - the shoreline
  // corridor's 41 x 54 m Gerstner sea, plus the shape-grammar corridor's glass
  // tower. 2 meshes / 2,203.6 m2 against the old 272, so the floor RISES to
  // 2,200 rather than staying where it was: this arena now carries the second
  // largest reflective body in the game and that coverage must not be
  // silently spent later. The sea needs its name registered in
  // ARENA_WATER_SURFACES to be seen at all - its gloss is a TSL Fresnel chain
  // and `material.roughness` reads it as matte, the same blind spot the
  // shared ocean's registration exists for.
  map3: { meshes: 2, footprintM2: 2200 },
};

type Coverage = {
  reflectiveMeshCount: number;
  reflectiveFootprintM2: number;
  shapes: number;
  candidatesConsidered: number;
  /** Names of the shapes that actually reached the packed set. */
  shapeNames: readonly string[];
  planeNames: readonly string[];
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
    { buildTest1, buildTest2 },
    // MAP3 (owner 2026-09-02, HF-405): Map 3 joins the proxy-coverage sweep.
    { buildMap3 },
    { addNeighbourhoodLife, loadArenaArt },
    { ARENA_VISUAL_REGISTRY },
    { createPass64TslSceneSystems },
  ] = await Promise.all([
    import('../../map'),
    import('../../additional-maps'),
    import('../../farcrysis'),
    import('../../high-seas'),
    import('../../test-maps'),
    import('../../map3-arena'),
    import('../../environment-assets'),
    import('../arena-visual-stream'),
    import('../pass64-tsl-scene'),
  ]);

  const factories: Record<string, (scene: THREE.Scene) => unknown> = {
    'atomic-acres': buildArena,
    'rustworks-1v1': buildRustworks1v1,
    'gun-range': buildGunRange,
    'skyline-terminal': buildSkylineTerminal,
    farcrysis: buildFarcrysis,
    'high-seas': (scene: THREE.Scene) => buildHighSeas(scene),
    // Owner 2026-08-30: Test1/Test2 join the proxy-coverage sweep.
    test1: buildTest1,
    test2: buildTest2,
    // MAP3 (owner 2026-09-02, HF-405).
    map3: buildMap3,
  };

  for (const id of ALL_ARENA_IDS) {
    const scene = new THREE.Scene();
    factories[id](scene);
    // atomic-acres' street dressing and arena art are separate passes; the
    // reflective surfaces they add are part of what the preset sees live.
    if (id === 'atomic-acres') {
      addNeighbourhoodLife(scene, false);
      await loadArenaArt(scene, undefined, false);
    }
    // The preset exists only on the WebGPU route, and on that route the shared
    // TSL presentation systems - sky, grass and the perimeter ocean the water
    // registration is written for - are added to this same scene before the
    // first frame (legacy-main -> createPass64TslSceneSystems). A gate that
    // omits them is not measuring the preset's scene.
    const camera = new THREE.PerspectiveCamera();
    scene.add(camera);
    const definition = (await ARENA_VISUAL_REGISTRY[id as keyof typeof ARENA_VISUAL_REGISTRY]()).definition;
    createPass64TslSceneSystems(scene, camera, { outputNode: null } as never, definition);
    // Production fits proxies to WORLD bounds during the frame loop, after the
    // renderer has updated matrices. Fitting them to stale local matrices
    // measures a different arena.
    scene.updateMatrixWorld(true);
    // Exactly `raytraced-light-node.ts` sceneRoot(): walk up from the camera.
    let root: THREE.Object3D = camera;
    while (root.parent) root = root.parent;
    expect(root, `${id} scene root`).toBe(scene);
    const proxy = extractProxyScene(root, THREE, EXTRACTION);
    coverage.set(id, {
      reflectiveMeshCount: proxy.reflectiveMeshCount,
      reflectiveFootprintM2: proxy.reflectiveFootprintM2,
      shapes: proxy.shapes.length,
      candidatesConsidered: proxy.candidatesConsidered,
      shapeNames: proxy.shapes.map(({ name }) => name),
      planeNames: proxy.shapes.filter(({ kind }) => kind === 'plane').map(({ name }) => name),
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

  it('actually traces the registered water on the arenas that have it', () => {
    // The aggregate floors above can be held by architecture alone, so the one
    // surface class `arena-proxy-registration.ts` exists for gets its own gate,
    // by NAME. Before Pass 81 this registration had never contributed a proxy
    // on any arena: the coverage gate built no TSL presentation systems, so the
    // shared ocean was not in the scene it measured.
    const seaArenas = ['rustworks-1v1', 'high-seas'] as const;
    for (const id of seaArenas) {
      const measured = coverage.get(id)!;
      expect(
        measured.planeNames,
        `${id} traced planes (packed shapes: ${measured.shapeNames.join(', ')})`,
      ).toContain('Pass 64 TSL perimeter water');
    }
    // farcrysis authors its own waterline in the arena builder rather than
    // taking the shared ocean, and registers four planes for it.
    const farcrysisPlanes = coverage.get('farcrysis')!.planeNames;
    expect(farcrysisPlanes.length, `farcrysis traced planes: ${farcrysisPlanes.join(', ')}`).toBeGreaterThan(0);
    for (const name of farcrysisPlanes) {
      expect(ARENA_WATER_SURFACES.some(({ namePattern }) => namePattern.test(name)), name).toBe(true);
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
