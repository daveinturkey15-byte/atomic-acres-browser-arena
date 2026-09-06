/**
 * forge-kit/lantern-head.ts - HF-536 PASS 2, the street lamp's HEAD.
 *
 * WHAT THIS REPLACES. The two verge lamp posts carried a single
 * 0.52 x 0.12 x 0.26 m box of `trim` at the fixture height
 * (`nuketown2-arena.ts:3379`). At 4.35 m, from 20 m down the street, that is a
 * dark horizontal dash: it has no lit face, no hood, and nothing that says
 * "lamp" rather than "bracket". It is the single loudest prop tell in the
 * street-centre frame.
 *
 * WHAT A LANTERN HEAD IS, in millimetres (R16/R17, real dimensions or nothing):
 * a shallow truncated pyramid hood about 560 x 300 mm at its mouth and 160 mm
 * deep, a flat cap course 30 mm proud of it, and a DIFFUSER PLATE on the
 * underside - the only face a player standing in the road can see lit. The
 * hood is four tapered walls rather than one box, so the silhouette breaks at
 * the mid scale (R20) and the sun catches one flank and not the other (R21).
 *
 * THE MATERIALS ARE BORROWED, NOT MINTED (R2). The hood, cap and rim reuse the
 * arena's own `trim` and `chrome` instances; the diffuser reuses the EXISTING
 * `warmLight` instance (`createNuketown2CeilingLightMaterial(true)`, the same
 * emissive material the house ceiling lenses use). Nothing here adds a graph
 * key, a `uniform()` node or a sampler - the program set is unchanged, which
 * is the condition the black-surface lane imposes on every forge pass.
 *
 * AUTHORITY. Every part is presentation only: `solid:false, shots:false,
 * cast:false, presentationOnly:true`. The lamp post is not cover and does not
 * become cover here (R29).
 */

/** One box the caller emits through its own `pair()`/`centred()` helper. */
export interface ForgeKitBox {
  /** Suffix appended to the caller's own id, e.g. `<id> hood n`. */
  readonly suffix: string;
  /** Offset from the anchor, metres, in the caller's authored frame. */
  readonly offset: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  /** The material ROLE the part wants; the caller resolves it. */
  readonly role: 'trim' | 'chrome' | 'warmLight' | 'block';
}

/** Mouth width / depth of the hood, metres - a 560 x 300 mm lantern. */
export const LANTERN_HEAD_MOUTH = Object.freeze({ width: 0.56, depth: 0.30 });
/** Hood height, metres. */
export const LANTERN_HEAD_HOOD_H = 0.16;
/** How far the lit diffuser plate hangs below the fixture anchor, metres. */
export const LANTERN_HEAD_DIFFUSER_DROP = 0.07;
/** Triangles this prefab adds per head (12 per box). */
export const LANTERN_HEAD_TRIANGLES = 12 * 7;

/**
 * The parts of one lantern head, anchored at the post's fixture point.
 *
 * The hood is built as four LEANING walls: each is a thin slab of the hood's
 * full height, set at half the taper in from the mouth edge, which reads as a
 * tapered pyramid in silhouette without a lathe or a custom buffer. `taper` is
 * how much each side draws in from mouth to cap (0.10 m = a 20 % rake).
 */
export function lanternHeadParts(taper = 0.10): readonly ForgeKitBox[] {
  const { width, depth } = LANTERN_HEAD_MOUTH;
  const wall = 0.035;
  const inset = taper / 2;
  const hoodY = LANTERN_HEAD_HOOD_H / 2;
  return Object.freeze([
    // Four hood walls. The two long ones span the full mouth; the two short
    // ones sit between them, so the corners meet instead of overlapping.
    Object.freeze({ suffix: 'hood front', offset: [0, hoodY, depth / 2 - inset] as const, size: [width - taper, LANTERN_HEAD_HOOD_H, wall] as const, role: 'trim' as const }),
    Object.freeze({ suffix: 'hood back', offset: [0, hoodY, -(depth / 2 - inset)] as const, size: [width - taper, LANTERN_HEAD_HOOD_H, wall] as const, role: 'trim' as const }),
    Object.freeze({ suffix: 'hood left', offset: [-(width / 2 - inset), hoodY, 0] as const, size: [wall, LANTERN_HEAD_HOOD_H, depth - taper - wall * 2] as const, role: 'trim' as const }),
    Object.freeze({ suffix: 'hood right', offset: [width / 2 - inset, hoodY, 0] as const, size: [wall, LANTERN_HEAD_HOOD_H, depth - taper - wall * 2] as const, role: 'trim' as const }),
    // Cap course, 40 mm proud of the hood mouth all round.
    Object.freeze({ suffix: 'cap', offset: [0, LANTERN_HEAD_HOOD_H + 0.015, 0] as const, size: [0.60, 0.03, 0.34] as const, role: 'trim' as const }),
    // The lit face. This is the whole point of the prefab: 440 x 220 mm of
    // emissive plate aimed at the road, 70 mm under the anchor.
    Object.freeze({ suffix: 'diffuser', offset: [0, -LANTERN_HEAD_DIFFUSER_DROP, 0] as const, size: [0.44, 0.02, 0.22] as const, role: 'warmLight' as const }),
    // A thin bright rim around the diffuser edge, so the lit face has an
    // outline at 30 m instead of dissolving into the hood.
    Object.freeze({ suffix: 'rim', offset: [0, -LANTERN_HEAD_DIFFUSER_DROP + 0.02, 0] as const, size: [0.48, 0.02, 0.26] as const, role: 'chrome' as const }),
  ]);
}
