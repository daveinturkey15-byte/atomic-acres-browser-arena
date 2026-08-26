import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain .mjs QA helper, no type declarations by design.
import { readGlb } from '../scripts/qa/hunter-drone-glb.mjs';

/**
 * HF-380 shipped-silhouette contract.
 *
 * The owner's complaint was that the operator skins all read as the same
 * person. They did: every archetype was one body plus bolt-on props and
 * recolours, all three exactly 1.8538 m tall, to the millimetre.
 *
 * `create-pass74-operator-archetype-skins.py` grew a full silhouette-profile
 * system to fix that - per-archetype stature, shoulder, waist, hip and limb
 * targets, each with its own fail-closed distinctness gate. None of it ever
 * reached the game: the generator raised `UnboundLocalError` on its first
 * trace entry, so no archetype could be exported at all and the shipped GLBs
 * silently stayed on the pre-profile build.
 *
 * That is the failure this file exists to catch. The generator's own gates run
 * inside Blender, against geometry in memory, and prove nothing about the
 * bytes under `public/`. These assertions read the SHIPPED GLBs and pin that
 * the authored profile actually arrived - and that it arrived without breaking
 * the rig the animation and team-tint systems bind to.
 */

const SKIN_DIR = join(
  import.meta.dirname, '..', 'public', 'assets', 'original',
  'models', 'operators', 'pass74-operator-skins',
);

/**
 * Height of the unmodified canonical body every archetype derives from,
 * measured by the generator's own `measure_profile` on the pristine bind
 * pose. Each archetype ships at this times its authored `heightScale`.
 */
const CANONICAL_BODY_HEIGHT_M = 1.8538;

/** Spec `silhouetteProfile.params.heightScale`, the authored stature target. */
const HEIGHT_SCALE: Record<string, number> = {
  explorer: 0.925,
  symbiote: 1.03,
  navalops: 0.955,
};

const ARCHETYPES = Object.keys(HEIGHT_SCALE);
const PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['explorer', 'symbiote'],
  ['explorer', 'navalops'],
  ['symbiote', 'navalops'],
];

type Glb = { json: any; binary: Buffer };

function accessorFloats(json: any, binary: Buffer, index: number): Float32Array {
  const accessor = json.accessors[index];
  const view = json.bufferViews[accessor.bufferView];
  const components = ({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 } as Record<string, number>)[accessor.type];
  const stride = view.byteStride ?? components * 4;
  const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const out = new Float32Array(accessor.count * components);
  for (let i = 0; i < accessor.count; i += 1) {
    for (let c = 0; c < components; c += 1) {
      out[i * components + c] = binary.readFloatLE(base + i * stride + c * 4);
    }
  }
  return out;
}

/**
 * Body-only measurements. The `Cube.*` meshes ARE the canonical body;
 * everything else in the file is a per-archetype accessory, and accessories
 * must not be able to disguise an unchanged body as a distinct silhouette.
 */
function measureBody({ json, binary }: Glb) {
  let minY = Infinity;
  let maxY = -Infinity;
  let vertices = 0;
  const hash = createHash('sha256');
  for (const mesh of json.meshes ?? []) {
    if (!String(mesh.name).startsWith('Cube')) continue;
    for (const primitive of mesh.primitives ?? []) {
      const positionIndex = primitive.attributes?.POSITION;
      if (positionIndex === undefined) continue;
      const positions = accessorFloats(json, binary, positionIndex);
      vertices += positions.length / 3;
      for (let i = 1; i < positions.length; i += 3) {
        if (positions[i] < minY) minY = positions[i];
        if (positions[i] > maxY) maxY = positions[i];
      }
      hash.update(Buffer.from(positions.buffer, positions.byteOffset, positions.byteLength));
    }
  }
  expect(vertices, 'body meshes found').toBeGreaterThan(0);
  return { heightM: maxY - minY, vertices, positionHash: hash.digest('hex') };
}

const loaded = new Map<string, Glb>();
async function skin(archetype: string): Promise<Glb> {
  const cached = loaded.get(archetype);
  if (cached) return cached;
  const glb = await readGlb(join(SKIN_DIR, `pass74-operator-skin-${archetype}-lod0.glb`)) as Glb;
  loaded.set(archetype, glb);
  return glb;
}

describe('HF-380 shipped operator skin silhouettes', () => {
  it('ships a body whose stature matches the archetype it was authored for', async () => {
    for (const archetype of ARCHETYPES) {
      const { heightM } = measureBody(await skin(archetype));
      const authored = CANONICAL_BODY_HEIGHT_M * HEIGHT_SCALE[archetype];
      // 2% covers the accessory ground-plane settle and the envelope clamp.
      // It does NOT cover a body that was never shaped: an unshaped archetype
      // ships at the full 1.8538 m, which is 8% high for explorer.
      expect(
        Math.abs(heightM - authored) / authored,
        `${archetype} stature: shipped ${heightM.toFixed(4)} m vs authored ${authored.toFixed(4)} m`,
      ).toBeLessThan(0.02);
    }
  });

  it('ships three bodies that are measurably different people', async () => {
    const heights = new Map<string, number>();
    for (const archetype of ARCHETYPES) {
      heights.set(archetype, measureBody(await skin(archetype)).heightM);
    }

    // Absolute separation: the archetypes must not sit within a few
    // millimetres of each other, which is exactly what the pre-fix build did
    // (all three at 1.8538 m).
    for (const [a, b] of PAIRS) {
      const gap = Math.abs(heights.get(a)! - heights.get(b)!);
      expect(gap, `${a} vs ${b} stature separation (${gap.toFixed(4)} m)`).toBeGreaterThan(0.04);
    }

    // Relative separation: the ratios between shipped bodies must reproduce
    // the ratios the spec authored. This is the assertion an unshaped build
    // cannot pass by accident - three identical bodies give every ratio 1.0.
    for (const [a, b] of PAIRS) {
      const shipped = heights.get(a)! / heights.get(b)!;
      const authored = HEIGHT_SCALE[a] / HEIGHT_SCALE[b];
      expect(
        Math.abs(shipped - authored) / authored,
        `${a}/${b} stature ratio: shipped ${shipped.toFixed(4)} vs authored ${authored.toFixed(4)}`,
      ).toBeLessThan(0.025);
    }
  });

  it('ships three distinct body meshes, not one body in three costumes', async () => {
    const hashes = new Map<string, string>();
    for (const archetype of ARCHETYPES) {
      hashes.set(archetype, measureBody(await skin(archetype)).positionHash);
    }
    expect(
      new Set(hashes.values()).size,
      `body position hashes: ${JSON.stringify([...hashes])}`,
    ).toBe(3);
  });

  it('keeps the canonical rig contract every archetype binds to', async () => {
    for (const archetype of ARCHETYPES) {
      const { json } = await skin(archetype);
      // 62 joints and 24 clips: the animation set is shared, so a skeleton
      // edit here silently breaks every other archetype's playback.
      expect(json.skins?.[0]?.joints?.length, `${archetype} joint count`).toBe(62);
      expect((json.animations ?? []).length, `${archetype} animation clips`).toBe(24);
      // Runtime team tinting binds to these four names; renaming one drops
      // that archetype out of team colouring with no other symptom.
      expect(
        (json.materials ?? []).map((material: { name: string }) => material.name).sort(),
        `${archetype} canonical material names`,
      ).toEqual(['Skin', 'Swat', 'Swat_Black', 'Visor']);
    }
  });
});
