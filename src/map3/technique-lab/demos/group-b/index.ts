/**
 * Technique lab - group B manifest (stable register source IDs 18-34).
 *
 * Every entry keeps its ORIGINAL register ID. Row 21 is a numbered alias of row 19 and is
 * present so that references to 21 resolve; it is not a distinct technique and must never be
 * counted as one. Rows that could not be honestly demonstrated carry `adaptation: 'blocked'`
 * and no factory, with the precise limitation recorded rather than a placeholder scene.
 *
 * Imports are restricted to this group's own modules. Root owns the HTML lab and router.
 */

import type { ManifestEntry } from './types';
import { createDemo as createSource18 } from './source-18';
import { createDemo as createSource19 } from './source-19';
import { createDemo as createSource23 } from './source-23';
import { createDemo as createSource26 } from './source-26';
import { createDemo as createSource33 } from './source-33';

import type { Demo, DemoContext } from './types';

export type { Adaptation, Demo, DemoContext, DemoFactory, DemoMetadata, ManifestEntry } from './types';

/**
 * Row 21 delegates to row 19's scene and relabels the metadata with its own stable ID, so a
 * host that looks up 21 gets a working scene AND an accurate identity. The relabel is what
 * stops the alias from being counted twice: its metadata says, in the limitation field, that
 * it is row 19's technique.
 */
function createSource21Alias(context: DemoContext): Demo {
  const demo = createSource19(context);
  return {
    ...demo,
    metadata: {
      ...demo.metadata,
      sourceId: 21,
      title: 'Classic ray tracing as a shipped option - see row 19',
      limitation: 'Alias of source 19',
    },
  };
}

