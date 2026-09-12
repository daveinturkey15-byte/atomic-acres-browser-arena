import { describe, expect, it } from 'vitest';
import { PASS65_KILLSTREAK_CATALOG, PASS65_KILLSTREAK_SLOT_DEFINITIONS } from '../killstreak-catalog';
import { DRONE_SUPPORT_DEFINITIONS } from '../killstreak-support-catalog';
import { DRONE_SWARM_DURATION_MS } from '../killstreak-runtime';
import { NUKE_WARNING_MS } from '../field-support';
import { KillstreakLoadoutController } from '../killstreak-loadout';
import type { Pass65KillstreakId } from '../killstreak-catalog';
import {
  KILLSTREAK_DESCRIPTIONS,
  activeKillstreakDurationMs,
  killstreakTimingLabel,
  killstreakLoadoutPanelMarkup,
  bindKillstreakLoadoutMenu,
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

// Minimal fake DOM harness: the vitest environment is node (no jsdom), and the
// binding only touches querySelector(All), select value/disabled/options/
// dataset/closest/addEventListener, and the status line's textContent. The
// demo rail binds to a no-op because '#killstreak-demo-rail' resolves to null.
class FakeOption {
  disabled = false;
  constructor(readonly value: string) {}
}

class FakeSelect {
  value: string;
  disabled = false;
  readonly options: FakeOption[];
  readonly dataset: { killstreakSlot: string };
  private readonly listeners: Array<() => void> = [];
  constructor(slot: number, optionValues: readonly string[], initial: string) {
    this.dataset = { killstreakSlot: String(slot) };
    this.options = optionValues.map((value) => new FakeOption(value));
    this.value = initial;
  }
  addEventListener(type: string, listener: () => void): void {
    if (type === 'change') this.listeners.push(listener);
  }
  closest(): null { return null; }
  pick(value: string): void {
    this.value = value;
    for (const listener of [...this.listeners]) listener();
  }
}

class FakeRoot {
  readonly status = { textContent: '' };
  constructor(readonly selects: FakeSelect[]) {}
  querySelectorAll(selector: string): unknown[] {
    return selector === '[data-killstreak-slot]' ? [...this.selects] : [];
  }
  querySelector(selector: string): unknown {
    return selector === '#killstreak-loadout-status' ? this.status : null;
  }
}

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

function bindFakeMenu(onChange?: (id: Pass65KillstreakId, slot: 1 | 2 | 3 | 4 | 5) => void) {
  const controller = new KillstreakLoadoutController(new MemoryStorage());
  const root = new FakeRoot(PASS65_KILLSTREAK_SLOT_DEFINITIONS.map((definition, index) =>
    new FakeSelect(definition.slot, definition.allowedIds, controller.selected.slots[index])));
  const binding = bindKillstreakLoadoutMenu(root as unknown as ParentNode, controller, onChange);
  return { controller, root, binding };
}

// HF-316 owner correction: picking the sibling heavy slot's reward swaps the
// two slots instead of being a silent disabled-option no-op.
describe('HF-316 killstreak loadout menu swap-on-conflict', () => {
  it('no longer disables the sibling heavy slot option anywhere', () => {
    const { root, controller } = bindFakeMenu();
    // Default loadout: slot 3 = tri-pass, slot 4 = chopper — before HF-316 the
    // sibling's pick was rendered disabled in each heavy select.
    for (const select of root.selects) {
      for (const option of select.options) expect(option.disabled).toBe(false);
    }
    // Still true after a heavy re-pick re-syncs the menu.
    root.selects[2].pick('carpet-bomber');
    expect(controller.selected.slots[2]).toBe('carpet-bomber');
    for (const select of root.selects) {
      for (const option of select.options) expect(option.disabled).toBe(false);
    }
  });

  it('swaps slots 3/4 on a sibling conflict pick and announces the swap', () => {
    const changes: Array<[Pass65KillstreakId, number]> = [];
    const { root, controller } = bindFakeMenu((id, slot) => changes.push([id, slot]));
    // Slot 4 currently holds chopper; picking slot 3's tri-pass must swap.
    root.selects[3].pick('tri-pass');
    expect(controller.selected.slots).toEqual(['scout-sweep', 'yardhawk', 'chopper', 'tri-pass', 'nuke']);
    expect(root.selects[2].value).toBe('chopper');
    expect(root.selects[3].value).toBe('tri-pass');
    expect(root.status.textContent).toBe('SWAPPED WITH SLOT 3');
    expect(changes).toEqual([['tri-pass', 4]]);
  });

  it('keeps the plain saved status for a non-conflicting pick', () => {
    const { root } = bindFakeMenu();
    root.selects[0].pick('care-package');
    expect(root.status.textContent).toBe('LOADOUT SAVED · KEYS 3–7 FOLLOW SLOT ORDER');
  });

  it('still freezes the whole control set while a match is active', () => {
    const { root, binding, controller } = bindFakeMenu();
    controller.freezeAtMatchStart();
    binding.setMatchActive(true);
    for (const select of root.selects) expect(select.disabled).toBe(true);
    expect(root.status.textContent).toBe('MATCH ACTIVE · SELECTION FROZEN');
  });
});
