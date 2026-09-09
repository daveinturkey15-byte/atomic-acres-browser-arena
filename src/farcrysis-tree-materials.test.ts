/**
 * Farcrysis TREE material fidelity gate.
 *
 * The Pass 79 audit found the 12 procedural tree species carrying ZERO
 * textures — flat `MeshStandardMaterial` colours only — which is why the
 * island reads as programmer art regardless of instance counts (HF-396/398,
 * "more jungle like"). Ground cover and terrain had PBR treatment through
 * applyFarcrysisTextures; every *tree* mesh fell through the classifier.
 *
 * This gate pins the NEW behaviour at the LIVE call site
 * (`buildVegetation` -> `applyFarcrysisTextures` inside `buildFarcrysis`,
 * farcrysis-art.ts): every tree-species trunk/canopy mesh must carry a full
 * PBR response (map + normalMap + roughnessMap), and the albedo maps must be
 * authored LIGHT so `material.color` multiplication preserves each species'
 * palette identity (failure-mode #4: colour multiplies the map, it never
 * brightens it).
 */
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { buildFarcrysis } from './farcrysis';
import { FARCRYSIS_VEGE_STATS } from './farcrysis-vegetation';

/** Trunk/canopy/foliage meshes of the tree species (NOT ground cover, NOT LOD impostors). */
const TREE_MESH_RE =
  /^farcrysis-vege-(broadleaf-trunks|broadleaf-canopies|fan-palms|banana-trunks|banana-leaves|bamboo-stems|dead-trunks|kapok-trunks|kapok-canopies|coconut-trunks|mangrove-trunks|mangrove-canopies|bamboo-grove-stems|cycad-trunks|cycad-leaves|bloom-trunks|bloom-canopies|emergent-trunks|emergent-crowns-lower|emergent-crowns-upper|midstorey-clumps)$/;

/** Species prefixes the 12-species roster must all appear under. */
const SPECIES_PREFIXES = [
  'broadleaf', 'fan-palms', 'banana', 'bamboo-stems', 'dead-trunks',
  'kapok', 'coconut-trunks', 'mangrove', 'bamboo-grove-stems',
  'cycad', 'bloom', 'emergent',
];

interface TextureSummary {
  resolution: [number, number] | null;
  wrapS: number;
  wrapT: number;
  colorSpace: string;
}

function summarizeTexture(tex: THREE.Texture | null): TextureSummary {
  if (!tex) return { resolution: null, wrapS: -1, wrapT: -1, colorSpace: '' };
  const img = tex.image as { width?: number; height?: number } | null;
  return {
    resolution: img && img.width ? [img.width, img.height ?? 0] : null,
    wrapS: tex.wrapS,
    wrapT: tex.wrapT,
    colorSpace: String(tex.colorSpace),
  };
}

function collectTreeMaterials(scene: THREE.Scene): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (!TREE_MESH_RE.test(obj.name)) return;
    const mat = (Array.isArray(obj.material) ? obj.material[0] : obj.material) as THREE.MeshStandardMaterial;
    out.push({
      mesh: obj.name,
      isInstanced: (obj as THREE.InstancedMesh).isInstancedMesh === true,
      map: summarizeTexture(mat?.map ?? null),
      normalMap: summarizeTexture(mat?.normalMap ?? null),
      roughnessMap: summarizeTexture(mat?.roughnessMap ?? null),
    });
  });
  return out;
}

// ---------------------------------------------------------------------------
// Recording canvas document (same pattern as farcrysis-boot-cost.test.ts) so
// the generated albedo PIXELS can be measured, not just their presence.
// ---------------------------------------------------------------------------

