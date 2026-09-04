import * as THREE from 'three';
import { ARENA_IDS, type ArenaId } from '../arena-identity';
import { TAA_RESOLVE_PIPELINE_ID } from './taa-resolve';

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

/**
 * Enumerates the material variants present in the exact scene root that is
 * handed to `compileAsync` with the velocity MRT selected. Names, versions and
 * sides are the same identifying fields used by the WebGPU render-object
 * pipeline census; duplicate uses of one material collapse to one variant.
 */
export function enumerateTaaVelocityMrtMaterialVariants(root: THREE.Object3D): readonly string[] {
  const variants = new Set<string>();
  root.traverseVisible((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const material of materials) {
      const pipelineId = typeof material.userData.tslPipelineId === 'string'
        ? material.userData.tslPipelineId
        : material.type;
      variants.add(`${pipelineId}|${material.name || material.type}|v${material.version}|side=${material.side}`);
    }
  });
  return Object.freeze([...variants].sort());
}

export function censusTaaColdSessionPrecompileReach(root: THREE.Object3D): TaaColdSessionPrecompileCensus {
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
 * the pipelines already built. IT DOES NOT WIDEN THE FENCE - the 12 s bound in
 * the transition is untouched and `presentation-prewarm-contract.test.ts` still
 * pins it verbatim. It costs this arena's first load the added
 * `visual-definition` time lane H2 measured, which is the price farcrysis
 * already pays and is worth paying against a rollback.
 *
 * The cost side is being attacked in parallel rather than accepted: candidate
 * 4b made the nuketown2 material families' base colours UNIFORMS instead of
 * baked graph constants (`uniformSwatch`, and the same fix in
 * `vehicle-forge/materials.ts`), which took the arena from 55 distinct node
 * graphs to 52 over the same 96 node materials, pinned by
 * `src/nuketown2-pipeline-budget.test.ts`. When that work has taken enough out
 * of the cold set, this entry is a candidate for removal - with a measurement.
 */
const MEASURED_COLD_SESSION_FENCE_LOSERS: readonly string[] = Object.freeze(['farcrysis', 'nuketown2']);

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
