import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import type { RenderPipeline, WebGPURenderer } from 'three/webgpu';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * THE FIRST-LOAD / SECOND-LOAD PARITY GATE (PASS 85, Lane I).
 *
 * The owner's statement of the defect was "map 1 lights differently from map
 * 2". Its cause was structural: the only PMREM generation site sat inside
 * `applyDefinition`, and the FIRST arena of a page load is the one that
 * CONSTRUCTS the systems object and therefore never reaches it, so
 * `scene.environment` stayed null for the whole of the first map of every
 * session (docs/IBL_FIRST_ARENA_BUG_2026-08-31.md).
 *
 * The 2026-08-31 fix gave both drivers one shared, post-admission bootstrap.
 * Nothing then measured the two load paths AGAINST EACH OTHER, so this file
 * does: it drives the real systems object through the caller's real order for
 * both paths and requires the resulting live environment receipt to be
 * IDENTICAL, field for field. A change that lights map 1 unlike map 2 fails
 * here, whichever of the two paths it moves.
 *
 * The behavioural half is paired with a call-site pin, because a green
 * behavioural test proves only that the systems object CAN converge - the
 * original defect was a caller that never asked it to. `scripts/qa/probe-ibl-
 * load-parity.mjs` is the same invariant measured in pixels on real hardware.
 */

// PMREM needs a real GPU device, so it is stubbed at the module boundary - and
// stubbed on 'three/webgpu' rather than 'three' on purpose. `THREE.PMREMGenerator`
// is the WebGL implementation: handed a WebGPURenderer it neither throws nor
// warns and returns a texture that carries no light. Where this mock lives is
// part of the contract (see arena-environment-ibl.test.ts).
const pmremInstances: Array<{ fromEquirectangular: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }> = [];

vi.mock('three/webgpu', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  class StubPmrem {
    compileEquirectangularShader = vi.fn(async () => {});
    dispose = vi.fn();
    fromEquirectangular = vi.fn(() => {
      const texture = new THREE.Texture();
      const target = { texture, height: 256, dispose: vi.fn() };
      return target as unknown as THREE.WebGLRenderTarget;
    });

    constructor() {
      pmremInstances.push(this);
    }
  }
  return { ...actual, PMREMGenerator: StubPmrem };
});

import { ARENA_VISUAL_REGISTRY } from './arena-visual-stream';
import { createPass64TslSceneSystems, type Pass65TslGraphicsOptions } from './pass64-tsl-scene';
import { SCREEN_SPACE_POST_DISABLED } from './screen-space-post-profile';
import type { ArenaVisualDefinition } from './arena-visual-definition';

// `hasInitialized()` is the WebGPU generator's own precondition; a stub that
// reported false would divert the module into `renderer.init()`.
const renderer = { hasInitialized: () => true } as unknown as WebGPURenderer;

const GRAPHICS: Pass65TslGraphicsOptions = Object.freeze({
  principalSamples: 4,
  volumetricScale: 1,
  ambientOcclusion: Object.freeze({
    quality: 'off', enabled: false, resolutionScale: 0, samples: 0, radius: 0, strength: 0, denoise: false,
  }),
  post: Object.freeze({
    bloomStrength: 0.14, exposureScale: 1, toneMapping: 'aces', filmGrainScale: 1, vignetteStrength: 0, sharpness: 0,
  }),
  reflectionScale: 1,
  reflectionQuality: 'high',
  environmentIntensity: 1,
  screenSpace: SCREEN_SPACE_POST_DISABLED,
}) as Pass65TslGraphicsOptions;

/**
 * The sky lifecycle both load paths sit on. `applySkyBackdrop` mounts a
 * procedural gradient SYNCHRONOUSLY and the generated .webp replaces it when it
 * decodes, which is why the environment is convolved after
 * `waitForSkyBackdropAdmission` and why the state keys regeneration on the
 * backdrop texture identity rather than on the arena id alone.
 */
function sky(name: string): THREE.Texture {
  const texture = new THREE.Texture();
  texture.name = name;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  return texture;
}

function newScene(): { scene: THREE.Scene; camera: THREE.Camera; pipeline: RenderPipeline } {
  return {
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(),
    pipeline: { outputNode: null } as unknown as RenderPipeline,
  };
}

