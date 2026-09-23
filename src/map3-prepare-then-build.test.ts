import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { MAP3_LANES, buildMap3, isMap3Prepared, prepareMap3 } from './map3-arena';

/**
 * THE ONE THING PREPARE-THEN-BUILD PROMISES, ASSERTED.
 *
 * `buildMap3` is a synchronous constructor like every other arena builder, but
 * its eighth corridor (the Rapier playground) needs a wasm module that can only
 * be fetched asynchronously. The design decision was that it must THROW rather
 * than quietly return seven corridors, because an arena silently missing an
 * eighth of its content, colliders and shot surfaces "would pass every gate
 * that counts what it can see and be measured, ledgered and published as whole".
 *
 * Every other Map 3 test awaits `prepareMap3()` at module scope, so all of them
 * exercise the PREPARED path and none of them could ever have caught the throw
 * being deleted, weakened to a console warning, or turned into a silent
 * seven-corridor return. This file is the only place the unprepared path is
 * exercised at all, which is why it must NOT call `prepareMap3()` before the
 * first test - and why the first assertion is that preparation has not already
 * happened, so the test fails loudly rather than passing vacuously if module
 * isolation ever stops holding.
 *
 * Order matters here: vitest runs a file's tests sequentially, and preparation
 * is memoised per process and cannot be undone.
 */
describe('Map 3 prepare-then-build', () => {
  it('throws, loudly and with the fix named, when built unprepared', () => {
    // If this is already true, some other module prepared first and the rest of
    // this test would prove nothing. Fail rather than pass vacuously.
    expect(isMap3Prepared()).toBe(false);

    expect(() => buildMap3(new THREE.Scene())).toThrow(/has not been prepared/u);

    // A thrown error is only useful if it says what to do. Pin the actionable
    // half, not just the fact of throwing.
    let message = '';
    try {
      buildMap3(new THREE.Scene());
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain('prepareMap3()');
    expect(message).toContain('prepareArena');
    expect(message).toContain('Rapier playground');
  });

  it('leaves nothing half-built behind when it throws', () => {
    // The throw is the FIRST statement of the builder, before any mesh is made.
    // A builder that threw halfway would leave a partial arena in the scene and
    // a retry would double it.
    const scene = new THREE.Scene();
    expect(() => buildMap3(scene)).toThrow();
    expect(scene.children).toHaveLength(0);
  });

  it('builds all eight corridors once prepared, and is then idempotent', async () => {
    await prepareMap3();
    expect(isMap3Prepared()).toBe(true);

    const scene = new THREE.Scene();
    const arena = buildMap3(scene);
    expect(arena).toBeDefined();

    // Every declared lane is really in the built scene - the eighth included.
    // Counting MAP3_LANES against itself would prove nothing, so this asks the
    // SCENE for each lane group by name.
    for (const lane of MAP3_LANES) {
      expect(scene.getObjectByName(`map3-lane-${lane.id}`), `lane group for ${lane.id}`).toBeDefined();
    }
    expect(MAP3_LANES).toHaveLength(8);
    expect(scene.getObjectByName('map3-lane-physics'), 'the eighth corridor').toBeDefined();

    // Idempotent: a second prepare must not throw, re-init Rapier, or matter.
    await prepareMap3();
    expect(isMap3Prepared()).toBe(true);
    expect(() => buildMap3(new THREE.Scene())).not.toThrow();
  });
});
