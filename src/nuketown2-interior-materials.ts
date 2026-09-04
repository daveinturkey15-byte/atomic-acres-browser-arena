/**
 * nuketown2-interior-materials.ts — interior & garage materials, as SHARED FAMILY roles.
 *
 * Was six bespoke node graphs (plus two unused factories), each baking its own
 * colour literals into the shader: every drywall tint and every warm/cold
 * fixture was its own pipeline. Now every surface below is a
 * `src/nuketown2-materials/*` family material in its own colour, carried as a
 * uniform (`uniformSwatch`), so per-instance values share the family graphs:
 * same roles, same colours, the wear on top is the family's.
 *
 * The mapping, with the preserved value:
 *   - wood plank floor  -> timber `deck` (flat boards, correct orientation),
 *     oak 0x997955, polygonOffset -1 tier kept (CPU-side, graph-safe);
 *   - kitchen tile      -> concrete `block` (finest grid in the family),
 *     ceramic 0xc2bfb8, -1 tier kept;
 *   - garage slab       -> concrete `apron` (control joints, broom, oil-dark
 *     damp), concrete 0x868481, -1 tier kept via the family's own option;
 *   - drywall tint      -> unpanelled painted metal in the caller's hex, so all
 *     tints are one graph;
 *   - garage boards     -> lap siding in workshop red 0xac5644 (horizontal
 *     courses are this family exactly);
 *   - ceiling fixtures  -> the single justified bespoke graph: no family emits
 *     light. Warm and cold are ONE graph with uniform tint and uniform drive,
 *     both still above the bloom threshold;
 *   - window glass      -> family glass, transparent, pale tint 0xcbdde5 at the
 *     family's own default 0.42 opacity.
 *
 * Two family-variant graphs are instantiated here for the first time
 * (`deck`, transparent glass). Both are shared-family variants with uniform
 * tints — future decks and panes share them free — and the cold-session
 * precompile reach is arena-scoped (`nuketown2` is already a member), so the
 * exact-scene precompile covers them with no roster change.
 *
 * Strictly procedural: zero imported textures, images, meshes or LUTs.
 */
import * as THREE from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { createTimberMaterial } from './nuketown2-materials/families/timber';
import { createConcreteMaterial } from './nuketown2-materials/families/concrete';
import { createPaintedMetalMaterial } from './nuketown2-materials/families/painted-metal';
import { createSidingMaterial } from './nuketown2-materials/families/siding';
import { createGlassMaterial } from './nuketown2-materials/families/glass';

/** The one TSL helper still needed here: per-instance values ride uniforms. */
const { uniform } = TSL as unknown as Record<string, any>;

/**
 * CPU-side coplanar tier. `polygonOffset` is a material flag, not a node, so
 * setting it here does not change the graph signature: the tier is kept and
 * the pipeline is still shared.
 */
function decalTier(mat: MeshStandardNodeMaterial, factor: number): MeshStandardNodeMaterial {
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = factor;
  mat.polygonOffsetUnits = factor;
  return mat;
}

/**
 * Residential wood plank floor for living rooms, stairs and sniper rooms:
 * deck boards in the floor's own oak.
 */
export function createNuketown2WoodFloorMaterial(): MeshStandardNodeMaterial {
  return decalTier(createTimberMaterial('nuketown2-house-wood-floor', 0x997955, 'deck'), -1);
}

/**
 * Ceramic tile floor for kitchen areas: the blockwork grid in ceramic pale.
 */
export function createNuketown2TileFloorMaterial(): MeshStandardNodeMaterial {
  return decalTier(createConcreteMaterial('nuketown2-kitchen-tile-floor', 0xc2bfb8, { variant: 'block' }), -1);
}

/**
 * Concrete garage floor: the poured apron — joints, broom, standing-water
 * damp where the bespoke oil field was — in the slab's own concrete.
 */
export function createNuketown2GarageFloorMaterial(): MeshStandardNodeMaterial {
  return createConcreteMaterial('nuketown2-garage-floor-concrete', 0x868481, {
    variant: 'apron',
    polygonOffset: -1,
  });
}

/**
 * Interior drywall in the caller's tint: unpanelled enamel, so every tint is
 * the same graph with a different uniform.
 */
export function createNuketown2DrywallMaterial(colorHex: number): MeshStandardNodeMaterial {
  return createPaintedMetalMaterial(`nuketown2-drywall-${colorHex.toString(16)}`, colorHex, {
    roughness: 0.94,
    metalness: 0.01,
  });
}

/**
 * Garage interior wall: lap siding courses in the workshop's own red.
 */
export function createNuketown2GarageWallMaterial(): MeshStandardNodeMaterial {
  return createSidingMaterial(0xac5644, 'nuketown2-garage-wall-boards');
}

/**
 * Ceiling light practical fixture face driven above bloom threshold.
 * @param warm If true, warm residential ceiling light; if false, cold garage fluorescent tube.
 *
 * One graph for both: the tint and the emissive drive are uniforms, so warm
 * and cold differ by buffer values, not by shader. No family emits light, so
 * this stays the module's single bespoke graph rather than a bad mapping.
 */
export function createNuketown2CeilingLightMaterial(warm = true): MeshStandardNodeMaterial {
  const mat = new MeshStandardNodeMaterial({
    roughness: 0.18,
    metalness: 0.12,
  });
  mat.name = warm ? 'nuketown2-warm-ceiling-light' : 'nuketown2-cold-tube-light';
  mat.type = 'MeshStandardMaterial';

  // Warm tungsten residential illumination: rich golden-white, driven above
  // the 1.02 linear bloom threshold per threejs-webgpu-interior-lighting-look.
  // Cold daylight fluorescent tube. Same nodes, different uniform values.
  const tint: readonly [number, number, number] = warm ? [1.0, 0.94, 0.84] : [0.88, 0.96, 1.0];
  const drive: readonly [number, number, number] = warm ? [2.6, 2.1, 1.4] : [1.8, 2.3, 3.1];
  mat.colorNode = uniform(new THREE.Vector3(tint[0], tint[1], tint[2]));
  mat.emissiveNode = uniform(new THREE.Vector3(drive[0], drive[1], drive[2]));

  return mat;
}

/**
 * Window glass: family glass, transparent, in the pane's own pale sky tint.
 */
export function createNuketown2GlassMaterial(): MeshStandardNodeMaterial {
  return createGlassMaterial('nuketown2-window-glass', 0xcbdde5);
}
