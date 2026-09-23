import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_SURFACE_SEED,
  MICRO_TILE_METRES,
  type SurfaceDescription,
  type SurfaceSample,
  createSurfaceNoise,
  disposeSurfaceForge,
  forgeSurface,
  rasterizeSurface,
  sharedMacroVariationRaster,
  sharedMicroDetailRaster,
  sharedSurfaceMaps,
  surfaceForgeCanvasAvailable,
  surfaceStandardMaterial,
  surfaceTexelBudget,
} from './surface-forge';

/** The forge copies each sample immediately, so one scratch object is legal. */
function scratchDescription(
  height: (u: number, v: number) => number,
  extra: Partial<SurfaceSample> = {},
): SurfaceDescription {
  const sample: SurfaceSample = {
    albedo: extra.albedo ?? [0.5, 0.5, 0.5],
    height: 0,
    roughness: extra.roughness ?? 0.8,
    ao: extra.ao ?? 1,
  };
  return (u, v) => {
    (sample as { height: number }).height = height(u, v);
    return sample;
  };
}

/** RGB of the normal texel at fractional tile position (u, v). */
function normalAt(normal: Uint8ClampedArray, size: number, u: number, v: number): [number, number, number] {
  const x = Math.min(size - 1, Math.floor(u * size));
  const y = Math.min(size - 1, Math.floor((1 - v) * size));
  const offset = (y * size + x) * 4;
  return [normal[offset]!, normal[offset + 1]!, normal[offset + 2]!];
}

function meanChannel(rgba: Uint8ClampedArray, channel: number): number {
  let sum = 0;
  const texels = rgba.length / 4;
  for (let index = 0; index < texels; index += 1) sum += rgba[index * 4 + channel]!;
  return sum / texels;
}

afterEach(() => {
  disposeSurfaceForge();
});