function recordingDocument(): { puts: Array<{ width: number; height: number; data: Uint8ClampedArray }> } {
  const puts: Array<{ width: number; height: number; data: Uint8ClampedArray }> = [];
  const gradient = () => ({ addColorStop: vi.fn() });
  const makeContext = (canvas: unknown): CanvasRenderingContext2D => {
    const state: Record<PropertyKey, unknown> = {
      fillStyle: '', strokeStyle: '', lineWidth: 1, font: '10px sans-serif', canvas,
    };
    return new Proxy(state, {
      get(target, prop) {
        if (prop === 'createImageData') {
          return (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
        }
        if (prop === 'putImageData') {
          return (image: { width: number; height: number; data: Uint8ClampedArray }) => {
            puts.push({ width: image.width, height: image.height, data: image.data });
          };
        }
        if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
        if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return gradient;
        if (prop === 'measureText') return (text: string) => ({ width: text.length * 10 });
        if (typeof prop === 'string') {
          if (!(prop in target)) target[prop] = vi.fn();
          return target[prop];
        }
        return undefined;
      },
      set(target, prop, value) { target[prop] = value; return true; },
    }) as unknown as CanvasRenderingContext2D;
  };
  vi.stubGlobal('document', {
    createElement: (_tagName: string) => {
      const element: Record<string, unknown> = {
        width: 0, height: 0, style: {},
        setAttribute: () => undefined, appendChild: () => undefined, remove: () => undefined,
      };
      element.getContext = () => makeContext(element);
      return element;
    },
    createElementNS: (_ns: string, _tagName: string) => ({
      width: 0, height: 0, style: {}, src: '',
      setAttribute: () => undefined, removeAttribute: () => undefined,
      addEventListener: () => undefined, removeEventListener: () => undefined,
    }),
    getElementById: (_id: string) => null,
    documentElement: { dataset: { renderBackend: 'webgpu' } },
    body: { appendChild: () => undefined },
  });
  vi.stubGlobal('HTMLCanvasElement', class {});
  return { puts };
}

describe('farcrysis tree material fidelity (12 species)', () => {
  const doc = recordingDocument();
  let scene: THREE.Scene;

  beforeAll(() => {
    scene = new THREE.Scene();
    buildFarcrysis(scene);
  });

  afterEach(() => {
    // keep the stubbed document alive across the file (beforeAll built once);
    // vitest calls afterEach after each test — nothing to undo per-test.
  });

  it('finds the live tree meshes this gate is about (guard against regex rot)', () => {
    const entries = collectTreeMaterials(scene);
    expect(entries.length, 'expected >= 20 live tree-species meshes').toBeGreaterThanOrEqual(20);
    for (const e of entries) {
      expect(e.isInstanced, `${e.mesh} should be an InstancedMesh`).toBe(true);
    }
  });

  it('covers all 12 tree species', () => {
    const names = new Set(
      collectTreeMaterials(scene).map((e) => String(e.mesh)),
    );
    for (const prefix of SPECIES_PREFIXES) {
      expect(
        [...names].some((n) => n.startsWith(`farcrysis-vege-${prefix}`)),
        `species '${prefix}' missing from the live tree mesh set`,
      ).toBe(true);
    }
  });

  it('gives every tree-species mesh a full PBR response (map + normal + roughness)', () => {
    const entries = collectTreeMaterials(scene);
    for (const e of entries) {
      const name = String(e.mesh);
      const map = e.map as TextureSummary;
      const normalMap = e.normalMap as TextureSummary;
      const roughnessMap = e.roughnessMap as TextureSummary;
      expect(map.resolution, `${name}: albedo map`).not.toBeNull();
      expect(normalMap.resolution, `${name}: normal map`).not.toBeNull();
      expect(roughnessMap.resolution, `${name}: roughness map`).not.toBeNull();
      expect(map.colorSpace, `${name}: albedo colour space`).toBe(THREE.SRGBColorSpace);
      expect(normalMap.colorSpace, `${name}: normal colour space`).toBe(THREE.NoColorSpace);
      expect(roughnessMap.colorSpace, `${name}: roughness colour space`).toBe(THREE.NoColorSpace);
      expect(map.wrapS, `${name}: albedo wrapS`).toBe(THREE.RepeatWrapping);
      expect(map.wrapT, `${name}: albedo wrapT`).toBe(THREE.RepeatWrapping);
    }
  });

  it('authors albedo maps LIGHT so material.color keeps each species hue (failure-mode #4)', () => {
    // Tree-family albedo maps are generated at 320x320 — every pre-existing
    // procedural map in this arena is either 512x512 (farcrysis-textures.ts)
    // or 256x256 (farcrysis-ground-textures.ts), so size selects only ours.
    const colorMaps = doc.puts.filter((p) => p.width === 320 && p.height === 320);
    expect(colorMaps.length, 'expected the new 320px tree albedo maps to be generated').toBeGreaterThanOrEqual(4);
    for (const p of colorMaps) {
      let sum = 0;
      for (let i = 0; i < p.data.length; i += 4) {
        sum += (p.data[i] + p.data[i + 1] + p.data[i + 2]) / (3 * 255);
      }
      const meanLum = sum / (p.data.length / 4);
      expect(
        meanLum,
        `320px albedo map must stay light (mean luminance ${meanLum.toFixed(3)}) — a dark map multiplied by material.color would crush the species palette`,
      ).toBeGreaterThanOrEqual(0.55);
      expect(meanLum).toBeLessThanOrEqual(1.0);
    }
  });

  it('reports the treatment through the live vegetation stats (wiring proof)', () => {
    // FARCRYSIS_VEGE_STATS().textureCount used to be hard-zero while the
    // audit's whole point was "zero textures". After the applier runs inside
    // buildFarcrysis it must count materials that actually carry maps.
    expect(FARCRYSIS_VEGE_STATS().textureCount).toBeGreaterThan(0);
  });
  it('gives the enhanced-palm crowns the frond texture treatment (not skipped as UV-less)', () => {
    // createPalmCrownGeometry used to be positions-only; applyFarcrysisTextures
    // skips meshes without UV attributes, so the most visible beach-tree canopy
    // silently kept its flat solid colour while every other species got PBR.
    let fronds: THREE.Mesh | null = null;
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.name === 'farcrysis-vege-palm-fronds') fronds = obj;
    });
    expect(fronds, 'palm-fronds mesh missing from the built scene').not.toBeNull();
    const mesh = fronds as unknown as THREE.Mesh;
    expect(mesh.geometry.getAttribute('uv'), 'crown geometry must carry UVs or the texture pass skips it').toBeTruthy();
    const mat = mesh.material as THREE.MeshStandardMaterial;
    expect(mat.alphaMap, `palm-fronds must carry the frond alpha map`).not.toBeNull();
    expect(mat.transparent, 'palm-fronds must be transparent for the alpha cut').toBe(true);
    expect(mat.alphaTest, 'palm-fronds must use an alpha test threshold').toBeGreaterThan(0);
  });

  it('lifts shaded trunk, canopy AND loose-foliage faces off black (HF-396 fix, HF-423 scales)', () => {
    // WebGPU captures showed mid-brown bark (broadleaf 0x6b4e30 ~ 9% linear)
    // collapsing to black silhouettes on the shaded side at the 0.3 ambient.
    // The fake-subsurface lift used to be canopy-only; then trunks joined at a
    // weaker bark scale.
    //
    // HF-423 re-pinned both scales and added a third tier, on measurement
    // rather than by eye: across the six authored review cameras
    // (scripts/qa/measure-farcrysis-frame-tone.mjs over a
    // capture-arena-viewpoints.mjs run) 20.59 % of pixels sat below linear
    // luma 0.02 with a 5th-percentile luma of 0.0062 - three frames had a
    // literal zero floor. Trunk 0.12 -> 0.30, canopy 0.22 -> 0.26, and the
    // loose-foliage families that matched NEITHER name pattern (fronds, ferns,
    // fans, vines, the palm impostor, the undergrowth carpet) now carry the
    // canopy scale instead of nothing at all.
    const TRUNK_SCALE = 0.30;
    const CANOPY_SCALE = 0.26;
    const trunkRe = /farcrysis-vege-(broadleaf|kapok|mangrove|emergent|bloom|cycad|coconut)-trunks$/;
    const canopyRe = /farcrysis-vege-(broadleaf|kapok|mangrove|bloom)-canopies$/;
    // The third tier, asserted by the layers it was ADDED for. Naming one
    // layer per family is what makes a future rename fail here instead of
    // silently dropping it back to black.
    const foliageRe = /farcrysis-vege-(palm-fronds|coconut-fronds|understory-ferns|large-ferns|ferns|fan-palms|vines|canopy-vines|jungle-vine-clusters|palm-imposters|undergrowth-carpet|undergrowth-cards|undergrowth-shrubs|heliconia-clumps|mangrove-lod)$/;
    let trunkMeshes = 0;
    let canopyMeshes = 0;
    let foliageMeshes = 0;
    scene.traverse((obj) => {
      if (!(obj instanceof THREE.InstancedMesh)) return;
      const mat = obj.material as THREE.MeshStandardMaterial;
      if (!mat?.emissive || !mat?.color) return;
      const expected = (scale: number) => {
        const c = mat.color.clone().multiplyScalar(scale);
        expect(
          mat.emissive.r, `${obj.name}: emissive.r`,
        ).toBeCloseTo(c.r, 4);
        expect(
          mat.emissive.g, `${obj.name}: emissive.g`,
        ).toBeCloseTo(c.g, 4);
        expect(
          mat.emissive.b, `${obj.name}: emissive.b`,
        ).toBeCloseTo(c.b, 4);
        // The whole point: the lift must be NON-black so the shaded side
        // cannot collapse to a silhouette.
        expect(mat.emissive.getHex(), `${obj.name}: emissive must not be black`).not.toBe(0);
      };
      if (trunkRe.test(obj.name)) {
        trunkMeshes += 1;
        expected(TRUNK_SCALE);
      } else if (canopyRe.test(obj.name)) {
        canopyMeshes += 1;
        expected(CANOPY_SCALE);
      } else if (foliageRe.test(obj.name)) {
        foliageMeshes += 1;
        expected(CANOPY_SCALE);
      }
    });
    expect(trunkMeshes, 'expected the live trunk layers to be covered').toBeGreaterThanOrEqual(7);
    expect(canopyMeshes, 'expected the live canopy layers to be covered').toBeGreaterThanOrEqual(4);
    expect(foliageMeshes, 'expected the loose-foliage layers to be covered').toBeGreaterThanOrEqual(5);
    // Ground cover stays UNLIFTED on purpose: it faces the sun, it is the
    // brightest mass in every frame, and lifting it is what produced the
    // rejected beige wash. Pinned so a future widening of the pattern has to
    // come back here and say so.
    let groundCoverChecked = 0;
    scene.traverse((obj) => {
      if (!(obj instanceof THREE.InstancedMesh)) return;
      if (!/farcrysis-vege-(grass-tufts|grass-patches|dense-grass|beach-grass|leaf-litter|twigs|beach-pebbles|small-rocks)$/.test(obj.name)) return;
      const mat = obj.material as THREE.MeshStandardMaterial;
      if (!mat?.emissive) return;
      groundCoverChecked += 1;
      expect(mat.emissive.getHex(), `${obj.name}: ground cover must stay unlifted`).toBe(0);
    });
    expect(groundCoverChecked, 'expected the ground-cover layers to be present').toBeGreaterThanOrEqual(4);
  });

  it('lifts the vegetation-class layers authored OUTSIDE farcrysis-vegetation.ts (HF-423)', () => {
    // The lift was gated on the `farcrysis-vege` name prefix and on the mesh
    // being an InstancedMesh - facts about WHERE a layer was authored, not
    // about what it is. Two vegetation families fell straight through:
    // the canopy trunk/crown visuals (built in farcrysis.ts AFTER
    // buildVegetation runs) and the detail vine tubes (plain Meshes, built in
    // farcrysis-detail.ts). MEASURED at emissive 0 with albedo floors of
    // 0.0138 and 0.0156 against this arena's own 0.196 ambient
    // (scripts/qa/measure-farcrysis-albedo-floor.ts) - below the 0.02 crush
    // line, i.e. the same black-silhouette defect the lift exists to remove.
    const trunkVisual = scene.getObjectByName('farcrysis-canopy-trunk-visuals') as THREE.Mesh | undefined;
    expect(trunkVisual, 'farcrysis-canopy-trunk-visuals must exist').toBeDefined();
    const trunkMat = trunkVisual!.material as THREE.MeshStandardMaterial;
    expect(trunkMat.emissive.getHex(), 'canopy trunk visuals must not be black').not.toBe(0);
    expect(trunkMat.emissive.r).toBeCloseTo(trunkMat.color.r * 0.30, 4);

    let crowns = 0;
    let vines = 0;
    scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const mat = obj.material as THREE.MeshStandardMaterial;
      if (!mat?.emissive || !mat?.color) return;
      if (/^farcrysis-canopy-crown-(lower|upper)$/.test(obj.name)) {
        crowns += 1;
        expect(mat.emissive.r, obj.name).toBeCloseTo(mat.color.r * 0.26, 4);
      } else if (/^farcrysis-detail-vine-mesh-/.test(obj.name)) {
        vines += 1;
        expect(mat.emissive.getHex(), `${obj.name}: vines must not be black`).not.toBe(0);
      }
    });
    expect(crowns, 'expected both canopy crown tiers').toBe(2);
    expect(vines, 'expected the detail vine tubes to be present and lifted').toBeGreaterThanOrEqual(8);
  });

  it('lifts the core building interior off black at the WEAKEST scale (HF-423)', () => {
    // The arena declares three practicals but none of them carries a light, so
    // the research station interior has no light source: 3.2 m walls and the
    // catwalk slab block the sun and the 0.3 ambient is all that is left.
    // MEASURED floors before this pass (measure-farcrysis-albedo-floor.ts):
    // catwalk and every stair tread 0.0195, below the 0.02 crush line. The
    // remedy is a fake bounce, not a shadowed local light - this arena's
    // in-combat frame time is already 1.85x atomic-acres.
    let lifted = 0;
    scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      if (!/^farcrysis-core-(catwalk|stair-\d+|desk)$/.test(obj.name)) return;
      const mat = obj.material as THREE.MeshStandardMaterial;
      if (!mat?.emissive || !mat?.color) return;
      lifted += 1;
      expect(mat.emissive.getHex(), `${obj.name}: core interior must not be black`).not.toBe(0);
      expect(mat.emissive.r, `${obj.name}: emissive.r`).toBeCloseTo(mat.color.r * 0.12, 4);
    });
    expect(lifted, 'expected the catwalk, the 7 stair treads and the desk').toBeGreaterThanOrEqual(9);

    // The walls are NOT lifted: measured, they already clear the crush line,
    // and they are seen in full sun from outside. Pinned so that widening the
    // pattern to the whole core has to be argued here first.
    const wallW = scene.getObjectByName('farcrysis-core-wall-w') as THREE.Mesh | undefined;
    expect(wallW, 'farcrysis-core-wall-w must exist').toBeDefined();
    expect((wallW!.material as THREE.MeshStandardMaterial).emissive.getHex(),
      'core walls must stay unlifted').toBe(0);
  });
});

