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

/** Axis-aligned bounds, in metres, over the meshes `select` accepts. */
function measureMeshes({ json, binary }: Glb, select: (name: string) => boolean) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let meshes = 0;
  for (const mesh of json.meshes ?? []) {
    if (!select(String(mesh.name))) continue;
    meshes += 1;
    for (const primitive of mesh.primitives ?? []) {
      const positionIndex = primitive.attributes?.POSITION;
      if (positionIndex === undefined) continue;
      const positions = accessorFloats(json, binary, positionIndex);
      for (let i = 0; i < positions.length; i += 3) {
        for (let axis = 0; axis < 3; axis += 1) {
          if (positions[i + axis] < min[axis]) min[axis] = positions[i + axis];
          if (positions[i + axis] > max[axis]) max[axis] = positions[i + axis];
        }
      }
    }
  }
  return {
    meshes,
    width: max[0] - min[0],
    height: max[1] - min[1],
    depth: max[2] - min[2],
    top: max[1],
    bottom: min[1],
  };
}

function accessoryNames({ json }: Glb): string[] {
  return (json.meshes ?? [])
    .map((mesh: { name: string }) => String(mesh.name))
    .filter((name: string) => name.includes('_Acc_'))
    .sort();
}

const loaded = new Map<string, Glb>();
async function skin(archetype: string, lod: 0 | 1 = 0): Promise<Glb> {
  const key = `${archetype}-lod${lod}`;
  const cached = loaded.get(key);
  if (cached) return cached;
  const glb = await readGlb(join(SKIN_DIR, `pass74-operator-skin-${archetype}-lod${lod}.glb`)) as Glb;
  loaded.set(key, glb);
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
/**
 * HF-380 sprint-1 / sprint-2 accessory manifest, read out of the SHIPPED GLBs.
 *
 * The silhouette assertions above deliberately measure only `Cube*` body
 * meshes, so until Pass 81 the entire accessory deliverable of commits
 * edf8cb2e (braid, twin thigh holsters, talons, cranial crest, ocular patches)
 * and 24f702ad (visor resize, holster offset) was unpinned: deleting every
 * accessory, or letting one builder silently drop out of ACCESSORY_BUILDERS in
 * `create-pass74-operator-archetype-skins.py`, left the whole suite green.
 * That is the same failure mode that let the GLBs sit three days stale behind
 * an `UnboundLocalError` in `enforce_silhouette_envelope`.
 *
 * Every name and number below was measured on 2026-08-28 from the shipped
 * lod0/lod1 POSITION accessors, not copied from the generator. Falsifier,
 * actually run: point `SKIN_DIR` at the pre-edf8cb2e GLBs and these go red.
 */
const ACCESSORY_MANIFEST: Record<string, readonly string[]> = {
  explorer: [
    'Pass74_Explorer_Acc_ankle-gaiter-straps_Foot.L',
    'Pass74_Explorer_Acc_ankle-gaiter-straps_Foot.L_buckle',
    'Pass74_Explorer_Acc_ankle-gaiter-straps_Foot.R',
    'Pass74_Explorer_Acc_ankle-gaiter-straps_Foot.R_buckle',
    'Pass74_Explorer_Acc_braided-hair-fall_plait_0',
    'Pass74_Explorer_Acc_braided-hair-fall_plait_1',
    'Pass74_Explorer_Acc_braided-hair-fall_plait_2',
    'Pass74_Explorer_Acc_braided-hair-fall_plait_3',
    'Pass74_Explorer_Acc_braided-hair-fall_tie_0',
    'Pass74_Explorer_Acc_braided-hair-fall_tie_1',
    'Pass74_Explorer_Acc_compass-chest-strap_Chest',
    'Pass74_Explorer_Acc_compass-chest-strap_compass_body',
    'Pass74_Explorer_Acc_compass-chest-strap_compass_face',
    'Pass74_Explorer_Acc_field-belt-with-double-pouches_belt',
    'Pass74_Explorer_Acc_field-belt-with-double-pouches_pouch_0',
    'Pass74_Explorer_Acc_field-belt-with-double-pouches_pouch_1',
    'Pass74_Explorer_Acc_goggles-raised-visor-variant_band',
    'Pass74_Explorer_Acc_goggles-raised-visor-variant_lens',
    'Pass74_Explorer_Acc_map-case-thigh-strap_UpperLeg.R',
    'Pass74_Explorer_Acc_map-case-thigh-strap_UpperLeg.R.001',
    'Pass74_Explorer_Acc_map-case-thigh-strap_UpperLeg.R.002',
    'Pass74_Explorer_Acc_rolled-cuff-sleeve-bands_LowerArm.L',
    'Pass74_Explorer_Acc_rolled-cuff-sleeve-bands_LowerArm.L.001',
    'Pass74_Explorer_Acc_rolled-cuff-sleeve-bands_LowerArm.R',
    'Pass74_Explorer_Acc_rolled-cuff-sleeve-bands_LowerArm.R.001',
    'Pass74_Explorer_Acc_twin-thigh-holsters_UpperLeg.L',
    'Pass74_Explorer_Acc_twin-thigh-holsters_UpperLeg.L.001',
    'Pass74_Explorer_Acc_twin-thigh-holsters_UpperLeg.L.002',
    'Pass74_Explorer_Acc_twin-thigh-holsters_UpperLeg.L_guard',
    'Pass74_Explorer_Acc_twin-thigh-holsters_UpperLeg.R',
    'Pass74_Explorer_Acc_twin-thigh-holsters_UpperLeg.R.001',
    'Pass74_Explorer_Acc_twin-thigh-holsters_UpperLeg.R.002',
    'Pass74_Explorer_Acc_twin-thigh-holsters_UpperLeg.R_guard',
  ],
  symbiote: [
    'Pass74_Symbiote_Acc_elongated-cranial-crest_plate_0',
    'Pass74_Symbiote_Acc_elongated-cranial-crest_plate_1',
    'Pass74_Symbiote_Acc_elongated-cranial-crest_plate_2',
    'Pass74_Symbiote_Acc_forearm-guard-wraps_LowerArm.L',
    'Pass74_Symbiote_Acc_forearm-guard-wraps_LowerArm.L.001',
    'Pass74_Symbiote_Acc_forearm-guard-wraps_LowerArm.L_guard',
    'Pass74_Symbiote_Acc_forearm-guard-wraps_LowerArm.R',
    'Pass74_Symbiote_Acc_forearm-guard-wraps_LowerArm.R.001',
    'Pass74_Symbiote_Acc_forearm-guard-wraps_LowerArm.R_guard',
    'Pass74_Symbiote_Acc_grafted-chest-plate-harness_plate_0',
    'Pass74_Symbiote_Acc_grafted-chest-plate-harness_plate_1',
    'Pass74_Symbiote_Acc_grafted-chest-plate-harness_plate_2',
    'Pass74_Symbiote_Acc_grafted-chest-plate-harness_strap_0',
    'Pass74_Symbiote_Acc_grafted-chest-plate-harness_strap_1',
    'Pass74_Symbiote_Acc_hip-armor-lashings_Hips',
    'Pass74_Symbiote_Acc_hip-armor-lashings_plate_0',
    'Pass74_Symbiote_Acc_hip-armor-lashings_plate_1',
    'Pass74_Symbiote_Acc_knee-guard-straps_UpperLeg.L',
    'Pass74_Symbiote_Acc_knee-guard-straps_UpperLeg.L_plate',
    'Pass74_Symbiote_Acc_knee-guard-straps_UpperLeg.R',
    'Pass74_Symbiote_Acc_knee-guard-straps_UpperLeg.R_plate',
    'Pass74_Symbiote_Acc_pale-ocular-patches_L',
    'Pass74_Symbiote_Acc_pale-ocular-patches_R',
    'Pass74_Symbiote_Acc_sealed-lens-visor-variant_band',
    'Pass74_Symbiote_Acc_sealed-lens-visor-variant_lens',
    'Pass74_Symbiote_Acc_spine-ridge-back-lashing_ridge_0',
    'Pass74_Symbiote_Acc_spine-ridge-back-lashing_ridge_1',
    'Pass74_Symbiote_Acc_spine-ridge-back-lashing_ridge_2',
    'Pass74_Symbiote_Acc_spine-ridge-back-lashing_ridge_3',
    'Pass74_Symbiote_Acc_taloned-hand-claws_Index4.L',
    'Pass74_Symbiote_Acc_taloned-hand-claws_Index4.R',
    'Pass74_Symbiote_Acc_taloned-hand-claws_Middle4.L',
    'Pass74_Symbiote_Acc_taloned-hand-claws_Middle4.R',
    'Pass74_Symbiote_Acc_taloned-hand-claws_Pinky4.L',
    'Pass74_Symbiote_Acc_taloned-hand-claws_Pinky4.R',
    'Pass74_Symbiote_Acc_taloned-hand-claws_Ring4.L',
    'Pass74_Symbiote_Acc_taloned-hand-claws_Ring4.R',
  ],
  navalops: [
    'Pass74_Navalops_Acc_ankle-tether-straps_Foot.L',
    'Pass74_Navalops_Acc_ankle-tether-straps_Foot.L_ring',
    'Pass74_Navalops_Acc_ankle-tether-straps_Foot.R',
    'Pass74_Navalops_Acc_ankle-tether-straps_Foot.R_ring',
    'Pass74_Navalops_Acc_anti-fog-sealed-visor-variant_band',
    'Pass74_Navalops_Acc_anti-fog-sealed-visor-variant_lens',
    'Pass74_Navalops_Acc_low-profile-swim-harness_Chest',
    'Pass74_Navalops_Acc_low-profile-swim-harness_Chest.001',
    'Pass74_Navalops_Acc_shin-cargo-pocket-straps_LowerLeg.L',
    'Pass74_Navalops_Acc_shin-cargo-pocket-straps_LowerLeg.L.001',
    'Pass74_Navalops_Acc_shin-cargo-pocket-straps_LowerLeg.L_pocket',
    'Pass74_Navalops_Acc_shin-cargo-pocket-straps_LowerLeg.R',
    'Pass74_Navalops_Acc_shin-cargo-pocket-straps_LowerLeg.R.001',
    'Pass74_Navalops_Acc_shin-cargo-pocket-straps_LowerLeg.R_pocket',
    'Pass74_Navalops_Acc_weight-belt-with-dive-pouches_belt',
    'Pass74_Navalops_Acc_weight-belt-with-dive-pouches_pouch_0',
    'Pass74_Navalops_Acc_weight-belt-with-dive-pouches_pouch_1',
    'Pass74_Navalops_Acc_weight-belt-with-dive-pouches_pouch_2',
    'Pass74_Navalops_Acc_wrist-gauge-strap_Wrist.L',
    'Pass74_Navalops_Acc_wrist-gauge-strap_gauge_body',
    'Pass74_Navalops_Acc_wrist-gauge-strap_gauge_face',
  ],
};

/**
 * Band diameter as a fraction of the skull span. `build_head_wear` builds the
 * band as a cylinder of radius `span * 0.44`, so the shipped band width is the
 * only skull-span measurement available in the bytes.
 */
const VISOR_BAND_PER_SKULL_SPAN = 0.88;

/** `lens_size[0]` in the three `build_*_visor_variant` builders. */
const VISOR_LENS_PER_SKULL_SPAN: Record<string, number> = {
  explorer: 0.52,
  symbiote: 0.62,
  navalops: 0.58,
};

const VISOR_ITEM: Record<string, string> = {
  explorer: 'goggles-raised-visor-variant',
  symbiote: 'sealed-lens-visor-variant',
  navalops: 'anti-fog-sealed-visor-variant',
};

const CAMEL: Record<string, string> = {
  explorer: 'Explorer',
  symbiote: 'Symbiote',
  navalops: 'Navalops',
};

/**
 * One measured dimension per archetype-read feature, in metres. These are the
 * numbers the sprint log claims in prose ("a 36 cm fall", "talons extend past
 * the fingertips", "the crest clears the skull") and that nothing checked.
 */
const FEATURE_DIMENSIONS = [
  {
    archetype: 'explorer',
    label: 'braid fall length',
    prefix: 'Pass74_Explorer_Acc_braided-hair-fall_',
    axis: 'height',
    metres: 0.3569,
  },
  {
    archetype: 'symbiote',
    label: 'cranial-crest rearward reach',
    prefix: 'Pass74_Symbiote_Acc_elongated-cranial-crest_',
    axis: 'depth',
    metres: 0.2624,
  },
  {
    archetype: 'symbiote',
    label: 'middle talon protrusion',
    prefix: 'Pass74_Symbiote_Acc_taloned-hand-claws_Middle4.R',
    axis: 'width',
    metres: 0.0408,
  },
  {
    archetype: 'symbiote',
    label: 'ocular patch width',
    prefix: 'Pass74_Symbiote_Acc_pale-ocular-patches_L',
    axis: 'width',
    metres: 0.1050,
  },
  {
    // Whole left rig - holster body, both straps and the trigger guard. Pins
    // the strap spacing that commit 24f702ad moved (offset 0.46 -> 0.34).
    archetype: 'explorer',
    label: 'left thigh holster rig drop',
    prefix: 'Pass74_Explorer_Acc_twin-thigh-holsters_UpperLeg.L',
    axis: 'height',
    metres: 0.2164,
  },
] as const;

/** Talon length must fall off outwards from the middle digit. */
const TALON_ORDER = ['Middle4', 'Ring4', 'Index4', 'Pinky4'] as const;

describe('HF-380 shipped operator skin accessories', () => {
  it.each(ARCHETYPES)('ships %s\'s exact accessory manifest in both LODs', async (archetype) => {
    const expected = ACCESSORY_MANIFEST[archetype];
    for (const lod of [0, 1] as const) {
      expect(
        accessoryNames(await skin(archetype, lod)),
        `${archetype} lod${lod} Acc_ meshes`,
      ).toEqual([...expected]);
    }
  });

  it.each(FEATURE_DIMENSIONS)(
    'pins $archetype $label in the shipped bytes',
    async ({ archetype, label, prefix, axis, metres }) => {
      for (const lod of [0, 1] as const) {
        const measured = measureMeshes(await skin(archetype, lod), (name) => name.startsWith(prefix));
        expect(measured.meshes, `${archetype} lod${lod} ${label} meshes`).toBeGreaterThan(0);
        const value = measured[axis];
        // 3% absorbs the envelope settle; it does not absorb a feature that was
        // never built (0 m), nor the bone-length sizing this replaced (~1/3).
        expect(
          Math.abs(value - metres) / metres,
          `${archetype} lod${lod} ${label}: shipped ${value.toFixed(4)} m vs pinned ${metres} m`,
        ).toBeLessThan(0.03);
      }
    },
  );

  it.each(ARCHETYPES)('sizes %s\'s visor lens off the skull, not the head bone', async (archetype) => {
    const item = VISOR_ITEM[archetype];
    const prefix = `Pass74_${CAMEL[archetype]}_Acc_${item}_`;
    for (const lod of [0, 1] as const) {
      const glb = await skin(archetype, lod);
      const band = measureMeshes(glb, (name) => name === `${prefix}band`);
      const lens = measureMeshes(glb, (name) => name === `${prefix}lens`);
      expect(band.meshes, `${archetype} lod${lod} visor band`).toBe(1);
      expect(lens.meshes, `${archetype} lod${lod} visor lens`).toBe(1);
      const skullSpan = band.width / VISOR_BAND_PER_SKULL_SPAN;
      const fraction = lens.width / skullSpan;
      // The pre-fix builders sized off the 0.0774 m Head BONE and shipped a
      // 4.8 cm letterbox - 0.21 of the skull - on every archetype.
      expect(
        fraction,
        `${archetype} lod${lod} lens/skull-span: ${fraction.toFixed(4)} (skull ${skullSpan.toFixed(4)} m, lens ${lens.width.toFixed(4)} m)`,
      ).toBeCloseTo(VISOR_LENS_PER_SKULL_SPAN[archetype], 2);
    }
  });

  it('keeps the symbiote talons longest on the middle digit', async () => {
    const glb = await skin('symbiote');
    const lengths = TALON_ORDER.map((digit) => measureMeshes(
      glb,
      (name) => name === `Pass74_Symbiote_Acc_taloned-hand-claws_${digit}.R`,
    ).width);
    for (let i = 1; i < lengths.length; i += 1) {
      expect(
        lengths[i - 1],
        `talon taper ${TALON_ORDER[i - 1]} (${lengths[i - 1].toFixed(4)} m) vs ${TALON_ORDER[i]} (${lengths[i].toFixed(4)} m)`,
      ).toBeGreaterThan(lengths[i]);
    }
  });

  it('gives each archetype its own accessory set, with no shared names', async () => {
    const sets = ARCHETYPES.map((archetype) => new Set(ACCESSORY_MANIFEST[archetype]));
    for (const [a, b] of PAIRS) {
      const left = sets[ARCHETYPES.indexOf(a)];
      const right = sets[ARCHETYPES.indexOf(b)];
      const shared = [...left].filter((name) => right.has(name));
      expect(shared, `${a} and ${b} must not share accessory meshes`).toEqual([]);
    }
  });
});
