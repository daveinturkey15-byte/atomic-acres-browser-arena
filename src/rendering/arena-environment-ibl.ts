import * as THREE from 'three';
// THE PMREM GENERATOR MUST COME FROM 'three/webgpu', NOT FROM 'three'.
//
// `THREE.PMREMGenerator` is the WebGL implementation. Handed a WebGPURenderer
// it does not throw, does not warn, and returns a render target whose texture
// carries NO LIGHT: measured 2026-08-31, driving scene.environmentIntensity to
// 20 with that texture bound moved the mean frame luminance by 0.0000, while
// binding a plain equirect texture at the arena's authored 0.22 moved it by
// +7.8%. The module had a one-line comment claiming the cast "accepts the
// WebGPU renderer at runtime because it detects the backend itself". It does
// not. `three/webgpu` ships its own PMREMGenerator built against the Renderer
// API (three/src/renderers/common/extras/PMREMGenerator.js) and that is the
// only one that produces a usable environment on this route.
import { PMREMGenerator, type WebGPURenderer } from 'three/webgpu';
import type { ArenaId } from '../map-selection';
import { arenaEnvironmentScale } from '../graphics-refinement';
import { skyBackdropPreset } from './sky-backdrop';

export { skyBackdropPreset };

/** PMREM resolution tiers gated by reflectionQuality graphics setting. */
export type PmremResolutionTier = 128 | 256 | 512;

/** The reflection quality tiers this module understands. */
export type IblReflectionQuality = 'off' | 'low' | 'high' | 'ultra';

/** State for the active arena's IBL environment map. */
export type ArenaIblState = Readonly<{
  /** The PMREM-generated environment texture bound to scene.environment. */
  environmentTexture: THREE.Texture | null;
  /** The render target holding the PMREM cubemap (must be disposed on switch). */
  pmremTarget: THREE.RenderTarget | null;
  /** The arena ID this IBL state belongs to. */
  arenaId: ArenaId | null;
  /**
   * The REQUESTED tier from the reflectionQuality setting.
   *
   * Not, currently, the size of the thing that was produced: the WebGPU
   * `fromEquirectangular` derives its cube size from the source panorama and
   * takes no size option, so this value gates regeneration and nothing else.
   * `generatedCubeSize` is what actually came out. Keeping both is the point -
   * the previous single field was named as though it described the output and
   * was only ever an input.
   */
  resolutionTier: PmremResolutionTier;
  /** The cube face size the generator actually produced, observed off the target. */
  generatedCubeSize: number;
  /** The graphics budget environment intensity at time of generation. */
  budgetEnvironmentIntensity: number;
  /** The arena's authored environment scale at time of generation. */
  arenaEnvironmentScale: number;
  /** The reflectionScale (from reflectionQuality setting) at time of generation. */
  reflectionScale: number;
  /**
   * The exact `scene.background` texture this PMREM was convolved from.
   *
   * Three of the eight arenas swap their backdrop asynchronously: the
   * procedural gradient goes in synchronously and a generated equirect .webp
   * replaces it when it decodes (`sky-backdrop.ts` admission). Keying
   * regeneration on arena id alone therefore silently pins the environment to
   * whichever sky happened to be mounted first, which is normally the
   * placeholder. Holding the source texture makes "the sky changed under us"
   * a first-class regeneration reason instead of an invisible one.
   */
  sourceTexture: THREE.Texture | null;
}>;

const prewarmedArenaIbl = new Map<string, ArenaIblState>();
const pendingArenaIblPrewarms = new Map<string, Promise<void>>();

function arenaIblCacheKey(
  arenaId: ArenaId,
  resolution: PmremResolutionTier,
  sourceTexture: THREE.Texture,
): string {
  return `${arenaId}:${resolution}:${sourceTexture.uuid}`;
}

/** Creates a new empty IBL state. */
function createEmptyIblState(): ArenaIblState {
  return Object.freeze({
    environmentTexture: null,
    pmremTarget: null,
    arenaId: null,
    resolutionTier: 128,
    budgetEnvironmentIntensity: 0,
    arenaEnvironmentScale: 0,
    reflectionScale: 0,
    sourceTexture: null,
    generatedCubeSize: 0,
  });
}

/** Maps reflectionQuality to PMREM resolution tier. */
export function pmremResolutionForReflectionQuality(reflectionQuality: IblReflectionQuality): PmremResolutionTier {
  return reflectionQuality === 'ultra' ? 512 : reflectionQuality === 'high' ? 256 : 128;
}

