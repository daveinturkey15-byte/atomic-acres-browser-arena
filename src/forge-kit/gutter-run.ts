/**
 * forge-kit/gutter-run.ts - HF-536 (night-kit). Eaves gutter and downpipes.
 *
 * WHAT THIS ADDS. Both houses end at a 120 mm fascia band
 * (`nuketown2-arena.ts`, `house front roof fascia`) and then nothing: the wall
 * meets the roof in one clean line, top to bottom, on every elevation. A real
 * house of this period hangs a gutter off that fascia and drops a pipe at each
 * end, and the eye reads those two things before it reads any texture - they
 * are what breaks a 11 m wall into something built rather than extruded, and
 * they are the difference the boards show at `front-porch` and `north-yard`.
 *
 * DIMENSIONS (R16/R17 - real millimetres or nothing). A domestic half-round
 * gutter is 112 mm across the mouth and about 75 mm deep, hung so its outer
 * bead sits ~15 mm below the tile line; a round downpipe is 68 mm; a shoe
 * throws the water 90 mm clear of the wall about 200 mm above ground. Authored
 * here as: trough 120 x 90 mm, outer bead 110 x 35 mm, downpipe 75 x 75 mm,
 * shoe 90 mm deep. The bead is a SEPARATE box standing 20 mm proud of the
 * trough face, because that is the part the low sun catches: it is the bright
 * horizontal line under the eaves in every reference photograph, and one box
 * with one normal cannot produce it.
 *
 * WHY BOXES AND NOT A LATHE. Eight boxes per elevation cost 96 triangles and
 * batch into the existing `trim` presentation batch (+0 draw calls). A round
 * lathed gutter at 8 segments costs ~600 triangles per elevation, needs its
 * own non-indexed merge, and at the review distance (12-30 m) is the same two
 * pixels of highlight. The silhouette rule (R20) asks for a break at three
 * scales, not for round pipe.
 *
 * AUTHORITY. Presentation only - `solid:false, shots:false, cast:false,
 * presentationOnly:true`. A downpipe is not cover and never becomes cover
 * (R29). No new material, no new sampler: `trim` and `chrome` already exist.
 */

import type { ForgeKitBox } from './lantern-head';

/** Mouth width and depth of the trough, metres (112 x 75 mm rounded to build). */
export const GUTTER_TROUGH = Object.freeze({ width: 0.12, depth: 0.09 });
/** Downpipe section, metres (68 mm nominal, authored 75 mm). */
export const GUTTER_DOWNPIPE = 0.075;
/** Triangles one gutter run adds (12 per box). */
export const GUTTER_RUN_TRIANGLES = 12 * 8;

export interface GutterRunOptions {
  /** Length of the eaves run, metres (the wall width the gutter spans). */
  readonly run: number;
  /** How far the downpipes fall from the anchor to the shoe, metres. */
  readonly drop: number;
  /**
   * Where the two downpipes stand, as a fraction of half the run from the
   * centre. 0.94 puts them just inboard of the corners, which is where a
   * builder puts them and where they do the most for the silhouette.
   */
  readonly pipeSpan?: number;
  /** +1 if the eaves face +z, -1 if it faces -z. The gutter hangs outboard. */
  readonly facing: 1 | -1;
}

/**
 * Parts of one eaves run, anchored at the OUTER FACE of the fascia, at the
 * fascia's own centre height. The caller emits them through `pair()`.
 */
export function gutterRunParts(options: GutterRunOptions): readonly ForgeKitBox[] {
  const { run, drop, facing } = options;
  const span = options.pipeSpan ?? 0.94;
  const { width, depth } = GUTTER_TROUGH;
  const pipe = GUTTER_DOWNPIPE;
  const out = facing * (depth / 2);          // trough centre, hung outboard of the fascia
  const beadOut = facing * (depth * 0.72);   // the lit lip, 20 mm proud of the trough face
  const pipeOut = facing * (pipe / 2 + 0.01);
  const pipeX = (run / 2) * span;
  const parts: ForgeKitBox[] = [
    // The trough: one band the full width of the eaves, hung 60 mm below the
    // fascia centre so the roof edge still reads above it.
    { suffix: 'gutter trough', offset: [0, -0.06, out], size: [run + 0.06, width, depth], role: 'trim' },
    // The bead. This is the whole point of the prefab: a 35 mm lip standing
    // proud of the trough, so the low sun draws one bright horizontal line the
    // full width of the house instead of leaving a flat band.
    { suffix: 'gutter bead', offset: [0, -0.10, beadOut], size: [run + 0.10, 0.035, 0.03], role: 'chrome' },
  ];
  for (const [index, side] of [-1, 1].entries()) {
    const x = side * pipeX;
    // Hopper where the trough turns down: a short wider block, the join a real
    // gutter makes and the thing that stops the pipe reading as a floating rod.
    parts.push({ suffix: `gutter hopper ${index}`, offset: [x, -0.12, out], size: [0.13, 0.10, depth + 0.01], role: 'trim' });
    parts.push({ suffix: `gutter downpipe ${index}`, offset: [x, -0.12 - drop / 2, pipeOut], size: [pipe, drop, pipe], role: 'trim' });
    // Shoe at the bottom: 90 mm of pipe thrown clear of the wall, 200 mm up.
    parts.push({ suffix: `gutter shoe ${index}`, offset: [x, -0.12 - drop - 0.05, facing * (pipe / 2 + 0.05)], size: [pipe, 0.14, pipe + 0.09], role: 'trim' });
  }
  return Object.freeze(parts);
}
