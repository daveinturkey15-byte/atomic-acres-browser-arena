/**
 * HF-536 — NUKETOWN2 ROAD TONE TO THE BOARDS (lane GEMINI-12).
 *
 * Pinned verification of the authored asphalt, kerb and marking albedos moved to
 * the per-station target boards by measurement (scripts/forge/boxes.json over
 * root-captures/refs-boards/nuketown2 and docs/forge/tonal-gap-after.json).
 *
 * MEASUREMENT FINDINGS:
 * - The boards' asphalt across all stations is a warm dark charcoal (hue 20-30 deg,
 *   sat 25-35%, p50 luma ~50-55; e.g. street-centre/roadCentre board p50=50, RGB
 *   [68.6, 54.7, 44.2], hue 25.8 deg, sat 35.6%).
 * - Our previous road was a flat cool blue-grey (baseSrgb 0x3b3d3e, hue 200 deg,
 *   linear [0.0436, 0.0469, 0.0487]) that rendered at excessive luma in the sun
 *   (p50 ~93-140) while dropping into cool cyan/blue shade (hue 247-291 deg).
 * - Markings on the boards are a warm off-white (RGB [244, 215, 181] in street-centre,
 *   hue ~33-38 deg, luma ~218-239) rather than cool white/grey (0xd9d3c2).
 * - Kerb and apron concrete on the boards carry a warm sandy concrete tone (hue 25-36 deg)
 *   rather than pale cool grey (0x9a978a, hue 49 deg).
 */

import { describe, expect, it } from 'vitest';
import {
  ASPHALT_BASE_SRGB,
  ASPHALT_TAR_SEAM_SRGB,
  ASPHALT_COLD_PATCH_SRGB,
  ASPHALT_AGGREGATE_SRGB,
  ASPHALT_AGGREGATE_TINT,
  ASPHALT_POLISH_TINT,
  MARKING_PAINT_SRGB,
  BOARD_TARGET_ROAD,
  computeAuthoredRoadLinearMix,
  asphaltSpec,
  markingSpec,
  KERB_CONCRETE_SRGB,
  DRIVEWAY_APRON_SRGB,
  createNuketown2MaterialRegistry,
} from './nuketown2-materials';
import { linearRgb } from './nuketown2-materials/wear';

/** Rec.709 luma weights. */
const LUMA_R = 0.2126;
const LUMA_G = 0.7152;
const LUMA_B = 0.0722;

