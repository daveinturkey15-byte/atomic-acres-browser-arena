/**
 * technique-lab/demos/group-a/index.ts — the group-A manifest.
 *
 * Stable source IDs 1-17, exactly as recorded in the AKP register
 * `references/ai-3d-technique-register.md`. IDs are never renumbered, never
 * merged and never reused; a row with no honest demo carries `adaptation:
 * 'blocked'` and omits `createDemo` rather than shipping a placeholder.
 *
 * Alias note carried for the host: in the full 1-50 catalogue, ID 21 is an alias
 * of ID 19 and must not be counted as a distinct technique. Both live in group B
 * and neither is imported here.
 *
 * Every import below is from this group's own folder. Nothing in this file
 * imports another group's modules, the game runtime, a renderer, or a router.
 */

import type { Adaptation, Demo, DemoContext } from './_shared';
import { createDemo as createSource01 } from './source-01';
import { createDemo as createSource02 } from './source-02';
import { createDemo as createSource03 } from './source-03';
import { createDemo as createSource04 } from './source-04';
import { createDemo as createSource05 } from './source-05';
import { createDemo as createSource06 } from './source-06';
import { createDemo as createSource07 } from './source-07';
import { createDemo as createSource08 } from './source-08';
import { createDemo as createSource09 } from './source-09';
import { createDemo as createSource10 } from './source-10';
import { createDemo as createSource11 } from './source-11';
import { createDemo as createSource12 } from './source-12';
import { createDemo as createSource13 } from './source-13';
import { createDemo as createSource14 } from './source-14';
import { createDemo as createSource16 } from './source-16';
import { createDemo as createSource17 } from './source-17';

export type { Demo, DemoContext } from './_shared';

export interface ManifestEntry {
  sourceId: number;
  title: string;
  method: string;
  adaptation: Adaptation;
  sources: string[];
  limitation?: string;
  createDemo?: (context: DemoContext) => Demo;
}

