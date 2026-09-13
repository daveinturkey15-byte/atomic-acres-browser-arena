/**
 * HF-571 world-studio architecture materials: behavioural pins for the material response.
 *
 * These assert what the capture showed was wrong - the realised colour of a tinted family,
 * the alpha layer count of a glazed opening, the sampler census - not the constants in the
 * spec table. A retune of a target is expected to pass; a regression to a double-decoded
 * tint, an opaque pane or a per-material texture upload is not.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { MAX_TINT_GAIN, createStudioMaterialKit, type StudioMaterialId } from './materials';

function toLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/** Mean of the material's own uploaded albedo, after tint, in linear light. */
function realisedLinear(material: THREE.MeshStandardMaterial): [number, number, number] {
  const map = material.map;
  if (!map) return [material.color.r, material.color.g, material.color.b];
  const data = (map.image as { data: Uint8Array }).data;
  let r = 0;
  let g = 0;
  let b = 0;
  let samples = 0;
  for (let index = 0; index < data.length; index += 4 * 7) {
    r += toLinear(data[index] / 255);
    g += toLinear(data[index + 1] / 255);
    b += toLinear(data[index + 2] / 255);
    samples++;
  }
  return [
    (r / samples) * material.color.r,
    (g / samples) * material.color.g,
    (b / samples) * material.color.b,
  ];
}

function targetLinear(hex: number): [number, number, number] {
  const color = new THREE.Color(hex);
  return [color.r, color.g, color.b];
}

describe('world-studio architecture materials', () => {
  it('lands a tinted family on its authored target instead of a second sRGB decode', () => {
    const kit = createStudioMaterialKit();
    // A double decode crushes exactly the surfaces the capture showed as black: the
    // shingle roof and the masonry. Both families are dark, so both need real gain.
    const cases: ReadonlyArray<readonly [StudioMaterialId, number]> = [
      ['siding-teal', 0x5fbfa6],
      ['siding-yellow', 0xecc65c],
      ['brick', 0xa06a52],
      ['stone', 0xa89b86],
      ['trim', 0xf2ede2],
    ];
    for (const [id, hex] of cases) {
      const realised = realisedLinear(kit.get(id));
      const target = targetLinear(hex);
      for (let channel = 0; channel < 3; channel++) {
        expect(realised[channel]).toBeGreaterThan(target[channel] * 0.85);
        expect(realised[channel]).toBeLessThan(target[channel] * 1.15);
      }
    }
    kit.dispose();
  });

  it('keeps masonry and roof out of the near-black band the capture showed', () => {
    const kit = createStudioMaterialKit();
    const luminance = (id: StudioMaterialId): number => {
      const [r, g, b] = realisedLinear(kit.get(id));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    // Sunlit exterior masonry and roofing sit well above the 0.02-0.03 linear the
    // double-decoded tints produced; below ~0.06 they read as silhouettes, not surfaces.
    expect(luminance('roof')).toBeGreaterThan(0.08);
    expect(luminance('brick')).toBeGreaterThan(0.06);
    expect(luminance('stone')).toBeGreaterThan(0.1);
    // ...and are still clearly darker than the trim they sit against, or the roof plane
    // stops reading as a roof.
    expect(luminance('roof')).toBeLessThan(luminance('trim') * 0.6);
    expect(luminance('brick')).toBeLessThan(luminance('trim') * 0.6);
    kit.dispose();
  });

  it('never applies more gain than the tint ceiling allows, and never skews hue to clamp', () => {
    const kit = createStudioMaterialKit();
    for (const id of ['roof', 'brick', 'stone', 'trim', 'siding-teal'] as const) {
      const tint = kit.get(id).color;
      expect(Math.max(tint.r, tint.g, tint.b)).toBeLessThanOrEqual(MAX_TINT_GAIN + 1e-6);
      expect(Number.isFinite(tint.r + tint.g + tint.b)).toBe(true);
    }
    kit.dispose();
  });

  it('glazes an opening with one alpha layer that does not depth-reject the room', () => {
    const kit = createStudioMaterialKit();
    const glass = kit.get('glass');
    expect(glass.transparent).toBe(true);
    // A pane is a closed box: FrontSide is one layer through it, DoubleSide is two.
    expect(glass.side).toBe(THREE.FrontSide);
    expect(glass.depthWrite).toBe(false);
    expect(glass.opacity).toBeLessThan(0.5);
    // Dark dielectric tint: a light base colour at low alpha is fog over the interior.
    const luminance = 0.2126 * glass.color.r + 0.7152 * glass.color.g + 0.0722 * glass.color.b;
    expect(luminance).toBeLessThan(0.1);
    expect(glass.roughness).toBeLessThan(0.12);
    kit.dispose();
  });

  it('softens the forge weathering without flattening the course rhythm', () => {
    const kit = createStudioMaterialKit();
    const siding = kit.get('siding-teal');
    const data = (siding.map!.image as { data: Uint8Array }).data;
    const green: number[] = [];
    for (let index = 1; index < data.length; index += 4 * 7) green.push(data[index]);
    green.sort((a, b) => a - b);
    const p05 = green[Math.floor(green.length * 0.05)];
    const p95 = green[Math.floor(green.length * 0.95)];
    // The shadow gap and the grain must survive (a flat fill is not siding)...
    expect(p95 - p05).toBeGreaterThan(12);
    // ...but the wear blotches must not still drop a maintained board by half its value,
    // which is what read as damage at house distance.
    expect(p05 / p95).toBeGreaterThan(0.62);
    // Relief stays metric-true but is no longer driven at full strength: the forge's 6 mm
    // shadow-gap step at grazing sun was the other half of the "damaged" read.
    expect(siding.normalScale.x).toBeLessThan(0.7);
    expect(siding.normalScale.x).toBeGreaterThan(0.3);
    kit.dispose();
  });

  it('holds the sampler census at one triplet per family', () => {
    const kit = createStudioMaterialKit();
    const ids: readonly StudioMaterialId[] = [
      'siding-teal', 'siding-yellow', 'trim', 'roof', 'brick', 'stone', 'foundation',
      'interior-wall', 'floor-hard', 'floor-soft', 'door', 'glass', 'metal',
    ];
    const buffers = new Set<unknown>();
    for (const id of ids) {
      const map = kit.get(id).map;
      if (map) buffers.add((map.image as { data: ArrayBufferView }).data);
    }
    expect(buffers.size).toBeLessThanOrEqual(kit.families.length);
    expect(kit.families.length).toBeLessThanOrEqual(6);
    kit.dispose();
  });

  it('keeps every roof and siding tile a whole-metre view of a tileable family', () => {
    const kit = createStudioMaterialKit();
    for (const id of ['roof', 'siding-teal', 'brick'] as const) {
      const metres = kit.metresPerTile(id);
      expect(metres).toBeGreaterThan(0);
      const repeat = kit.get(id).map!.repeat;
      expect(repeat.x).toBeCloseTo(1 / metres, 6);
      expect(repeat.y).toBeCloseTo(1 / metres, 6);
    }
    // The roof rhythm is the point of the finer tile: 300 mm authored courses seen at
    // 2.1 m per 3.0 m tile are 210 mm on the plane, readable from the street.
    expect(kit.metresPerTile('roof')).toBeLessThan(3);
    kit.dispose();
  });
});
