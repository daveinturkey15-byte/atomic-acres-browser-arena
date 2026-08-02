import { describe, expect, it } from 'vitest';
import { PASS65_KILLSTREAK_CATALOG, PASS65_KILLSTREAK_SLOT_DEFINITIONS } from '../killstreak-catalog';
import { DRONE_SUPPORT_DEFINITIONS } from '../killstreak-support-catalog';
import { DRONE_SWARM_DURATION_MS } from '../killstreak-runtime';
import { NUKE_WARNING_MS } from '../field-support';
import {
  KILLSTREAK_DESCRIPTIONS,
  activeKillstreakDurationMs,
  killstreakTimingLabel,
  killstreakLoadoutPanelMarkup,
} from './killstreak-loadout-menu';

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

  it('keeps one non-empty plain-language description for every canonical reward', () => {
    expect(Object.keys(KILLSTREAK_DESCRIPTIONS).sort()).toEqual(
      PASS65_KILLSTREAK_CATALOG.definitions.map((entry) => entry.id).sort(),
    );
    for (const description of Object.values(KILLSTREAK_DESCRIPTIONS)) {
      expect(description.trim().length).toBeGreaterThan(20);
    }
  });

  it('describes Yardhawk as the shipped homing explosive and derives Drone Swarm duration from runtime authority', () => {
    expect(KILLSTREAK_DESCRIPTIONS.yardhawk).toMatch(/homing/u);
    expect(KILLSTREAK_DESCRIPTIONS.yardhawk).toMatch(/explodes/u);
    expect(KILLSTREAK_DESCRIPTIONS.yardhawk).not.toMatch(/turret/u);

    const catalogDuration = PASS65_KILLSTREAK_CATALOG.definitions
      .find((definition) => definition.id === 'drone-swarm')!.durationMs;
    expect(new Set([
      catalogDuration,
      DRONE_SUPPORT_DEFINITIONS.swarm.lifetimeMs,
      DRONE_SWARM_DURATION_MS,
      activeKillstreakDurationMs('drone-swarm'),
    ])).toEqual(new Set([30_000]));
    expect(KILLSTREAK_DESCRIPTIONS['drone-swarm']).toContain('30s');
    expect(KILLSTREAK_DESCRIPTIONS['drone-swarm']).not.toContain('60s');
  });

  it('describes the canonical nuke warning instead of claiming an immediate wipe', () => {
    expect(NUKE_WARNING_MS).toBe(5_000);
    expect(killstreakTimingLabel('nuke')).toBe('5s WARNING');
    expect(KILLSTREAK_DESCRIPTIONS.nuke).toContain('5-second global warning');
    expect(KILLSTREAK_DESCRIPTIONS.nuke).not.toMatch(/instant/iu);
  });
});
