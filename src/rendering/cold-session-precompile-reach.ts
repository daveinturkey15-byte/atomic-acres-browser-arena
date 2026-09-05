import * as THREE from 'three';
import { ARENA_IDS, type ArenaId } from '../arena-identity';
import type { Object3D } from 'three';
import { TAA_RESOLVE_PIPELINE_ID, type TaaPrecompileRenderer } from './taa-resolve';

/**
 * PASS 2 admission census. These are the complete TAA-on reach items found
 * by the pipeline census: one unattached resolve material, one copy-command
 * path used only to seed history, and the exact material variants that the
 * velocity MRT scene pass compiles. The last list is derived from the
 * submitted scene, never maintained as a guessed roster.
 */
export const TAA_COLD_SESSION_PRECOMPILE_REACH = Object.freeze({
  resolveNodeMaterial: TAA_RESOLVE_PIPELINE_ID,
  historyCopy: 'taa-history.copyTextureToTexture',
  velocityMrt: 'scene-pass.velocity-mrt',
});

export type TaaColdSessionPrecompileCensus = Readonly<{
  resolveNodeMaterial: typeof TAA_RESOLVE_PIPELINE_ID;
  historyCopy: typeof TAA_COLD_SESSION_PRECOMPILE_REACH.historyCopy;
  velocityMrt: typeof TAA_COLD_SESSION_PRECOMPILE_REACH.velocityMrt;
  velocityMrtMaterialVariants: readonly string[];
}>;

type TaaVelocityMrtRenderable = THREE.Mesh | THREE.Line | THREE.Points;

function materialVariant(material: THREE.Material): string {
  const pipelineId = typeof material.userData.tslPipelineId === 'string'
    ? material.userData.tslPipelineId
    : material.type;
  return `${pipelineId}|${material.name || material.type}|v${material.version}|side=${material.side}`;
}

function geometryVariant(object: TaaVelocityMrtRenderable): string {
  const geometry = object.geometry;
  const attributes = Object.entries(geometry.attributes)
    .map(([name, attribute]) => `${name}:${attribute.itemSize}:${attribute.normalized ? 1 : 0}`)
    .sort()
    .join(',');
  return `${geometry.uuid}|${attributes}|index=${geometry.index?.count ?? 0}|instanced=${(object as THREE.InstancedMesh).isInstancedMesh ? 1 : 0}`;
}

function isTaaVelocityMrtRenderable(object: THREE.Object3D): object is TaaVelocityMrtRenderable {
  const candidate = object as THREE.Object3D & { isMesh?: boolean; isLine?: boolean; isPoints?: boolean };
  return candidate.isMesh === true || candidate.isLine === true || candidate.isPoints === true;
}

/**
 * Enumerates the material variants present in the exact scene root that is
 * handed to `compileAsync` with the velocity MRT selected. Names, versions and
 * sides are the same identifying fields used by the WebGPU render-object
 * pipeline census; duplicate uses of one material collapse to one variant.
 */
export function enumerateTaaVelocityMrtMaterialVariants(
  root: THREE.Object3D | readonly THREE.Object3D[],
): readonly string[] {
  const variants = new Set<string>();
  const roots: readonly THREE.Object3D[] = Array.isArray(root) ? root : [root];
  for (const sceneRoot of roots) {
    sceneRoot.traverse((object) => {
      if (!isTaaVelocityMrtRenderable(object)) return;
      const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
      for (const material of materials) {
        if (material.visible) variants.add(materialVariant(material));
      }
    });
  }
  return Object.freeze([...variants].sort());
}

/**
 * Returns one representative for every geometry/material identity in the
 * submitted scene, including non-selected LOD levels and renderables hidden
 * by the menu camera. The identity is derived from the same material fields
 * used by the census plus the geometry attribute layout that WebGPU includes
 * in its render-pipeline key; no arena-specific roster is maintained here.
 */
