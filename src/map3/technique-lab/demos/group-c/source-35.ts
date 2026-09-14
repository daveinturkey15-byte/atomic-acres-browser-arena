/**
 * Source 35 — gas-station-highway: the one-page photoreal-scene brief.
 *
 * Method, extracted from the primary artefact (`PROMPT.md` at
 * StarKnightt/gas-station-highway @ 3e1b7cbb1f46bb0b0601b4d06ceef63438ae132c,
 * 7,308 B, read in full): a scene brief is one page and carries four parts —
 *   1. an ATMOSPHERE PIN that says what the place is and, just as hard, what it
 *      is not ("This is not a jungle. Not a desert canyon. Not a foggy forest.");
 *   2. a STRICT VERB WHITELIST — "Interactions (ONLY these three)" — plus an
 *      explicit "Do NOT add" list that forbids everything else by name;
 *   3. an ALL-PROCEDURAL CLAUSE — "Zero external assets. Every texture, every
 *      mesh, every sound must be generated procedurally in code";
 *   4. a DEPARTURES APPENDIX written after the build ("Where the build departed
 *      from this"), each departure carrying its reason.
 *
 * What this scene demonstrates, and what it does not: the brief is a process
 * artefact, so the demonstrable part is the clause that has geometry — the
 * all-procedural one — plus the whitelist as an executable contract rather than
 * prose. BEFORE is the forecourt slab as a flat placeholder colour, which is
 * what "an asset was supposed to go here" looks like. AFTER is the same slab
 * with its surface synthesised in code: aggregate, cold-patch repairs, tar
 * seams and one leftover puddle (the brief's "leftover water, not active
 * rain"). Three whitelisted interaction markers stand on the after slab; a
 * fourth, non-whitelisted verb is offered to the builder and is refused, which
 * is the part of the pattern that actually bites.
 *
 * Licence position: NO LICENSE FILE at the pinned revision — re-verified by
 * this lane (raw.githubusercontent LICENSE at the pin returned HTTP 404, 14 B).
 * Authority 2b applies: the technique is learned, the expression is not copied.
 * No code, constant, shader body or texture from that repository is reused; the
 * asphalt synthesis below is written here from the general idea.
 */

import { hash11 } from '../../../noise';
import {
  beforeAfterPanels,
  countDraws,
  createRng,
  disposeTree,
  paintVertices,
  type Demo,
  type DemoContext,
} from './shared';

/**
 * The brief's verb whitelist, verbatim in intent and reduced to the three the
 * brief admits. A builder asking for anything not in this set is refused.
 */
const INTERACTION_WHITELIST = ['pump', 'door', 'fridge'] as const;
type InteractionVerb = (typeof INTERACTION_WHITELIST)[number];

/** Named in the brief's own "Do NOT add" list, so refusal is not a judgement call. */
const FORBIDDEN_VERBS = ['drive', 'shop', 'inventory', 'quest', 'map'] as const;

export type BriefRequest = { verb: string; at: [number, number] };

export type BriefOutcome = {
  admitted: Array<{ verb: InteractionVerb; at: [number, number] }>;
  refused: Array<{ verb: string; reason: string }>;
};

/**
 * The executable half of the pattern. A one-page brief is only worth writing if
 * something enforces it; this is that something, and it is deliberately dumb —
 * membership of a closed set, not an interpretation of intent.
 */
export function applyBrief(requests: readonly BriefRequest[]): BriefOutcome {
  const admitted: BriefOutcome['admitted'] = [];
  const refused: BriefOutcome['refused'] = [];
  for (const request of requests) {
    if ((INTERACTION_WHITELIST as readonly string[]).includes(request.verb)) {
      admitted.push({ verb: request.verb as InteractionVerb, at: request.at });
    } else if ((FORBIDDEN_VERBS as readonly string[]).includes(request.verb)) {
      refused.push({ verb: request.verb, reason: 'named in the brief\'s Do NOT add list' });
    } else {
      refused.push({ verb: request.verb, reason: 'not in the three-verb whitelist' });
    }
  }
  return { admitted, refused };
}

/** CPU value noise over the slab, written here rather than taken from anywhere. */
function valueNoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const corner = (cx: number, cy: number) => hash11(cx * 157.31 + cy * 311.7);
  const top = corner(ix, iy) * (1 - sx) + corner(ix + 1, iy) * sx;
  const bottom = corner(ix, iy + 1) * (1 - sx) + corner(ix + 1, iy + 1) * sx;
  return top * (1 - sy) + bottom * sy;
}

/**
 * The all-procedural clause, honoured literally: every value in this surface is
 * computed, and the demo loads no image, no GLB and no audio file.
 */