/**
 * FIRST ARENA OF A PAGE LOAD, in the caller's real order: the definition is
 * applied (mounting the placeholder sky), the systems object is CONSTRUCTED -
 * the branch that reaches no PMREM call - the admitted sky replaces the
 * placeholder, and the shared bootstrap runs.
 */
async function firstLoadObservation(definition: ArenaVisualDefinition, admittedSkyName: string) {
  const { scene, camera, pipeline } = newScene();
  scene.background = sky(`${admittedSkyName}-procedural-placeholder`);
  const systems = createPass64TslSceneSystems(scene, camera, pipeline, definition, GRAPHICS, renderer);
  scene.background = sky(admittedSkyName);
  await systems.applyArenaEnvironment();
  return systems.observeArenaEnvironment();
}

/**
 * THE SAME ARENA REACHED BY AN IN-PAGE MAP SWITCH: the systems object already
 * exists (built by an earlier arena), so this arena takes `applyDefinition` -
 * which convolves whatever backdrop is mounted at that instant, i.e. the
 * placeholder - and then the same shared bootstrap after admission.
 */
async function secondLoadObservation(
  definition: ArenaVisualDefinition, admittedSkyName: string,
  earlier: ArenaVisualDefinition, earlierSkyName: string,
) {
  const { scene, camera, pipeline } = newScene();
  scene.background = sky(`${earlierSkyName}-procedural-placeholder`);
  const systems = createPass64TslSceneSystems(scene, camera, pipeline, earlier, GRAPHICS, renderer);
  scene.background = sky(earlierSkyName);
  await systems.applyArenaEnvironment();

  scene.background = sky(`${admittedSkyName}-procedural-placeholder`);
  await systems.applyDefinition(definition);
  scene.background = sky(admittedSkyName);
  await systems.applyArenaEnvironment();
  return systems.observeArenaEnvironment();
}

beforeEach(() => {
  pmremInstances.length = 0;
});

describe('first-load / second-load arena lighting parity', () => {
  it('lights the first arena of a page load exactly like the same arena reached by a map switch', async () => {
    const atomic = (await ARENA_VISUAL_REGISTRY['atomic-acres']()).definition;
    const rust = (await ARENA_VISUAL_REGISTRY['rustworks-1v1']()).definition;

    const first = await firstLoadObservation(atomic, 'sky-atomic-acres-admitted');
    const second = await secondLoadObservation(atomic, 'sky-atomic-acres-admitted', rust, 'sky-rustworks-admitted');

    // Field for field: presence, texture name, live intensity, the intensity
    // the arena's authored scale says it should be, the backdrop it was
    // convolved from, the PMREM tier and the cube size actually produced.
    expect(second).toEqual(first);
    expect(first.present).toBe(true);
    expect(first.matchesIblState).toBe(true);
    expect(first.environmentIntensity).toBe(first.expectedEnvironmentIntensity);
    // BOTH paths must end on the ADMITTED sky, never on the placeholder that
    // goes in synchronously ahead of it.
    expect(first.sourceTextureName).toBe('sky-atomic-acres-admitted');
  });

  it('holds for an arena whose environment scale is not the default, on both paths', async () => {
    const highSeas = (await ARENA_VISUAL_REGISTRY['high-seas']()).definition;
    const gunRange = (await ARENA_VISUAL_REGISTRY['gun-range']()).definition;

    const first = await firstLoadObservation(highSeas, 'sky-high-seas-admitted');
    const second = await secondLoadObservation(highSeas, 'sky-high-seas-admitted', gunRange, 'sky-gun-range-admitted');

    expect(second).toEqual(first);
    expect(first.environmentIntensity).toBe(first.expectedEnvironmentIntensity);
  });

  it('FAILS when the first-load bootstrap is skipped - the defect this gate exists for', async () => {
    // Sensitivity proof. Without this, a parity assertion between two paths
    // that both regressed the same way would still pass. Here the first-load
    // path is driven the pre-2026-08-31 way (construct, never bootstrap) and
    // the two observations must NOT match.
    const atomic = (await ARENA_VISUAL_REGISTRY['atomic-acres']()).definition;
    const rust = (await ARENA_VISUAL_REGISTRY['rustworks-1v1']()).definition;

    const { scene, camera, pipeline } = newScene();
    scene.background = sky('sky-atomic-acres-admitted');
    const systems = createPass64TslSceneSystems(scene, camera, pipeline, atomic, GRAPHICS, renderer);
    const brokenFirstLoad = systems.observeArenaEnvironment();
    expect(brokenFirstLoad.present).toBe(false);
    expect(scene.environment).toBeNull();

    const second = await secondLoadObservation(atomic, 'sky-atomic-acres-admitted', rust, 'sky-rustworks-admitted');
    expect(second).not.toEqual(brokenFirstLoad);
  });
});

