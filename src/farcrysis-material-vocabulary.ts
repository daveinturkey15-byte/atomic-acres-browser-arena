import * as THREE from 'three';

/**
 * PASS 94, FARCRYSIS rework slice 1 - the arena's ONE material vocabulary.
 *
 * WHY THIS EXISTS, MEASURED RATHER THAN ASSUMED
 * ---------------------------------------------
 * `docs/evidence/pass87/lane-r/frame-time-at-head.json` measured farcrysis at
 * 222 distinct materials against atomic-acres' 110, in the same browser launch
 * on a quiet machine, and named that number - not the 93,194 instances and not
 * the 866,727 triangles - as the lever nobody had pulled:
 *
 *     p50 frame 18.2 ms vs 13.6 ms, 222 distinct materials vs 110
 *
 * Measured again here, in the deterministic unit environment over
 * `buildFarcrysis(scene)` alone: 990 meshes, 198 distinct material OBJECTS,
 * and only 14 distinct render-state SIGNATURES. Almost two hundred material
 * objects for fourteen genuinely different draw states.
 *
 * Every one of those objects is a separate binding the renderer must set up, a
 * separate row in the admission coverage draw, and - because the coverage draw
 * is fenced at 12 s and farcrysis is the one arena MEASURED to lose that race
 * (`src/rendering/cold-session-precompile-reach.ts`) - a separate reason the
 * arena admits slower than its control.
 *
 * WHAT THIS DOES
 * --------------
 * One pass at the END of the build replaces exact duplicates with a single
 * shared representative. It is deliberately NOT a "make things look the same"
 * pass: two materials merge only when their COMPLETE render state is already
 * identical, texture identity included, so the renderer cannot tell the
 * difference between the before and the after. Nothing is retuned, nothing is
 * recoloured, and no surface loses a variant it actually had.
 *
 * THE FOUR RULES THAT MAKE IT SAFE (each one is a defect found first, then
 * ruled out)
 * ---------------------------------------------------------------------------
 * 1. `MeshStandardMaterial` ONLY, by exact `type`. Node materials carry TSL
 *    graphs whose identity is not visible in scalar parameters, and merging two
 *    of them by their scalars would silently pick one graph - their budget is
 *    `TSL_FOLIAGE_MAX_DISTINCT_GRAPHS` and its own gate. And every farcrysis
 *    material that is MUTATED PER FRAME at runtime (god-ray shaft opacity, foam
 *    rings, caustics, edge ripples, sun glitter, fireflies) is a
 *    `MeshBasicMaterial` or a `PointsMaterial` - verified by reading every
 *    `.material as THREE.Mesh*Material` write in `src/farcrysis-*.ts`.
 *    Excluding both classes therefore excludes, mechanically, every material
 *    whose object identity is load-bearing after the build.
 *
 * 2. It runs LAST, after every NAME-KEYED mutator. `applyFarcrysisTextures`
 *    assigns maps through a name classifier and `applyFarcrysisShadeLift`
 *    writes `emissive` from name patterns; run before them, a merge could hand
 *    two differently-classified meshes one material and the second write would
 *    win. Run after them, those differences are already IN the render state, so
 *    the key separates them without knowing the classifier at all. Measured on
 *    the built arena: a key taken before classification merges 5 groups it must
 *    not; the same key taken after classification merges none of them.
 *
 * 3. The key contains TEXTURE IDENTITY, not "has a map". Two sand materials
 *    carrying different sand rasters are different draws and stay different.
 *
 * 4. It NEVER disposes the duplicates it drops. A dropped duplicate may still
 *    be held by a module-level capture; nothing here has been uploaded to the
 *    GPU yet, so garbage collection is its correct owner and a `dispose()` here
 *    would only risk freeing something still in use.
 *
 * WHAT IT IS NOT. It is not the rework's material vocabulary in the sense of
 * `docs/farcrysis-rework/BRIEF.md` section "Material families" - that is a
 * REAUTHORING job, one material per family with per-instance tint, and it lands
 * with the art slices. This is the mechanical half that can be taken now at
 * zero visual risk, so the art slices start from a smaller number and the
 * ratchet in `farcrysis-material-vocabulary.test.ts` holds every metre of
 * ground they win.
 */

/** Texture slots whose identity changes the draw and therefore the key. */
const TEXTURE_SLOTS = [
  'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'alphaMap', 'emissiveMap',
  'aoMap', 'bumpMap', 'displacementMap', 'lightMap', 'envMap',
] as const;

/**
 * A material's complete render state, as a string.
 *
 * Anything that can make two draws differ has to be in here. When in doubt the
 * field goes IN: a key that is too coarse merges materials that must not merge
 * (a visual defect), while a key that is too fine merely fails to merge two
 * materials that could have been (a missed saving, and the ratchet stays green).
 */