export function enumerateTaaVelocityMrtPrecompileCandidates(
  roots: readonly THREE.Object3D[],
): readonly Readonly<{ object: TaaVelocityMrtRenderable; variants: readonly string[] }>[] {
  const candidates = new Map<string, Readonly<{ object: TaaVelocityMrtRenderable; variants: readonly string[] }>>();
  for (const root of roots) {
    root.traverse((object) => {
      if (!isTaaVelocityMrtRenderable(object)) return;
      const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
      const variants = materials.filter((material) => material.visible).map(materialVariant).sort();
      if (variants.length === 0) return;
      const key = `${geometryVariant(object)}|materials=${variants.join(',')}`;
      if (!candidates.has(key)) candidates.set(key, Object.freeze({ object, variants: Object.freeze(variants) }));
    });
  }
  return Object.freeze([...candidates.values()].sort((a, b) => (
    a.variants.join(',').localeCompare(b.variants.join(',')) || a.object.uuid.localeCompare(b.object.uuid)
  )));
}

/**
 * Compiles the census-derived velocity-MRT renderables against the exact
 * ScenePass target/MRT. `compileAsync(object, ..., targetScene)` intentionally
 * bypasses parent visibility, so every LOD level can be admitted without
 * changing the live scene; each object's own visibility/frustum flags are
 * restored immediately after its compile.
 */
export async function precompileTaaVelocityMrtCandidates(
  renderer: Pick<TaaPrecompileRenderer, 'compileAsync'>,
  camera: THREE.Camera,
  targetScene: THREE.Scene,
  roots: readonly THREE.Object3D[],
): Promise<number> {
  const candidates = enumerateTaaVelocityMrtPrecompileCandidates(roots);
  for (const { object } of candidates) {
    const previousVisible = object.visible;
    const previousFrustumCulled = object.frustumCulled;
    object.visible = true;
    object.frustumCulled = false;
    try {
      await renderer.compileAsync(object, camera, targetScene);
    } finally {
      object.visible = previousVisible;
      object.frustumCulled = previousFrustumCulled;
    }
  }
  return candidates.length;
}

export function censusTaaColdSessionPrecompileReach(
  root: THREE.Object3D | readonly THREE.Object3D[],
): TaaColdSessionPrecompileCensus {
  return Object.freeze({
    ...TAA_COLD_SESSION_PRECOMPILE_REACH,
    velocityMrtMaterialVariants: enumerateTaaVelocityMrtMaterialVariants(root),
  });
}

