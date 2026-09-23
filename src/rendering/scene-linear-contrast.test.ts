import { readFileSync } from 'node:fs';
import type { Node } from 'three/webgpu';
import { describe, expect, it, vi } from 'vitest';

// Evaluate the production TSL expression without a renderer/GPU. This checks
// its arithmetic wiring, not WGSL compilation or rendered pixel equivalence.
const arithmetic = vi.hoisted(() => {
  type Value = number | number[] | boolean;
  type Operand = Value | ScalarNode;
  const unwrap = (v: Operand): Value => v instanceof ScalarNode ? v.value : v;
  class ScalarNode {
    constructor(readonly value: Value) {}
    binary(other: Operand, op: (a: number, b: number) => number): ScalarNode {
      const a = this.value, b = unwrap(other);
      return new ScalarNode(Array.isArray(a)
        ? a.map((v, i) => op(v, Array.isArray(b) ? b[i] : Number(b)))
        : Array.isArray(b) ? b.map(v => op(Number(a), v)) : op(Number(a), Number(b)));
    }
    sub(v: Operand) { return this.binary(v, (a, b) => a - b); }
    div(v: Operand) { return this.binary(v, (a, b) => a / b); }
    mul(v: Operand) { return this.binary(v, (a, b) => a * b); }
    equal(v: Operand) { return new ScalarNode(this.value === unwrap(v)); }
    select(a: ScalarNode, b: ScalarNode) { return this.value ? a : b; }
  }
  return {
    node: (value: Value) => new ScalarNode(value),
    vec3: (...values: number[]) => new ScalarNode(values),
    dot: (a: ScalarNode, b: ScalarNode) => new ScalarNode(
      (a.value as number[]).reduce((sum, v, i) => sum + v * (b.value as number[])[i], 0)),
    max: (a: ScalarNode, b: number) => a.binary(b, Math.max),
    pow: (a: ScalarNode, b: ScalarNode) => a.binary(b, Math.pow),
  };
});
vi.mock('three/tsl', () => arithmetic);
import { sceneLinearContrast, sceneLinearContrastNode, type LinearContrastRgb } from './scene-linear-contrast';

describe('positive scene-linear contrast candidate', () => {
  it('preserves exact identity, black, pivot and zero channels', () => {
    const rgb = [0.02, 0.03, 8] as const;
    expect(sceneLinearContrast(rgb, 1)).toBe(rgb);
    for (const contrast of [0.9, 1, 1.0865, 1.18]) {
      expect(sceneLinearContrast([0, 0, 0], contrast)).toEqual([0, 0, 0]);
      for (const v of sceneLinearContrast([0.5, 0.5, 0.5], contrast)) expect(v).toBeCloseTo(0.5, 14);
      expect(sceneLinearContrast([0, 0.03, 0.06], contrast)[0]).toBe(0);
    }
  });

  it('matches the analytic grey power curve and retains HDR values', () => {
    for (const contrast of [0.9, 1.0865, 1.18]) {
      for (const y of [1e-6, 0.002, 0.02, 0.18, 0.5, 1, 4, 16]) {
        expect(sceneLinearContrast([y, y, y], contrast)[0])
          .toBeCloseTo(0.5 * Math.pow(y / 0.5, contrast), 12);
      }
    }
    expect(sceneLinearContrast([4, 4, 4], 1.0865)[0]).toBeGreaterThan(4);
  });

  it('preserves hue ratios without channel clipping across dark and HDR input', () => {
    for (const rgb of [[0.02, 0.03, 0.06], [0.002, 0.008, 0.001], [2, 4, 16]] as const) {
      const out = sceneLinearContrast(rgb, 1.0865);
      expect(out.every(v => Number.isFinite(v) && v > 0)).toBe(true);
      expect(out[0] / out[1]).toBeCloseTo(rgb[0] / rgb[1], 14);
      expect(out[2] / out[1]).toBeCloseTo(rgb[2] / rgb[1], 14);
    }
  });

  it('is continuous at epsilon and strictly monotone along a fixed hue', () => {
    for (const contrast of [0.9, 1, 1.0865, 1.18]) {
      let previous = -1;
      for (const y of [0, 1e-12, 1e-8, 0.999999e-6, 1e-6, 1.000001e-6, 0.01, 0.1, 0.5, 1, 16]) {
        const out = sceneLinearContrast([y, y, y], contrast)[0];
        expect(out).toBeGreaterThan(previous);
        previous = out;
      }
      const low = sceneLinearContrast([0.999999e-6, 0.999999e-6, 0.999999e-6], contrast)[0];
      const high = sceneLinearContrast([1.000001e-6, 1.000001e-6, 1.000001e-6], contrast)[0];
      expect(high / low).toBeLessThan(1.000003);
    }
  });

  it('evaluates the production TSL arithmetic consistently with the CPU reference', () => {
    for (const rgb of [[0, 0, 0], [1e-12, 0, 1e-10], [0.02, 0.03, 0.06], [0.5, 0.5, 0.5], [2, 4, 16]] satisfies LinearContrastRgb[]) {
      for (const contrast of [0.9, 1, 1.0865, 1.18]) {
        const input = arithmetic.node([...rgb]);
        const result = sceneLinearContrastNode(
          input as unknown as Node<'vec3'>, arithmetic.node(contrast) as unknown as Node<'float'>,
        ) as unknown as { value: number[] };
        expect(result.value).toEqual(sceneLinearContrast(rgb, contrast));
        if (contrast === 1) expect(result).toBe(input);
      }
    }
  });

  it('keeps the original other-arena expression and updates the arena selector on switches', () => {
    const source = readFileSync(new URL('./pass64-tsl-scene.ts', import.meta.url), 'utf8');
    expect(source).toContain("uniform(definition.id === 'nuketown2')");
    expect(source).toContain("useNuketown2LinearContrast.value = next.id === 'nuketown2'");
    expect(source).toContain('const legacyContrasted = saturated.sub(0.5).mul(contrast).add(0.5);');
    expect(source).toContain('sceneLinearContrastNode(saturated, contrast), legacyContrasted');
  });
});
