import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ATOMIC_ACRES_GENERATED_SKY_ASSET_URL,
  ATOMIC_ACRES_GENERATED_SKY_PROVENANCE_PATH,
  RUSTWORKS_GENERATED_SKY_ASSET_URL,
  RUSTWORKS_GENERATED_SKY_PROVENANCE_PATH,
  SKY_BACKDROP_CLOUDS,
  SKY_BACKDROP_SUN,
  SKY_BACKDROP_TEXTURE_SIZE,
  SKY_BACKDROP_WEBGPU_ADMISSION_TIMEOUT_MS,
  TERMINAL_GENERATED_SKY_ASSET_URL,
  TERMINAL_GENERATED_SKY_PROVENANCE_PATH,
  applySkyBackdrop,
  disposeSkyBackdrops,
  skyBackdropAssetForPreset,
  skyBackdropPreset,
  waitForSkyBackdropAdmission,
} from './sky-backdrop';
import { definition as atomicAcresDefinition } from './arenas/atomic-acres';
import { definition as rustworksDefinition } from './arenas/rustworks-1v1';
import { definition as terminalDefinition } from './arenas/skyline-terminal';

type TextureLoadCallbacks = {
  url: string;
  onLoad?: (image: HTMLImageElement) => void;
  onError?: (event: unknown) => void;
};

function fakeCanvasContext(): CanvasRenderingContext2D {
  const gradient = () => ({ addColorStop: vi.fn() });
  return {
    createLinearGradient: gradient,
    createRadialGradient: gradient,
    fillRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    fillStyle: '',
  } as unknown as CanvasRenderingContext2D;
}

function stubCanvasDocument(): void {
  const context = fakeCanvasContext();
  vi.stubGlobal('document', {
    createElement: () => ({ width: 0, height: 0, getContext: () => context }),
  });
}

function captureTextureLoads(): TextureLoadCallbacks[] {
  const requests: TextureLoadCallbacks[] = [];
  vi.spyOn(THREE.ImageLoader.prototype, 'load').mockImplementation(((
    url: string,
    onLoad?: (image: HTMLImageElement) => void,
    _onProgress?: (event: ProgressEvent<EventTarget>) => void,
    onError?: (event: unknown) => void,
  ) => {
    requests.push({ url, onLoad, onError });
    return {} as HTMLImageElement;
  }) as THREE.ImageLoader['load']);
  return requests;
}

function decodedSkyImage(): HTMLImageElement {
  return { width: 4_096, height: 2_048, complete: true } as HTMLImageElement;
}

