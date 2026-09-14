/**
 * Technique lab — group C manifest (stable source IDs 35-50).
 *
 * The IDs are the register's own and are preserved exactly; they are not a
 * position in this array. Root embeds this behind the same 1-50 labels and owns
 * the HTML lab and its router. Nothing here imports another group's modules.
 *
 * A `blocked` entry carries no `createDemo`. That is the honest form for a row
 * whose source yields no technique to demonstrate, and it is preferred to a
 * plausible-looking scene with an unrelated title.
 */

import { createDemo as createSource35 } from './source-35';
import { createDemo as createSource36 } from './source-36';
import { createDemo as createSource37 } from './source-37';
import { createDemo as createSource38 } from './source-38';
import { createDemo as createSource39 } from './source-39';
import { createDemo as createSource40 } from './source-40';
import { createDemo as createSource41 } from './source-41';
import { createDemo as createSource42 } from './source-42';
import { createDemo as createSource43 } from './source-43';
import { createDemo as createSource45 } from './source-45';
import { createDemo as createSource46 } from './source-46';
import { createDemo as createSource47 } from './source-47';
import { createDemo as createSource48 } from './source-48';
import { createDemo as createSource49 } from './source-49';
import { createDemo as createSource50 } from './source-50';
import type { Demo, DemoAdaptation, DemoContext } from './shared';

export type ManifestEntry = {
  sourceId: number;
  title: string;
  method: string;
  adaptation: DemoAdaptation;
  sources: string[];
  limitation?: string;
  createDemo?: (context: DemoContext) => Demo;
};

