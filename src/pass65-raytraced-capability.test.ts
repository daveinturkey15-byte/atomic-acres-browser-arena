import { describe, expect, it } from 'vitest';
import {
  RAY_TRACED_REQUIRES_WEBGPU_REASON,
  normalizePass65Settings,
  parsePass65Settings,
  resolveDisplayedGraphicsPreset,
  resolveGraphicsRuntime,
} from './pass65-settings';
import { GRAPHICS_PRESET_VALUES } from './graphics-settings-registry';

/**
 * HF-398 introduced the RAY TRACED preset and a capability gate for its trace.
 * HF-438 (owner 2026-09-03: "I don't think we should have a ray tracing AND an
 * RTX mode") retired that preset and folded its controls into QUALITY (light)
 * and MAX (full). What survives is exactly what still has a live consumer:
 *
 *  - the STORED-PREFERENCE migration: a persisted `raytraced` preset id must
 *    resolve to QUALITY on load, on every machine, not to whatever the
 *    automatic default would have been;
 *  - the TRACE CAPABILITY gate: the trace is built inside the TSL/HDR graph,
 *    which only the WebGPU route constructs, so a renderer that cannot trace
 *    has the one control switched off — with a reason — while the player keeps
 *    the rung they chose and every other value in it. The gate used to demote
 *    the whole retired preset; that branch is gone because the preset is gone.
 *
 * The capability defaults to "can trace" so every existing caller keeps its
 * behaviour; the renderer route is the only thing that knows the truth and it
 * passes the real backend in.
 */

const high = normalizePass65Settings({ graphics: { preset: 'high', ...GRAPHICS_PRESET_VALUES.high } }).graphics;
const max = normalizePass65Settings({ graphics: { preset: 'max', ...GRAPHICS_PRESET_VALUES.max } }).graphics;

describe('retired raytraced preset migration (HF-438)', () => {
  it('maps a stored raytraced preference to QUALITY on load', () => {
    const migrated = normalizePass65Settings({ graphics: { preset: 'raytraced' } }).graphics;
    expect(migrated.preset).toBe('high');
    // QUALITY's real control set, not a hybrid: the retired preset's stored
    // advanced values (if any travelled alongside) are discarded exactly like
    // every other named-profile override.
    expect(migrated.antiAliasing).toBe(GRAPHICS_PRESET_VALUES.high.antiAliasing);
    expect(migrated.rayTracing).toBe('reflections');
    expect(migrated.ambientOcclusion).toBe('high');
  });

  it('maps a stored raytraced preference through a storage read on a weak machine too', () => {
    // The migration must NOT fall through to defaultGraphicsPreset: on a
    // 4-core machine the automatic default is PERFORMANCE, and silently
    // dropping a saved rung two steps down the ladder is the defect class this
    // guard exists for.
    const migrated = parsePass65Settings(
      JSON.stringify({ version: 1, graphics: { schemaVersion: 1, preset: 'raytraced' } }),
      { hardwareConcurrency: 4, deviceMemoryGb: 4 },
    ).graphics;
    expect(migrated.preset).toBe('high');
  });

  it('refuses the retired id through the same fail-closed path as any unknown preset', () => {
    expect(Object.keys(GRAPHICS_PRESET_VALUES)).not.toContain('raytraced');
  });
});

describe('ray-trace capability gate (HF-438 shape)', () => {
  it('keeps QUALITY and MAX intact, trace included, on a renderer that can trace', () => {
    for (const settings of [high, max]) {
      const runtime = resolveGraphicsRuntime(settings, false, { rayTracingCapable: true });
      expect(runtime.effectivePreset).toBe(settings.preset);
      expect(runtime.screenSpace.rayTracing.enabled).toBe(true);
      expect(runtime.reason).toBeNull();
    }
    expect(resolveDisplayedGraphicsPreset('high')).toBe('high');
    expect(resolveDisplayedGraphicsPreset('max')).toBe('max');
  });

  it('assumes the renderer can trace when no capability is stated', () => {
    // Every existing caller passes nothing; the default must not silently
    // switch a WebGPU player's trace off.
    for (const settings of [high, max]) {
      expect(resolveGraphicsRuntime(settings).screenSpace.rayTracing.enabled).toBe(true);
    }
  });

  it('switches the trace off, with a reason, on a renderer with no trace — keeping the rung', () => {
    for (const settings of [high, max]) {
      const runtime = resolveGraphicsRuntime(settings, false, { rayTracingCapable: false });
      expect(runtime.requestedPreset).toBe(settings.preset);
      expect(runtime.effectivePreset).toBe(settings.preset);
      expect(runtime.screenSpace.rayTracing.enabled).toBe(false);
      expect(runtime.reason).toBe(RAY_TRACED_REQUIRES_WEBGPU_REASON);
      // Every OTHER value survives: the player keeps the rung they chose.
      expect(runtime.antialiasSamples).toBe(settings.antiAliasing === 'msaa-4x' ? 4 : 0);
      expect(runtime.ambientOcclusion.enabled).toBe(settings.ambientOcclusion !== 'off');
    }
    expect(resolveDisplayedGraphicsPreset('high')).toBe('high');
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
    const runtime = resolveGraphicsRuntime(high, true, { rayTracingCapable: false });
    expect(runtime.effectivePreset).toBe('performance');
    expect(runtime.reason).toBe('Compatibility renderer is active.');
  });

  it('keeps the explicit review routes ahead of the capability gate', () => {
    expect(resolveDisplayedGraphicsPreset('high', 'performance')).toBe('performance');
    expect(resolveDisplayedGraphicsPreset('high', 'blender')).toBe('high');
  });
});
