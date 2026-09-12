/**
 * Farcrysis ground PBR material fidelity gate.
 *
 * Measures — not merely asserts presence — the material response of every
 * terrain/ground mesh in the farcrysis arena: map/normalMap/roughnessMap
 * presence, source resolution, repeat, anisotropy, wrap mode, roughness.
 *
 * Companion to farcrysis-geometry-integrity.test.ts (geometry untouched here;
 * this file is materials-only).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { buildFarcrysis } from './farcrysis';

/**
 * The ground meshes that the LIVE arena actually builds.
 *
 * This list was originally written against `farcrysis-terrain.ts`, which names
 * a sand ring and a wet-sand band - but that module has no importers and is not
 * what `buildFarcrysis` runs. The live path is `farcrysis-art.ts`, which builds
 * the beach into the terrain shell's vertex colours and names the shoreline
 * `farcrysis-water-wetsand`. Asserting against the dead module's mesh set made
 * this gate unsatisfiable, so it is corrected to the real surfaces here.
 */
const GROUND_MESH_RE = /^farcrysis-(terrain-elevation|water-wetsand)$/;

function fakeCanvasContext(): CanvasRenderingContext2D {
  const gradient = () => ({ addColorStop: vi.fn() });
  const contextState: Record<PropertyKey, unknown> = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '10px sans-serif',
  };
  return new Proxy(contextState, {
    get(target, property) {
      if (property === 'createImageData') {
        return (w: number, h: number) => ({
          width: w,
          height: h,
          data: new Uint8ClampedArray(w * h * 4),
        });
      }
      if (property === 'getImageData') {
        return (_x: number, _y: number, w: number, h: number) => ({
          width: w,
          height: h,
          data: new Uint8ClampedArray(w * h * 4),
        });
      }
      if (property === 'createLinearGradient' || property === 'createRadialGradient') {
        return gradient;
      }
      if (property === 'measureText') {
        return (text: string) => ({ width: text.length * 10 });
      }
      if (property in target) return target[property];
      return () => undefined;
    },
    set(target, property, value) {
      target[property] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

function stubCanvasDocument(): void {
  const context = fakeCanvasContext();
  vi.stubGlobal('document', {
    createElement: (_tagName: string) => ({
      width: 0,
      height: 0,
      getContext: () => context,
      style: {},
      setAttribute: () => undefined,
      appendChild: () => undefined,
      remove: () => undefined,
    }),
    getElementById: (_id: string) => null,
    body: { appendChild: () => undefined },
  });
}

interface TextureSummary {
  resolution: [number, number] | null;
  repeat: [number, number];
  anisotropy: number;
  wrapS: number;
  wrapT: number;
  colorSpace: string;
}

function summarizeTexture(tex: THREE.Texture | null): TextureSummary {
  if (!tex) return { resolution: null, repeat: [1, 1], anisotropy: 0, wrapS: -1, wrapT: -1, colorSpace: '' };
  const img = tex.image as { width?: number; height?: number } | null;
  return {
    resolution: img && img.width ? [img.width, img.height ?? 0] : null,
    repeat: [tex.repeat.x, tex.repeat.y],
    anisotropy: tex.anisotropy,
    wrapS: tex.wrapS,
    wrapT: tex.wrapT,
    colorSpace: String(tex.colorSpace),
  };
}

function collectGroundMaterials(scene: THREE.Scene): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (!GROUND_MESH_RE.test(obj.name)) return;
    const mat = (Array.isArray(obj.material) ? obj.material[0] : obj.material) as THREE.MeshStandardMaterial;
    out.push({
      mesh: obj.name,
      materialType: mat?.type ?? null,
      vertexColors: mat?.vertexColors ?? null,
      colorHex: mat instanceof THREE.MeshStandardMaterial ? '#'+mat.color.getHexString() : null,
      map: summarizeTexture(mat?.map ?? null),
      normalMap: summarizeTexture(mat?.normalMap ?? null),
      normalScale: mat?.normalScale ? [mat.normalScale.x, mat.normalScale.y] : null,
      roughnessMap: summarizeTexture(mat?.roughnessMap ?? null),
      roughness: mat?.roughness ?? null,
      metalness: mat?.metalness ?? null,
    });
  });
  return out;
}

describe('farcrysis ground material fidelity', () => {
  beforeEach(() => stubCanvasDocument());
  afterEach(() => vi.unstubAllGlobals());

  it('reports the live terrain/ground material state', () => {
    const scene = new THREE.Scene();
    buildFarcrysis(scene);
    const report = collectGroundMaterials(scene);
    // eslint-disable-next-line no-console
    console.log('GROUND_MATERIAL_REPORT ' + JSON.stringify(report));
    expect(report.length).toBeGreaterThanOrEqual(2);
  });

  it('gives every live terrain mesh a full PBR response (map + normal + roughness)', () => {
    const scene = new THREE.Scene();
    buildFarcrysis(scene);
    const liveTerrainNames = [
      'farcrysis-terrain-elevation',
      'farcrysis-water-wetsand',
    ];
    for (const name of liveTerrainNames) {
      const entry = collectGroundMaterials(scene).find((m) => m.mesh === name);
      expect(entry, `${name} must exist in the built arena`).toBeTruthy();
      const map = entry!.map as TextureSummary;
      const normalMap = entry!.normalMap as TextureSummary;
      const roughnessMap = entry!.roughnessMap as TextureSummary;
      expect(map.resolution, `${name}: albedo map`).not.toBeNull();
      expect(normalMap.resolution, `${name}: normal map`).not.toBeNull();
      expect(roughnessMap.resolution, `${name}: roughness map`).not.toBeNull();
      // Anti-tile contract: repeat high enough that one canvas never spans
      // the whole 64 m surface visibly
      expect(map.repeat[0]).toBeGreaterThanOrEqual(2);
      expect(map.repeat[1]).toBeGreaterThanOrEqual(2);
      expect(normalMap.anisotropy).toBeGreaterThanOrEqual(4);
      expect(map.wrapS).toBe(THREE.RepeatWrapping);
      expect(map.wrapT).toBe(THREE.RepeatWrapping);
    }
  });

  it('keeps wet sand optically smoother than dry sand (roughness ordering)', () => {
    const scene = new THREE.Scene();
    buildFarcrysis(scene);
    const report = collectGroundMaterials(scene);
    const wetBand = report.find((m) => m.mesh === 'farcrysis-water-wetsand');
    const elevation = report.find((m) => m.mesh === 'farcrysis-terrain-elevation');
    expect(wetBand).toBeTruthy();
    expect(elevation).toBeTruthy();
    const wetRough = wetBand!.roughness as number;
    const dryRough = elevation!.roughness as number;
    expect(wetRough, 'wet shoreline must read smoother than dry terrain').toBeLessThan(dryRough);
  });

  it('does not overwrite the legacy plates when they are absent (Pass 69 layout)', () => {
    // Pass 69 re-authored layout builds only the three live terrain meshes;
    // the legacy plate names do not exist. The applier must not throw or
    // fabricate materials for them.
    const scene = new THREE.Scene();
    expect(() => buildFarcrysis(scene)).not.toThrow();
    const names = new Set<string>();
    scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) names.add(obj.name);
    });
    expect(names.has('farcrysis-terrain-elevation')).toBe(true);
  });
});