/**
 * Generates a PMREM environment map from the current scene.background (sky backdrop).
 * Called once per arena switch on the WebGPU path.
 */
export async function generateArenaEnvironmentMap(
  renderer: WebGPURenderer,
  scene: THREE.Scene,
  arenaId: ArenaId,
  reflectionQuality: IblReflectionQuality,
  budgetEnvironmentIntensity: number,
  reflectionScale: number,
): Promise<ArenaIblState> {
  const resolution = pmremResolutionForReflectionQuality(reflectionQuality);
  const arenaScale = arenaEnvironmentScale(arenaId);

  // The sky backdrop must already be applied to scene.background by applySkyBackdrop
  const backgroundTexture = scene.background as THREE.Texture | null;
  if (!backgroundTexture) {
    throw new Error(`Arena ${arenaId}: no sky backdrop applied to scene.background before PMREM generation`);
  }

  // Ensure the background texture is configured for PMREM (equirectangular reflection mapping)
  backgroundTexture.mapping = THREE.EquirectangularReflectionMapping;
  backgroundTexture.colorSpace = THREE.SRGBColorSpace;

  // The WebGPU generator refuses to run before the backend is up, by design.
  // `init()` on an already-initialised renderer resolves the existing promise,
  // so this is a fence rather than a second initialisation.
  if (!renderer.hasInitialized()) await renderer.init();
  const pmrem = new PMREMGenerator(renderer);
  await pmrem.compileEquirectangularShader();

  // PMREM the equirect SKY TEXTURE, not the live scene. fromScene renders every
  // mesh in the scene through PMREM's cube camera - including a count-0
  // placeholder geometry - which produced the farcrysis boot's three
  // "computeBoundingSphere(): radius is NaN" warnings and made the environment
  // depend on whatever happened to be in the scene at switch time. The sky
  // backdrop IS the arena's authored environment; sampling it directly renders
  // zero scene meshes, so that NaN class cannot exist here.
  const pmremTarget = pmrem.fromEquirectangular(backgroundTexture);
  const environmentTexture = pmremTarget.texture;
  environmentTexture.name = `pass64-arena-environment-${arenaId}-${resolution}`;
  // Deliberately NO mapping/colorSpace overrides: PMREM output carries its own
  // CubeUV mapping that the renderer detects; forcing CubeReflectionMapping on
  // it breaks environment sampling silently.

  // Apply to scene.environment with combined intensity
  scene.environment = environmentTexture;
  scene.environmentIntensity = budgetEnvironmentIntensity * arenaScale * reflectionScale;

  pmrem.dispose();

  return Object.freeze({
    environmentTexture,
    pmremTarget,
    arenaId,
    resolutionTier: resolution,
    budgetEnvironmentIntensity,
    arenaEnvironmentScale: arenaScale,
    reflectionScale,
    sourceTexture: backgroundTexture,
    generatedCubeSize: pmremTarget.height,
  });
}

/**
 * Builds the selected menu arena's environment before deployment. The menu has
 * already admitted the sky, so this GPU bake does not compete with the first
 * gameplay submission. The transition consumes the result by the exact
 * source-texture identity; a different selected sky never receives a stale
 * probe.
 */
export async function prewarmArenaEnvironmentIbl(
  renderer: WebGPURenderer,
  scene: THREE.Scene,
  arenaId: ArenaId,
  reflectionQuality: IblReflectionQuality,
  budgetEnvironmentIntensity: number,
  reflectionScale: number,
): Promise<void> {
  const sourceTexture = scene.background as THREE.Texture | null;
  if (!sourceTexture || reflectionQuality === 'off') return;
  const resolution = pmremResolutionForReflectionQuality(reflectionQuality);
  const key = arenaIblCacheKey(arenaId, resolution, sourceTexture);
  if (prewarmedArenaIbl.has(key)) return;
  const pending = pendingArenaIblPrewarms.get(key);
  if (pending) return pending;
  const operation = generateArenaEnvironmentMap(
    renderer,
    scene,
    arenaId,
    reflectionQuality,
    budgetEnvironmentIntensity,
    reflectionScale,
  ).then((state) => {
    prewarmedArenaIbl.set(key, state);
  }).finally(() => {
    if (pendingArenaIblPrewarms.get(key) === operation) pendingArenaIblPrewarms.delete(key);
  });
  pendingArenaIblPrewarms.set(key, operation);
  return operation;
}

