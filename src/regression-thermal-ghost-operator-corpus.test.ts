/**
 * REGRESSION GATE — through-wall reveal, sized against the SHIPPED corpus.
 *
 * Owner 2026-08-30: "see through walls is still there and good on piloted
 * drone but gone on chopper gunner and rail gun".
 *
 * Root cause (HF, playtest 2026-08-30): THERMAL_GHOST_MAX_BODY_LAYERS was 12,
 * derived from the pass65 operator's 9 body primitives. Pass 74 then shipped
 * three archetype skins at 30/42/46 primitives and bots began drawing from
 * them, so every skinned actor failed the completeness preflight and received
 * ZERO reveal layers. The M14, Railgun and Chopper Gunner all delegate body
 * drawing to this one pool, so all three went dark at once; the piloted drone
 * draws its own silhouettes and looked fine, which is exactly the split the
 * owner reported.
 *
 * Why it shipped: the test that owned the bound listed the assets it checked
 * BY HAND. A hand-written list cannot fail when an asset family is added to
 * disk and left off the list — the list was still describing the pass65 world
 * long after Pass 74 landed.
 *
 * This gate therefore never names an asset. It walks the shipped operator
 * asset tree on disk, decodes every GLB it finds, and pins the bound against
 * whatever is actually there. A tenth, eleventh or fiftieth operator asset is
 * covered the moment it is committed, with no test edit.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  THERMAL_GHOST_MAX_BODY_LAYERS,
  THERMAL_GHOST_MAX_EXACT_MODEL_MATERIALS,
  THERMAL_GHOST_MAX_TARGETS,
  THERMAL_GHOST_MAX_TOTAL_BODY_LAYERS,
  ThermalGhostPresentation,
} from './thermal-ghost-presentation';

/** The directory `public/` publishes verbatim into every shipped build. */
const OPERATOR_ASSET_ROOT = fileURLToPath(
  new URL('../public/assets/original/models/operators', import.meta.url),
);

type OperatorAsset = Readonly<{
  /** Path relative to the operator asset root, POSIX separators. */
  relativePath: string;
  absolutePath: string;
  /** Public URL the runtime would request, matching operator-model.ts. */
  publicUrl: string;
  primitives: number;
  materials: number;
  /**
   * First-person arms are drawn by WeaponPresentation, never by the reveal
   * pool. Everything else under this tree is a third-person body the reveal
   * can be handed. The discriminator is the authored file name, so a new
   * third-person asset is IN the corpus by default — the safe direction.
   */
  thirdPersonBody: boolean;
}>;

function walkGlbFiles(directory: string, prefix = ''): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => (
    left.name.localeCompare(right.name)
  ))) {
    const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) found.push(...walkGlbFiles(path.join(directory, entry.name), relative));
    else if (entry.name.endsWith('.glb')) found.push(relative);
  }
  return found;
}

/**
 * GLTFLoader emits one Mesh per glTF PRIMITIVE, splitting a multi-primitive
 * mesh into a Group of Meshes. Primitives — not mesh nodes — are therefore the
 * layer count the reveal pool has to serve: the Pass 74 skins carry 37/41 mesh
 * nodes but 42/46 primitives, and it is the larger number that hit the bound.
 */
function decodeOperatorAsset(relativePath: string): OperatorAsset {
  const absolutePath = path.join(OPERATOR_ASSET_ROOT, relativePath);
  const bytes = readFileSync(absolutePath);
  const jsonLength = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8')) as {
    meshes?: Array<{ primitives: unknown[] }>;
    materials?: unknown[];
  };
  return Object.freeze({
    relativePath,
    absolutePath,
    publicUrl: `./assets/original/models/operators/${relativePath}`,
    primitives: (gltf.meshes ?? []).reduce((sum, mesh) => sum + mesh.primitives.length, 0),
    materials: (gltf.materials ?? []).length,
    thirdPersonBody: !relativePath.includes('first-person'),
  });
}

const SHIPPED_OPERATOR_ASSETS: readonly OperatorAsset[] = Object.freeze(
  walkGlbFiles(OPERATOR_ASSET_ROOT).map(decodeOperatorAsset),
);
const SHIPPED_OPERATOR_BODIES = SHIPPED_OPERATOR_ASSETS.filter((asset) => asset.thirdPersonBody);