describe('surface forge - periodic noise toolkit', () => {
  it('is seamless by construction: every generator wraps at its period', () => {
    const noise = createSurfaceNoise(1234);
    for (const y of [0, 0.37, 1.9, 4.25]) {
      expect(noise.noise(0, y, 8)).toBeCloseTo(noise.noise(8, y, 8), 12);
      expect(noise.noise(y, 0, 8)).toBeCloseTo(noise.noise(y, 8, 8), 12);
      expect(noise.fbm(0, y, 8, 3)).toBeCloseTo(noise.fbm(8, y, 8, 3), 12);
      expect(noise.warp(0, y, 6, 0.5)).toBeCloseTo(noise.warp(6, y, 6, 0.5), 12);
      expect(noise.worley(0, y, 8)).toBeCloseTo(noise.worley(8, y, 8), 12);
    }
  });

  it('is deterministic per seed and actually varies with the seed', () => {
    expect(createSurfaceNoise(7).fbm(0.3, 0.7, 8)).toBe(createSurfaceNoise(7).fbm(0.3, 0.7, 8));
    expect(createSurfaceNoise(7).fbm(0.3, 0.7, 8)).not.toBe(createSurfaceNoise(8).fbm(0.3, 0.7, 8));
    // Bounded, so a description can rely on the 0..1 contract.
    const noise = createSurfaceNoise(99);
    for (let i = 0; i < 200; i += 1) {
      const value = noise.fbm(i * 0.13, i * 0.29, 8);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});

describe('surface forge - determinism', () => {
  it('produces byte-identical rasters for the same seed', () => {
    const noisy: SurfaceDescription = (u, v, noise) => ({
      albedo: [noise.fbm(u * 6, v * 6, 6), 0.4, 0.3],
      height: noise.fbm(u * 8, v * 8, 8, 3),
      roughness: 0.7 + noise.noise(u * 4, v * 4, 4) * 0.2,
      ao: 0.85 + noise.noise(u * 5, v * 5, 5) * 0.15,
    });
    const options = { size: 64, seed: 4242, tileMetres: 2, reliefMetres: 0.02 };

    const first = rasterizeSurface(noisy, options);
    const second = rasterizeSurface(noisy, options);

    expect(second.albedo).toEqual(first.albedo);
    expect(second.normal).toEqual(first.normal);
    expect(second.roughness).toEqual(first.roughness);
    expect(second.ao).toEqual(first.ao);
    expect(Array.from(second.height)).toEqual(Array.from(first.height));
  });

  it('changes with the seed, so variants are cheap but never accidental', () => {
    const noisy: SurfaceDescription = (u, v, noise) => ({
      albedo: [noise.fbm(u * 6, v * 6, 6), 0.4, 0.3],
      height: noise.fbm(u * 8, v * 8, 8, 3),
      roughness: 0.7,
    });
    const a = rasterizeSurface(noisy, { size: 32, seed: 1 });
    const b = rasterizeSurface(noisy, { size: 32, seed: 2 });
    expect(b.albedo).not.toEqual(a.albedo);
  });

  it('builds the two shared maps deterministically and only once', () => {
    const microA = sharedMicroDetailRaster();
    expect(sharedMicroDetailRaster()).toBe(microA);
    expect(sharedMacroVariationRaster()).toBe(sharedMacroVariationRaster());

    disposeSurfaceForge();
    const microB = sharedMicroDetailRaster();
    expect(microB).not.toBe(microA);
    expect(microB.rgba).toEqual(microA.rgba);
    expect(Array.from(microB.slopeU)).toEqual(Array.from(microA.slopeU));
  });
});

describe('surface forge - Sobel height to tangent normal', () => {
  const flatOptions = { size: 32, reliefMetres: 0.05, tileMetres: 1, micro: false as const };

  it('yields the neutral normal (128, 128, 255) for a flat height field', () => {
    const raster = rasterizeSurface(scratchDescription(() => 0.5), flatOptions);
    for (let index = 0; index < raster.size * raster.size; index += 1) {
      const offset = index * 4;
      expect([raster.normal[offset], raster.normal[offset + 1], raster.normal[offset + 2]])
        .toEqual([128, 128, 255]);
    }
  });

  it('points the right way for a ramp in u (red below neutral, green neutral)', () => {
    const raster = rasterizeSurface(scratchDescription((u) => u), flatOptions);
    // Sampled mid-tile, away from the wrap seam where the ramp resets.
    const [r, g, b] = normalAt(raster.normal, raster.size, 0.5, 0.5);
    expect(r).toBeLessThan(128); // uphill toward +u tilts the normal toward -u
    expect(g).toBe(128);
    // Still a tangent-space normal: +Z dominates, and the 5 cm-per-metre slope
    // this ramp implies is a 7-byte tilt, not a wild one.
    expect(b).toBeGreaterThan(Math.max(r, g));
    expect(128 - r).toBeGreaterThan(3);
  });

  it('points the right way for a ramp in v (green below neutral, red neutral)', () => {
    const raster = rasterizeSurface(scratchDescription((_u, v) => v), flatOptions);
    const [r, g] = normalAt(raster.normal, raster.size, 0.5, 0.5);
    expect(g).toBeLessThan(128); // uphill toward +v tilts the normal toward -v
    expect(r).toBe(128);
  });

  it('scales the slope with relief over tile metres, not with resolution', () => {
    // A genuinely periodic field, so the wrap is exact and the only difference
    // between resolutions is the Sobel footprint.
    const wave = scratchDescription((u) => 0.5 + 0.35 * Math.sin(u * Math.PI * 2));
    const shared = { reliefMetres: 0.1, tileMetres: 1, micro: false as const };
    const coarse = rasterizeSurface(wave, { ...shared, size: 64 });
    const fine = rasterizeSurface(wave, { ...shared, size: 256 });

    const coarseNormal = normalAt(coarse.normal, coarse.size, 0.5, 0.5);
    const fineNormal = normalAt(fine.normal, fine.size, 0.5, 0.5);
    expect(Math.abs(coarseNormal[0] - fineNormal[0])).toBeLessThanOrEqual(2);
    expect(coarseNormal[0]).toBeGreaterThan(128); // downhill at u = 0.5

    // Doubling the relief over the same tile must tilt the normal further.
    const deeper = rasterizeSurface(wave, { ...shared, size: 64, reliefMetres: 0.2 });
    expect(normalAt(deeper.normal, deeper.size, 0.5, 0.5)[0]).toBeGreaterThan(coarseNormal[0]);

    // Doubling the tile metres at fixed relief must flatten it by the same law.
    const stretched = rasterizeSurface(wave, { ...shared, size: 64, tileMetres: 2 });
    expect(normalAt(stretched.normal, stretched.size, 0.5, 0.5)[0]).toBeLessThan(coarseNormal[0]);
  });
});

describe('surface forge - authored channels', () => {
  it('round-trips albedo, roughness and AO from the one description', () => {
    const raster = rasterizeSurface(
      () => ({ albedo: [1, 0, 0.5], height: 0.5, roughness: 0.25, ao: 0.5 }),
      { size: 16, micro: false },
    );
    expect([raster.albedo[0], raster.albedo[1], raster.albedo[2], raster.albedo[3]]).toEqual([255, 0, 128, 255]);
    expect(raster.roughness[0]).toBe(64);
    expect(raster.ao[0]).toBe(128);
  });

  it('defaults a missing ao to fully unoccluded and clamps out-of-range authoring', () => {
    const raster = rasterizeSurface(
      () => ({ albedo: [2, -1, 0.5], height: 5, roughness: -3 }),
      { size: 8, micro: false },
    );
    expect(raster.ao[0]).toBe(255);
    expect([raster.albedo[0], raster.albedo[1]]).toEqual([255, 0]);
    expect(raster.roughness[0]).toBe(0);
    expect(raster.height[0]).toBe(1);
  });

  it('never leaves height in albedo alpha, so nothing can flip transparency', () => {
    const raster = rasterizeSurface(scratchDescription(() => 0.2), { size: 8 });
    for (let index = 0; index < raster.size * raster.size; index += 1) {
      expect(raster.albedo[index * 4 + 3]).toBe(255);
    }
  });
});

describe('surface forge - two-scale detail', () => {
  it('adds shared micro tooth to a macro surface that has none', () => {
    const flat = scratchDescription(() => 0.5);
    const options = { size: 128, tileMetres: 2, reliefMetres: 0.01 };
    const macroOnly = rasterizeSurface(flat, { ...options, micro: false });
    const twoScale = rasterizeSurface(flat, { ...options, micro: { tiles: 2 } });

    expect(macroOnly.microTiles).toBe(0);
    expect(twoScale.microTiles).toBe(2);
    // The macro-only normal is perfectly neutral; the two-scale one is not.
    expect(twoScale.normal).not.toEqual(macroOnly.normal);
    expect(meanChannel(macroOnly.ao, 0)).toBe(255);
    expect(meanChannel(twoScale.ao, 0)).toBeLessThan(255);
    // Micro relief speckles albedo about the authored value rather than
    // uniformly darkening or brightening it.
    expect(meanChannel(twoScale.albedo, 0)).toBeCloseTo(meanChannel(macroOnly.albedo, 0), 0);
  });

  it('derives micro repetitions from the surface footprint, not from a repeat count', () => {
    const flat = scratchDescription(() => 0.5);
    // 0.5 m tile at 0.25 m micro = 2 repeats; 1 m tile = 4.
    expect(rasterizeSurface(flat, { size: 256, tileMetres: 0.5 }).microTiles).toBe(2);
    expect(rasterizeSurface(flat, { size: 256, tileMetres: 1 }).microTiles).toBe(4);
    // Capped so one micro repeat never gets fewer than 64 surface texels.
    expect(rasterizeSurface(flat, { size: 128, tileMetres: 8 }).microTiles).toBe(2);
    expect(MICRO_TILE_METRES).toBe(0.25);
  });

  it('keeps exactly two shared maps and hands back the same singleton', () => {
    const maps = sharedSurfaceMaps();
    expect(sharedSurfaceMaps()).toBe(maps);
    expect(Object.keys(maps).sort()).toEqual(['macroVariationMap', 'microDetailMap', 'microRepeatFor']);
    expect(maps.microRepeatFor(2)).toBe(8);
    expect(maps.microRepeatFor(0.25)).toBe(1);
  });
});

describe('surface forge - Nyquist budget', () => {
  it('reports millimetres per texel and texels per authored cell', () => {
    const budget = surfaceTexelBudget({ size: 512, tileMetres: 2 });
    expect(budget.millimetresPerTexel).toBeCloseTo(3.90625, 5);
    expect(budget.texelsPerCell(32)).toBe(16);
    // The shared micro tile's finest authored band stays above 5 texels.
    const micro = sharedMicroDetailRaster();
    expect(micro.size / 32).toBeGreaterThanOrEqual(5);
  });
});

describe('surface forge - headless safety and caching', () => {
  it('returns nulls instead of throwing when there is no 2D canvas', () => {
    // The vitest suites and the collider/visual parity audit run in plain Node
    // with no DOM, so this is the path every arena build actually takes here.
    expect(surfaceForgeCanvasAvailable()).toBe(false);

    const forged = forgeSurface('headless-probe', scratchDescription(() => 0.5), { size: 32 });
    expect(forged.available).toBe(false);
    expect(forged.map).toBeNull();
    expect(forged.normalMap).toBeNull();
    expect(forged.roughnessMap).toBeNull();
    expect(forged.aoMap).toBeNull();
    expect(forged.reliefRatio).toBeGreaterThan(0);

    const maps = sharedSurfaceMaps();
    expect(maps.microDetailMap).toBeNull();
    expect(maps.macroVariationMap).toBeNull();
  });

  it('falls back to a flat MeshStandardMaterial with no maps bound', () => {
    const forged = forgeSurface('headless-material', scratchDescription(() => 0.5), { size: 32 });
    const material = surfaceStandardMaterial(forged, { color: 0xb59a6e, roughness: 0.94 });

    expect(material).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(material.map).toBeNull();
    expect(material.normalMap).toBeNull();
    expect(material.roughnessMap).toBeNull();
    expect(material.aoMap).toBeNull();
    expect(material.roughness).toBe(0.94);
    expect(material.metalness).toBe(0);
    expect(material.color.getHex()).toBe(0xb59a6e);
    material.dispose();
  });

  it('never evaluates the description when the canvas is unavailable', () => {
    let calls = 0;
    forgeSurface('headless-lazy', (u, v) => {
      calls += 1;
      return { albedo: [u, v, 0], height: 0.5, roughness: 0.5 };
    }, { size: 64 });
    expect(calls).toBe(0);
  });

  it('caches by surface name so repeat calls are free and identical', () => {
    const description = scratchDescription(() => 0.5);
    const first = forgeSurface('cached-hardpan', description, { size: 32 });
    const second = forgeSurface('cached-hardpan', description, { size: 32 });
    expect(second).toBe(first);
    expect(Object.isFrozen(first)).toBe(true);

    disposeSurfaceForge();
    expect(forgeSurface('cached-hardpan', description, { size: 32 })).not.toBe(first);
  });

  it('exposes a stable default seed so peers bake identical arenas', () => {
    expect(DEFAULT_SURFACE_SEED).toBe(0x5eed_10a5 | 0);
    expect(Number.isInteger(DEFAULT_SURFACE_SEED)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The browser path. Node has no canvas, so without this stub the half of the
// forge that actually reaches a player's screen would never be executed by any
// test. The stub is a plain ImageData store - it does no drawing, because the
// forge only ever putImageData/getImageData.
// ---------------------------------------------------------------------------

function installStubCanvas(): () => void {
  const host = globalThis as { document?: unknown };
  const original = Object.getOwnPropertyDescriptor(host, 'document');
  host.document = {
    createElement(tag: string) {
      if (tag !== 'canvas') throw new Error(`stub canvas cannot create <${tag}>`);
      let store: Uint8ClampedArray | null = null;
      const canvas = {
        width: 0,
        height: 0,
        getContext(kind: string) {
          if (kind !== '2d') return null;
          return {
            createImageData: (w: number, h: number) => ({
              data: new Uint8ClampedArray(w * h * 4),
              width: w,
              height: h,
            }),
            putImageData: (image: { data: Uint8ClampedArray }) => {
              store = new Uint8ClampedArray(image.data);
            },
            getImageData: (x: number, y: number, w: number, h: number) => {
              const out = new Uint8ClampedArray(w * h * 4);
              if (store) {
                for (let row = 0; row < h; row += 1) {
                  const from = ((y + row) * canvas.width + x) * 4;
                  out.set(store.subarray(from, from + w * 4), row * w * 4);
                }
              }
              return { data: out, width: w, height: h };
            },
          };
        },
      };
      return canvas;
    },
  };
  return () => {
    if (original) Object.defineProperty(host, 'document', original);
    else delete host.document;
    disposeSurfaceForge();
  };
}

describe('surface forge - browser path', () => {
  it('binds all four maps with the correct colour spaces and repeat', () => {
    const restore = installStubCanvas();
    try {
      disposeSurfaceForge();
      expect(surfaceForgeCanvasAvailable()).toBe(true);

      const forged = forgeSurface(
        'stub-hardpan',
        (u, v, noise) => ({
          albedo: [0.71, 0.6, 0.43],
          height: noise.fbm(u * 8, v * 8, 8, 3),
          roughness: 0.92,
          ao: 0.95,
        }),
        { size: 64, tileMetres: 2, reliefMetres: 0.012, repeat: [7, 5.4], anisotropy: 8 },
      );

      expect(forged.available).toBe(true);
      expect(forged.map?.colorSpace).toBe(THREE.SRGBColorSpace);
      // Normal, roughness and AO are DATA. sRGB-encoding them would read a
      // stored 0.5 back as 0.21 linear and bias every derived term.
      expect(forged.normalMap?.colorSpace).toBe(THREE.NoColorSpace);
      expect(forged.roughnessMap?.colorSpace).toBe(THREE.NoColorSpace);
      expect(forged.aoMap?.colorSpace).toBe(THREE.NoColorSpace);
      expect(forged.map?.wrapS).toBe(THREE.RepeatWrapping);
      expect(forged.map?.repeat.toArray()).toEqual([7, 5.4]);
      expect(forged.normalMap?.repeat.toArray()).toEqual([7, 5.4]);
      expect(forged.map?.anisotropy).toBe(8);
      expect(forged.reliefRatio).toBeCloseTo(0.006, 6);

      const material = surfaceStandardMaterial(forged, { normalScale: 1.2, aoMapIntensity: 0.8 });
      expect(material.map).toBe(forged.map);
      expect(material.normalMap).toBe(forged.normalMap);
      expect(material.roughnessMap).toBe(forged.roughnessMap);
      expect(material.aoMap).toBe(forged.aoMap);
      expect(material.normalScale.x).toBe(1.2);
      expect(material.aoMapIntensity).toBe(0.8);
      // A roughness map multiplies the scalar, so the scalar must stay at 1.
      expect(material.roughness).toBe(1);
      material.dispose();

      const shared = sharedSurfaceMaps();
      expect(shared.microDetailMap?.colorSpace).toBe(THREE.NoColorSpace);
      expect(shared.macroVariationMap?.colorSpace).toBe(THREE.NoColorSpace);
    } finally {
      restore();
    }
  });
});
