import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import {
  TINT_CHAINED_SWIZZLE_PATTERN,
  composeSwizzles,
  installTintSwizzleShimOnDevice,
  rewriteChainedSwizzles,
} from './webgpu-tint-swizzle-shim';

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

  it('flattens the PASS 93 chains the Nuke Town Rebuild post composite emits', () => {
    // Verbatim shapes from the captured renderPipeline_RenderPipeline_25
    // fragment shader (docs/evidence/pass93/chrome153-hotfix/REPORT.md):
    // a uniform-array element read as .xyz and then re-swizzled.
    expect(rewriteChainedSwizzles('NodeBuffer_1941.value[ i ].xyz.xy * vec2<f32>( 1.0 )'))
      .toBe('NodeBuffer_1941.value[ i ].xy * vec2<f32>( 1.0 )');
    expect(rewriteChainedSwizzles('( NodeBuffer_1941.value[ i ].xyz.z * ( object.nodeUniform27 - 1.0 ) )'))
      .toBe('( NodeBuffer_1941.value[ i ].z * ( object.nodeUniform27 - 1.0 ) )');
    expect(rewriteChainedSwizzles('( object.nodeUniform37 * vec4<f32>( a, 1.0 ) ).xyz.y - b'))
      .toBe('( object.nodeUniform37 * vec4<f32>( a, 1.0 ) ).y - b');
  });

  it('composes every chain shape by swizzle arithmetic, across families and depths', () => {
    expect(rewriteChainedSwizzles('v.rg.x')).toBe('v.r');
    expect(rewriteChainedSwizzles('v.rgb.x')).toBe('v.r');
    expect(rewriteChainedSwizzles('v.xy.y')).toBe('v.y');
    expect(rewriteChainedSwizzles('v.xyz.zy')).toBe('v.zy');
    expect(rewriteChainedSwizzles('v.wzyx.xw')).toBe('v.wx');
    expect(rewriteChainedSwizzles('v.rgba.bgr')).toBe('v.bgr');
    // Three-deep chains reduce fully.
    expect(rewriteChainedSwizzles('v.xyzw.xyz.xy.x')).toBe('v.x');
    // A chain that indexes past the first swizzle's width was never valid
    // WGSL; it is left for Tint to reject rather than silently reshaped.
    expect(composeSwizzles('xy', 'z')).toBeNull();
    expect(rewriteChainedSwizzles('v.xy.z')).toBe('v.xy.z');
    // Identifier boundaries: a swizzle-looking prefix of a longer member name
    // is not a chain.
    expect(rewriteChainedSwizzles('v.xy.x1 + v.xy.xyzw5')).toBe('v.xy.x1 + v.xy.xyzw5');
  });

  it('composeSwizzles is exact against a concrete vector', () => {
    const vector = [7, 11, 13, 17];
    const applySwizzle = (input: number[], swizzle: string) => [...swizzle].map((c) => input['xyzw'.indexOf(c)]);
    for (const [first, second] of [['xyz', 'xy'], ['xyz', 'z'], ['xy', 'x'], ['wzyx', 'xw'], ['xyzw', 'wzyx']]) {
      const chained = applySwizzle(applySwizzle(vector, first), second);
      const composed = composeSwizzles(first, second)!;
      expect(applySwizzle(vector, composed)).toEqual(chained);
    }
  });

  it('repairs the captured live failure shaders when present', () => {
    for (const captured of [
      'artifacts/qa/tint-swizzle/fragment.wgsl',
      'docs/evidence/pass93/chrome153-hotfix/renderPipeline_RenderPipeline_25.frag.wgsl',
    ]) {
      if (!existsSync(captured)) continue; // capture artifacts are environment-local
      const source = readFileSync(captured, 'utf8');
      const chains = source.match(TINT_CHAINED_SWIZZLE_PATTERN);
      if (!chains) continue;
      const repaired = rewriteChainedSwizzles(source);
      expect(repaired).not.toMatch(TINT_CHAINED_SWIZZLE_PATTERN);
      // Nothing else changed: each removed link drops exactly one dot plus the
      // first swizzle, minus whatever the composition keeps of the second.
      expect(repaired.length).toBeLessThan(source.length);
      expect(repaired.replace(/\.[xyzwrgbastpq]{1,4}\b/g, '')).toBe(source.replace(/\.[xyzwrgbastpq]{1,4}\b/g, ''));
    }
  });

  it('wraps createShaderModule on the negotiated device only, and leaves fakes alone', () => {
    // WebGpuRenderRuntime.create applies the shim to the device it negotiated,
    // AFTER requestDevice: adapter/device feature negotiation is never wrapped
    // (render-runtime-device-features.test.ts injects a fake gpu and spies on
    // requestDevice), and a device without createShaderModule is untouched.
    expect(installTintSwizzleShimOnDevice(undefined)).toBe(false);
    expect(installTintSwizzleShimOnDevice({ features: { has: () => false } })).toBe(false);

    const created: string[] = [];
    const device = { createShaderModule: (descriptor: { code: string }) => { created.push(descriptor.code); return {}; } };
    expect(installTintSwizzleShimOnDevice(device)).toBe(true);
    expect(installTintSwizzleShimOnDevice(device), 'idempotent').toBe(false);
    device.createShaderModule({ code: 'let a = v.xyz.xy; let b = v.xy.x;' });
    device.createShaderModule({ code: 'let c = v.xy;' });
    expect(created).toEqual(['let a = v.xy; let b = v.x;', 'let c = v.xy;']);
  });

  it('pins the three internals this shim exists for (upgrade tripwire)', () => {
    // If a three upgrade stops emitting the DFGLUT .rg chain, this shim can
    // retire; if it changes shape, the pattern must follow.
    const source = readFileSync('node_modules/three/build/three.webgpu.js', 'utf8');
    expect(source).toContain('return texture( lut, uv ).rg;');
  });
});
