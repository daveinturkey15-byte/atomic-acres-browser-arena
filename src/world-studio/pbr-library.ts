import * as THREE from 'three';

/**
 * world-studio/pbr-library — reusable CC0 PBR material factory (2026-09-12).
 *
 * Additive, presentation-only. This module owns NO scene, renderer, lights or
 * tone mapping: it builds `MeshStandardMaterial`s from locally hosted original
 * Poly Haven textures (see `public/assets/original/world-studio/pbr/manifest.json`,
 * CC0-1.0, provenance + SHA256 per file). Colour contract: albedo is sRGB
 * (`SRGBColorSpace`); normal/roughness stay linear (`NoColorSpace`), per the
 * repo convention and the Poly Haven map semantics.
 *
 * Sharing rule: the library keeps ONE original `THREE.Texture` per map and
 * hands every consumer a CLONE with its own `repeat`/`offset`, so a consumer
 * mutating repeat never leaks into another consumer or the original.
 * `release(consumer)` disposes exactly that consumer's clones; `dispose()`
 * disposes the originals and any live consumers.
 *
 * UV contract: tiling is PHYSICAL. `repeat = sizeMeters / tileMeters` —
 * callers pass the real-world surface size; the library never rescales
 * geometry UVs. Root integration example (parent performs it):
 *
 * ```ts
 * const pbr = createStudioPbrLibrary();          // defaults to the hosted dir
 * void pbr.load();                                // kick off; errors land in whenReady()
 * // …after `await pbr.whenReady()` (or poll isReady()):
 * const road = pbr.createConsumer('asphalt_02', { sizeMeters: [12, 60] });
 * roadMesh.material = road.material;              // 3 m tile → repeat 4×20
 * const wall = pbr.createConsumer('brushed_concrete_03', { sizeMeters: [8, 2.55], normalScale: 0.6 });
 * wallMesh.material = wall.material;              // 2 m tile → repeat 4×1.275
 * // on arena retirement: road consumers first, then pbr.dispose()
 * ```
 */

export interface StudioPbrAssetSpec {
  readonly assetId: string;
  readonly name: string;
  readonly tileMeters: number;
  readonly albedoFile: string;
  readonly normalFile: string;
  readonly roughnessFile: string;
}

const ASSET_DIR = 'assets/original/world-studio/pbr';

/** Selected from the owner-approved candidate packet (brushed_concrete_03 2 m, asphalt_02 3 m). */
export const STUDIO_PBR_ASSETS: Readonly<Record<string, StudioPbrAssetSpec>> = Object.freeze({
  brushed_concrete_03: {
    assetId: 'brushed_concrete_03',
    name: 'Brushed Concrete 03',
    tileMeters: 2,
    albedoFile: 'brushed_concrete_03/brushed_concrete_03_diff_1k.jpg',
    normalFile: 'brushed_concrete_03/brushed_concrete_03_nor_gl_1k.png',
    roughnessFile: 'brushed_concrete_03/brushed_concrete_03_rough_1k.jpg',
  },
  asphalt_02: {
    assetId: 'asphalt_02',
    name: 'Asphalt 02',
    tileMeters: 3,
    albedoFile: 'asphalt_02/asphalt_02_diff_1k.jpg',
    normalFile: 'asphalt_02/asphalt_02_nor_gl_1k.png',
    roughnessFile: 'asphalt_02/asphalt_02_rough_1k.jpg',
  },
});

/** Restrained default normal magnitude; callers may lower it further. */
export const DEFAULT_NORMAL_SCALE = 0.7;

export interface StudioPbrConsumerOptions {
  /** Real-world surface size in metres; repeat = size / tileMeters. */
  readonly sizeMeters: readonly [number, number];
  /** Uniform normal-map magnitude, default `DEFAULT_NORMAL_SCALE` (restrained). */
  readonly normalScale?: number;
  /** Roughness scalar multiplier over the roughness map, default 1. */
  readonly roughness?: number;
}

export interface StudioPbrConsumer {
  readonly assetId: string;
  readonly material: THREE.MeshStandardMaterial;
  /** Consumer-owned texture clones; disposed by `release`, never mutate the originals. */
  readonly textures: readonly THREE.Texture[];
}

export interface StudioPbrLibrary {
  /** Starts async loading exactly once; safe to call repeatedly. */
  load(): void;
  /** Resolves when every map of every asset decoded; rejects with the failing asset+map. */
  whenReady(): Promise<void>;
  isReady(): boolean;
  /** Consumer-scoped material with cloned, repeat-set textures. Throws before ready. */
  createConsumer(assetId: string, options: StudioPbrConsumerOptions): StudioPbrConsumer;
  /** Disposes exactly this consumer's clones + material; originals survive. */
  release(consumer: StudioPbrConsumer): void;
  /** Disposes originals and every live consumer. Idempotent. */
  dispose(): void;
}

/** Minimal loader seam so CPU tests never touch Image/decoder stacks. */
export interface PbrTextureLoader {
  load(url: string, onLoad: (texture: THREE.Texture) => void, onProgress: undefined, onError: (error: unknown) => void): THREE.Texture | void;
}

interface LoadedSet {
  readonly albedo: THREE.Texture;
  readonly normal: THREE.Texture;
  readonly roughness: THREE.Texture;
}