export const manifest: ManifestEntry[] = [
  {
    sourceId: 35,
    title: 'One-page photoreal-scene brief, all-procedural',
    method:
      'Closed three-verb interaction whitelist enforced in code, plus an all-procedural surface '
      + 'synthesised from a CPU hash with zero external assets.',
    adaptation: 'adapted',
    sources: [
      'https://x.com/prasenx/status/2093762240361173305',
      'https://github.com/StarKnightt/gas-station-highway',
    ],
    limitation:
      'Process artefact: only the all-procedural clause and the whitelist are demonstrable as a '
      + 'scene. No licence file at the pin, so no expression is reused.',
    createDemo: createSource35,
  },
  {
    sourceId: 36,
    title: 'Voxel remesh with a highpoly attribute bake',
    method:
      'A highpoly authored in headless Blender, reduced by Blender\'s OpenVDB voxel remesher at a '
      + '0.22 m voxel (the silhouette control), with the highpoly\'s smooth normals transferred '
      + 'onto the result by nearest-surface BVH lookup. Three panels isolate the bake: highpoly, '
      + 'reduced mesh with its own normals, reduced mesh with the baked ones.',
    adaptation: 'adapted',
    sources: [
      'https://x.com/hybridherbst/status/2093299068441092380',
      'https://mesh-baker.needle.tools/',
    ],
    limitation:
      'Proprietary hosted tool, not used or purchased and with no public source; the Blender lane '
      + 'shown is the register\'s own recommended free alternative and upstream does NOT use '
      + 'Blender. No UV atlas, no normal/ORM texture bake, no tangents, and none of its TRELLIS '
      + 'generation stage. Nearest-surface transfer has no cage; no vertex flipped against the '
      + 'normals this scene replaces, and Blender\'s own 97.7 degree outlier does not reproduce '
      + 'there and is not claimed as one.',
    createDemo: createSource36,
  },
  {
    sourceId: 37,
    title: 'Z-up centimetres to Y-up metres at the ingest boundary, with cache-build progress',
    method:
      'One boundary function converts upstream Z-up centimetre records to Y-up metres; a '
      + 'simulated cache build reveals each record only as its entry completes.',
    adaptation: 'adapted',
    sources: [
      'https://x.com/samgcoder/status/2093773310203191312',
      'https://github.com/SamG-Coder/fable-test',
    ],
    limitation:
      'Records are generated from the seed; no commercial game data, format parser or streaming '
      + 'server is present. The cache pass is a timer, not a real build.',
    createDemo: createSource37,
  },
  {
    sourceId: 38,
    title: 'Spline-field forest on sculpted terrain: mask, species, ground cover, floor blend',
    method:
      'An authored spline field drives density on a sculpted patch and a separate mask field '
      + 'decides admissibility first, so the glade and the watercourse stay clear at any density. '
      + 'Four species carry their own slope/moisture windows, separation and normal-follow, one '
      + 'material each; clump geometry under a blade material carpets what the canopy leaves; a '
      + 'baked floor blend ties the scatter into the ground material. update() steps the curve '
      + 'through three authored poses and re-derives placement, cover, floor and overlay.',
    adaptation: 'adapted',
    sources: [
      'https://x.com/alightinastorm/status/2093648383202259325',
      'https://github.com/vibe-stack/super-terrain',
    ],
    limitation:
      'A 3 m analytic terrain patch, not the source\'s sculpting, CSG, tunnels or LOD streaming; '
      + 'no tree editor and no GLB export (the register calls the editor a product question). The '
      + 'floor blend is a 64x64 baked colour map, not a splat graph. Four species, not the '
      + 'unverified "30+ tree types". Licence state conflicts with the register — see '
      + 'SOURCE_RESEARCH.json.',
    createDemo: createSource38,
  },
  {
    sourceId: 39,
    title: 'Level generation as a replayable editor-operation log',
    method:
      'An ordered log of typed editor operations is replayed by a strict replayer that rejects '
      + 'any operation whose precondition is unmet rather than reordering it.',
    adaptation: 'adapted',
    sources: [
      'https://x.com/fabianofirmo/status/2094044844804993523',
      'https://x.com/Stefan_3D_AI',
    ],
    limitation:
      'No MCP bridge exists publicly and none is present: no repository, no released bridge, no '
      + 'licence, no engine, no agent. Both source demos also lean on Megascans libraries.',
    createDemo: createSource39,
  },
  {
    sourceId: 40,
    title: 'Emissive windows derived from voxel topology (zero lights)',
    method:
      'A cell emits only where it is hollow and solid material still stands above it, recomputed '
      + 'from the live voxel grid, so destroying a ceiling puts the glow out with no notification.',
    adaptation: 'adapted',
    sources: ['https://x.com/VoxpoliaGame', 'https://endstreet.itch.io/voxpolia'],
    limitation:
      'Atom 1 only. The destruction is a scripted carve on a timer, NOT emergent structural '
      + 'failure, and the amortised self-collision atom is absent.',
    createDemo: createSource40,
  },
  {
    sourceId: 41,
    title: 'Catalogue format: named, isolated, individually addressable exhibits',
    method:
      'Each technique is one numbered bay carrying its own subject and a noun-phrase title, '
      + 'resolvable by index without constructing any other, beside the merged-scene failure mode.',
    adaptation: 'adapted',
    sources: ['https://x.com/curllmooha', 'https://sketchesbycurllmooha.vercel.app/'],
    limitation:
      'None of the source\'s sixteen sketches is reproduced; the four subjects are trivial '
      + 'stand-ins built by this lane. Routing and page chrome belong to root\'s HTML lab.',
    createDemo: createSource41,
  },
  {
    sourceId: 42,
    title: 'CGA-style shape grammar: footprint to podium/shaft/crown to bays',
    method:
      'A building is derived by rewriting: a vertical mass split that tiles the height exactly, '
      + 'bays whose count follows face width over bay width, and a roof cap.',
    adaptation: 'adapted',
    sources: [
      'https://x.com/stefan_3d_ai?s=11',
      'https://github.com/vibe-stack/procedural-bank',
    ],
    limitation:
      'Written independently from the MIT source; recording is not adoption. Five rules, no '
      + 'kit-of-parts library, no textures.',
    createDemo: createSource42,
  },
  {
    sourceId: 43,
    title: 'Lighting kept as a movable parameter, objects kept separable',
    method:
      'The same props built twice — merged with irradiance baked into vertex colour, and '
      + 'separable with plain albedo under a real light that moves at runtime.',
    adaptation: 'adapted',
    sources: [
      'https://x.com/stefan_3d_ai/status/2093937170717585657',
      'https://haidilao0328.github.io/Lumera/',
    ],
    limitation:
      'No image-to-3D reconstruction happens or is simulated: Lumera has no released code or '
      + 'weights. Only the transferable principle, on a scene authored by this lane.',
    createDemo: createSource43,
  },
  {
    sourceId: 44,
    title: 'Thin comparators from the 2026-08-31 sweep',
    method:
      'Not implementable as a scene. The register records two posts and finds no technique in '
      + 'either: one is a single line of text over a video, the other a paid-partnership claim '
      + 'about a token-budgeted build loop.',
    adaptation: 'blocked',
    sources: [
      'https://x.com/lexnlin/status/2093982122197627217',
      'https://x.com/Stefan_3D_AI',
    ],
    limitation:
      'BLOCKED, and deliberately so. Neither post resolves to a repository, a released tool or a '
      + 'licence — the register states that this absence IS the finding, not a gap in the search. '
      + 'Both URLs were fetched by this lane (HTTP 200) and neither adds a method. The only '
      + 'transferable content is comparator discipline, which is a register practice and not a 3D '
      + 'technique, and the loop the second post gestures at is already carried better by rows '
      + '13/34 and the visual-gauntlet-loop skill. Any scene built under this ID would be a '
      + 'counterfeit: there is no named method for it to demonstrate.',
  },
  {
    sourceId: 45,
    title: 'Generated-shell post-processing: surface, WeldVertices, FillHoles, SmoothNormals',
    method:
      'A voxel field is surfaced, coincident vertices welded, single-use boundary edges chained '
      + 'into loops and fan-filled, then normals averaged — which only smooths because weld ran.',
    adaptation: 'adapted',
    sources: [
      'https://x.com/comfyui/status/2094561833638404449',
      'https://raw.githubusercontent.com/comfyanonymous/ComfyUI/0e65cb907193cf1013bda474593eb48d8c53d848/comfy_extras/nodes_mesh_postprocess.py',
    ],
    limitation:
      'The generator is absent: no Trellis.2/Pixal3D inference, no weights installed, no ComfyUI '
      + 'contacted. The PBR bake stage is not implemented. Independent TS, not a port. Three of '
      + 'the four named nodes were inspected at the pin; VoxelToMesh is not in that file and its '
      + 'implementation is unseen — see SOURCE_RESEARCH.json.',
    createDemo: createSource45,
  },
  {
    sourceId: 46,
    title: 'Beer-Lambert absorption with broadband backscatter upstream of the integral',
    method:
      'Per-channel absorption over a depth ramp with a spectrally flat bubble source injected '
      + 'inside the integral, beside the same energy added as a tint afterwards. The source is '
      + 'driven by the determinant of the horizontal-displacement Jacobian — the fold test that '
      + 'locates breaking — accumulated into one decaying field read twice: as surface foam '
      + 'composited after absorption, and as the bubble source inside it.',
    adaptation: 'adapted',
    sources: [
      'https://x.com/dangreenheck/status/2095028187063280085',
      'https://docs.threejswaterpro.com/license.html',
    ],
    limitation:
      'Items 4, 6 and the breaking-detection half of 7, of thirteen. NOT an FFT ocean: the '
      + 'spectrum is the repository\'s existing Gerstner forge. The foam field is per-vertex '
      + 'state on a fixed patch, not a world-fixed camera-following texture, and its three layers '
      + 'are not separated. No SSR, refraction, caustics or Snell window. Amplitude is the shipped '
      + 'authored value; presentation choppiness Q is raised to 8 so the surface can fold at all.',
    createDemo: createSource46,
  },
  {
    sourceId: 47,
    title: 'The street cell, authored in surface-priority order',
    method:
      'One street cell treated in descending order of screen area: road, then jointed paving and '
      + 'split kerb, then instanced recessed facade bays, then street furniture last.',
    adaptation: 'adapted',
    sources: [
      'https://x.com/mattshumer_/status/2095187868746383758',
      'https://somethingbig.ai/gauntlet-loop',
    ],
    limitation:
      'One cell, not a city; no road graph, traffic or trees. The reference\'s flat overcast '
      + 'grade is deliberately not adopted, and its own capture measured 18-20 fps.',
    createDemo: createSource47,
  },
  {
    sourceId: 48,
    title: 'Dark interior look with no GI, lightmaps or ray tracing',
    method:
      'Repetitive human-scale architecture, a narrow desaturated value band, emissive fixtures, '
      + 'two short-range lights on visible fixtures only, distance darkening, flat matte grime, '
      + 'a mote field and exactly one exposure event.',
    adaptation: 'adapted',
    sources: [
      'https://x.com/bijanbowen/status/2094931925513261273',
      'https://api.fxtwitter.com/bijanbowen/status/2094931925513261273',
    ],
    limitation:
      'No post chain in a lab exhibit, so the bloom halo and filmic grade that carry the look in '
      + 'the shipped renderer are absent. Distance darkening is baked per vertex, not fog.',
    createDemo: createSource48,
  },
  {
    sourceId: 49,
    title: 'Critically-damped constraint placement with a rolling motion context',
    method:
      'Target pose constraints placed by a critically-damped spring, with the last four produced '
      + 'frames retained as the context the next window would be planned from.',
    adaptation: 'adapted',
    sources: [
      'https://x.com/jichiep/status/2095157236658315288',
      'https://github.com/localai-org/motion-bricks.cpp',
    ],
    limitation:
      'NO MOTION IS GENERATED: the network is native C++/GGML with browser inference explicitly '
      + 'deferred upstream and its weights absent. Five schematic hinges, not the G1 skeleton '
      + 'and not the operator rig; no retarget is attempted or claimed.',
    createDemo: createSource49,
  },
  {
    sourceId: 50,
    title: 'Mechanical passability sweep: every 1.5 m, can a 0.34 m disc pass?',
    method:
      'Step the centreline every 1.5 m, sweep the full width, pass only if a player-radius disc '
      + 'fits; collapse blocked runs; the companion script exits non-zero when any station fails.',
    adaptation: 'adapted',
    sources: [
      'https://github.com/PhiloLabs/fable51-worlds',
      'https://raw.githubusercontent.com/PhiloLabs/fable51-worlds/1dcc255adc5600cfec8a7e3e38c896074668dd1e/kyoto-higashiyama/tools/passability.mjs',
    ],
    limitation:
      'The sweep runs against an analytic obstacle list, NOT a browser or the built world\'s real '
      + 'colliders, so it is the gate\'s shape and not yet the gate. No walkthrough probe.',
    createDemo: createSource50,
  },
];

export type { Demo, DemoContext, DemoAdaptation } from './shared';
