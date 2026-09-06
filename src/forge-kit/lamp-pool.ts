/**
 * forge-kit/lamp-pool.ts - HF-536 NIGHT MUSE-LAMPS, ground light pools and post cone highlights.
 *
 * WHAT WAS MISSING (critic gap #3, street-centre (560,25)-(625,185)): the
 * kit lane's lantern heads carry emissive faces and bloom halos, but the
 * street under them stays dark - a lit lamp with no pool is a lamp-shaped
 * sticker (night-poc `buildStreetAfter`, same note). The PoC proved the fix:
 * one additive ground quad under the lantern, warm, falling off radially.
 *
 * WHAT THIS IS. Two boxes per lamp, anchored at the GROUND under the post
 * (the arena pairs them through its own `pair()`, so handedness, symmetry
 * and presentation-only flags keep working exactly as for authored geometry):
 *   (a) LIGHT POOL: a 5.2 x 5.2 m slab, 20 mm thick, centred 12 mm over the
 *       verge (22 mm over the carriageway crown, whose slab tops at 0.0) -
 *       radius ~2.6 m inscribed by the shader falloff, not by geometry;
 *   (b) CONE HIGHLIGHT: a 100 mm x 2.0 m strip on the post's ROAD side,
 *       spanning y 2.2..4.2 so its bright end meets the head at 4.35 m and
 *       fades down the post - the post reads lit under its own head.
 *
 * ONE MATERIAL FOR THE WHOLE LANE (Amendment B: "additive light pool; no
 * existing role is additive"). Both parts, at both posts, share a single
 * `MeshBasicNodeMaterial`: warm 0xffc37a, additive, transparent, depthWrite
 * off, radial falloff from 0.35 at the centre to 0 at the rim computed from
 * the face UV (every BoxGeometry face spans 0..1, so one formula serves the
 * pool's top face AND the strip's front face - bright middle fading to both
 * ends, which is the vertical gradient the brief asks for). No texture
 * sampler, no `uniform()` node: colour and opacity are literals baked into
 * the one graph, so the pipeline budget grows by exactly one program and the
 * black-surface lane's program-set condition holds. Because every pool box
 * shares that one instance, `batchPresentationOnlyBoxes` folds all four
 * pools into a single static batch: +1 draw for the whole arena.
 *
 * DEPTH. The slab sits 2 mm proud of the lawn tile, so the race is pinned
 * with polygonOffset -3 (one tier above the -2 road dashes) rather than left
 * to the depth buffer at 20 m. depthTest stays on: houses still occlude it.
 *
 * AUTHORITY. No lights (R5: the rig is frozen at 30, a point light per lamp
 * is forbidden). Presentation only: `solid:false, shots:false, cast:false,
 * presentationOnly:true`, emitted with the lamp head's own `propId` so the
 * declutter ratchet keeps counting one prop per lamp.
 */
import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';
import type { ForgeKitBox } from './lantern-head';

/** Cast boundary for the TSL DSL (repo idiom: one cast per module). */
const {
  clamp,
  float,
  length,
  uv,
  vec2,
  vec3,
  vec4,
} = TSL as unknown as Record<string, any>;

/** Pool radius, metres - the brief's ~2.6 m, inscribed in the slab by the falloff. */
export const LAMP_POOL_RADIUS = 2.6;
/** Pool slab centre height: 12 mm over the verge tile (top 0.022), 22 mm over the road crown. */
export const LAMP_POOL_Y = 0.012;
/** Slab thickness: 20 mm, so the foot is buried and no edge floats. */
export const LAMP_POOL_SLAB_H = 0.02;
/** Warm sodium-ish tint (brief: 0xffc37a-ish). Baked as a linear literal, not a uniform. */
export const LAMP_POOL_COLOR_HEX = 0xffc37a;
/** Centre opacity; the TSL falloff takes it to 0 at the rim. Subtle under the golden-hour key. */
export const LAMP_POOL_OPACITY = 0.35;
/** Triangles this prefab adds per lamp: one pool slab plus one highlight strip, 12 each. */
export const LAMP_POOL_TRIANGLES = 12 * 2;

/** The cone-highlight strip: narrow plate on the post's road face, bright end at the head. */
export const LAMP_POST_HIGHLIGHT = Object.freeze({
  /** 100 mm wide - inside the 120 mm post, so it reads as a lit face, never a fin. */
  width: 0.10,
  /** 2.0 m tall: y 2.2..4.2, bright end meeting the head, fading down the post. */
  height: 2.0,
  /** 20 mm thick; the back 8 mm sit inside the post so no faces are coplanar. */
  depth: 0.02,
  /** Strip centre height, metres. */
  centreY: 3.2,
  /** Road-side offset: front face 12 mm proud of the post, back buried in it. */
  faceOffsetZ: 0.062,
});

/**
 * The parts of one lamp pool, anchored at the GROUND under the post.
 *
 * The strip sits on the authored +z face; `pair()` mirrors it onto -z for
 * the south half, which faces its own road side too - the road is always
 * toward z = 0 from either verge.
 */
export function lampPoolParts(): readonly ForgeKitBox[] {
  const span = LAMP_POOL_RADIUS * 2;
  const highlight = LAMP_POST_HIGHLIGHT;
  return Object.freeze([
    Object.freeze({
      suffix: 'light pool',
      offset: [0, LAMP_POOL_Y, 0] as const,
      size: [span, LAMP_POOL_SLAB_H, span] as const,
      role: 'lampPool' as const,
    }),
    Object.freeze({
      suffix: 'cone highlight',
      offset: [0, highlight.centreY, highlight.faceOffsetZ] as const,
      size: [highlight.width, highlight.height, highlight.depth] as const,
      role: 'lampPool' as const,
    }),
  ]);
}

let cachedLampPoolMaterial: MeshBasicNodeMaterial | null = null;

/**
 * The lane's ONE additive material, shared by every pool and strip in the arena.
 *
 * Module singleton (not per-lamp, not per-build): one instance, one node
 * graph, one compiled program, one static batch. The falloff is a pure
 * function of the face UV - `d = |uv*2-1|`, 0 at the centre, 1 at the edge
 * midpoints - squared and scaled by the centre opacity, so the pool's top
 * face draws a circular warm patch and the strip's front face draws a
 * vertical highlight, from the same graph.
 */
export function getLampPoolMaterial(): MeshBasicNodeMaterial {
  if (cachedLampPoolMaterial) return cachedLampPoolMaterial;
  const material = new MeshBasicNodeMaterial();
  material.name = 'nuketown2-lamp-pool';
  material.transparent = true;
  material.depthWrite = false;
  material.blending = THREE.AdditiveBlending;
  // One tier above the -2 road dashes: the pool draws over the markings, never under them.
  material.polygonOffset = true;
  material.polygonOffsetFactor = -3;
  material.polygonOffsetUnits = -3;
  const warm = new THREE.Color().setHex(LAMP_POOL_COLOR_HEX, THREE.SRGBColorSpace);
  const tint = vec3(float(warm.r), float(warm.g), float(warm.b));
  const centred = uv().sub(vec2(float(0.5), float(0.5))).mul(float(2.0));
  const edge = clamp(float(1).sub(length(centred)), float(0), float(1));
  const falloff = edge.mul(edge).mul(float(LAMP_POOL_OPACITY));
  material.colorNode = vec4(tint, falloff);
  cachedLampPoolMaterial = material;
  return material;
}
