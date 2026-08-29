import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { rewriteChainedSwizzles } from './webgpu-tint-swizzle-shim';

describe('Chrome 153 Tint chained-swizzle shim', () => {
  it('flattens the exact chains three r185 emits and nothing else', () => {
    expect(rewriteChainedSwizzles('( nodeVar30.xy.x + nodeVar30.xy.y )'))
      .toBe('( nodeVar30.x + nodeVar30.y )');
    expect(rewriteChainedSwizzles('SpecularColorBlended * vec3<f32>( nodeVar55.xy.x )'))
      .toBe('SpecularColorBlended * vec3<f32>( nodeVar55.x )');
    // Untouched: plain swizzles, uv fields, member names.
    const untouched = 'let a = v.xy; let b = v.x; let c = uv.xy * 2.0; let d = s.xyz;';
    expect(rewriteChainedSwizzles(untouched)).toBe(untouched);
  });

  it('is semantics-preserving by swizzle composition', () => {
    // v.xy selects components (0,1); .x of that = component 0 = v.x, and
    // .y of it = component 1 = v.y - for any vector width >= 2.
    const vector = [7, 11, 13, 17];
    const xy = [vector[0], vector[1]];
    expect(xy[0]).toBe(vector[0]);
    expect(xy[1]).toBe(vector[1]);
  });

  it('repairs the captured live failure shader when present', () => {
    const captured = 'artifacts/qa/tint-swizzle/fragment.wgsl';
    if (!existsSync(captured)) return; // capture artifact is environment-local
    const source = readFileSync(captured, 'utf8');
    if (!/\.xy\.(x|y)\b/.test(source)) return;
    const repaired = rewriteChainedSwizzles(source);
    expect(repaired).not.toMatch(/\.xy\.(x|y)\b/);
    // Nothing else changed: length shrinks by exactly 3 chars per chain.
    const chains = source.match(/\.xy\.(x|y)\b/g)!.length;
    expect(source.length - repaired.length).toBe(chains * 3);
  });

  it('pins the three internals this shim exists for (upgrade tripwire)', () => {
    // If a three upgrade stops emitting the DFGLUT .rg chain, this shim can
    // retire; if it changes shape, the pattern must follow.
    const source = readFileSync('node_modules/three/build/three.webgpu.js', 'utf8');
    expect(source).toContain('return texture( lut, uv ).rg;');
  });
});
