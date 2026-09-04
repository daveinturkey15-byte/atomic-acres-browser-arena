import { describe, expect, it } from 'vitest';
import { PASS65_RENDERER_FEATURES } from '../../pass65-renderer-feature-inventory';
import { TSL_MIGRATION_INVENTORY, TSL_SHARED_MATERIAL_INVENTORY } from '../tsl-migration-inventory';

describe('Nuke Town SH-L2 pipeline budget', () => {
  it('keeps the pre-existing TSL pipeline count unchanged and adds no pipeline', () => {
    const pipelineCountBeforeShL2 = 7;
    const existingPipelineIds = TSL_MIGRATION_INVENTORY.map((entry) => entry.replacementPipelineId);
    const sharedShL2 = TSL_SHARED_MATERIAL_INVENTORY.find(
      (entry) => entry.id === 'nuketown2-sh-l2-indirect-materials',
    );
    const feature = PASS65_RENDERER_FEATURES.find((entry) => entry.id === 'nuketown2-sh-l2-indirect-light');

    expect(existingPipelineIds).toHaveLength(pipelineCountBeforeShL2);
    expect(new Set(existingPipelineIds).size).toBe(pipelineCountBeforeShL2);
    expect(sharedShL2?.pipelineIds).toEqual([]);
    expect(feature?.pipelineIds).toEqual([]);
    expect(existingPipelineIds.length + (sharedShL2?.pipelineIds.length ?? 0)).toBe(pipelineCountBeforeShL2);
  });
});