describe('shipped operator corpus discovery', () => {
  /**
   * A disk-walking gate that silently matches nothing passes every assertion
   * below it, which would be a worse version of the hand-written list it
   * replaces. Nine third-person bodies ship today (3 pass65 LODs + 3 Pass 74
   * archetypes x 2 LODs); this floor only ever moves UP.
   */
  it('actually finds the shipped assets instead of vacuously passing', () => {
    expect(SHIPPED_OPERATOR_ASSETS.length).toBeGreaterThanOrEqual(11);
    expect(SHIPPED_OPERATOR_BODIES.length).toBeGreaterThanOrEqual(9);
    for (const asset of SHIPPED_OPERATOR_ASSETS) {
      expect(asset.primitives, asset.relativePath).toBeGreaterThan(0);
      expect(asset.materials, asset.relativePath).toBeGreaterThan(0);
    }
    // The three Pass 74 archetypes are the assets that broke the old bound.
    // Their absence would mean the walk found the wrong tree.
    for (const archetype of ['navalops', 'explorer', 'symbiote']) {
      expect(
        SHIPPED_OPERATOR_BODIES.some((asset) => asset.relativePath.includes(archetype)),
        `Pass 74 ${archetype} skin missing from the discovered corpus`,
      ).toBe(true);
    }
  });

  /**
   * The other half of the 2026-08-30 failure: code and disk drifting apart.
   * Every operator URL any non-test source file requests must exist on disk,
   * so a renamed or dropped asset fails here rather than as a runtime 404 that
   * silently degrades a bot to the fallback body.
   */
  it('ships every operator asset the runtime asks for', () => {
    const sourceRoot = fileURLToPath(new URL('.', import.meta.url));
    const requested = new Set<string>();
    const collect = (directory: string): void => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const child = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          collect(child);
          continue;
        }
        if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) continue;
        const text = readFileSync(child, 'utf8');
        for (const match of text.matchAll(/\.\/assets\/original\/models\/operators\/[A-Za-z0-9/._-]+\.glb/g)) {
          requested.add(match[0]);
        }
      }
    };
    collect(sourceRoot);
    const shipped = new Set(SHIPPED_OPERATOR_ASSETS.map((asset) => asset.publicUrl));
    expect(requested.size).toBeGreaterThanOrEqual(9);
    expect([...requested].filter((url) => !shipped.has(url))).toEqual([]);
  });
});