/**
 * The call-site half. The behavioural tests above prove the systems object
 * CONVERGES when both paths are driven; the 2026-08-31 defect was a caller
 * that never drove one of them. These pins fail if the shared bootstrap moves
 * back inside a branch, loses its awaited admission, or stops being checked.
 */
describe('the caller drives both load paths through the one shared bootstrap', () => {
  const legacyMain = readFileSync('src/legacy-main.ts', 'utf8');
  const scene = readFileSync('src/rendering/pass64-tsl-scene.ts', 'utf8');

  /** Index just past the `}` that closes the block opened at `openIndex`. */
  function endOfBlock(source: string, openIndex: number): number {
    let depth = 0;
    for (let index = source.indexOf('{', openIndex); index < source.length; index += 1) {
      if (source[index] === '{') depth += 1;
      else if (source[index] === '}') {
        depth -= 1;
        if (depth === 0) return index;
      }
    }
    throw new Error('unbalanced block');
  }

  it('bootstraps the environment exactly once, after the sky admission, for EVERY arena', () => {
    const calls = legacyMain.match(/pass64TslSystems\.applyArenaEnvironment\(\)/gu) ?? [];
    expect(calls, 'one shared bootstrap, not one per branch').toHaveLength(1);

    const bootstrapIndex = legacyMain.indexOf('await pass64TslSystems.applyArenaEnvironment();');
    expect(bootstrapIndex, 'the bootstrap must be AWAITED').toBeGreaterThan(-1);

    // It has to run after the admitted sky is sealed, or the arenas with
    // generated skies convolve the synchronous procedural placeholder.
    const admissionIndex = legacyMain.lastIndexOf('await waitForSkyBackdropAdmission(scene);', bootstrapIndex);
    expect(admissionIndex, 'the bootstrap must follow an awaited sky admission').toBeGreaterThan(-1);

    // And it has to sit OUTSIDE the construction branch. `pass64TslSystems` is
    // created once per page, so anything inside that `else` runs for the first
    // arena only - which is the whole defect.
    const constructionIndex = legacyMain.indexOf('pass64TslSystems = createPass64TslSceneSystems(');
    expect(constructionIndex).toBeGreaterThan(-1);
    const elseIndex = legacyMain.lastIndexOf('else {', constructionIndex);
    expect(bootstrapIndex, 'the bootstrap must not live in the first-arena-only branch')
      .toBeGreaterThan(endOfBlock(legacyMain, elseIndex));

    // The map-switch driver is awaited too: unawaited, a commit could resolve
    // before its environment landed (measured at t=20862 ms on a map switch).
    expect(legacyMain).toContain('if (pass64TslSystems) await pass64TslSystems.applyDefinition(module.definition);');

    // The live receipt is checked on every arena commit, immediately after.
    const assertIndex = legacyMain.indexOf('assertArenaEnvironmentLive(pass64TslSystems.observeArenaEnvironment());');
    expect(assertIndex).toBeGreaterThan(bootstrapIndex);
  });

  it('keeps ONE generation site, so the two paths cannot drift apart again', () => {
    // Three drivers - definition commit, explicit bootstrap, graphics change -
    // and exactly one call to the generator. Two call sites is how map 1 and
    // map 2 diverged in the first place.
    expect(scene.match(/await applyArenaEnvironmentIbl\(/gu) ?? []).toHaveLength(1);
    expect(scene).toContain('applyArenaEnvironment: async () => {');
    expect(scene).toContain('if (canSyncArenaEnvironmentIbl()) await syncArenaEnvironmentIbl();');
  });
});
