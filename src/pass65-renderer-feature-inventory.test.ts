import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
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
      'ambient-contact-effects', 'frame-cap', 'hardware-ray-tracing',
    ]);
    expect(unsupported.every(({ control }) => control.kind === 'unsupported' && control.settingKeys.length === 0)).toBe(true);
  });

  it('probes real owners and symbols for every inventory row', () => {
    for (const feature of PASS65_RENDERER_FEATURES) {
      for (const probe of feature.sourceProbes) {
        expect(existsSync(probe.path), `${feature.id}: ${probe.path}`).toBe(true);
        expect(readFileSync(probe.path, 'utf8'), `${feature.id}: ${probe.symbol}`).toContain(probe.symbol);
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