describe('THERMAL_GHOST_MAX_BODY_LAYERS covers the whole shipped corpus', () => {
  // A failing assertion skips the inline mockRestore, and a leaked console spy
  // makes the NEXT test's evidence read another test's warnings.
  afterEach(() => { vi.restoreAllMocks(); });


  it('bounds every shipped third-person operator body, named on failure', () => {
    const oversized = SHIPPED_OPERATOR_BODIES
      .filter((asset) => asset.primitives > THERMAL_GHOST_MAX_BODY_LAYERS)
      .map((asset) => `${asset.relativePath} needs ${asset.primitives} layers`);
    // Named rather than counted: the retired bound failed 6 of 9 assets and
    // the only evidence anywhere was an unread `incompleteTargets` counter.
    expect(oversized).toEqual([]);
  });

  it('keeps the pool ceiling at least the corpus maximum for a full target set', () => {
    const corpusMaximum = Math.max(...SHIPPED_OPERATOR_BODIES.map((asset) => asset.primitives));
    // Measured 2026-08-30: 46 (pass74 symbiote). The retired bound of 12 sat
    // 3.8x BELOW this, which is the whole defect in one number.
    expect(corpusMaximum).toBeGreaterThanOrEqual(46);
    expect(THERMAL_GHOST_MAX_BODY_LAYERS).toBeGreaterThanOrEqual(corpusMaximum);
    expect(THERMAL_GHOST_MAX_TOTAL_BODY_LAYERS)
      .toBeGreaterThanOrEqual(corpusMaximum * THERMAL_GHOST_MAX_TARGETS);
    // Every shipped body owns four appearance materials, so a full admitted
    // target set must fit inside the exact-material budget too — a reveal that
    // fails the material preflight is just as black as one that fails layers.
    const materialMaximum = Math.max(...SHIPPED_OPERATOR_BODIES.map((asset) => asset.materials));
    expect(materialMaximum * THERMAL_GHOST_MAX_TARGETS)
      .toBeLessThanOrEqual(THERMAL_GHOST_MAX_EXACT_MODEL_MATERIALS);
  });

  /**
   * The bound is not the defect on its own — a silently-incomplete record is.
   * This drives the REAL renderer once per shipped asset, at that asset's own
   * measured primitive and material count, and demands a complete reveal. With
   * the retired bound of 12 this fails on six of the nine shipped bodies.
   */
  it.each(SHIPPED_OPERATOR_BODIES.map((asset) => [asset.relativePath, asset] as const))(
    'reveals a %s-sized body completely through the real pool',
    (_label, asset) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const scene = new THREE.Scene();
      const geometry = new THREE.BoxGeometry();
      const materials = Array.from({ length: asset.materials }, (_, index) => (
        new THREE.MeshStandardMaterial({ color: 0x202020 + index * 0x111 })
      ));
      const root = new THREE.Group();
      const visual = new THREE.Group();
      // The named rigged visual is the exact animated model authority; the
      // shipped rigs are entirely skinned, so the pool sees SkinnedMeshes.
      visual.name = 'rigged-operator-visual';
      const skeleton = new THREE.Skeleton([]);
      for (let layer = 0; layer < asset.primitives; layer += 1) {
        const mesh = new THREE.SkinnedMesh(geometry, materials[layer % materials.length]);
        mesh.bind(skeleton);
        visual.add(mesh);
      }
      root.add(visual);
      scene.add(root);
      const presentation = new ThermalGhostPresentation();

      presentation.sync([{ id: asset.relativePath, relation: 'hostile', root }], true);
      const telemetry = presentation.telemetry();

      expect(telemetry).toMatchObject({
        activeTargets: 1,
        completeOperatorModels: true,
        incompleteTargets: 0,
        bodyLayerBudgetExceeded: false,
        oversizedBodyRejections: 0,
        materialBudgetExceeded: false,
        throughGeometry: true,
        orangeHalo: true,
      });
      // Zero layers was the shipped symptom: a "tracked" target drawing
      // nothing at all. One exact model layer and one halo layer per primitive.
      expect(telemetry.activeModelLayers).toBe(asset.primitives);
      expect(telemetry.activeHaloLayers).toBe(asset.primitives);
      expect(warn).not.toHaveBeenCalled();

      presentation.terminalDispose();
      geometry.dispose();
      for (const material of materials) material.dispose();
      warn.mockRestore();
    },
  );

  /**
   * The bound must still be a real fail-closed boundary. One primitive past it
   * rejects loudly — the warning is what turns the next oversized asset into a
   * console line instead of another owner bug report.
   */
  it('still fails closed, and loudly, one layer past the bound', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const scene = new THREE.Scene();
    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshStandardMaterial();
    const root = new THREE.Group();
    const visual = new THREE.Group();
    visual.name = 'rigged-operator-visual';
    const skeleton = new THREE.Skeleton([]);
    for (let layer = 0; layer <= THERMAL_GHOST_MAX_BODY_LAYERS; layer += 1) {
      const mesh = new THREE.SkinnedMesh(geometry, material);
      mesh.bind(skeleton);
      visual.add(mesh);
    }
    root.add(visual);
    scene.add(root);
    const presentation = new ThermalGhostPresentation();

    presentation.sync([{ id: 'oversized-probe', relation: 'hostile', root }], true);

    expect(presentation.telemetry()).toMatchObject({
      bodyLayerBudgetExceeded: true,
      oversizedBodyRejections: 1,
      activeModelLayers: 0,
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('THERMAL_GHOST_MAX_BODY_LAYERS');

    presentation.terminalDispose();
    geometry.dispose();
    material.dispose();
    warn.mockRestore();
  });
});
