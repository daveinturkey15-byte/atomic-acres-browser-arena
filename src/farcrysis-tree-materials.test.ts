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
});