export function createStudioPbrLibrary(baseUrl: string = ASSET_DIR, loader: PbrTextureLoader = new THREE.TextureLoader()): StudioPbrLibrary {
  const originals = new Map<string, LoadedSet>();
  const consumers = new Set<StudioPbrConsumer>();
  let loadPromise: Promise<void> | null = null;
  let disposed = false;
  let failed = false;
  const ownedTextures = new Set<THREE.Texture>();
  const releasedTextures = new WeakSet<THREE.Texture>();
  const pendingRejects = new Set<(error: Error) => void>();
  const releaseTexture = (texture: THREE.Texture): void => {
    if (releasedTextures.has(texture)) return;
    releasedTextures.add(texture);
    ownedTextures.delete(texture);
    texture.dispose();
  };
  const loadOne = (url: string): Promise<THREE.Texture> => new Promise((resolve, reject) => {
    const cancel = (error: Error): void => { pendingRejects.delete(cancel); reject(error); };
    pendingRejects.add(cancel);
    const texture = loader.load(url, (loaded) => {
      pendingRejects.delete(cancel);
      if (disposed || failed) {
        releaseTexture(loaded);
        reject(new Error('pbr-library: disposed or failed during load'));
        return;
      }
      ownedTextures.add(loaded);
      resolve(loaded);
    }, undefined, (error) => cancel(new Error(`pbr-library: failed to load ${url}: ${String(error)}`)));
    if (texture) {
      if (disposed || failed) releaseTexture(texture);
      else ownedTextures.add(texture);
    }
  });
  const load = (): Promise<void> => {
    if (disposed) return Promise.reject(new Error('pbr-library: disposed'));
    if (loadPromise) return loadPromise;
    const entries = Object.values(STUDIO_PBR_ASSETS).map((asset) => {
      const prefix = `${baseUrl.replace(/\/$/, '')}/`;
      return Promise.all([
        loadOne(prefix + asset.albedoFile),
        loadOne(prefix + asset.normalFile),
        loadOne(prefix + asset.roughnessFile),
      ]).then(([albedo, normal, roughness]) => {
        if (disposed || failed) throw new Error('pbr-library: disposed or failed during load');
        albedo.colorSpace = THREE.SRGBColorSpace;
        normal.colorSpace = THREE.NoColorSpace;
        roughness.colorSpace = THREE.NoColorSpace;
        for (const texture of [albedo, normal, roughness]) {
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
        }
        originals.set(asset.assetId, { albedo, normal, roughness });
      });
    });
    loadPromise = Promise.all(entries).then(() => undefined).catch((error: unknown) => {
      failed = true;
      originals.clear();
      for (const texture of [...ownedTextures]) releaseTexture(texture);
      for (const rejectPending of [...pendingRejects]) rejectPending(new Error('pbr-library: another map failed'));
      throw error;
    });
    return loadPromise;
  };

  return {
    load() {
      void load().catch(() => undefined); // whenReady retains the rejection for callers.
    },
    whenReady(): Promise<void> {
      return load();
    },
    isReady(): boolean {
      return !disposed && !failed && originals.size === Object.keys(STUDIO_PBR_ASSETS).length;
    },
    createConsumer(assetId: string, options: StudioPbrConsumerOptions): StudioPbrConsumer {
      const asset = STUDIO_PBR_ASSETS[assetId];
      if (!asset) throw new Error(`pbr-library: unknown asset '${assetId}'`);
      const set = originals.get(assetId);
      if (!set) throw new Error(`pbr-library: asset '${assetId}' not loaded yet (call load() and await whenReady())`);
      const [width, height] = options.sizeMeters;
      if (!(Number.isFinite(width) && width > 0) || !(Number.isFinite(height) && height > 0)) {
        throw new Error('pbr-library: sizeMeters must be finite positive metres');
      }
      const repeatX = width / asset.tileMeters;
      const repeatY = height / asset.tileMeters;
      if (!Number.isFinite(repeatX) || !Number.isFinite(repeatY)) {
        throw new Error('pbr-library: computed repeat is not finite');
      }
      const normalScale = options.normalScale ?? DEFAULT_NORMAL_SCALE;
      if (!Number.isFinite(normalScale) || normalScale < 0 || normalScale > 1.5) {
        throw new Error('pbr-library: normalScale must be finite within [0, 1.5] (restrained)');
      }
      const roughness = options.roughness ?? 1;
      if (!Number.isFinite(roughness) || roughness <= 0 || roughness > 1) {
        throw new Error('pbr-library: roughness must be finite within (0, 1]');
      }
      const clones = [set.albedo, set.normal, set.roughness].map((texture) => {
        const clone = texture.clone();
        clone.wrapS = THREE.RepeatWrapping;
        clone.wrapT = THREE.RepeatWrapping;
        clone.repeat.set(repeatX, repeatY);
        return clone;
      });
      const material = new THREE.MeshStandardMaterial({
        map: clones[0]!,
        normalMap: clones[1]!,
        roughnessMap: clones[2]!,
        normalScale: new THREE.Vector2(normalScale, normalScale),
        roughness,
        metalness: 0,
      });
      const consumer: StudioPbrConsumer = { assetId, material, textures: clones };
      consumers.add(consumer);
      return consumer;
    },
    release(consumer: StudioPbrConsumer): void {
      if (!consumers.delete(consumer)) return;
      for (const texture of consumer.textures) texture.dispose();
      consumer.material.dispose();
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      for (const rejectPending of [...pendingRejects]) rejectPending(new Error('pbr-library: disposed during load'));
      for (const consumer of [...consumers]) {
        for (const texture of consumer.textures) texture.dispose();
        consumer.material.dispose();
      }
      consumers.clear();
      for (const texture of [...ownedTextures]) releaseTexture(texture);
      originals.clear();
    },
  };
}
