import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { buildMap3, map3ArenaSky, prepareMap3 } from '../map3-arena';
import type { ArenaFrameContext } from '../arena-frame-animation';

/**
 * MAP3-SKY: the sun fix used to land on the demo page only. `createSky` was
 * imported by `map3/main.ts` and `signature.test.ts` and by nothing the player
 * loads. These tests pin the wiring that reaches the game: the arena root
 * carries the sky, the arena tick moves the sun, and the lowest tier degrades
 * to the authored backdrop.
 *
 * `buildMap3` is synchronous but its eighth corridor needs a wasm module
 * first: one top-level await resolves it for every build below.
 */
await prepareMap3();

const frameContext = (): ArenaFrameContext => ({
  arenaId: 'map3',
  cameraPosition: new THREE.Vector3(0, 2.6, 6),
  playerVelocity: new THREE.Vector3(),
});

describe('map3 arena sky wiring (MAP3-SKY)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('attaches the showcase sky to the arena root at the origin, unrotated and unscaled', () => {
    const scene = new THREE.Scene();
    const arena = buildMap3(scene);
    const sky = map3ArenaSky(arena.root);
    expect(sky).not.toBeNull();
    expect(sky!.group.parent).toBe(arena.root);
    expect(sky!.group.name).toBe('map3-arena-sky');
    expect(sky!.group.position.length()).toBe(0);
    expect([sky!.group.rotation.x, sky!.group.rotation.y, sky!.group.rotation.z]).toEqual([0, 0, 0]);
    expect(sky!.group.scale.toArray()).toEqual([1, 1, 1]);
    expect(scene.getObjectByName('map3-arena-sky')).toBe(sky!.group);
    // Dome, sun, planet, plus the cloud layers.
    expect(sky!.group.children.length).toBeGreaterThanOrEqual(3);
  });

  it('marks the sky dynamic so the batcher and the matrix freeze skip the moving subtree', () => {
    const arena = buildMap3(new THREE.Scene());
    const sky = map3ArenaSky(arena.root);
    expect(sky!.group.userData.dynamic).toBe(true);
  });

  it('advances the visible sun on the arena tick', () => {
    const arena = buildMap3(new THREE.Scene());
    expect(typeof arena.update).toBe('function');
    const sky = map3ArenaSky(arena.root)!;
    arena.update!(0, 0.016, frameContext());
    expect(sky.sunDirection.length()).toBeCloseTo(1, 5);
    const before = sky.sunDirection.clone();
    // Ten seconds is a quarter of the 40 s orbit: the disc must be far away.
    arena.update!(10, 0.016, frameContext());
    expect(sky.sunDirection.length()).toBeCloseTo(1, 5);
    expect(sky.sunDirection.distanceTo(before)).toBeGreaterThan(0.5);
  });

  it('hides the dome on the lowest tier so compat keeps the authored backdrop', () => {
    // Node has no DOM, so the tier read degrades to full sky. A document stub
    // exercises the compat path; the street-cell sign takes the canvas branch
    // behind the same stub, so it gets a no-op 2D context.
    const noop = () => undefined;
    const canvasStub = () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        fillStyle: '',
        font: '',
        textBaseline: '',
        textAlign: '',
        fillRect: noop,
        fillText: noop,
      }),
    });
    vi.stubGlobal('document', {
      documentElement: { dataset: { graphicsLiveProfile: 'compat' } },
      createElement: (tag: string) => {
        if (tag === 'canvas') return canvasStub();
        return {};
      },
    });
    const arena = buildMap3(new THREE.Scene());
    const sky = map3ArenaSky(arena.root)!;
    arena.update!(1, 0.016, frameContext());
    expect(sky.group.visible).toBe(false);
  });

  it('shows the dome when no tier is readable', () => {
    const arena = buildMap3(new THREE.Scene());
    const sky = map3ArenaSky(arena.root)!;
    arena.update!(1, 0.016, frameContext());
    expect(sky.group.visible).toBe(true);
  });

  it('disposes without throwing', () => {
    const arena = buildMap3(new THREE.Scene());
    const sky = map3ArenaSky(arena.root)!;
    expect(() => sky.dispose()).not.toThrow();
  });
});
