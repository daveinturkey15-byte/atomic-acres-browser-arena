/**
 * Source 8 — Fully procedural jungle (`StarKnightt/jungle-trail`).
 *
 * Read at pin `c15640d3a2b6f08ca68e4df98fdfc953ea8a070a`: `PROMPT.md` in full
 * (lines 1-50), `src/gfx/glsl.js` and `src/render/grade.js`. Licence: MIT.
 *
 * PROMPT.md is unusually honest and is the primary source for this demo. It
 * records what the blind-critic loop actually caught (lines 37-50), and two of
 * those four defects are texture-generation bugs that any procedural vegetation
 * pass will reproduce:
 *   - "**Dark outlines on every leaf.** A premultiplied-alpha bug in the texture
 *      baker."
 *   - "**Black tree trunks.** Traced to inverted quad winding in the tube
 *      builder, compounded by a moss layer that was eating the bark."
 * It also records the honest score: vegetation was signed off at 5/10 after six
 * rounds.
 *
 * So this demo bakes a leaf-card atlas twice from the same generator. BEFORE
 * writes premultiplied colour into transparent texels, which is exactly how the
 * dark leaf outline appears once the sampler blends across the alpha edge. AFTER
 * bleeds straight-alpha colour outward past the silhouette so every texel the
 * filter can reach carries leaf colour. The bug is measurable, not just visible:
 * `darkEdgeTexels` counts texels with alpha under 255 whose RGB has been dragged
 * toward black.
 */

import {
  DisposalRegistry,
  countDrawables,
  countTriangles,
  makeRng,
  sideBySide,
  type Demo,
  type DemoContext,
  type ThreeNamespace,
} from './_shared';
import type * as THREE_NS from 'three';

const ATLAS = 64;
const LEAF_RGB = [74, 122, 52] as const;

/** Signed coverage of a leaf silhouette in atlas space: 1 inside, 0 outside. */
function leafCoverage(u: number, v: number): number {
  const x = (u - 0.5) * 2;
  const y = (v - 0.5) * 2;
  const width = 0.55 * Math.cos(y * 1.35) * (1 - Math.abs(y) * 0.35);
  const inside = Math.abs(x) < Math.abs(width) && Math.abs(y) < 0.95;
  const edge = Math.max(0, 1 - Math.abs(Math.abs(x) - Math.abs(width)) * 14);
  return inside ? 1 : edge * 0.35;
}

/**
 * Bake the leaf card. `premultiplied` reproduces the documented baker bug: alpha
 * is multiplied into RGB, so every partially transparent texel is darker, and
 * bilinear filtering smears that darkness into a visible outline.
 */
function bakeLeafAtlas(premultiplied: boolean): { data: Uint8Array; darkEdgeTexels: number } {
  const data = new Uint8Array(ATLAS * ATLAS * 4);
  let darkEdgeTexels = 0;
  for (let y = 0; y < ATLAS; y += 1) {
    for (let x = 0; x < ATLAS; x += 1) {
      const u = (x + 0.5) / ATLAS;
      const v = (y + 0.5) / ATLAS;
      const coverage = leafCoverage(u, v);
      const alpha = Math.round(Math.min(1, coverage) * 255);

      // Vein and shade variation, generated, never sampled from a photo.
      const vein = Math.exp(-((Math.abs((u - 0.5) * 2) * 9) ** 2)) * 0.25;
      const shade = 0.82 + 0.18 * (1 - Math.abs(v - 0.5) * 2) + vein;

      let r = LEAF_RGB[0] * shade;
      let g = LEAF_RGB[1] * shade;
      let b = LEAF_RGB[2] * shade;

      if (premultiplied) {
        const a = alpha / 255;
        r *= a;
        g *= a;
        b *= a;
      }
      // Straight alpha with edge bleed: colour is written even where alpha is 0,
      // so the filter never reaches an unwritten texel.

      const i = (y * ATLAS + x) * 4;
      data[i] = Math.round(r);
      data[i + 1] = Math.round(g);
      data[i + 2] = Math.round(b);
      data[i + 3] = alpha;
      if (alpha < 255 && data[i + 1] < LEAF_RGB[1] * 0.55) darkEdgeTexels += 1;
    }
  }
  return { data, darkEdgeTexels };
}