function standardMaterialKey(material: THREE.MeshStandardMaterial): string {
  const parts: (string | number | boolean)[] = [
    material.type,
    material.color.getHexString(),
    material.roughness,
    material.metalness,
    material.emissive.getHexString(),
    material.emissiveIntensity,
    material.transparent,
    material.opacity,
    material.alphaTest,
    material.alphaToCoverage,
    material.side,
    material.shadowSide === null ? 'null' : material.shadowSide,
    material.flatShading,
    material.vertexColors,
    material.depthTest,
    material.depthWrite,
    material.blending,
    material.polygonOffset,
    material.polygonOffsetFactor,
    material.polygonOffsetUnits,
    material.fog,
    material.wireframe,
    material.dithering,
    material.toneMapped,
    material.premultipliedAlpha,
    material.envMapIntensity,
    material.aoMapIntensity,
    material.lightMapIntensity,
    material.bumpScale,
    material.displacementScale,
    material.displacementBias,
    material.normalMapType,
    material.normalScale.x,
    material.normalScale.y,
    material.stencilWrite,
    material.colorWrite,
    material.forceSinglePass,
    material.onBeforeCompile.toString(),
  ];
  for (const slot of TEXTURE_SLOTS) {
    const texture = material[slot] as THREE.Texture | null | undefined;
    // `uuid` is the only identity three itself uses for a texture; two
    // different rasters must never collapse onto one material.
    parts.push(slot, texture ? texture.uuid : '-');
  }
  return parts.join(String.fromCharCode(31));
}

export interface FarcrysisVocabularyCollapse {
  /** Meshes visited. */
  readonly meshes: number;
  /** Distinct material objects of every class before the pass. */
  readonly materialsBefore: number;
  /** Distinct material objects of every class after the pass. */
  readonly materialsAfter: number;
  /** Duplicate `MeshStandardMaterial` objects replaced by a representative. */
  readonly collapsed: number;
  /** Distinct `MeshStandardMaterial` render states that survived. */
  readonly standardFamilies: number;
}

function materialList(mesh: THREE.Mesh): THREE.Material[] {
  return Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
}

/**
 * Collapse exact-duplicate `MeshStandardMaterial` objects under `root` onto one
 * shared representative each. Returns the census, so a caller (and the gate)
 * can assert on it rather than trust it.
 *
 * MUST be called after every name-keyed material mutator - see rule 2 above.
 */
export function collapseFarcrysisMaterialVocabulary(root: THREE.Object3D): FarcrysisVocabularyCollapse {
  const representatives = new Map<string, THREE.MeshStandardMaterial>();
  const before = new Set<THREE.Material>();
  const after = new Set<THREE.Material>();
  let meshes = 0;
  let collapsed = 0;

  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    meshes += 1;
    const materials = materialList(object);
    for (const material of materials) before.add(material);

    const replaced = materials.map((material) => {
      // Rule 1: exact type. `instanceof` would also catch subclasses, and a
      // subclass can carry state this key knows nothing about.
      if (material.type !== 'MeshStandardMaterial') return material;
      const standard = material as THREE.MeshStandardMaterial;
      const key = standardMaterialKey(standard);
      const existing = representatives.get(key);
      if (existing === undefined) {
        representatives.set(key, standard);
        return standard;
      }
      if (existing !== standard) collapsed += 1;
      return existing;
    });

    if (Array.isArray(object.material)) {
      object.material = replaced;
    } else if (replaced.length === 1) {
      object.material = replaced[0];
    }
    for (const material of materialList(object)) after.add(material);
  });

  return {
    meshes,
    materialsBefore: before.size,
    materialsAfter: after.size,
    collapsed,
    standardFamilies: representatives.size,
  };
}

/**
 * Read-only census of the material objects under `root`, used by the ratchet
 * gate and by the admission report. Counts material OBJECTS - the quantity the
 * frame-time receipt calls "distinct materials" - not programs.
 */
export function farcrysisMaterialCensus(root: THREE.Object3D): {
  readonly meshes: number;
  readonly materials: number;
  readonly standardMaterials: number;
  readonly nodeMaterials: number;
  readonly otherMaterials: number;
} {
  const seen = new Set<THREE.Material>();
  let meshes = 0;
  let standard = 0;
  let node = 0;
  let other = 0;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    meshes += 1;
    for (const material of materialList(object)) {
      if (seen.has(material)) continue;
      seen.add(material);
      if (material.type === 'MeshStandardMaterial') standard += 1;
      else if ((material as unknown as { isNodeMaterial?: boolean }).isNodeMaterial === true) node += 1;
      else other += 1;
    }
  });
  return { meshes, materials: seen.size, standardMaterials: standard, nodeMaterials: node, otherMaterials: other };
}
