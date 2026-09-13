import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PASS65_ADVANCED_GRAPHICS_TRACE,
  PASS65_RENDERER_FEATURES,
  pass65RendererFeatureInventoryReport,
  validatePass65RendererFeatureInventory,
} from './pass65-renderer-feature-inventory';

describe('Pass 65 renderer feature inventory', () => {
  it('maps every active feature to a setting, preset, or reviewed fixed rationale', () => {
    expect(validatePass65RendererFeatureInventory()).toEqual([]);
    for (const feature of PASS65_RENDERER_FEATURES.filter(({ availability }) => availability === 'active')) {
      expect(feature.control.kind).not.toBe('unsupported');
      if (feature.control.kind === 'fixed') expect(feature.control.rationale.length).toBeGreaterThan(24);
      expect(feature.authorityAffecting).toBe(false);
      expect(feature.budget.length).toBeGreaterThan(0);
      expect(feature.verifier.length).toBeGreaterThan(0);
    }
  });

  it('reports unavailable features instead of implying unsupported controls work', () => {
    const unsupported = PASS65_RENDERER_FEATURES.filter(({ availability }) => availability === 'unsupported');
    // HF-364 shipped the screen-space stack, so only the two real browser
    // boundaries remain: there is no WebGPU ray-tracing pipeline and no
    // vendor-native temporal reconstruction. Screen-space GI, SSR, depth of
    // field, motion blur and FSR 1 are now active rows with settings.
    expect(unsupported.map(({ id }) => id).sort()).toEqual([
      'ai-upscaling-frame-generation',
      'hardware-ray-tracing',
    ]);
    expect(unsupported.every(({ control }) => control.kind === 'unsupported' && control.settingKeys.length === 0)).toBe(true);
  });

  it('describes the screen-space stack honestly and never as ray tracing', () => {
    const screenSpaceIds = [
      'volumetric-light-shafts', 'screen-space-gi', 'screen-space-reflections',
      'depth-of-field', 'motion-blur', 'spatial-upscaling',
    ];
    for (const id of screenSpaceIds) {
      const found = PASS65_RENDERER_FEATURES.find((entry) => entry.id === id);
      expect(found?.availability, id).toBe('active');
      expect(found?.control.kind, id).toBe('setting');
      expect(found?.control.settingKeys.length, id).toBeGreaterThan(0);
    }
    // HF-398 CHANGED THIS RULE, AND MADE IT STRICTER RATHER THAN LOOSER.
    //
    // Before HF-398 nothing in this build was ray tracing, so a blanket ban on
    // the phrase across every active row was exactly right, and it stays right
    // for every row that is not a ray tracer. What changed is that one row now
    // genuinely is one: real world-space rays intersecting real world-space
    // geometry, recursing at reflective and refractive surfaces, casting shadow
    // rays. Forbidding the accurate word for that would push the row into
    // describing itself dishonestly in the other direction, which is the same
    // defect facing the other way.
    //
    // So the allowance is narrow, and it comes with three obligations the old
    // blanket rule never imposed on anything:
    //   1. a row that says "ray traced" must also say "software";
    //   2. it may never say RTX, RT core, or hardware acceleration;
    //   3. no row may claim path tracing, ever — the technique explicitly is
    //      not path tracing, and that mislabel is the same class of error as
    //      the RTX one.
    // A fourth applies to EVERY row, active or not: "rtx" may appear in exactly
    // one place, the unsupported hardware row, where it names the review GPU
    // rather than claiming a capability.
    const GENUINE_RAY_TRACING_ROWS = new Set(['classic-recursive-ray-tracing', 'presentation-profile']);
    for (const entry of PASS65_RENDERER_FEATURES.filter(({ availability }) => availability === 'active')) {
      const prose = `${entry.title} ${entry.control.effectiveValue} ${entry.control.rationale}`.toLowerCase();
      const claimsRayTracing = /\bray[- ]trac/.test(prose)
        && !/no ray-tracing|not ray tracing|never .*ray[- ]trac|rather than ray[- ]trac|mistaken for/.test(prose);
      if (!GENUINE_RAY_TRACING_ROWS.has(entry.id)) {
        expect(claimsRayTracing, entry.id).toBe(false);
        continue;
      }
      expect(prose, `${entry.id} must say software`).toMatch(/software/);
      expect(/\brtx\b/.test(prose), `${entry.id} claims RTX`).toBe(false);
      expect(/rt core/.test(prose), `${entry.id} claims RT cores`).toBe(false);
      expect(/hardware[- ]accelerat/.test(prose), `${entry.id} claims hardware acceleration`).toBe(false);
    }
    // Obligation 3, applied to every row without exception.
    for (const entry of PASS65_RENDERER_FEATURES) {
      const prose = `${entry.title} ${entry.control.effectiveValue} ${entry.control.rationale}`.toLowerCase();
      const claimsPathTracing = /\bpath[- ]trac/.test(prose)
        && !/not path[- ]trac|no path[- ]trac|never path[- ]trac/.test(prose);
      expect(claimsPathTracing, `${entry.id} claims path tracing`).toBe(false);
    }
    // Obligation 4.
    const rtxRows = PASS65_RENDERER_FEATURES.filter((entry) => (
      /\brtx\b/.test(`${entry.title} ${entry.control.effectiveValue} ${entry.control.rationale} ${entry.budget}`.toLowerCase())
    ));
    expect(rtxRows.map(({ id }) => id)).toEqual(['hardware-ray-tracing']);
    expect(rtxRows[0]?.availability).toBe('unsupported');

    const gi = PASS65_RENDERER_FEATURES.find((entry) => entry.id === 'screen-space-gi');
    expect(gi?.title).toContain('Screen-space');
    expect(gi?.control.rationale).toContain('WebGPU exposes no ray-tracing pipeline');

    // And the new row is real: active, player-selectable, and its budget states
    // the ray count as a number rather than as an adjective.
    const traced = PASS65_RENDERER_FEATURES.find((entry) => entry.id === 'classic-recursive-ray-tracing');
    expect(traced?.availability).toBe('active');
    expect(traced?.control.settingKeys).toEqual(['graphics.rayTracing']);
    expect(traced?.budget).toMatch(/24 analytic proxy shapes/);
    expect(traced?.budget).toMatch(/Recursion depth 2 \(reflections\) or 3 \(refractions\)/);
  });

  it('binds menu choreography to prerecorded media with zero runtime renderer ownership', () => {
    const preview = PASS65_RENDERER_FEATURES.find(({ id }) => id === 'menu-preview-motion');
    expect(preview).toMatchObject({
      owner: 'src/ui/menu-preview-video.ts + offline authored media',
      sourceProbes: expect.arrayContaining([
        { path: 'src/ui/menu-preview-video.ts', symbol: 'class MenuPreviewVideoController' },
        { path: 'src/ui/menu-preview-video.ts', symbol: 'rendererSubmissions: 0' },
      ]),
      verifier: 'src/ui/menu-preview-video.test.ts + tests/e2e/pass65-preview-choreography.spec.ts',
    });
    expect(preview?.owner).not.toContain('menu-preview-camera');
    expect(preview?.control.effectiveValue).toContain('prerecorded compressed video');
    expect(preview?.budget).toContain('zero menu-preview arena constructions or WebGPU submissions');
  });

  it('probes real owners and symbols for every inventory row', () => {
    for (const [stage, probe] of Object.entries(PASS65_ADVANCED_GRAPHICS_TRACE)) {
      expect(existsSync(probe.path), `${stage}: ${probe.path}`).toBe(true);
      expect(readFileSync(probe.path, 'utf8'), `${stage}: ${probe.symbol}`).toContain(probe.symbol);
    }
    for (const feature of PASS65_RENDERER_FEATURES) {
      for (const probe of feature.sourceProbes) {
        expect(existsSync(probe.path), `${feature.id}: ${probe.path}`).toBe(true);
        expect(readFileSync(probe.path, 'utf8'), `${feature.id}: ${probe.symbol}`).toContain(probe.symbol);
      }
    }
    for (const setting of pass65RendererFeatureInventoryReport().settings.filter(({ key }) => key.startsWith('graphics.'))) {
      expect(setting.runtimeEvidence?.length, setting.key).toBeGreaterThan(0);
      for (const probe of setting.runtimeEvidence ?? []) {
        expect(existsSync(probe.path), `${setting.key}: ${probe.path}`).toBe(true);
        expect(readFileSync(probe.path, 'utf8'), `${setting.key}: ${probe.symbol}`).toContain(probe.symbol);
      }
    }
  });

  it('keeps the checked-in generated JSON tied to the canonical registry', () => {
    const report = pass65RendererFeatureInventoryReport();
    const inventorySha256 = createHash('sha256').update(JSON.stringify(report.features)).digest('hex');
    const generated = JSON.parse(readFileSync('docs/PASS65_RENDERER_FEATURE_INVENTORY.generated.json', 'utf8'));
    expect(generated).toEqual({ ...report, inventorySha256 });
  });
});
