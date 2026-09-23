import { describe, expect, it } from 'vitest';

// The derivation implementation is intentionally a small ESM CLI module. Its
// pure pixel export is imported here so the contract stays independent of the
// filesystem and of Sharp's PNG encoder.
// @ts-ignore JavaScript pipeline module is exercised through its typed runtime surface below.
const { derivePixels } = await import('./derive.mjs') as {
  derivePixels: (source: Uint8Array, size: number, options: { family: string; metresPerTile: number }) => {
    maps: { albedo: Uint8Array; normal: Uint8Array; roughness: Uint8Array; ao: Uint8Array };
    wrapDelta: number;
    detail: { albedoStddev: number };
  };

function sourceTile(size: number): Uint8Array {
  const rgba = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const index = (y * size + x) * 4;
      const value = (x * 19 + y * 11 + ((x ^ y) * 7)) & 0xff;
      rgba[index] = value;
      rgba[index + 1] = (value + 31) & 0xff;
      rgba[index + 2] = (value + 67) & 0xff;
      rgba[index + 3] = 255;
    }
  }
  return rgba;
}

describe('HF-536 image-generated PBR derivation', () => {
  it('makes the color and scalar maps wrap within one code value', () => {
    const result = derivePixels(sourceTile(32), 32, { family: 'asphalt', metresPerTile: 4 });
    expect(result.wrapDelta).toBeLessThanOrEqual(1);
  });

  it('emits unit-length tangent normals with a positive Z hemisphere', () => {
    const result = derivePixels(sourceTile(32), 32, { family: 'lapSiding', metresPerTile: 1.76 });
    let maximumLengthError = 0;
    let minimumZ = 1;
    for (let index = 0; index < result.maps.normal.length; index += 4) {
      const x = result.maps.normal[index] / 127.5 - 1;
      const y = result.maps.normal[index + 1] / 127.5 - 1;
      const z = result.maps.normal[index + 2] / 127.5 - 1;
      maximumLengthError = Math.max(maximumLengthError, Math.abs(Math.hypot(x, y, z) - 1));
      minimumZ = Math.min(minimumZ, z);
    }
    expect(maximumLengthError).toBeLessThan(0.02);
    expect(minimumZ).toBeGreaterThan(0);
  });

  it('clamps roughness to the family band', () => {
    const result = derivePixels(sourceTile(32), 32, { family: 'concrete', metresPerTile: 3 });
    const values = [...result.maps.roughness];
    expect(Math.min(...values)).toBeGreaterThanOrEqual(Math.round(0.78 * 255));
    expect(Math.max(...values)).toBeLessThanOrEqual(255);
  });

  it('is deterministic for the same image and physical tile span', () => {
    const source = sourceTile(32);
    const first = derivePixels(source, 32, { family: 'timber', metresPerTile: 1.8 });
    const second = derivePixels(source, 32, { family: 'timber', metresPerTile: 1.8 });
    expect([...first.maps.albedo]).toEqual([...second.maps.albedo]);
    expect([...first.maps.normal]).toEqual([...second.maps.normal]);
    expect([...first.maps.roughness]).toEqual([...second.maps.roughness]);
    expect(first.detail.albedoStddev).toBe(second.detail.albedoStddev);
  });
});