export const manifest: ManifestEntry[] = [
  {
    sourceId: 18,
    title: 'Procedural grass and landscape systems for Three.js',
    method:
      'Instanced quadratic-Bezier tapered blades on a jittered grid with slope/height/density '
      + 'rejection, layered wind, and concentric LOD rings that thin density and simplify blades.',
    adaptation: 'adapted',
    sources: ['https://github.com/CK42BB/procedural-grass-threejs'],
    limitation:
      'CPU rigid-blade wind on MeshStandardMaterial instead of the source GLSL per-vertex bend; '
      + 'emissive stand-in for subsurface scattering; bounded lab blade budget.',
    createDemo: createSource18,
  },
  {
    sourceId: 19,
    title: 'Classic ray tracing in the browser (THREE.js-RayTracing-Renderer)',
    method:
      'Whitted-style classic ray tracing with the Hall shading model: bounded iterative bounce '
      + 'loop, Blinn-Phong direct lighting, hard shadows through transparent occluders, metal '
      + 'reflection, Fresnel clearcoat, refraction with Schlick split and TIR.',
    adaptation: 'adapted',
    sources: ['https://github.com/erichlof/THREE.js-RayTracing-Renderer'],
    limitation:
      'Traced on the CPU at 160x120 into a DataTexture, not in the source\'s WebGL2 fragment '
      + 'shader; no BVH, no depth of field, no frame-rate claim, and no diffuse GI.',
    createDemo: createSource19,
  },
  {
    // Row 21 is a numbered stub that aliases row 19. It delegates to the same factory inside
    // this group so references to 21 resolve, and it takes no separate credit.
    sourceId: 21,
    title: 'Classic ray tracing as a shipped option - see row 19',
    method: 'Alias of source 19; carries no technique of its own.',
    adaptation: 'adapted',
    sources: ['https://github.com/erichlof/THREE.js-RayTracing-Renderer'],
    limitation: 'Alias of source 19',
    createDemo: createSource21Alias,
  },
  {
    sourceId: 22,
    title: 'Environment-art comparators, 2026-08-24 batch',
    method: 'No recoverable method: quality targets, not techniques.',
    adaptation: 'blocked',
    sources: [
      'https://revo-realms.aleksandargjoreski.dev/',
      'https://winchxyz.github.io/moon-rover/',
      'https://yugiriworks.itch.io/sky-fang',
    ],
    limitation:
      'BLOCKED: comparator-only row with no repository, no published technique and no licence. '
      + 'All three URLs were fetched on 2026-09-12; revo-realms returned HTTP 200 with only 1,430 '
      + 'bytes, confirming it serves no meaningful HTML to a fetcher. A scene here would be our '
      + 'own work wearing this row\'s title.',
  },
  {
    sourceId: 23,
    title: 'Hand-written GLSL combat sim with deforming terrain (Battle of Hoth)',
    method:
      'Terrain deformation as persistent accumulating state: one shared additive brush path, a '
      + 'texel-snapped toroidal window that follows the subject, and banked recovery.',
    adaptation: 'adapted',
    sources: ['https://github.com/csanz/battle-of-the-hoth-simulator'],
    limitation:
      'Source is all rights reserved (our LICENSE probe at the pinned revision returned HTTP 404); '
      + 'independent implementation, CPU Float32Array over displaced vertices rather than '
      + 'ping-ponged RGBA16F targets.',
    createDemo: createSource23,
  },
  {
    sourceId: 24,
    title: 'TAKEN - browser survival horror, dense ground cover and night sky (VOIDMODE)',
    method: 'No recoverable method: the source repository is unlocated.',
    adaptation: 'blocked',
    sources: ['https://www.taken-game.com/play'],
    limitation:
      'BLOCKED: the playable page was fetched (HTTP 200, 69,243 bytes) but no source repository '
      + 'resolves, so there is no implementation to demonstrate. The register closed this search '
      + 'negative on 2026-08-24 and this lane did not reopen it.',
  },
  {
    sourceId: 25,
    title: 'Browser water with shoreline waves and blending (VOIDMODE)',
    method: 'No published implementation; the author has said the water will become available.',
    adaptation: 'blocked',
    sources: ['https://x.com/voidmode/status/2079334222217588842'],
    limitation:
      'BLOCKED: unreleased technique with no source. The post URL returned HTTP 200 but only X\'s '
      + 'client shell; the post body was NOT recovered by a plain fetcher and is not reproduced. '
      + 'The register\'s 2026-08-24 browser reading is retained as prior evidence, not re-verified.',
  },
  {
    sourceId: 26,
    title: 'Arcade attract-loop game-select menu (AMIX GAMES)',
    method:
      'Ring geometry derived from item count (R = N(W+GAP)/TAU, STEP = TAU/N), short-way rotation '
      + 'modulo N, two-stage commit where only the focus slot launches, and a content-derived '
      + 'accent clamped into a legible saturation/lightness band.',
    adaptation: 'adapted',
    sources: ['https://amix-design.com/tl/web-g-games/'],
    limitation:
      'Source page is all rights reserved for design, markup, art, audio and code; behaviour is '
      + 'restated in our own implementation. No DOM, so the semantic-roster-as-data-source idea is '
      + 'stated but not demonstrated; no entry gate, degradation branches or capture mode.',
    createDemo: createSource26,
  },
  {
    sourceId: 30,
    title: 'Generated video as MOTION REFERENCE, not as the asset (the owner\'s bridge)',
    method:
      'Describe a motion, generate a reference video, reconstruct or author pose from it, retarget '
      + 'onto our own rig, ship only the rig data.',
    adaptation: 'blocked',
    // The packet records no URL for this row: it is owner-taught and composed from rows 1, 5
    // and 16, so the only citable source is the register section itself.
    sources: ['ai-3d-technique-register.md#30 (owner-taught 2026-08-24; no third-party artefact)'],
    limitation:
      'BLOCKED: the technique\'s first step is a video generation this lane may not run (no GPU '
      + 'jobs), and its second needs Blender or a pose-reconstruction route that is equally out of '
      + 'scope. A rig-retarget scene without a reference video would demonstrate retargeting, not '
      + 'this row\'s bridge. This row is a composition of rows 1, 5 and 16 and has no artefact of '
      + 'its own.',
  },
  {
    sourceId: 32,
    title: 'WAN 2.2 - local text-to-video and image-to-video, Apache 2.0',
    method:
      'Mixture-of-experts video diffusion split by denoising timestep, text-to-video and '
      + 'image-to-video, run locally in ComfyUI.',
    adaptation: 'blocked',
    sources: [
      'https://docs.comfy.org/tutorials/video/wan/wan2_2',
      'https://raw.githubusercontent.com/Comfy-Org/docs/main/tutorials/video/wan/wan2_2.mdx',
    ],
    limitation:
      'BLOCKED: requires model weights and a GPU generation this lane forbids, and the weights are '
      + 'not pinned, so the Apache 2.0 claim remains documentation-level and unverified against the '
      + 'weights. The documented URL failed with an expired TLS certificate (recorded verbatim, not '
      + 'bypassed); the author-owned docs repository was read instead.',
  },
  {
    sourceId: 33,
    title: 'ThreeJS Super Terrain - partitioned mesh terrain with live CSG and worker LOD',
    method:
      'Partitioned sections selecting LOD by projected screen-space geometric error with '
      + 'asymmetric hysteresis, settled by a neighbour constraint of at most one level per seam.',
    adaptation: 'adapted',
    sources: ['https://github.com/vibe-stack/super-terrain'],
    limitation:
      'Source is all rights reserved (LICENSE probe returned HTTP 404); independent implementation '
      + 'of the read algorithms only. No dual-contouring CSG, no caves, no worker pool, no '
      + 'persistence or export.',
    createDemo: createSource33,
  },
];

/**
 * Rows whose primary source WAS recovered, read and licence-checked in this lane, but whose
 * demo was not built inside the lane's time budget. They are deliberately absent from the
 * manifest rather than present as placeholders or mislabelled as blocked: blocked means no
 * honest demo is possible, and that is not true of these. Their research is complete in
 * docs/technique-lab/group-b/SOURCE_RESEARCH.json.
 */
export const notDeliveredSourceIds: readonly number[] = [20, 27, 28, 29, 31, 34];

export default manifest;