/** Standard HSV from normalized channels (0..1). */
function rgbToHsv(r: number, g: number, b: number): { hue: number; sat: number; val: number } {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const sat = max === 0 ? 0 : d / max;
  let hue = 0;
  if (d !== 0) {
    if (max === r) hue = ((g - b) / d) % 6;
    else if (max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  return { hue, sat, val: max };
}

/** sRGB encode from linear (0..1 -> 0..255). */
function linearToSrgb([r, g, b]: readonly [number, number, number]): [number, number, number] {
  return [
    Math.round(255 * (r <= 0.0031308 ? r * 12.92 : 1.055 * Math.pow(r, 1 / 2.4) - 0.055)),
    Math.round(255 * (g <= 0.0031308 ? g * 12.92 : 1.055 * Math.pow(g, 1 / 2.4) - 0.055)),
    Math.round(255 * (b <= 0.0031308 ? b * 12.92 : 1.055 * Math.pow(b, 1 / 2.4) - 0.055)),
  ];
}

describe('HF-536 Nuke Town road tone to the boards', () => {
  describe('authored asphalt mix in linear space', () => {
    const mixLin = computeAuthoredRoadLinearMix();
    const mixSrgb = linearToSrgb(mixLin);
    const linHsv = rgbToHsv(mixLin[0], mixLin[1], mixLin[2]);
    const srgbHsv = rgbToHsv(mixSrgb[0] / 255, mixSrgb[1] / 255, mixSrgb[2] / 255);
    const sLuma = LUMA_R * mixSrgb[0] + LUMA_G * mixSrgb[1] + LUMA_B * mixSrgb[2];

    it('lands linear mix hue within 12 deg of the authored board target constant (25.8 deg)', () => {
      // Linear hue of mix: ~25.5 deg (vs 25.8 deg target -> delta = 0.3 deg)
      // sRGB hue of mix: ~28.6 deg (vs 25.8 deg target -> delta = 2.8 deg)
      const deltaLinHue = Math.abs(linHsv.hue - BOARD_TARGET_ROAD.hueDeg);
      expect(deltaLinHue, 'linear mix hue delta from board target').toBeLessThanOrEqual(12);

      const deltaSrgbHue = Math.abs(srgbHsv.hue - BOARD_TARGET_ROAD.hueDeg);
      expect(deltaSrgbHue, 'sRGB equivalent hue delta from board target').toBeLessThanOrEqual(12);
    });

    it('lands saturation within 10 points of the authored board target constant (35.6 %)', () => {
      const srgbSatPct = srgbHsv.sat * 100;
      const deltaSat = Math.abs(srgbSatPct - BOARD_TARGET_ROAD.satPercent);
      expect(deltaSat, `mix saturation (${srgbSatPct.toFixed(1)}%) vs board target (${BOARD_TARGET_ROAD.satPercent}%)`)
        .toBeLessThanOrEqual(10);
    });

    it('lands luma within 12 of the authored board p50 target (50)', () => {
      const deltaLuma = Math.abs(sLuma - BOARD_TARGET_ROAD.lumaP50);
      expect(deltaLuma, `mix luma (${sLuma.toFixed(1)}) vs board p50 target (${BOARD_TARGET_ROAD.lumaP50})`)
        .toBeLessThanOrEqual(12);
    });
  });

  describe('measured ratchets on moved constants', () => {
    it('ratchet: asphalt base moved from cool grey 0x3b3d3e to warm charcoal 0x392f26 (HF-536)', () => {
      expect(ASPHALT_BASE_SRGB).toBe(0x392f26);
      const spec = asphaltSpec();
      expect(spec.baseSrgb).toBe(0x392f26);

      const lin = linearRgb(ASPHALT_BASE_SRGB);
      const hsv = rgbToHsv(lin[0], lin[1], lin[2]);
      // Must be warm charcoal (hue 20-30 deg), NOT cool blue-grey (previous 200 deg)
      expect(hsv.hue, 'asphalt base hue is warm charcoal').toBeGreaterThanOrEqual(20);
      expect(hsv.hue, 'asphalt base hue is warm charcoal').toBeLessThanOrEqual(30);
      // Red component dominates blue (warmth)
      expect(lin[0], 'linear R > linear B').toBeGreaterThan(lin[2]);
    });

    it('ratchet: tar seam moved from cool 0x1f2021 to warm bitumen seal 0x1d1611 (HF-536)', () => {
      expect(ASPHALT_TAR_SEAM_SRGB).toBe(0x1d1611);
      const lin = linearRgb(ASPHALT_TAR_SEAM_SRGB);
      const hsv = rgbToHsv(lin[0], lin[1], lin[2]);
      expect(hsv.hue, 'tar seam hue is warm bitumen').toBeGreaterThanOrEqual(20);
      expect(hsv.hue, 'tar seam hue is warm bitumen').toBeLessThanOrEqual(30);
      expect(lin[0], 'tar seam R > B').toBeGreaterThan(lin[2]);
    });

    it('ratchet: cold patch moved from cool 0x2b2c2d to warm repair patch 0x2b221a (HF-536)', () => {
      expect(ASPHALT_COLD_PATCH_SRGB).toBe(0x2b221a);
      const lin = linearRgb(ASPHALT_COLD_PATCH_SRGB);
      const hsv = rgbToHsv(lin[0], lin[1], lin[2]);
      expect(hsv.hue, 'cold patch hue is warm asphalt').toBeGreaterThanOrEqual(20);
      expect(hsv.hue, 'cold patch hue is warm asphalt').toBeLessThanOrEqual(30);
      expect(lin[0], 'cold patch R > B').toBeGreaterThan(lin[2]);
    });

    it('ratchet: aggregate tone is warm crushed stone chip (HF-536)', () => {
      expect(ASPHALT_AGGREGATE_SRGB).toBe(0x584a3b);
      // Aggregate lift tint favours warm red/amber stone over cool blue
      expect(ASPHALT_AGGREGATE_TINT[0]).toBeGreaterThan(ASPHALT_AGGREGATE_TINT[1]);
      expect(ASPHALT_AGGREGATE_TINT[1]).toBeGreaterThan(ASPHALT_AGGREGATE_TINT[2]);
    });

    it('ratchet: wheel-path polish tint lifts warm tyre sheen and dust (HF-536)', () => {
      // Warm tyre sheen lifts R > G > B
      expect(ASPHALT_POLISH_TINT[0]).toBeGreaterThan(ASPHALT_POLISH_TINT[1]);
      expect(ASPHALT_POLISH_TINT[1]).toBeGreaterThan(ASPHALT_POLISH_TINT[2]);
      expect(ASPHALT_POLISH_TINT[0]).toBe(0.25);
    });

    it('ratchet: marking paint tone moved from cool white 0xd9d3c2 to warm off-white 0xe8d5ba (HF-536)', () => {
      expect(MARKING_PAINT_SRGB).toBe(0xe8d5ba);
      const spec = markingSpec();
      expect(spec.baseSrgb).toBe(0xe8d5ba);

      const r = (MARKING_PAINT_SRGB >> 16) & 0xff;
      const g = (MARKING_PAINT_SRGB >> 8) & 0xff;
      const b = MARKING_PAINT_SRGB & 0xff;
      const hsv = rgbToHsv(r / 255, g / 255, b / 255);
      const luma = LUMA_R * r + LUMA_G * g + LUMA_B * b;

      // Warm off-white: hue 30-40 deg, luma > 200, R > G > B
      expect(hsv.hue, 'marking paint hue is warm off-white').toBeGreaterThanOrEqual(30);
      expect(hsv.hue, 'marking paint hue is warm off-white').toBeLessThanOrEqual(40);
      expect(luma, 'marking paint is bright thermoplastic').toBeGreaterThan(200);
      expect(r).toBeGreaterThan(g);
      expect(g).toBeGreaterThan(b);
    });

    it('ratchet: kerb concrete moved from cool grey 0x9a978a to warm sand concrete 0x9e917d (HF-536)', () => {
      expect(KERB_CONCRETE_SRGB).toBe(0x9e917d);
      const r = (KERB_CONCRETE_SRGB >> 16) & 0xff;
      const g = (KERB_CONCRETE_SRGB >> 8) & 0xff;
      const b = KERB_CONCRETE_SRGB & 0xff;
      const hsv = rgbToHsv(r / 255, g / 255, b / 255);
      // Warm sandy concrete: hue ~30-40 deg, R > G > B
      expect(hsv.hue, 'kerb concrete hue').toBeGreaterThanOrEqual(30);
      expect(hsv.hue, 'kerb concrete hue').toBeLessThanOrEqual(42);
      expect(r).toBeGreaterThan(g);
      expect(g).toBeGreaterThan(b);
    });

    it('ratchet: driveway apron concrete moved from 0x8b8879 to warm weathered 0x8d806d (HF-536)', () => {
      expect(DRIVEWAY_APRON_SRGB).toBe(0x8d806d);
      const r = (DRIVEWAY_APRON_SRGB >> 16) & 0xff;
      const g = (DRIVEWAY_APRON_SRGB >> 8) & 0xff;
      const b = DRIVEWAY_APRON_SRGB & 0xff;
      const hsv = rgbToHsv(r / 255, g / 255, b / 255);
      expect(hsv.hue, 'driveway apron hue').toBeGreaterThanOrEqual(30);
      expect(hsv.hue, 'driveway apron hue').toBeLessThanOrEqual(42);
      expect(r).toBeGreaterThan(g);
      expect(g).toBeGreaterThan(b);
    });
  });

  describe('shadow floor safeguard', () => {
    it('preserves shadow floor luma: base asphalt does not crush into shade floor under 10', () => {
      const lin = linearRgb(ASPHALT_BASE_SRGB);
      const lumaLin = LUMA_R * lin[0] + LUMA_G * lin[1] + LUMA_B * lin[2];
      // Linear luma > 0.025 preserves shadow response under golden-hour key/fill
      expect(lumaLin).toBeGreaterThan(0.025);

      const r = (ASPHALT_BASE_SRGB >> 16) & 0xff;
      const g = (ASPHALT_BASE_SRGB >> 8) & 0xff;
      const b = ASPHALT_BASE_SRGB & 0xff;
      const sLumaVal = LUMA_R * r + LUMA_G * g + LUMA_B * b;
      // sRGB luma > 48 ensures shadow side p10 (measured at coach-elevation / street-centre)
      // stays well above the p10 >= 10 floor
      expect(sLumaVal).toBeGreaterThan(48);
    });
  });

  describe('material registry integration', () => {
    it('applies updated road, kerb, drive and trim roles without changing graph count', () => {
      const registry = createNuketown2MaterialRegistry();
      expect(registry.asphalt).toBeDefined();
      expect(registry.kerb).toBeDefined();
      expect(registry.drive).toBeDefined();
      expect(registry.driveDecal).toBeDefined();
      expect(registry.trimDecal).toBeDefined();

      expect(registry.trimDecal.color.getHex()).toBe(MARKING_PAINT_SRGB);
      expect(registry.kerb.color.getHex()).toBe(KERB_CONCRETE_SRGB);
      expect(registry.drive.color.getHex()).toBe(DRIVEWAY_APRON_SRGB);
    });
  });
});
