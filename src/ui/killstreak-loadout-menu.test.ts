import { describe, expect, it } from 'vitest';
import { PASS65_KILLSTREAK_SLOT_DEFINITIONS } from '../killstreak-catalog';
import { killstreakLoadoutPanelMarkup } from './killstreak-loadout-menu';

describe('killstreak loadout menu projection', () => {
  it('derives all five controls and every option from the canonical slot definitions', () => {
    const html = killstreakLoadoutPanelMarkup();
    expect(html.match(/data-killstreak-slot="[1-5]"/g)).toHaveLength(5);
    for (const slot of PASS65_KILLSTREAK_SLOT_DEFINITIONS) {
      for (const id of slot.allowedIds) expect(html).toContain(`value="${id}"`);
    }
    expect(html).toContain('Slots 3 and 4 must be different');
    expect(html).toContain('Nuke and Drone Swarm share slot 5');
    expect(html).toContain('class="killstreak-loadout-layout"');
    expect(html).toContain('id="killstreak-demo-rail"');
    expect(html).not.toContain('<canvas');
  });
});
