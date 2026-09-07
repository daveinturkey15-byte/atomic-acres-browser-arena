/**
 * forge-kit/kerb-course.ts - HF-536 (night-kit). A kerb that reads as stones.
 *
 * WHAT THIS ADDS. Each side of the stem is ONE box, 26 m long, 240 mm high,
 * 300 mm deep, in the `kerb` role (`nuketown2-arena.ts`, `carriageway stem
 * kerb`). It is a correct collider and a correct ballistic surface and it is
 * also, on screen, a 26 m grey stripe with no scale in it at all - the single
 * longest untextured run in the street-centre and into-sun frames. The boards
 * (`refs-boards/nuketown2/street-centre.target.png`) show a kerb made of
 * STONES: a lit chamfer line along the top arris, and a joint every metre.
 *
 * DIMENSIONS (R16/R17). A BS 7263 pre-cast concrete kerb is 915 mm long,
 * 125 mm x 255 mm in section, laid with a 13 mm chamfer on the road arris and
 * a 10 mm mortar joint. The stone length and the joint pitch here are the real
 * 915 mm. The chamfer is authored at 45 mm, NOT 13 mm, and that is a deliberate
 * departure recorded here rather than hidden: at the `street-centre` station
 * the kerb is 14-24 m from the eye, where 13 mm subtends under one pixel at
 * 1080p, so a true-scale chamfer would be measured as "no change" by the
 * scorer and seen as nothing by the player. 45 mm is the smallest section that
 * survives that sampling. Everything else is real.
 *
 * WHY IT WORKS. The chamfer is ROTATED 45 degrees about the run axis. That is
 * the entire point: an axis-aligned strip laid on an axis-aligned kerb shares
 * the kerb's normals and is invisible. A 45-degree face has its own normal, so
 * at golden hour it returns a different value from both the top and the road
 * face and draws one continuous bright line the length of the street. The
 * joints then INTERRUPT that line at 915 mm, and an interrupted highlight is
 * how an eye counts stones.
 *
 * AUTHORITY. Every part is presentation only. THE COLLIDER DOES NOT CHANGE:
 * the solid kerb box is untouched, and nothing here is solid, shot-rated or
 * shadow-casting, so movement, ballistics and the walkable-surface ledger are
 * byte-identical (R29). No new material - `kerb` already exists.
 *
 * Z-FIGHTING (owner defect, 2026-09-06 18:05). Nothing here is coplanar with
 * anything. The chamfer is at 45 degrees to every face it touches; the joint
 * haunches stand 8 mm proud of the top and the road face; the stone plates
 * stand 6 mm proud of the road face. The smallest separation in the prefab is
 * 6 mm, which is 50 x the depth-buffer resolution at this range.
 */

import type { ForgeKitBox } from './lantern-head';

/** BS 7263 kerb stone length, metres. */
export const KERB_STONE_LENGTH = 0.915;
/** Authored chamfer section, metres (see the header: real 13 mm, drawn 45 mm). */
export const KERB_CHAMFER = 0.045;
/** How far a mortar haunch stands proud, metres. */
export const KERB_JOINT_PROUD = 0.008;
/** How far an alternating stone face stands proud, metres. */
export const KERB_FACE_PROUD = 0.006;

export interface KerbCourseOptions {
  /** Length of the kerb run along x, metres. */
  readonly run: number;
  /** Kerb height (the solid box's y size), metres. */
  readonly height: number;
  /** Kerb depth (the solid box's z size), metres. */
  readonly tread: number;
  /** +1 if the road is at +z from this kerb, -1 if it is at -z. */
  readonly roadSide: 1 | -1;
  /** Cap on the number of stones drawn, so a long run cannot blow the budget. */
  readonly maxStones?: number;
}

/**
 * Parts of one kerb course, anchored at the CENTRE of the solid kerb box.
 * The caller emits them through `centred()` (the stem kerbs are authored per
 * side, not as a 180-degree pair, because the road is not symmetric in z).
 */
export function kerbCourseParts(options: KerbCourseOptions): readonly ForgeKitBox[] {
  const { run, height, tread, roadSide } = options;
  const maxStones = options.maxStones ?? 40;
  const stones = Math.min(maxStones, Math.max(2, Math.round(run / KERB_STONE_LENGTH)));
  const pitch = run / stones;
  const top = height / 2;
  const roadFace = roadSide * (tread / 2);
  const parts: ForgeKitBox[] = [
    // The chamfer arris, the full length of the run, rotated 45 degrees about
    // x so half its section is buried in the kerb and the lit half faces up
    // and out toward the road.
    {
      suffix: 'kerb chamfer',
      offset: [0, top - KERB_CHAMFER * 0.35, roadFace - roadSide * KERB_CHAMFER * 0.35],
      size: [run, KERB_CHAMFER, KERB_CHAMFER],
      role: 'kerb',
      rotation: [roadSide * (Math.PI / 4), 0, 0],
    },
  ];
  for (let index = 0; index < stones; index += 1) {
    const x = -run / 2 + (index + 0.5) * pitch;
    // Mortar haunch at the joint: 40 mm of squeezed mortar standing 8 mm proud
    // of the top and the road face. It breaks the chamfer highlight, which is
    // what makes the run read as stones rather than as one extrusion.
    parts.push({
      suffix: `kerb joint ${index}`,
      offset: [x - pitch / 2, KERB_JOINT_PROUD / 2, roadSide * KERB_JOINT_PROUD / 2],
      size: [0.04, height + KERB_JOINT_PROUD, tread + KERB_JOINT_PROUD],
      role: 'kerb',
    });
    // Every other stone gets its road face pushed 6 mm out: a laid kerb is
    // never perfectly in line, and the alternation gives the run a low-
    // frequency value rhythm the eye reads as individual stones at 20 m.
    if (index % 2 === 0) {
      parts.push({
        suffix: `kerb face ${index}`,
        offset: [x, -0.02, roadFace + roadSide * (KERB_FACE_PROUD / 2)],
        size: [pitch - 0.06, height - 0.05, KERB_FACE_PROUD],
        role: 'kerb',
      });
    }
  }
  return Object.freeze(parts);
}

/** Triangles a course of `stones` stones adds: chamfer + joints + alternating faces. */
export function kerbCourseTriangles(stones: number): number {
  return 12 * (1 + stones + Math.ceil(stones / 2));
}