function buildCanopy(
  THREE: ThreeNamespace,
  registry: DisposalRegistry,
  texture: THREE_NS.Texture,
  seed: number,
): { group: THREE_NS.Group; cards: THREE_NS.InstancedMesh } {
  const group = new THREE.Group();
  const rng = makeRng(seed);

  const trunkGeometry = registry.track(new THREE.CylinderGeometry(0.035, 0.055, 1.1, 7, 1));
  const trunkMaterial = registry.track(
    new THREE.MeshStandardMaterial({ color: 0x5a4634, roughness: 0.95, side: THREE.FrontSide }),
  );
  for (let i = 0; i < 3; i += 1) {
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.set((rng() - 0.5) * 1.2, 0.55, (rng() - 0.5) * 1.2);
    trunk.name = `trunk-${i}`;
    group.add(trunk);
  }

  // Leaf cards as one InstancedMesh: layered silhouettes at one draw call.
  const cardGeometry = registry.track(new THREE.PlaneGeometry(0.22, 0.3));
  const cardMaterial = registry.track(
    new THREE.MeshStandardMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.35,
      side: THREE.DoubleSide,
      roughness: 0.78,
    }),
  );
  const count = 96;
  const cards = new THREE.InstancedMesh(cardGeometry, cardMaterial, count);
  cards.name = 'leaf-cards';
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scale = new THREE.Vector3();
  for (let i = 0; i < count; i += 1) {
    const layer = i % 3; // three canopy layers, as the prompt's system 2 asks
    position.set((rng() - 0.5) * 1.5, 0.55 + layer * 0.28 + rng() * 0.2, (rng() - 0.5) * 1.5);
    euler.set((rng() - 0.5) * 0.9, rng() * Math.PI * 2, (rng() - 0.5) * 0.7);
    quaternion.setFromEuler(euler);
    const s = 0.7 + rng() * 0.7;
    scale.set(s, s, s);
    matrix.compose(position, quaternion, scale);
    cards.setMatrixAt(i, matrix);
  }
  cards.instanceMatrix.needsUpdate = true;
  group.add(cards);

  return { group, cards };
}

export function createDemo(context: DemoContext): Demo {
  const { THREE } = context;
  const registry = new DisposalRegistry();

  const buggy = bakeLeafAtlas(true);
  const fixed = bakeLeafAtlas(false);

  const makeTexture = (data: Uint8Array) => {
    const texture = registry.track(new THREE.DataTexture(data, ATLAS, ATLAS, THREE.RGBAFormat));
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return texture;
  };

  const before = buildCanopy(THREE, registry, makeTexture(buggy.data), context.seed);
  const after = buildCanopy(THREE, registry, makeTexture(fixed.data), context.seed);
  before.group.name = 'before:premultiplied-baker-dark-leaf-outline';
  after.group.name = 'after:straight-alpha-with-edge-bleed';

  const root = sideBySide(THREE, registry, before.group, after.group, 2.6);
  root.name = 'source-08:procedural-canopy-texture-bake';

  const metadata = {
    sourceId: 8,
    title: 'Fully procedural jungle (same author, earlier)',
    method:
      'Bake every vegetation texture in code, and bake it with straight alpha and an edge bleed so the sampler never reads an unwritten texel - the premultiplied-alpha baker bug the upstream blind-critic loop caught as "dark outlines on every leaf". Layered leaf cards are drawn as one InstancedMesh.',
    adaptation: 'adapted' as const,
    sources: [
      'https://github.com/StarKnightt/jungle-trail',
      'StarKnightt/jungle-trail@c15640d3a2b6f08ca68e4df98fdfc953ea8a070a PROMPT.md:1-50 (MIT)',
    ],
    limitation:
      'Vegetation and its texture bake only - no terrain, path, ruins, waterfall, procedural audio, god rays or grade, all of which the upstream project owns and several of which belong to the host renderer here. The upstream project signed vegetation off at 5/10 after six critic rounds, so this row is not a photorealism claim.',
    counters: {
      triangles: countTriangles(root),
      drawables: countDrawables(root),
      leafInstances: after.cards.count,
      beforeDarkEdgeTexels: buggy.darkEdgeTexels,
      afterDarkEdgeTexels: fixed.darkEdgeTexels,
    },
  };

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();

  return {
    root,
    update(time: number) {
      // Wind, applied by mutating instance matrices in place. No allocation here:
      // the scratch objects above are hoisted, which is source 9's HIGH rule.
      for (const canopy of [before.cards, after.cards]) {
        for (let i = 0; i < canopy.count; i += 1) {
          canopy.getMatrixAt(i, matrix);
          matrix.decompose(position, quaternion, scale);
          const sway = Math.sin(time * 1.3 + position.x * 3 + position.z * 2) * 0.06;
          matrix.compose(position, quaternion, scale);
          matrix.elements[12] = position.x + sway;
          canopy.setMatrixAt(i, matrix);
        }
        canopy.instanceMatrix.needsUpdate = true;
      }
    },
    dispose() {
      registry.run();
    },
    metadata,
  };
}

export default createDemo;