async function flushTextureAdmission(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

async function skyPixelEvidence(path: string): Promise<Readonly<{
  width: number;
  height: number;
  edgeMae: number;
  adjacentMae: number;
  laplacianMae: number;
  mirrorMae: number;
  sampledColors: number;
  encodedBytes: number;
}>> {
  const encoded = readFileSync(path);
  const { data, info } = await sharp(encoded).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let edgeDelta = 0;
  let adjacentDelta = 0;
  let mirrorDelta = 0;
  let laplacianDelta = 0;
  let edgeSamples = 0;
  let adjacentSamples = 0;
  let mirrorSamples = 0;
  let laplacianSamples = 0;
  const sampledColors = new Set<number>();
  for (let y = 0; y < info.height; y += 1) {
    const row = y * info.width * info.channels;
    const oppositeRow = (info.height - 1 - y) * info.width * info.channels;
    for (let channel = 0; channel < 3; channel += 1) {
      edgeDelta += Math.abs(data[row + channel]! - data[row + (info.width - 1) * info.channels + channel]!);
      edgeSamples += 1;
    }
    for (let x = 1; x < info.width; x += 1) {
      const pixel = row + x * info.channels;
      const previous = pixel - info.channels;
      for (let channel = 0; channel < 3; channel += 1) {
        adjacentDelta += Math.abs(data[pixel + channel]! - data[previous + channel]!);
        adjacentSamples += 1;
      }
      if (x < info.width - 1 && y > 0 && y < info.height - 1 && x % 2 === 0 && y % 2 === 0) {
        const left = pixel - info.channels;
        const right = pixel + info.channels;
        const above = pixel - info.width * info.channels;
        const below = pixel + info.width * info.channels;
        const luminance = (offset: number) => (
          data[offset]! * 0.2126 + data[offset + 1]! * 0.7152 + data[offset + 2]! * 0.0722
        );
        laplacianDelta += Math.abs(
          luminance(pixel) * 4
          - luminance(left)
          - luminance(right)
          - luminance(above)
          - luminance(below)
        );
        laplacianSamples += 1;
      }
    }
    if (y < Math.floor(info.height / 2)) {
      for (let x = 0; x < info.width; x += 1) {
        const pixel = row + x * info.channels;
        const opposite = oppositeRow + x * info.channels;
        for (let channel = 0; channel < 3; channel += 1) {
          mirrorDelta += Math.abs(data[pixel + channel]! - data[opposite + channel]!);
          mirrorSamples += 1;
        }
      }
    }
    if (y % 7 === 0) {
      for (let x = 0; x < info.width; x += 7) {
        const pixel = row + x * info.channels;
        sampledColors.add((data[pixel]! << 16) | (data[pixel + 1]! << 8) | data[pixel + 2]!);
      }
    }
  }
  return Object.freeze({
    width: info.width,
    height: info.height,
    edgeMae: edgeDelta / edgeSamples,
    adjacentMae: adjacentDelta / adjacentSamples,
    laplacianMae: laplacianDelta / laplacianSamples,
    mirrorMae: mirrorDelta / mirrorSamples,
    sampledColors: sampledColors.size,
    encodedBytes: encoded.byteLength,
  });
}

describe('shared sky backdrop', () => {
  beforeEach(() => stubCanvasDocument());
  afterEach(() => {
    vi.useRealTimers();
    disposeSkyBackdrops();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('retains a 4K-reviewable 2:1 equirectangular source instead of the blocky 512px fallback', () => {
    expect(SKY_BACKDROP_TEXTURE_SIZE).toEqual({ width: 2_048, height: 1_024 });
    expect(SKY_BACKDROP_TEXTURE_SIZE.width / SKY_BACKDROP_TEXTURE_SIZE.height).toBe(2);
  });

  it('keeps the new production panoramas detailed, continuous and non-mirrored after WebP delivery', async () => {
    const files = [
      { path: 'source-assets/skies/atomic-acres-sunset-generated.png', runtime: false },
      { path: 'public/assets/original/skies/atomic-acres-sunset.webp', runtime: true },
      { path: 'source-assets/skies/rustworks-industrial-night-generated.png', runtime: false },
      { path: 'public/assets/original/skies/rustworks-industrial-night.webp', runtime: true },
      { path: 'source-assets/skies/terminal-airport-dawn-generated.png', runtime: false },
      { path: 'public/assets/original/skies/terminal-airport-dawn.webp', runtime: true },
    ];
    for (const { path, runtime } of files) {
      const evidence = await skyPixelEvidence(path);
      expect(evidence.width).toBe(runtime ? 4_096 : 1_774);
      expect(evidence.height).toBe(runtime ? 2_048 : 887);
      expect(evidence.width / evidence.height).toBe(2);
      expect(evidence.edgeMae).toBeLessThan(8);
      expect(evidence.adjacentMae).toBeGreaterThan(runtime ? 0.65 : 1);
      expect(evidence.laplacianMae).toBeGreaterThan(runtime ? 1.5 : 2);
      expect(evidence.mirrorMae).toBeGreaterThan(10);
      expect(evidence.sampledColors).toBeGreaterThan(3_000);
      if (runtime) expect(evidence.encodedBytes).toBeGreaterThan(500_000);
    }
  });

  it('fails unknown arena presets into the readable day sky', () => {
    expect(skyBackdropPreset('sunset-farmland')).toBe('sunset-farmland');
    expect(skyBackdropPreset('industrial-night')).toBe('industrial-night');
    expect(skyBackdropPreset('airport-dawn')).toBe('airport-dawn');
    expect(skyBackdropPreset('indoor-range')).toBe('indoor-range');
    expect(skyBackdropPreset('future-map')).toBe('airport-dawn');
  });

  it('keeps outdoor detail in the visible sky hemisphere instead of below the horizon', () => {
    for (const preset of ['sunset-farmland', 'industrial-night', 'airport-dawn'] as const) {
      expect(SKY_BACKDROP_CLOUDS[preset]?.bandTop).toBeLessThan(0.25);
      expect(SKY_BACKDROP_CLOUDS[preset]?.bandBottom).toBeLessThanOrEqual(0.56);
    }
    expect(SKY_BACKDROP_SUN['sunset-farmland']?.y).toBeLessThanOrEqual(0.5);
    expect(SKY_BACKDROP_SUN['airport-dawn']?.y).toBeLessThan(0.5);
  });

  it('maps every outdoor preset to one selected project-original panorama', () => {
    expect(ATOMIC_ACRES_GENERATED_SKY_ASSET_URL).toBe('./assets/original/skies/atomic-acres-sunset.webp');
    expect(RUSTWORKS_GENERATED_SKY_ASSET_URL).toBe('./assets/original/skies/rustworks-industrial-night.webp');
    expect(TERMINAL_GENERATED_SKY_ASSET_URL).toBe('./assets/original/skies/terminal-airport-dawn.webp');
    expect(skyBackdropAssetForPreset('sunset-farmland')).toBe(ATOMIC_ACRES_GENERATED_SKY_ASSET_URL);
    expect(skyBackdropAssetForPreset('industrial-night')).toBe(RUSTWORKS_GENERATED_SKY_ASSET_URL);
    expect(skyBackdropAssetForPreset('airport-dawn')).toBe(TERMINAL_GENERATED_SKY_ASSET_URL);
    expect(skyBackdropAssetForPreset('indoor-range')).toBeNull();
    expect(atomicAcresDefinition.assetDependencies).toContain(ATOMIC_ACRES_GENERATED_SKY_ASSET_URL);
    expect(rustworksDefinition.assetDependencies).toContain(RUSTWORKS_GENERATED_SKY_ASSET_URL);
    expect(terminalDefinition.assetDependencies).toContain(TERMINAL_GENERATED_SKY_ASSET_URL);
  });

  it('requests the selected sky only and preserves the immediate fallback for every outdoor arena', () => {
    const requests = captureTextureLoads();
    const selected = [
      ['sunset-farmland', ATOMIC_ACRES_GENERATED_SKY_ASSET_URL],
      ['industrial-night', RUSTWORKS_GENERATED_SKY_ASSET_URL],
      ['airport-dawn', TERMINAL_GENERATED_SKY_ASSET_URL],
    ] as const;

    for (const [preset, expectedUrl] of selected) {
      const scene = new THREE.Scene();
      const recorded: string[] = [];
      const fallback = applySkyBackdrop(scene, preset, (url) => recorded.push(url));
      expect(scene.background).toBe(fallback);
      expect(scene.userData.pass66SkyBackdropStatus).toBe('asset-loading');
      expect(scene.userData.pass66SkyBackdropSource).toBe('procedural-canvas');
      expect(recorded).toEqual([expectedUrl]);
    }

    expect(requests.map((entry) => entry.url)).toEqual(selected.map(([, url]) => url));
  });

  it('keeps the procedural texture visible until the decoded equirectangular asset is ready', async () => {
    const requests = captureTextureLoads();
    const scene = new THREE.Scene();
    const recorded: string[] = [];
    const fallback = applySkyBackdrop(scene, 'sunset-farmland', (url) => recorded.push(url));

    expect(scene.background).toBe(fallback);
    expect(scene.userData.pass66SkyBackdropStatus).toBe('asset-loading');
    expect(scene.userData.pass66SkyBackdropSource).toBe('procedural-canvas');
    expect(recorded).toEqual([ATOMIC_ACRES_GENERATED_SKY_ASSET_URL]);
    expect(requests.map((entry) => entry.url)).toEqual([ATOMIC_ACRES_GENERATED_SKY_ASSET_URL]);

    requests[0]!.onLoad?.(decodedSkyImage());
    await flushTextureAdmission();

    const generated = scene.background as THREE.Texture;

    expect(generated).not.toBe(fallback);
    expect(scene.userData.pass66SkyBackdropStatus).toBe('asset-ready');
    expect(scene.userData.pass66SkyBackdropSource).toBe('generated-equirectangular-webp');
    expect(generated.mapping).toBe(THREE.EquirectangularReflectionMapping);
    expect(generated.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(generated.wrapS).toBe(THREE.RepeatWrapping);
    expect(generated.wrapT).toBe(THREE.ClampToEdgeWrapping);
    expect(generated.generateMipmaps).toBe(false);
    // ImageLoader hands ownership to one fully configured Texture. This must
    // remain one upload version: TextureLoader plus a second needsUpdate was a
    // device-loss suspect on the native WebGPU map-switch path.
    expect(generated.version).toBe(1);
  });

  it('settles the selected panorama before WebGPU presentation prewarm', async () => {
    const requests = captureTextureLoads();
    const scene = new THREE.Scene();
    applySkyBackdrop(scene, 'sunset-farmland');
    const admission = waitForSkyBackdropAdmission(scene);

    expect(scene.userData.pass66SkyBackdropStatus).toBe('asset-loading');
    requests[0]!.onLoad?.(decodedSkyImage());

    await expect(admission).resolves.toBe('asset-ready');
    expect(scene.userData.pass66SkyBackdropSource).toBe('generated-equirectangular-webp');
  });

  it('fails open to the procedural sky and rejects a decode that arrives after the admission bound', async () => {
    vi.useFakeTimers();
    const requests = captureTextureLoads();
    const scene = new THREE.Scene();
    const fallback = applySkyBackdrop(scene, 'sunset-farmland');
    const admission = waitForSkyBackdropAdmission(scene, 25);

    await vi.advanceTimersByTimeAsync(25);
    await expect(admission).resolves.toBe('procedural-fallback');
    expect(SKY_BACKDROP_WEBGPU_ADMISSION_TIMEOUT_MS).toBe(4_000);
    expect(scene.background).toBe(fallback);
    expect(scene.userData.pass66SkyBackdropStatus).toBe('procedural-fallback');

    requests[0]!.onLoad?.(decodedSkyImage());
    await flushTextureAdmission();

    expect(scene.background).toBe(fallback);
    expect(scene.userData.pass66SkyBackdropStatus).toBe('procedural-fallback');
    expect(scene.userData.pass66SkyBackdropSource).toBe('procedural-canvas');
  });

  it('retains the non-white procedural fallback when image decoding fails', async () => {
    const requests = captureTextureLoads();
    const scene = new THREE.Scene();
    const fallback = applySkyBackdrop(scene, 'sunset-farmland');

    requests[0]!.onError?.(new Error('decode failed'));
    await flushTextureAdmission();

    expect(scene.background).toBe(fallback);
    expect(scene.userData.pass66SkyBackdropStatus).toBe('procedural-fallback');
    expect(scene.userData.pass66SkyBackdropSource).toBe('procedural-canvas');
  });

  it('does not attach a late Atomic Acres decode after the scene selected another preset', async () => {
    const requests = captureTextureLoads();
    const scene = new THREE.Scene();
    applySkyBackdrop(scene, 'sunset-farmland');
    const selectedFallback = applySkyBackdrop(scene, 'industrial-night');

    requests[0]!.onLoad?.(decodedSkyImage());
    await flushTextureAdmission();

    expect(scene.background).toBe(selectedFallback);
    expect(scene.userData.pass66SkyBackdropPreset).toBe('industrial-night');
    expect(scene.userData.pass66SkyBackdropStatus).toBe('asset-loading');
    expect(requests.map((entry) => entry.url)).toEqual([
      ATOMIC_ACRES_GENERATED_SKY_ASSET_URL,
      RUSTWORKS_GENERATED_SKY_ASSET_URL,
    ]);
  });

  it('retains the admitted generated texture across map switches without disposal or re-decode', async () => {
    const requests = captureTextureLoads();
    const scene = new THREE.Scene();
    applySkyBackdrop(scene, 'sunset-farmland');
    requests[0]!.onLoad?.(decodedSkyImage());
    await flushTextureAdmission();
    const generated = scene.background as THREE.Texture;
    const generatedDispose = vi.spyOn(generated, 'dispose');

    applySkyBackdrop(scene, 'airport-dawn');
    expect(scene.background).not.toBe(generated);
    applySkyBackdrop(scene, 'sunset-farmland');
    await flushTextureAdmission();

    expect(requests.map((entry) => entry.url)).toEqual([
      ATOMIC_ACRES_GENERATED_SKY_ASSET_URL,
      TERMINAL_GENERATED_SKY_ASSET_URL,
    ]);
    expect(scene.background).toBe(generated);
    expect(generatedDispose).not.toHaveBeenCalled();
  });

  it('disposes both procedural and admitted generated textures at terminal teardown', async () => {
    const requests = captureTextureLoads();
    const scene = new THREE.Scene();
    const fallback = applySkyBackdrop(scene, 'sunset-farmland');
    const fallbackDispose = vi.spyOn(fallback, 'dispose');
    requests[0]!.onLoad?.(decodedSkyImage());
    await flushTextureAdmission();
    const generated = scene.background as THREE.Texture;
    const generatedDispose = vi.spyOn(generated, 'dispose');

    // Called once per page exit; a second invocation must not re-dispose or
    // throw on the already-cleared caches.
    disposeSkyBackdrops();

    expect(fallbackDispose).toHaveBeenCalledTimes(1);
    expect(generatedDispose).toHaveBeenCalledTimes(1);
  });

  it('pins the corrected source, runtime image and full two-stage generation provenance', () => {
    const manifest = JSON.parse(readFileSync('assets.manifest.json', 'utf8'));
    const asset = manifest.assets.find((entry: { id?: string }) => entry.id === 'atomic-acres-generated-sunset-sky-2026-08-01');
    const provenance = JSON.parse(readFileSync(ATOMIC_ACRES_GENERATED_SKY_PROVENANCE_PATH, 'utf8'));

    expect(asset).toMatchObject({
      files: 'public/assets/original/skies/atomic-acres-sunset.webp',
      sourceImage: 'source-assets/skies/atomic-acres-sunset-generated.png',
      sourceProvenance: ATOMIC_ACRES_GENERATED_SKY_PROVENANCE_PATH,
      sourceScript: 'scripts/assets/author-pass66-sky-backdrops.py',
      placeholderStatus: 'production',
    });
    expect(sha256(asset.files)).toBe(asset.sha256);
    expect(sha256(asset.sourceImage)).toBe(asset.sourceImageSha256);
    expect(sha256(asset.sourceProvenance)).toBe(asset.sourceProvenanceSha256);
    expect(sha256(asset.sourceScript)).toBe(asset.sourceScriptSha256);
    expect(provenance.runtimeImageSha256).toBe(asset.sha256);
    expect(provenance.sourceImageSha256).toBe(asset.sourceImageSha256);
    expect(provenance.runtimeDimensions).toEqual([4_096, 2_048]);
    expect(provenance.sourceScriptSha256).toBe(asset.sourceScriptSha256);
    expect(provenance.authoringTool).toMatchObject({ model: 'realesrgan-x4plus', tileSize: 256 });
    expect(provenance.generationStages).toHaveLength(2);
    expect(provenance.generationStages[0]).toMatchObject({ stage: 1, disposition: expect.stringContaining('rejected') });
    expect(provenance.generationStages[1]).toMatchObject({
      stage: 2,
      artifact: 'exec-71dce031-68aa-40fe-b5dd-80a2ed8d5b36.png',
      disposition: expect.stringContaining('admitted'),
    });
    expect(provenance.generationStages.every((stage: { prompt: string }) => stage.prompt.length > 200)).toBe(true);
  });

  it('wires exactly one terminal-teardown call site into legacy-main', () => {
    const main = readFileSync(new URL('../legacy-main.ts', import.meta.url), 'utf8');
    expect(main)
      .toContain("import { applySkyBackdrop, disposeSkyBackdrops, waitForSkyBackdropAdmission } from './rendering/sky-backdrop';");
    // Exactly one live call in the entire entry module.
    expect(main.match(/\bdisposeSkyBackdrops\(\)/g)).toHaveLength(1);
    // ...and it sits between the page-exit flag (which stops the frame loop
    // from sampling) and the renderer's own disposal.
    const teardownStart = main.indexOf('gameplayRuntimeDisposing = true;');
    const rendererDisposal = main.indexOf('renderRuntime.dispose();', teardownStart);
    const callSite = main.indexOf('disposeSkyBackdrops();');
    expect(teardownStart).toBeGreaterThanOrEqual(0);
    expect(callSite).toBeGreaterThan(teardownStart);
    expect(callSite).toBeLessThan(rendererDisposal);
  });

  it('never disposes sky backdrops during per-arena retirement', () => {
    const main = readFileSync(new URL('../legacy-main.ts', import.meta.url), 'utf8');
    // Shared textures stay alive across arena switches by design; only the
    // page-exit teardown owns them.
    const retireBlock = main.slice(
      main.indexOf('function disposeRetiredArena('),
      main.indexOf('function disposeArenaPresentationRoot('),
    );
    expect(retireBlock).not.toContain('disposeSkyBackdrops');
  });

  it('pins object-free RustRig and Terminal panoramas to source, runtime and provenance hashes', () => {
    const manifest = JSON.parse(readFileSync('assets.manifest.json', 'utf8'));
    const expected = [
      {
        id: 'rustworks-generated-industrial-night-sky-2026-08-02',
        runtime: 'public/assets/original/skies/rustworks-industrial-night.webp',
        source: 'source-assets/skies/rustworks-industrial-night-generated.png',
        provenance: RUSTWORKS_GENERATED_SKY_PROVENANCE_PATH,
        preset: 'industrial-night',
      },
      {
        id: 'terminal-generated-airport-dawn-sky-2026-08-02',
        runtime: 'public/assets/original/skies/terminal-airport-dawn.webp',
        source: 'source-assets/skies/terminal-airport-dawn-generated.png',
        provenance: TERMINAL_GENERATED_SKY_PROVENANCE_PATH,
        preset: 'airport-dawn',
      },
    ] as const;

    for (const expectedAsset of expected) {
      const asset = manifest.assets.find((entry: { id?: string }) => entry.id === expectedAsset.id);
      const provenance = JSON.parse(readFileSync(expectedAsset.provenance, 'utf8'));
      expect(asset).toMatchObject({
        files: expectedAsset.runtime,
        sourceImage: expectedAsset.source,
        sourceProvenance: expectedAsset.provenance,
        sourceScript: 'scripts/assets/author-pass66-sky-backdrops.py',
        placeholderStatus: 'production',
      });
      expect(sha256(asset.files)).toBe(asset.sha256);
      expect(sha256(asset.sourceImage)).toBe(asset.sourceImageSha256);
      expect(sha256(asset.sourceProvenance)).toBe(asset.sourceProvenanceSha256);
      expect(sha256(asset.sourceScript)).toBe(asset.sourceScriptSha256);
      expect(provenance.runtimeImageSha256).toBe(asset.sha256);
      expect(provenance.sourceImageSha256).toBe(asset.sourceImageSha256);
      expect(provenance.runtimeDimensions).toEqual([4_096, 2_048]);
      expect(provenance.sourceScriptSha256).toBe(asset.sourceScriptSha256);
      expect(provenance.authoringTool).toMatchObject({ model: 'realesrgan-x4plus', tileSize: 256 });
      expect(provenance.runtimeContract).toMatchObject({
        arenaPreset: expectedAsset.preset,
        failurePolicy: 'retain procedural backdrop without blocking map admission',
      });
      expect(provenance.externalAssets).toEqual([]);
      expect(provenance.generationStages).toHaveLength(1);
      expect(provenance.generationStages[0]).toMatchObject({
        stage: 1,
        disposition: expect.stringContaining('admitted'),
      });
      expect(provenance.generationStages[0].prompt.length).toBeGreaterThan(500);
      expect(provenance.qualityEvidence.manualObjectReview).toContain('no aircraft');
    }
  });
});
