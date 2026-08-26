import * as THREE from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import type { ArenaId } from '../map-selection';
import { arenaEnvironmentScale } from '../graphics-refinement';
import { applySkyBackdrop, skyBackdropPreset } from './sky-backdrop';

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
  /** The reflection quality tier that produced this environment map. */
  resolutionTier: PmremResolutionTier;
  /** The graphics budget environment intensity at time of generation. */
  budgetEnvironmentIntensity: number;
  /** The arena's authored environment scale at time of generation. */
  arenaEnvironmentScale: number;
  /** The reflectionScale (from reflectionQuality setting) at time of generation. */
  reflectionScale: number;
}>;

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

  // One cast, quarantined here: PMREMGenerator types demand WebGLRenderer but
  // accepts the WebGPU renderer at runtime (it detects the backend itself).
  const pmrem = new THREE.PMREMGenerator(renderer as unknown as THREE.WebGLRenderer);
  pmrem.compileEquirectangularShader();

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
  });
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
 * Determines if the IBL needs regeneration (arena switch or resolution tier change).
 */
export function needsIblRegeneration(
  currentState: ArenaIblState,
  newArenaId: ArenaId,
  newResolutionTier: PmremResolutionTier,
): boolean {
  return currentState.arenaId !== newArenaId || currentState.resolutionTier !== newResolutionTier;
}

/**
 * Applies the arena's sky backdrop and generates/updates the PMREM environment map
 * for the WebGPU path. This is the single entry point for arena IBL on WebGPU.
 */
export async function applyArenaEnvironmentIbl(
  renderer: WebGPURenderer,
  scene: THREE.Scene,
  arenaId: ArenaId,
  preset: string,
  reflectionQuality: IblReflectionQuality,
  budgetEnvironmentIntensity: number,
  reflectionScale: number,
  currentIblState: ArenaIblState,
): Promise<ArenaIblState> {
  // Apply the sky backdrop to scene.background (works on both backends)
  applySkyBackdrop(scene, preset);

  // If reflection quality is off, clear environment and return empty state
  if (reflectionQuality === 'off') {
    if (scene.environment === currentIblState.environmentTexture) {
      scene.environment = null;
    }
    disposeArenaIbl(currentIblState);
    return createEmptyIblState();
  }

  const targetResolution = pmremResolutionForReflectionQuality(reflectionQuality);

  // Check if we need to regenerate
  if (needsIblRegeneration(currentIblState, arenaId, targetResolution)) {
    // Dispose previous arena's IBL resources
    disposeArenaIbl(currentIblState);

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

  // Same arena and resolution - just update intensity
  return updateArenaEnvironmentIntensity(scene, currentIblState, budgetEnvironmentIntensity, reflectionScale);
}