import { describe, expect, it } from 'vitest';
import {
  RAY_TRACED_REQUIRES_WEBGPU_REASON,
  normalizePass65Settings,
  resolveDisplayedGraphicsPreset,
  resolveGraphicsRuntime,
} from './pass65-settings';
import { GRAPHICS_PRESET_VALUES } from './graphics-settings-registry';

/**
 * PASS 81 - the RAY TRACED preset on a renderer that cannot trace.
 *
 * The tracer lives inside the TSL/HDR graph, and that graph is constructed
 * only on WebGPU (`legacy-main.ts` guards createPass64TslSceneSystems with
 * `renderRuntime.backend === 'webgpu'`). Nothing demoted the preset on a plain
 * WebGL2 fallback, so a player on that route could pick RAY TRACED and receive
 * QUALITY minus MSAA 4x (smaa instead) minus screen-space reflections, with no
 * traced reflection in exchange: strictly worse than the preset below it, sold
 * as the one above it, and the EFFECTIVE badge said RAY TRACED the whole time.
 *
 * The gate is a DEMOTION WITH A REASON, not a hidden option. The player still
 * sees what they asked for and is told why the machine cannot give it, which is
 * the same contract the compatibility route already honours.
 *
 * The capability defaults to "can trace" so that every existing caller keeps
 * its behaviour; the renderer route is the only thing that knows the truth and
 * it passes the real backend in.
 */

const raytraced = normalizePass65Settings({ graphics: { preset: 'raytraced', ...GRAPHICS_PRESET_VALUES.raytraced } }).graphics;
const high = normalizePass65Settings({ graphics: { preset: 'high', ...GRAPHICS_PRESET_VALUES.high } }).graphics;

describe('RAY TRACED capability gate', () => {
  it('keeps the preset intact on a renderer that can trace', () => {
    const runtime = resolveGraphicsRuntime(raytraced, false, { rayTracingCapable: true });
    expect(runtime.effectivePreset).toBe('raytraced');
    expect(runtime.screenSpace.rayTracing.enabled).toBe(true);
    expect(runtime.reason).toBeNull();
    expect(resolveDisplayedGraphicsPreset('raytraced', null, { rayTracingCapable: true })).toBe('raytraced');
  });

  it('assumes the renderer can trace when no capability is stated', () => {
    // Every existing caller passes nothing; the default must not silently
    // switch a WebGPU player's preset off.
    expect(resolveGraphicsRuntime(raytraced).effectivePreset).toBe('raytraced');
    expect(resolveDisplayedGraphicsPreset('raytraced')).toBe('raytraced');
  });

  it('demotes RAY TRACED to QUALITY on a renderer with no trace, with a reason', () => {
    const runtime = resolveGraphicsRuntime(raytraced, false, { rayTracingCapable: false });
    expect(runtime.requestedPreset).toBe('raytraced');
    expect(runtime.effectivePreset).toBe('high');
    expect(runtime.reason).toBe(RAY_TRACED_REQUIRES_WEBGPU_REASON);
    expect(resolveDisplayedGraphicsPreset('raytraced', null, { rayTracingCapable: false })).toBe('high');
  });

  it('hands back QUALITY\'s real values, not RAY TRACED\'s values under a different name', () => {
    // The whole defect was paying RAY TRACED's costs for QUALITY's picture. A
    // label-only demotion would leave that exactly where it was.
    const demoted = resolveGraphicsRuntime(raytraced, false, { rayTracingCapable: false });
    const quality = resolveGraphicsRuntime(high, false, { rayTracingCapable: false });
    expect(demoted.screenSpace.rayTracing.enabled).toBe(false);
    expect(demoted.antialiasSamples).toBe(quality.antialiasSamples);
    expect(demoted.antialiasSamples).toBe(4);
    expect(demoted.screenSpace.reflections.enabled).toBe(quality.screenSpace.reflections.enabled);
    expect(demoted.screenSpace.reflections.enabled).toBe(true);
    expect(demoted.reflectionQuality).toBe(quality.reflectionQuality);
  });

  it('switches a custom set\'s ray tracing off rather than demoting the whole set', () => {
    // A player who built a custom set is not asking for QUALITY; they are
    // asking for their own values, one of which this machine cannot draw.
    const custom = normalizePass65Settings({
      graphics: { preset: 'custom', ...GRAPHICS_PRESET_VALUES.max, rayTracing: 'refractions' },
    }).graphics;
    const runtime = resolveGraphicsRuntime(custom, false, { rayTracingCapable: false });
    expect(runtime.effectivePreset).toBe('custom');
    expect(runtime.screenSpace.rayTracing.enabled).toBe(false);
    expect(runtime.reason).toBe(RAY_TRACED_REQUIRES_WEBGPU_REASON);
    // Everything else the player chose survives.
    expect(runtime.maximumAnisotropy).toBe(GRAPHICS_PRESET_VALUES.max.anisotropy);
    expect(runtime.screenSpace.globalIllumination.enabled)
      .toBe(resolveGraphicsRuntime(custom).screenSpace.globalIllumination.enabled);
  });

  it('leaves the compatibility route saying what it already said', () => {
    // Compat is a stronger statement than "no tracer" and must win.
    const runtime = resolveGraphicsRuntime(raytraced, true, { rayTracingCapable: false });
    expect(runtime.effectivePreset).toBe('performance');
    expect(runtime.reason).toBe('Compatibility renderer is active.');
  });

  it('keeps the explicit review routes ahead of the capability demotion', () => {
    expect(resolveDisplayedGraphicsPreset('raytraced', 'performance', { rayTracingCapable: false })).toBe('performance');
    expect(resolveDisplayedGraphicsPreset('raytraced', 'blender', { rayTracingCapable: false })).toBe('high');
  });
});
