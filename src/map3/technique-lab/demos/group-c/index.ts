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
import { createDemo as createSource40 } from './source-40';
import { createDemo as createSource46 } from './source-46';
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
      'Vertex-clustering voxel remesh at a settable grid spacing, with the highpoly normals '
      + 'averaged into the replacing cell so the reduced mesh keeps detail its geometry lost.',
    adaptation: 'adapted',
    sources: [
      'https://x.com/hybridherbst/status/2093299068441092380',
      'https://mesh-baker.needle.tools/',
    ],
    limitation:
      'Proprietary hosted tool, not used or purchased and with no public source. No UV atlas, no '
      + 'normal/ORM texture bake, no tangents, and none of its TRELLIS generation stage.',
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
    sourceId: 46,
    title: 'Beer-Lambert absorption with broadband backscatter upstream of the integral',
    method:
      'Per-channel absorption over a depth ramp with a spectrally flat bubble source injected '
      + 'inside the integral, beside the same energy added as a tint afterwards.',
    adaptation: 'adapted',
    sources: [
      'https://x.com/dangreenheck/status/2095028187063280085',
      'https://docs.threejswaterpro.com/license.html',
    ],
    limitation:
      'Items 4 and 6 of thirteen. NOT an FFT ocean: the surface is the repository\'s existing '
      + 'Gerstner forge. No foam field, SSR, refraction, caustics or Snell window.',
    createDemo: createSource46,
  },
];

export type { Demo, DemoContext, DemoAdaptation } from './shared';