/**
 * Arenas whose OWN vocabulary has been MEASURED to exceed the 12 s admission
 * fence when it is realised inside a cold session's first fenced submission.
 *
 * WHY THIS EXISTS AS AN AUTHORITY RATHER THAN AN `id ===` IN THE TRANSITION
 * -----------------------------------------------------------------------
 * Pass 84 (lane C) discovered that farcrysis loses that race: its warm frame
 * realised 134-217 cold render pipelines synchronously inside submission 1 and
 * reported "WebGPU queue completion exceeded 12000 ms for submission 1 ...
 * fenced draws 1017", the selection rolled back, and the stuck submission then
 * failed the NEXT arena's fence as well. Atomic Acres compiles 75 there and
 * passes. So the relief was gated on the arena id, inline in the transition.
 *
 * Pass 85 lane H removed that gate entirely, on the correct observation that
 * HF-417 - the same failure on an IN-SESSION SWITCH - is not arena-specific at
 * all: whichever arena is entered second pays for its whole cold vocabulary
 * inside one fenced submission. That fix is right and it took the 56-pair
 * switch matrix from 55/56 to 56/56.
 *
 * But it also applied the relief to COLD SESSIONS, where it is not free and
 * mostly not needed. Measured 2026-09-03 (lane H2), interleaved A/B on the same
 * machine minutes apart, internal control x0.99-x1.02:
 *
 *   gun-range first load, `visual-definition` phase
 *     PASS 86 baseline                     4 398 / 4 404 ms
 *     relief over the whole scene         12 981 ms   (+8 583)
 *     relief over the arena root only     10 049 ms   (+5 645)
 *
 * and `coverage-submit-fence` did not fall to pay for either (x1.00), so on a
 * cold session the work is ADDED, not moved: the coverage precompile downstream
 * realises the same set off the fence anyway, and the warm frame in between
 * clears 12 s comfortably on every arena but the one below.
 *
 * So the cold-session relief goes back to being scoped - but to a NAMED,
 * TESTED, EVIDENCED authority instead of an `id ===` buried in a 35 000-line
 * transition. The transition asks this module; `src/presentation-prewarm-
 * contract.test.ts` still pins that the region contains ZERO arena-id branches;
 * and `cold-session-precompile-reach.test.ts` pins that every member here is a
 * real arena id and that the set is non-empty, so a rename cannot silently empty
 * it the way a hand-typed roster does.
 *
 * TO REMOVE AN ENTRY you need the measurement that removing the gate did not
 * reintroduce the fence failure on a COLD boot of that arena, not an argument.
 *
 * NUKETOWN2 JOINED THE LIST IN PASS 94 CANDIDATE 4b, on the same kind of
 * measurement that put farcrysis here. Candidate 4 merged four art lanes into
 * this arena, and its cold first submission then lost the race outright:
 *
 *   [Nuke Town Rebuild map selection failed] WebGPU queue completion exceeded
 *   12000 ms for submission 1 (pending 12001 ms, fenced draws 568)
 *
 * on the pass74 arena boot smoke AND on one qa:stock-boot attempt, both on real
 * hardware WebGPU (nvidia/blackwell), with the retry passing warm. That is the
 * farcrysis signature exactly: a cold session realising the arena's OWN
 * vocabulary synchronously inside submission 1. The selection rolled back, so
 * the map came up with no visual definition installed and every one of its 17
 * authored review cameras was unreachable (0/17 captures).
 *
 * The relief this buys is the SAME relief: `precompileExactScenePass` runs
 * first, through `compileAsync` -> `createRenderPipelineAsync`, which Dawn
 * compiles on worker threads OUTSIDE any fence, so the fenced warm frame finds
 * the pipelines already built. Cold sessions pass the newly admitted arena
 * root; in-session switches pass the whole scene because their prior arena
 * cache is the falsifier that caused the original switch failure. IT DOES NOT
 * WIDEN THE FENCE - the 12 s bound in the transition is untouched and
 * `presentation-prewarm-contract.test.ts` still pins it verbatim.
 *
 * Candidate 6 remeasured this authority after the geometry/material merge.
 * The first measurement made the Nuke cold precompile look redundant because
 * coverage also spent 8.807 s compiling. The transition now records whether
 * that exact compile has already run and reuses it at coverage; keeping the
 * off-fence realization is therefore the measured fence protection without
 * paying twice for the vocabulary.
 *
 * The cost side is being attacked in parallel rather than accepted: candidate
 * 4b made the nuketown2 material families' base colours UNIFORMS instead of
 * baked graph constants (`uniformSwatch`, and the same fix in
 * `vehicle-forge/materials.ts`), which took the arena from 55 distinct node
 * graphs to 52 over the same 96 node materials, pinned by
 * `src/nuketown2-pipeline-budget.test.ts`. Nuke Town's measured cold
 * transition now owns its exact coverage compile behind the loading surface;
 * retaining it here would compile the same arena twice before admission.
 */
const MEASURED_COLD_SESSION_FENCE_LOSERS: readonly string[] = Object.freeze(['farcrysis']);

export const COLD_SESSION_PRECOMPILE_ARENAS: readonly ArenaId[] = Object.freeze(
  ARENA_IDS.filter((id) => MEASURED_COLD_SESSION_FENCE_LOSERS.includes(id)),
);

/**
 * True when this arena's first fenced submission of a cold session must find its
 * vocabulary already realised. An in-session switch never asks this: there the
 * relief is unconditional, because the renderer's cache holds a DIFFERENT
 * arena's permutations and any arena can lose that race.
 */
export function arenaNeedsColdSessionPrecompile(arena: { readonly id: string }): boolean {
  return (COLD_SESSION_PRECOMPILE_ARENAS as readonly string[]).includes(arena.id);
}

export function coldArenaOperation(cold: boolean, operation: () => Promise<unknown>): () => Promise<unknown> {
  return cold ? () => Promise.resolve() : operation;
}

export async function withDetachedRoots<T>(roots: readonly Object3D[], operation: () => Promise<T>): Promise<T> {
  const parents = roots.map((root) => root.parent);
  for (const root of roots) root.removeFromParent();
  try { return await operation(); } finally {
    roots.forEach((root, index) => parents[index]?.add(root));
  }
}