/**
 * Disposes the previous arena's IBL resources.
 * Must be called before generating a new arena's environment map.
 */
export function disposeArenaIbl(state: ArenaIblState): void {
  if (state.environmentTexture) {
    state.environmentTexture.dispose();
  }
  if (state.pmremTarget) {
    state.pmremTarget.dispose();
  }
}

/**
 * Updates the environment intensity without regenerating the PMREM.
 * Called when graphics settings change (budget, reflectionScale) but arena stays same.
 */
export function updateArenaEnvironmentIntensity(
  scene: THREE.Scene,
  state: ArenaIblState,
  budgetEnvironmentIntensity: number,
  reflectionScale: number,
): ArenaIblState {
  if (!state.environmentTexture || !scene.environment) {
    return state;
  }
  const newIntensity = budgetEnvironmentIntensity * state.arenaEnvironmentScale * reflectionScale;
  scene.environmentIntensity = newIntensity;
  return Object.freeze({
    ...state,
    budgetEnvironmentIntensity,
    reflectionScale,
  });
}

/**
 * Determines if the IBL needs regeneration (arena switch, resolution-tier
 * change, or a backdrop swap under a live arena).
 *
 * `sourceTexture` is optional so a caller that genuinely does not care about
 * the backdrop identity keeps the old two-term rule; production always passes
 * it, because the generated-sky admission legitimately replaces the texture
 * this environment was convolved from.
 */
export function needsIblRegeneration(
  currentState: ArenaIblState,
  newArenaId: ArenaId,
  newResolutionTier: PmremResolutionTier,
  sourceTexture?: THREE.Texture | null,
): boolean {
  if (currentState.arenaId !== newArenaId) return true;
  if (currentState.resolutionTier !== newResolutionTier) return true;
  if (sourceTexture !== undefined && currentState.sourceTexture !== sourceTexture) return true;
  return false;
}

/**
 * Generates or refreshes the PMREM environment map for the WebGPU path. This is
 * the single entry point for arena IBL on WebGPU.
 *
 * It deliberately does NOT apply the sky backdrop. The caller applies it (with
 * the asset-request recorder the stream needs) and then seals it with
 * `waitForSkyBackdropAdmission`; re-applying it here would bump the backdrop
 * application counter, invalidate the admission the caller is awaiting and
 * start a second decode of the same .webp. The environment is convolved from
 * whatever backdrop is mounted when this runs, and the state records which one
 * that was, so a later admitted sky regenerates rather than being ignored.
 */
export async function applyArenaEnvironmentIbl(
  renderer: WebGPURenderer,
  scene: THREE.Scene,
  arenaId: ArenaId,
  reflectionQuality: IblReflectionQuality,
  budgetEnvironmentIntensity: number,
  reflectionScale: number,
  currentIblState: ArenaIblState,
): Promise<ArenaIblState> {
  // If reflection quality is off, clear environment and return empty state
  if (reflectionQuality === 'off') {
    if (scene.environment === currentIblState.environmentTexture) {
      scene.environment = null;
    }
    disposeArenaIbl(currentIblState);
    return createEmptyIblState();
  }

  const targetResolution = pmremResolutionForReflectionQuality(reflectionQuality);
  const sourceTexture = scene.background as THREE.Texture | null;

  // Check if we need to regenerate
  if (needsIblRegeneration(currentIblState, arenaId, targetResolution, sourceTexture)) {
    // Dispose previous arena's IBL resources
    disposeArenaIbl(currentIblState);

    if (sourceTexture) {
      const key = arenaIblCacheKey(arenaId, targetResolution, sourceTexture);
      const prewarmed = prewarmedArenaIbl.get(key);
      if (prewarmed) {
        prewarmedArenaIbl.delete(key);
        scene.environment = prewarmed.environmentTexture;
        scene.environmentIntensity = budgetEnvironmentIntensity * prewarmed.arenaEnvironmentScale * reflectionScale;
        return Object.freeze({
          ...prewarmed,
          budgetEnvironmentIntensity,
          reflectionScale,
        });
      }
    }

    // Generate new PMREM environment map
    return await generateArenaEnvironmentMap(
      renderer,
      scene,
      arenaId,
      reflectionQuality,
      budgetEnvironmentIntensity,
      reflectionScale,
    );
  }

  // Same arena, resolution and backdrop - just update intensity
  return updateArenaEnvironmentIntensity(scene, currentIblState, budgetEnvironmentIntensity, reflectionScale);
}

