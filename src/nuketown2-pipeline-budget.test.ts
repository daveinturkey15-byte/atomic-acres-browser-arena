import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  NUKETOWN2_CLUSTERED_LIGHTING_SETTINGS,
  NUKETOWN2_LOCAL_LIGHT_COUNT,
} from './rendering/clustered-lights';

describe('Nuke Town clustered lighting pipeline budget', () => {
  it('reserves one fixed clustered update pipeline inside the 54-pipeline ceiling', () => {
    expect(NUKETOWN2_CLUSTERED_LIGHTING_SETTINGS.pipelineCount).toBe(1);
    expect(NUKETOWN2_CLUSTERED_LIGHTING_SETTINGS.pipelineCount)
      .toBeLessThanOrEqual(NUKETOWN2_CLUSTERED_LIGHTING_SETTINGS.pipelineBudgetCeiling);
    expect(NUKETOWN2_CLUSTERED_LIGHTING_SETTINGS.pipelineBudgetCeiling).toBe(54);
  });

  it('keeps the catalog and bounded per-tile loop inside their fixed limits', () => {
    expect(NUKETOWN2_LOCAL_LIGHT_COUNT).toBeLessThanOrEqual(NUKETOWN2_CLUSTERED_LIGHTING_SETTINGS.maxLightsPerArena);
    expect(NUKETOWN2_CLUSTERED_LIGHTING_SETTINGS.maxLightsPerTile).toBe(24);
    expect(NUKETOWN2_CLUSTERED_LIGHTING_SETTINGS.tileSizePixels).toBe(32);
    expect(NUKETOWN2_CLUSTERED_LIGHTING_SETTINGS.zSlices).toBe(24);
  });

  it('uses the installed r185 addon and leaves farcrysis outside the Nuke Town lane', () => {
    const clusteredSource = readFileSync(new URL('./rendering/clustered-lights.ts', import.meta.url), 'utf8');
    const farcrysisSource = readFileSync(new URL('./farcrysis.ts', import.meta.url), 'utf8');
    expect(clusteredSource).toContain("three/addons/lighting/ClusteredLighting.js");
    expect(clusteredSource).toContain('new ClusteredLighting(');
    expect(clusteredSource).not.toContain('renderer.compute');
    expect(farcrysisSource).not.toContain('clustered-lights');
  });
});
