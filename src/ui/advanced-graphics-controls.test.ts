import { describe, expect, it } from 'vitest';
import { ADVANCED_GRAPHICS_CONTROLS, GRAPHICS_CAPABILITY_NOTICES } from '../graphics-settings-registry';
import { advancedGraphicsMarkup } from './advanced-graphics-controls';

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
});
