import { describe, expect, it } from 'vitest';
import { ADVANCED_GRAPHICS_CONTROLS, GRAPHICS_CAPABILITY_NOTICES, GRAPHICS_PRESET_VALUES } from '../graphics-settings-registry';
import { normalizePass65Settings } from '../pass65-settings';
import { AdvancedGraphicsEditTransaction, advancedGraphicsMarkup } from './advanced-graphics-controls';

describe('Advanced Graphics generated controls', () => {
  it('renders exactly one control for every canonical setting', () => {
    const markup = advancedGraphicsMarkup();
    expect(markup).toContain(`data-graphics-registry-count="${ADVANCED_GRAPHICS_CONTROLS.length}"`);
    for (const definition of ADVANCED_GRAPHICS_CONTROLS) {
      expect(markup.match(new RegExp(`id="${definition.id}"`, 'g'))).toHaveLength(1);
      expect(markup).toContain(`data-graphics-setting="${definition.key}"`);
    }
  });

  it('renders capability-gated paths as disabled explanations', () => {
    const markup = advancedGraphicsMarkup();
    for (const notice of GRAPHICS_CAPABILITY_NOTICES) {
      expect(markup).toContain(`data-graphics-capability="${notice.id}"`);
      expect(markup).toContain(notice.reason);
    }
    expect(markup.match(/aria-disabled="true"/g)).toHaveLength(GRAPHICS_CAPABILITY_NOTICES.length);
  });

  it('keeps pending edits inspectable until persistence explicitly succeeds', () => {
    const quality = normalizePass65Settings({ graphics: { preset: 'high' } }).graphics;
    const transaction = new AdvancedGraphicsEditTransaction(quality);
    transaction.stage('filmGrain', 0.22);

    expect(transaction.peekPendingEdits()).toEqual({ filmGrain: 0.22 });
    expect(transaction.peekPendingEdits()).toEqual({ filmGrain: 0.22 });
    expect(transaction.hasPendingEdits()).toBe(true);

    transaction.clearPendingEdits();
    expect(transaction.peekPendingEdits()).toEqual({});
    expect(transaction.hasPendingEdits()).toBe(false);
  });

  it('materializes Custom from the most recently refreshed named preset', () => {
    const quality = normalizePass65Settings({ graphics: { preset: 'high' } }).graphics;
    const max = normalizePass65Settings({ graphics: { preset: 'max' } }).graphics;
    const transaction = new AdvancedGraphicsEditTransaction(quality);

    transaction.stage('renderScale', 0.75);
    transaction.refresh(max);
    expect(transaction.hasPendingEdits()).toBe(false);
    expect(transaction.customSettings()).toMatchObject({
      ...GRAPHICS_PRESET_VALUES.max,
      schemaVersion: 1,
      preset: 'custom',
    });

    transaction.stage('filmGrain', 0.19);
    expect(transaction.customSettings()).toMatchObject({
      ...GRAPHICS_PRESET_VALUES.max,
      schemaVersion: 1,
      preset: 'custom',
      filmGrain: 0.19,
    });
    expect(transaction.hasPendingEdits()).toBe(true);
  });
});
