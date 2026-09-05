/**
 * HF-486 — SH-L2 digest-guarded persistent cache.
 *
 * WHY THIS EXISTS. The bake is deterministic from its inputs
 * (`arena id + light rig + geometry hash`, see `shL2Digest`), so a second
 * cold boot with unchanged inputs must never pay ~2.4 s again. The runtime
 * keeps an in-memory volume per arena root, which dies with the page; this
 * module adds the cross-boot layer behind an injectable `Storage` so tests
 * pass a memory map and production passes `localStorage` (sync, ~0.5 ms for
 * a 192 KiB volume — free beside the 10 s cold-admission budget).
 *
 * WHAT IS STORED. One key per digest,
 * `atomic-acres.sh-l2.v1.<digest>`, holding JSON metadata plus the
 * coefficients as base64. A read validates version, digest, dimensions and
 * coefficient length before returning anything; anything else is a miss
 * (null), never a throw, so a corrupt or evicted entry degrades to a
 * menu-idle rebake rather than a broken frame.
 */

import {
  SH_L2_FLOATS_PER_PROBE,
  type ShL2Volume,
} from './sh-l2-irradiance';

/** The storage surface this cache needs; `Storage` satisfies it as-is. */
export type ShL2Storage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const SH_L2_CACHE_KEY_PREFIX = 'atomic-acres.sh-l2.v1.';
const SH_L2_CACHE_VERSION = 1;

export function shL2CacheKey(digest: string): string {
  return `${SH_L2_CACHE_KEY_PREFIX}${digest}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK));
  }
  // `btoa` exists in every browser and Node 16+ this ships to.
  return btoa(binary);
}

function base64ToBytes(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/**
 * Serialises a finished volume into storage. Returns false (never throws)
 * when storage is unavailable, full, or private-mode — the bake still
 * completes in memory and the next boot simply rebakes.
 */
export function storeShL2Volume(storage: ShL2Storage | null, volume: ShL2Volume): boolean {
  if (!storage) return false;
  try {
    const bytes = new Uint8Array(volume.coefficients.buffer, volume.coefficients.byteOffset, volume.coefficients.byteLength);
    const document = JSON.stringify({
      version: SH_L2_CACHE_VERSION,
      digest: volume.digest,
      arenaId: volume.arenaId,
      conditionId: volume.conditionId,
      originM: [...volume.originM],
      spacingM: [...volume.spacingM],
      dimensions: [...volume.dimensions],
      band: volume.band,
      bake: { ...volume.bake },
      coefficients: bytesToBase64(bytes),
    });
    storage.setItem(shL2CacheKey(volume.digest), document);
    return true;
  } catch {
    return false;
  }
}

export type CachedShL2Volume = ShL2Volume;

/**
 * Reads the entry for `digest`. Any mismatch — missing key, bad JSON, wrong
 * version, digest/dimension/coefficient-length disagreement — is a miss and
 * returns null (removing the offending key when it is safe to do so).
 */
export function readCachedShL2Volume(storage: ShL2Storage | null, digest: string): CachedShL2Volume | null {
  if (!storage) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(shL2CacheKey(digest));
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as {
      version?: unknown;
      digest?: unknown;
      arenaId?: unknown;
      conditionId?: unknown;
      originM?: unknown;
      spacingM?: unknown;
      dimensions?: unknown;
      band?: unknown;
      bake?: unknown;
      coefficients?: unknown;
    };
    if (parsed.version !== SH_L2_CACHE_VERSION) return null;
    if (parsed.digest !== digest) return null;
    if (!Array.isArray(parsed.dimensions) || parsed.dimensions.length !== 3) return null;
    const dimensions = parsed.dimensions as [number, number, number];
    const expectedFloats = dimensions[0] * dimensions[1] * dimensions[2] * SH_L2_FLOATS_PER_PROBE;
    if (typeof parsed.coefficients !== 'string') return null;
    const bytes = base64ToBytes(parsed.coefficients);
    if (bytes.byteLength !== expectedFloats * 4) return null;
    const coefficients = new Float32Array(bytes.buffer, bytes.byteOffset, expectedFloats);
    return Object.freeze({
      arenaId: parsed.arenaId as string,
      conditionId: parsed.conditionId as string,
      digest,
      originM: parsed.originM as ShL2Volume['originM'],
      spacingM: parsed.spacingM as ShL2Volume['spacingM'],
      dimensions,
      band: parsed.band as ShL2Volume['band'],
      coefficients: new Float32Array(coefficients),
      bake: Object.freeze({ ...(parsed.bake as ShL2Volume['bake']) }),
    });
  } catch {
    try {
      storage.removeItem?.(shL2CacheKey(digest));
    } catch {
      /* A cache miss must never break the frame. */
    }
    return null;
  }
}

/** Production default: `localStorage` when present, otherwise null (memory-only). */
export function defaultShL2Storage(): ShL2Storage | null {
  try {
    const candidate = (globalThis as { localStorage?: ShL2Storage }).localStorage;
    if (!candidate) return null;
    // Probe once: Safari private mode exposes the object and throws on write.
    const probe = '__sh-l2-probe';
    candidate.setItem(probe, '1');
    candidate.removeItem?.(probe);
    return candidate;
  } catch {
    return null;
  }
}