export const manifest: ManifestEntry[] = [
  {
    sourceId: 1,
    title: 'Mocap to in-game animation',
    method:
      'FK-only pose evaluation from an action spec, with ground contact resolved by bisecting hip height rather than by an IK solver.',
    adaptation: 'adapted',
    sources: [
      'https://x.com/Graalitoo/status/2089469774602633431',
      'https://github.com/squall01337/mixamo-llm-mocap',
    ],
    limitation:
      'Blender, GVHMR checkpoints and SMPL-X data are required by the upstream pipeline and were not run; the demo rebuilds the plant step only, on a proportioned stand-in rig.',
    createDemo: createSource01,
  },
  {
    sourceId: 2,
    title: 'Spectral FFT ocean',
    method:
      'JONSWAP + TMA spectrum, Tessendorf h0(k), finite-depth dispersion, inverse Cooley-Tukey FFT, choppy displacement and Jacobian-negative foam.',
    adaptation: 'adapted',
    sources: [
      'https://x.com/Graalitoo/status/2089656660981862487',
      'https://github.com/squall01337/abyssal-ocean',
    ],
    limitation:
      'One CPU cascade at N=32, not three GPU cascades at 512^2; no reflection, refraction, caustics or buoyancy.',
    createDemo: createSource02,
  },
  {
    sourceId: 3,
    title: 'Stylized water composition',
    method:
      'Depth absorption ramp with a distinct shallow stop, depth-banded travelling shore foam, and a caustic term keyed to seabed depth.',
    adaptation: 'adapted',
    sources: ['https://x.com/Graalitoo/status/2077373937449648518'],
    limitation: 'Comparator-only source: no repository, licence or published implementation exists.',
    createDemo: createSource03,
  },
  {
    sourceId: 4,
    title: 'Underwater volume and waterline cutting',
    method:
      'Displaced-volume dome plus heading-aligned laminar deflection on the surface, with the naive waterline cut left visibly failing.',
    adaptation: 'adapted',
    sources: ['https://x.com/gruberbuilds/status/2090235767922512234'],
    limitation:
      'The author states surface cutting is unsolved upstream; the cut shown here tears at grid resolution by design and must not be read as solved.',
    createDemo: createSource04,
  },
  {
    sourceId: 5,
    title: 'Local H3 video to sprite animation',
    method:
      'Provider-neutral half of the workflow: flat key background, pose-extreme selection, chroma key to alpha during atlas packing, per-extreme hold timing.',
    adaptation: 'adapted',
    sources: [
      'https://x.com/victormustar/status/2089310616854892818',
      'https://www.minimax.io/blog/minimax-h3',
      'https://huggingface.co/MiniMaxAI/MiniMax-H3',
    ],
    limitation:
      'MiniMax H3 is licence-blocked in the UK for both the model and its output; no H3 model, weights or output were fetched or used. Frames are locally drawn. Output is a 2D sprite, never a skinned rig.',
    createDemo: createSource05,
  },
  {
    sourceId: 6,
    title: 'Image to procedural Three.js model',
    method:
      'ObjectSculptSpec -> code-only factory -> action-ready gate, publishing pivots, sockets, colliders and destruction groups on root.userData.sculptRuntime.',
    adaptation: 'adapted',
    sources: ['https://github.com/img2threejs/img2threejs'],
    limitation:
      'No reference image, vision probe or upstream material gate was run; the spec was authored by hand to the documented shape.',
    createDemo: createSource06,
  },
  {
    sourceId: 7,
    title: 'Code-only procedural scene authoring',
    method:
      'Zero-external-asset street cell with a procedurally generated albedo, plus the contact-shadow-before-shadow-map discipline and the emissive-versus-real-light budget rule.',
    adaptation: 'adapted',
    sources: [
      'https://x.com/prasenx/status/2087604022849184080',
      'https://github.com/StarKnightt/night-street',
    ],
    limitation:
      'One street cell, not the map; no post chain, LUT-free grade or god rays, because the lab host owns tone mapping.',
    createDemo: createSource07,
  },
  {
    sourceId: 8,
    title: 'Fully procedural jungle (same author, earlier)',
    method:
      'Every texture and mesh generated in code: a baked leaf-card atlas with correct straight-alpha edges, layered canopy silhouettes, and the blind-critic defect list applied as assertions.',
    adaptation: 'adapted',
    sources: ['https://github.com/StarKnightt/jungle-trail'],
    limitation:
      'Vegetation only; no terrain, audio, god rays or waterfall, and the upstream project itself signed vegetation off at 5/10.',
    createDemo: createSource08,
  },
  {
    sourceId: 9,
    title: 'Three.js frame-loop and visual audit',
    method:
      'Frame-loop severity ranking plus a disposal audit, restated as an executable static check and a live before/after scene that counts per-frame allocations and undisposed GPU resources.',
    adaptation: 'adapted',
    sources: [
      'https://x.com/aidenybai/status/2089400082550620636',
      'https://github.com/millionco/react-doctor',
    ],
    limitation:
      'The upstream skill and React Doctor were not installed or executed - installing runs third-party code and is an owner decision, and the licence carries an AI-training carve-out. The rubric rows that need rendered evidence stay OPEN.',
    createDemo: createSource09,
  },
  {
    sourceId: 10,
    title: 'Vibe3D asset registry',
    method:
      'Registry-of-source-props pattern: a models.json-shaped config, code-installed factories that import the host Three, and an ingestion gate that measures bounds and strips preview lights and collider authority.',
    adaptation: 'adapted',
    sources: [
      'https://x.com/DerekBrenner/status/2089780687708856412',
      'https://x.com/alightinastorm/status/2088712139364041161',
      'https://x.com/alightinastorm/status/2097598580546470197',
      'https://github.com/vibe-stack/vibe3d',
      'https://github.com/keysforthewin/thaikit',
    ],
    limitation:
      'No package was installed and no upstream prop source was vendored; the props here are locally authored stand-ins exercising the ingestion contract. Model count and token-saving claims remain author claims.',
    createDemo: createSource10,
  },
  {
    sourceId: 11,
    title: 'Scaffold in code, generate the hero asset',
    method:
      'Separation of concerns plus the harmonisation step the post omits: measure the hero asset bounds, normalise scale, re-seat the pivot on the contact plane and align facing to the world verb axis.',
    adaptation: 'adapted',
    sources: ['https://x.com/filiksyos/status/2089297181026951425'],
    limitation:
      'Opinion post with no repository and no licence. No AI generator was invoked; the hero stand-in is locally authored with a deliberately wrong scale, pivot and facing so the harmonisation step has something real to fix.',
    createDemo: createSource11,
  },
  {
    sourceId: 12,
    title: 'Closed-loop asset generation with browser self-verification',
    method:
      'Propose -> falsify -> verify applied to assets: a local acceptance harness that measures each candidate against declared criteria and rejects, with the rejected and accepted candidates both kept on screen.',
    adaptation: 'adapted',
    sources: ['https://x.com/anshuc/status/2065598069790716294'],
    limitation:
      'The browser visual-verification leg is OPEN: no browser or GPU job runs in this lane. fal.ai and Gemini are paid external APIs and were never invoked.',
    createDemo: createSource12,
  },
  {
    sourceId: 13,
    title: 'Gauntlet loop',
    method:
      'The five published steps as an executable bounded loop: concrete bar, split work, fresh critic that never graded its own build, frozen regressions, and round plus wall-clock budgets.',
    adaptation: 'adapted',
    sources: ['https://somethingbig.ai/gauntlet-loop', 'https://github.com/mshumer/Claude-of-Duty'],
    limitation:
      'No model is called: builder and critic are pure functions, so this proves the loop mechanics and the frozen-regression refusal, not that an agent would improve the artefact.',
    createDemo: createSource13,
  },
  {
    sourceId: 14,
    title: 'Modern Claudefare',
    method:
      'Comparator rubric for a first-person viewmodel: offscreen-connected arm and weapon silhouette, weapon-versus-arm material contrast, and a local muzzle-lit read.',
    adaptation: 'adapted',
    sources: ['https://www.modernclaudefare.com/'],
    limitation:
      'No source code, reusable asset licence or technique publication exists; the site is a fan-made non-commercial experience. Nothing is copied, and attractive frames are not gameplay or performance evidence.',
    createDemo: createSource14,
  },
  {
    sourceId: 15,
    title: 'Native RTX runtime for Three.js (ThreeRuntime)',
    method:
      'Three.js/TSL scene description over a native WebGPU layer into C++/Vulkan with hardware ray tracing, with no browser rendering at all.',
    adaptation: 'blocked',
    sources: [
      'https://x.com/samgcoder/status/2091775237646114921',
      'https://github.com/SamG-Coder/threepp',
    ],
    limitation:
      'BLOCKED, and deliberately so. The method is a native desktop runtime that REPLACES the browser; no browser exposes a hardware ray-tracing pipeline in WebGPU today, so there is no honest in-browser demo of this technique. Building the C++/Vulkan sample is out of scope for this lane (no compiler run, no third-party build, no GPU job) and adopting it is a product decision about shipping a native build, not an agent decision. Substituting the unrelated in-browser hybrid RT library found by search would be exactly the row-15 substitution error the register already recorded. See docs/technique-lab/group-a/SOURCE_RESEARCH.json for the licence and pin evidence that WAS recovered.',
  },
  {
    sourceId: 16,
    title: 'Text to character animation, locally (kimodo.cpp)',
    method:
      'Select the joint layout by joint count at import (30 = SOMA, 22 = SMPL-X), retarget onto our own skeleton, and stitch clips past the 10-second cap with an explicit transition, as src/sequence.cpp does.',
    adaptation: 'adapted',
    sources: [
      'https://x.com/stefan_3d_ai/status/2091531702183350276',
      'https://x.com/jichiep/status/2091277918521417834',
      'https://github.com/localai-org/kimodo.cpp',
    ],
    limitation:
      'No kimodo binary was built and no GGUF weights were downloaded in this lane; the motion buffers are synthetic and deterministic, so this demonstrates the import-and-stitch contract, not generation quality.',
    createDemo: createSource16,
  },
  {
    sourceId: 17,
    title: 'Environment-art quality bar (Cadle)',
    method:
      'The four named comparator properties made measurable: dense instanced wind-animated ground cover, layered vegetation silhouettes, a distant terrain band that stays readable, and a declared draw/triangle budget while all three are on screen.',
    adaptation: 'adapted',
    sources: ['https://cadle.gg/'],
    limitation:
      "Cadle's implementation is NOT DETERMINED and this is not it. The site is a client-rendered app that served no fetchable content, and no postmortem exists. Explicit anti-conflation: the MIT procedural-grass projects surfaced by searching are a different row and there is no evidence Cadle uses them.",
    createDemo: createSource17,
  },
];

export default manifest;
