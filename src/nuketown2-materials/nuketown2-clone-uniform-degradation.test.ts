/**
 * HF-535 day shift — the CLONED-MATERIAL colour-value gate.
 *
 * MECHANISM (measured 2026-09-06 by reading back the live WebGPU uniform
 * buffers of the type-pinned build, lane day-uniform-readback):
 *
 * The only nuketown2 program whose object uniform buffer held NaN was the
 * timber/trim program — slots 0..2, i.e. `nodeUniform0 : vec3<f32>`, which the
 * generated WGSL uses as `object.nodeUniform0 * nodeVar0 * (1 + boardTone)`,
 * the shared `baseColor`. Every other family's buffer was finite and carried
 * its own authored colour. So after the type pin the remaining NaN is not a
 * declared-type fault at all — it is a VALUE fault.
 *
 * Four Nuke Town materials are built by cloning a family material so they can
 * own a polygon-offset decal tier:
 *   nuketown2-arena.ts   balcony rail cap   m.trim.clone()
 *   nuketown2-arena.ts   yard butt pad      m.drive.clone()
 *   nuketown2-arena.ts   perimeter wall end m.fence.clone()
 *   nuketown2-roofs.ts   exterior stair riser materials.timber.clone()
 *
 * three r185 `Material.copy()` (materials/Material.js:1172) rebuilds userData as
 * `JSON.parse( JSON.stringify( source.userData ) )`, and `Color.toJSON()`
 * returns `getHex()`. So a clone's `userData.nuketown2Uniforms.baseColor` is a
 * raw hex NUMBER, and the shared node's onObjectUpdate used to assign it
 * straight through. `UniformsGroup.updateColor()` then reads `v.r` off a
 * Number — undefined — and writes NaN into the Float32Array; because the
 * `a[offset] !== v.r` guard compares NaN with undefined it never settles, so
 * the slot stays NaN for every subsequent frame and every subsequent material
 * that shares the node. NaN albedo is clamped to exact [0,0,0] by the driver.
 *
 * Measured hex numbers actually observed in the running arena:
 *   nuketown2-balcony-rail-cap     15787209 (0xf0e4c9)
 *   nuketown2-perimeter-wall-end    6765348 (0x673b24)
 *   nuketown2-exterior-stair-riser  6765348 (0x673b24)
 *   nuketown2-yard-butt-pad         9144441 (0x8b8879)
 *
 * FALSIFIER PROPERTY: these cases fail on CONTENT at 4a60f52f (the type-pin
 * HEAD) using only exports that already existed there.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';

import { createNuketown2Uniforms } from './material-uniforms';
import { assertSpec } from './spec';

function timberishSpec(name: string) {
  return assertSpec({
    name,
    family: 'timber',
    baseSrgb: 0x673b24,
    roughness: 0.66,
    metalness: 0.0,
    grain: { sizeM: 0.0012, albedo: 0.028, roughness: 0.07 },
    scuff: { sizeM: 0.055, albedo: 0.055, roughness: 0.1 },
    traffic: { sizeM: 1.8, albedo: 0.06, roughness: 0.08 },
    soil: 0.075,
  });
}

/** Drive one shared node's OBJECT update exactly the way NodeFrame does. */
function driveObjectUpdate(node: unknown, material: THREE.Material): void {
  (node as { update: (frame: { material: THREE.Material }) => void }).update({ material });
}

describe('nuketown2 cloned-material uniform degradation', () => {
  it('reproduces the three r185 clone degradation that caused it', () => {
    const material = new THREE.MeshStandardMaterial();
    createNuketown2Uniforms(timberishSpec('nuketown2-trim'), 0xf0e4c9, 0x6b5741, material);
    const clone = material.clone();
    const degraded = (clone.userData as Record<string, any>).nuketown2Uniforms;
    // This is upstream behaviour, not ours: it must stay true or the gate below
    // is testing nothing. Material.copy() JSON round-trips userData.
    expect(typeof degraded.baseColor).toBe('number');
    expect(degraded.baseColor).toBe(0xf0e4c9);
  });

  it('never puts a non-Color value into a colour-typed shared node', () => {
    const material = new THREE.MeshStandardMaterial();
    const uniforms = createNuketown2Uniforms(
      timberishSpec('nuketown2-trim'), 0xf0e4c9, 0x6b5741, material,
    ) as Record<string, any>;
    const clone = material.clone();

    for (const name of ['baseColor', 'soilColor', 'sidingWainscotColor']) {
      driveObjectUpdate(uniforms[name], clone);
      const value = uniforms[name].value;
      expect(value, `${name} must stay a THREE.Color after a cloned material updates it`)
        .toBeInstanceOf(THREE.Color);
      // The exact NaN path: ColorNodeUniform reads .r/.g/.b.
      expect(Number.isFinite(value.r) && Number.isFinite(value.g) && Number.isFinite(value.b))
        .toBe(true);
    }
  });

  it('restores the authored colour of a cloned material, not a default', () => {
    const material = new THREE.MeshStandardMaterial();
    const uniforms = createNuketown2Uniforms(
      timberishSpec('nuketown2-trim'), 0xf0e4c9, 0x6b5741, material,
    ) as Record<string, any>;
    const expected = new THREE.Color().setHex(0xf0e4c9, THREE.SRGBColorSpace);
    const clone = material.clone();

    driveObjectUpdate(uniforms.baseColor, clone);
    const value = uniforms.baseColor.value as THREE.Color;
    expect(value.r).toBeCloseTo(expected.r, 5);
    expect(value.g).toBeCloseTo(expected.g, 5);
    expect(value.b).toBeCloseTo(expected.b, 5);
  });

  it('repairs the clone in place so the cost is paid once, not per draw', () => {
    const material = new THREE.MeshStandardMaterial();
    const uniforms = createNuketown2Uniforms(
      timberishSpec('nuketown2-trim'), 0xf0e4c9, 0x6b5741, material,
    ) as Record<string, any>;
    const clone = material.clone();

    driveObjectUpdate(uniforms.baseColor, clone);
    expect((clone.userData as Record<string, any>).nuketown2Uniforms.baseColor)
      .toBeInstanceOf(THREE.Color);
  });

  it('keeps float slots numeric and ignores a degraded non-number', () => {
    const material = new THREE.MeshStandardMaterial();
    const uniforms = createNuketown2Uniforms(
      timberishSpec('nuketown2-trim'), 0xf0e4c9, 0x6b5741, material,
    ) as Record<string, any>;
    const values = (material.userData as Record<string, any>).nuketown2Uniforms;

    values.baseRoughness = 0.42;
    driveObjectUpdate(uniforms.baseRoughness, material);
    expect(uniforms.baseRoughness.value).toBe(0.42);

    values.baseRoughness = { x: 1 } as unknown as number;
    driveObjectUpdate(uniforms.baseRoughness, material);
    expect(uniforms.baseRoughness.value, 'a non-number must not reach a float slot').toBe(0.42);
  });
});