function asphalt(x: number, z: number): [number, number, number] {
  let aggregate = 0;
  let amplitude = 0.5;
  let frequency = 1.6;
  for (let octave = 0; octave < 4; octave += 1) {
    aggregate += valueNoise(x * frequency, z * frequency) * amplitude;
    amplitude *= 0.5;
    frequency *= 2.07;
  }
  // Cold-patch repairs: broad low-frequency patches of a different, darker mix.
  const patch = valueNoise(x * 0.35 + 11.2, z * 0.35 - 4.7) > 0.62 ? 0.82 : 1;
  // Tar seams: thin bright-dark ridges along a slowly wandering line.
  const seam = Math.abs(Math.sin((z + valueNoise(x * 0.3, 0) * 1.4) * 1.9));
  const seamMask = seam < 0.06 ? 1 : 0;
  // One leftover puddle — standing water from last night, not active rain.
  const puddle = Math.max(0, 1 - Math.hypot(x - 0.55, z + 0.4) / 0.62);
  const base = (0.17 + aggregate * 0.16) * patch;
  const withSeam = base * (1 - seamMask * 0.35) + seamMask * 0.05;
  // Wet asphalt reads darker and slightly cooler, and holds a warm sky glint.
  const wet = withSeam * (1 - puddle * 0.55);
  return [wet + puddle * 0.14, wet + puddle * 0.13, wet * 1.06 + puddle * 0.19];
}

export function createDemo(context: DemoContext): Demo {
  const { THREE, seed } = context;
  const rng = createRng(seed);
  const root = new THREE.Group();
  root.name = 'source-35-one-page-brief';
  const { before, after } = beforeAfterPanels(THREE);

  // BEFORE — the placeholder an external asset would have replaced.
  const flatGeometry = new THREE.PlaneGeometry(2.6, 2.6, 1, 1);
  flatGeometry.rotateX(-Math.PI / 2);
  const flat = new THREE.Mesh(
    flatGeometry,
    new THREE.MeshStandardMaterial({ color: 0x4a4a4e, roughness: 0.95, metalness: 0 }),
  );
  flat.name = 'placeholder-slab';
  before.add(flat);

  // AFTER — the same slab, every value synthesised in code.
  const slabGeometry = new THREE.PlaneGeometry(2.6, 2.6, 96, 96);
  slabGeometry.rotateX(-Math.PI / 2);
  paintVertices(THREE, slabGeometry, (x, _y, z) => asphalt(x, z));
  const slab = new THREE.Mesh(
    slabGeometry,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 }),
  );
  slab.name = 'procedural-slab';
  after.add(slab);

  // The whitelist, exercised. Four verbs are requested; one is not admitted.
  const outcome = applyBrief([
    { verb: 'pump', at: [-0.8, -0.7] },
    { verb: 'door', at: [0.15, 0.85] },
    { verb: 'fridge', at: [0.95, 0.2] },
    { verb: 'drive', at: [-0.2, 0.1] },
  ]);

  const markerGeometry = new THREE.CylinderGeometry(0.07, 0.09, 0.34, 10);
  const markerMaterial = new THREE.MeshStandardMaterial({
    color: 0xd8c27a,
    emissive: 0x2a2210,
    roughness: 0.55,
    metalness: 0.1,
  });
  for (const entry of outcome.admitted) {
    const marker = new THREE.Mesh(markerGeometry, markerMaterial);
    marker.name = `interactable-${entry.verb}`;
    marker.position.set(entry.at[0], 0.17, entry.at[1]);
    marker.rotation.y = rng() * Math.PI;
    after.add(marker);
  }

  root.add(before, after);
  const draws = countDraws(root);

  return {
    root,
    dispose: () => disposeTree(root),
    metadata: {
      sourceId: 35,
      title: 'One-page photoreal-scene brief, all-procedural',
      method:
        'Atmosphere pin plus a closed three-verb interaction whitelist plus an all-procedural '
        + 'clause, enforced as code: the slab surface (aggregate, cold-patch repairs, tar seams, '
        + 'one leftover puddle) is synthesised from a CPU hash with no external asset, and a '
        + 'fourth, non-whitelisted verb is refused rather than quietly built.',
      adaptation: 'adapted',
      sources: [
        'https://x.com/prasenx/status/2093762240361173305',
        'https://github.com/StarKnightt/gas-station-highway',
        'https://raw.githubusercontent.com/StarKnightt/gas-station-highway/3e1b7cbb1f46bb0b0601b4d06ceef63438ae132c/PROMPT.md',
      ],
      limitation:
        'The brief is a process artefact; only its all-procedural clause and its whitelist are '
        + 'demonstrable as a scene. The source build\'s own subject (a walkable dawn gas station) '
        + 'is deliberately NOT reproduced — that would be copying the expression of a repository '
        + 'with no licence file at the pin (HTTP 404 re-verified by this lane). Lighting, sound '
        + 'and the blind-critic loop are out of scope for a lab exhibit.',
      localLights: [],
      counters: {
        verbsRequested: 4,
        verbsAdmitted: outcome.admitted.length,
        verbsRefused: outcome.refused.length,
        externalAssetsLoaded: 0,
        meshes: draws.meshes,
        triangles: draws.triangles,
      },
    },
  };
}

export default createDemo;
