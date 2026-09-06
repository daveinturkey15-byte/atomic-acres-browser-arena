/**
 * DAY-VISUAL-A (HF-535) lane contract: mountains, ground and haze cues.
 *
 * Every constant this lane adds is a value a future refactor could silently
 * drop (flatten the two-tone, reorder the haze, re-grey the palette, pave
 * the stripes). This file pins them in one place. Presentation only: no
 * collider, spawn, authority or solid/shots assertions.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  mountainTwoTone,
  NUKETOWN_MOUNTAIN_HAZE_FAR,
  NUKETOWN_MOUNTAIN_HAZE_MID,
  NUKETOWN_MOUNTAIN_HAZE_NEAR,
  NUKETOWN_MOUNTAIN_HAZE_WARM_BAND,
  NUKETOWN_MOUNTAIN_TWO_TONE_FLOOR,
} from './nuketown-mountain-backdrop';
import {
  LAWN_SCRUB_STRAW,
  LAWN_STRIPE_CONTRAST,
  LAWN_WILDFLOWER_THRESHOLD,
} from './nuketown2-materials/families/lawn';
import {
  ASPHALT_SUN_GLINT_WARM_MIX,
  ASPHALT_WET_SHEEN_ROUGHNESS_DROP,
} from './nuketown2-materials/families/asphalt';
import { KERB_TIDY_DAMP_SCALE } from './nuketown2-materials/families/concrete';
import { AtmosphereSystem, NUKETOWN2_HAZE_PALETTE } from './atmosphere-system';

/** Relative luminance of an sRGB triple (ratio use only). */
function luminance(rgb: readonly [number, number, number]): number {
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

describe('DAY-VISUAL-A mountain two-tone and haze recession (HF-535)', () => {
  it('orders haze near < mid < far so the massif recedes', () => {
    expect(NUKETOWN_MOUNTAIN_HAZE_NEAR).toBeGreaterThan(0);
    expect(NUKETOWN_MOUNTAIN_HAZE_MID).toBeGreaterThan(NUKETOWN_MOUNTAIN_HAZE_NEAR);
    expect(NUKETOWN_MOUNTAIN_HAZE_FAR).toBeGreaterThan(NUKETOWN_MOUNTAIN_HAZE_MID);
    expect(NUKETOWN_MOUNTAIN_HAZE_FAR).toBeLessThanOrEqual(1);
    expect(NUKETOWN_MOUNTAIN_HAZE_WARM_BAND).toBeGreaterThan(0);
    expect(NUKETOWN_MOUNTAIN_HAZE_WARM_BAND).toBeLessThanOrEqual(1);
  });

  it('keeps a contrast floor between fully-lit and fully-shaded rock', () => {
    const base: [number, number, number] = [0.5, 0.5, 0.5];
    const lit = mountainTwoTone(base[0], base[1], base[2], 1, [0, 0, 0]);
    const shaded = mountainTwoTone(base[0], base[1], base[2], 0, [0, 0, 0]);
    expect(luminance(lit) / luminance(shaded)).toBeGreaterThanOrEqual(
      NUKETOWN_MOUNTAIN_TWO_TONE_FLOOR,
    );
  });

  it('lights warm and shades cool (blue-violet shadow faces)', () => {
    const base: [number, number, number] = [0.5, 0.5, 0.5];
    const lit = mountainTwoTone(base[0], base[1], base[2], 1, [0, 0, 0]);
    const shaded = mountainTwoTone(base[0], base[1], base[2], 0, [0, 0, 0]);
    // Warm = red survives over blue; cool = blue survives over red.
    expect(lit[0] / lit[2]).toBeGreaterThan(shaded[0] / shaded[2]);
    expect(shaded[2] / shaded[0]).toBeGreaterThan(1);
  });

  it('clamps the lambert input instead of extrapolating', () => {
    const over = mountainTwoTone(0.5, 0.5, 0.5, 4, [0, 0, 0]);
    const edge = mountainTwoTone(0.5, 0.5, 0.5, 1, [0, 0, 0]);
    expect(over).toEqual(edge);
  });
});

describe('DAY-VISUAL-A ground cues (HF-535)', () => {
  it('keeps the mow-stripe checker readable', () => {
    // Full cell-to-cell swing; below ~0.08 the checker vanishes at the
    // overhead station and the lawn flattens to a green plane.
    expect(LAWN_STRIPE_CONTRAST).toBeGreaterThanOrEqual(0.08);
    expect(LAWN_STRIPE_CONTRAST).toBeLessThanOrEqual(0.3);
  });

  it('keeps the verge dry and sparingly flowered (scrub only)', () => {
    expect(LAWN_SCRUB_STRAW).toBeGreaterThan(0.5);
    expect(LAWN_WILDFLOWER_THRESHOLD).toBeGreaterThan(0.9);
    expect(LAWN_WILDFLOWER_THRESHOLD).toBeLessThan(1);
  });

  it('keeps the wet sheen and warm sun glint on the carriageway', () => {
    expect(ASPHALT_WET_SHEEN_ROUGHNESS_DROP).toBeGreaterThan(0);
    expect(ASPHALT_WET_SHEEN_ROUGHNESS_DROP).toBeLessThanOrEqual(0.3);
    expect(ASPHALT_SUN_GLINT_WARM_MIX).toBeGreaterThan(0);
    expect(ASPHALT_SUN_GLINT_WARM_MIX).toBeLessThan(1);
  });

  it('keeps the kerb damp band reduced but present', () => {
    expect(KERB_TIDY_DAMP_SCALE).toBeGreaterThan(0);
    expect(KERB_TIDY_DAMP_SCALE).toBeLessThan(1);
  });
});

describe('DAY-VISUAL-A nuketown2 haze palette (HF-535)', () => {
  it('is warm on the light side and violet-cool on the shade side', () => {
    const light = new THREE.Color(NUKETOWN2_HAZE_PALETTE.light);
    const shadow = new THREE.Color(NUKETOWN2_HAZE_PALETTE.shadow);
    // Linear-space ratios preserve the ordering: warm light carries
    // relatively more red, violet shade relatively more blue.
    expect(light.r / light.b).toBeGreaterThan(shadow.r / shadow.b);
    expect(light.r).toBeGreaterThan(light.b);
    expect(shadow.b).toBeGreaterThan(shadow.r);
  });

  it('reaches the nuketown2 mist cards (not the neutral fallthrough)', () => {
    const system = new AtmosphereSystem(new THREE.Scene(), 'performance', 'lane-probe', null, 'nuketown2');
    expect(mistColor(system, 'uLightColor').getHex()).toBe(NUKETOWN2_HAZE_PALETTE.light);
    expect(mistColor(system, 'uShadowColor').getHex()).toBe(NUKETOWN2_HAZE_PALETTE.shadow);
  });
});

/** Read one mist uniform colour off the system, narrowing (never casting). */
function mistColor(system: AtmosphereSystem, uniform: string): THREE.Color {
  const inner: unknown = system;
  if (inner === null || typeof inner !== 'object' || !('material' in inner)) {
    throw new Error('expected the atmosphere system to carry a mist material');
  }
  const material: unknown = inner.material;
  if (material === null || typeof material !== 'object' || !('uniforms' in material)) {
    throw new Error('nuketown2 must build the mist material');
  }
  const uniforms: unknown = material.uniforms;
  if (uniforms === null || typeof uniforms !== 'object') {
    throw new Error('mist material has no uniforms');
  }
  if (!(uniform in uniforms)) throw new Error(`mist material is missing ${uniform}`);
  for (const [key, entry] of Object.entries(uniforms)) {
    if (key !== uniform) continue;
    if (entry === null || typeof entry !== 'object' || !('value' in entry)) {
      throw new Error(`mist uniform ${uniform} has no value`);
    }
    const color: unknown = entry.value;
    if (!(color instanceof THREE.Color)) throw new Error(`mist uniform ${uniform} is not a colour`);
    return color;
  }
  throw new Error(`mist uniform ${uniform} has no value`);
}