/**
 * What the SCENE actually carries, read back off the live object.
 *
 * Every field here is observed, not asserted from configuration: `present`,
 * `environmentName` and `environmentIntensity` come off `scene`, and
 * `expectedEnvironmentIntensity` is recomputed from the arena's authored scale
 * so the two can be compared rather than assumed equal. This is the receipt the
 * first-arena gate fails closed on, and it exists because the previous
 * "evidence" for this control was a grep for a symbol in a source file - which
 * passed for months against a code path that never executed.
 */
export type ArenaEnvironmentObservation = Readonly<{
  arenaId: ArenaId;
  reflectionQuality: IblReflectionQuality;
  /** True when `scene.environment` holds a texture right now. */
  present: boolean;
  /** The live `scene.environment.name`, or null when there is no environment. */
  environmentName: string | null;
  /** The live `scene.environmentIntensity`. */
  environmentIntensity: number;
  /** budgetEnvironmentIntensity x arenaEnvironmentScale(arenaId) x reflectionScale. */
  expectedEnvironmentIntensity: number;
  /** True when the live environment texture is the one this IBL state generated. */
  matchesIblState: boolean;
  /** The backdrop texture the live environment was convolved from. */
  sourceTextureName: string | null;
  resolutionTier: PmremResolutionTier;
  /** The cube face size the generator actually produced. */
  generatedCubeSize: number;
}>;

/** Reads the live arena environment off the scene. No configuration inputs. */
export function observeArenaEnvironment(
  scene: THREE.Scene,
  arenaId: ArenaId,
  reflectionQuality: IblReflectionQuality,
  budgetEnvironmentIntensity: number,
  reflectionScale: number,
  state: ArenaIblState,
): ArenaEnvironmentObservation {
  const environment = scene.environment;
  return Object.freeze({
    arenaId,
    reflectionQuality,
    present: Boolean(environment),
    environmentName: environment?.name ?? null,
    environmentIntensity: scene.environmentIntensity,
    expectedEnvironmentIntensity: reflectionQuality === 'off'
      ? 0
      : budgetEnvironmentIntensity * arenaEnvironmentScale(arenaId) * reflectionScale,
    matchesIblState: Boolean(environment) && environment === state.environmentTexture,
    sourceTextureName: state.sourceTexture?.name ?? null,
    resolutionTier: state.resolutionTier,
    generatedCubeSize: state.generatedCubeSize,
  });
}

/**
 * The gate the first arena of a fresh page has to pass.
 *
 * Before 2026-08-31 `scene.environment` was null on the first arena of every
 * page load and non-null after any in-page map switch, so the same build lit
 * map 1 differently from map 2 - and map 1 is the one every player actually
 * plays. Nothing failed: the only PMREM call site sat inside `applyDefinition`,
 * which the first arena never reaches because that arena is the one that
 * CONSTRUCTS the systems object. This assertion is the thing that would have
 * caught it, so it runs live, on the real scene, on every arena commit.
 *
 * `reflectionQuality: 'off'` is a legitimate player choice and is asserted in
 * the other direction: no environment, and nothing left bound to the scene.
 */
export function assertArenaEnvironmentLive(observation: ArenaEnvironmentObservation): void {
  const where = `arena ${observation.arenaId} (reflectionQuality ${observation.reflectionQuality})`;
  if (observation.reflectionQuality === 'off') {
    if (observation.present) {
      throw new Error(`Arena environment gate failed closed: ${where} still has scene.environment ${observation.environmentName}`);
    }
    return;
  }
  if (!observation.present) {
    throw new Error(`Arena environment gate failed closed: ${where} rendered with scene.environment === null`);
  }
  if (!observation.matchesIblState) {
    throw new Error(`Arena environment gate failed closed: ${where} scene.environment ${observation.environmentName} is not the texture this arena generated`);
  }
  // Float product of three authored scalars: compare at the tolerance the
  // product can actually hold, not with ===.
  const drift = Math.abs(observation.environmentIntensity - observation.expectedEnvironmentIntensity);
  if (!(drift <= 1e-6)) {
    throw new Error(
      `Arena environment gate failed closed: ${where} scene.environmentIntensity ${observation.environmentIntensity} `
      + `!= budget x arenaEnvironmentScale x reflectionScale (${observation.expectedEnvironmentIntensity})`,
    );
  }
}
