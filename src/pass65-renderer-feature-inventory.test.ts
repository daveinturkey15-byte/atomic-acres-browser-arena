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
    expect(unsupported.map(({ id }) => id).sort()).toEqual([
      'ai-upscaling-frame-generation',
      'depth-of-field',
      'hardware-ray-tracing',
      'motion-blur',
      'screen-space-gi',
      'screen-space-reflections',
    ]);
    expect(unsupported.every(({ control }) => control.kind === 'unsupported' && control.settingKeys.length === 0)).toBe(true);
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
