import {
  PASS65_KILLSTREAK_CATALOG,
  PASS65_KILLSTREAK_SLOT_DEFINITIONS,
  type Pass65KillstreakId, type SelectableKillstreakId,
} from '../killstreak-catalog';
import {
  DEFAULT_KILLSTREAK_LOADOUT,
  type KillstreakLoadoutController,
} from '../killstreak-loadout';
import { NUKE_WARNING_MS } from '../field-support';

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

export function activeKillstreakDurationMs(id: Pass65KillstreakId): number {
  const definition = PASS65_KILLSTREAK_CATALOG.definitions.find((entry) => entry.id === id);
  if (!definition) throw new Error(`Unknown killstreak ${id}`);
  return definition.durationMs;
}

function killstreakDurationSeconds(id: SelectableKillstreakId): number {
  const durationMs = activeKillstreakDurationMs(id);
  if (durationMs <= 0 || durationMs % 1_000 !== 0) {
    throw new Error(`Killstreak ${id} requires a positive whole-second duration`);
  }
  return durationMs / 1_000;
}

/**
 * Owner request: plain-language descriptions of what each killstreak IS and
 * DOES, shown in the loadout menu so every reward is self-explanatory.
 */
export const KILLSTREAK_DESCRIPTIONS: Readonly<Record<Pass65KillstreakId, string>> = Object.freeze({
  'crimson-flamethrower': 'Care-package only (10% chance): a red flamethrower of your own, 30% weaker than the map one.',
  'scout-sweep': 'Reveals every enemy on your minimap for 12s.',
  'adrenaline': '+10% damage and move speed, -10% reload time for 15s.',
  'care-package': 'Calls a supply crate you can capture for a bonus reward.',
  'yardhawk': 'Throws a homing hunter-killer that pursues one enemy and explodes.',
  'piloted-drone': `Take first-person control of an armed drone for ${killstreakDurationSeconds('piloted-drone')}s.`,
  'tri-pass': 'Three aircraft strafe a line you place on the map.',
  'carpet-bomber': 'Bombs saturate a target point - hurts everyone, including you.',
  'hunter-swarm': 'Five drones dive on the nearest enemies for 20s.',
  'chopper': 'Gun a chopper from first person; press its key again to take the gun.',
  'drone-swarm': `24 drones patrol and engage enemies for ${killstreakDurationSeconds('drone-swarm')}s.`,
  'nuke': `Starts a ${NUKE_WARNING_MS / 1_000}-second global warning, then wipes every enemy on the map.`,
});

export function killstreakTimingLabel(id: Pass65KillstreakId): string {
  if (id === 'nuke') return `${NUKE_WARNING_MS / 1_000}s WARNING`;
  const durationMs = activeKillstreakDurationMs(id);
  return durationMs === 0 ? 'IMMEDIATE' : `${durationMs / 1_000}s`;
}

function killstreakIcon(id: string): string {
  const shape = id === 'care-package' ? '<path d="m4 8 8-4 8 4-8 4-8-4v10l8 4 8-4V8M12 12v10M8 6l8 4"/>'
    : id === 'chopper' ? '<path d="M3 4h18M12 4v5M5 17h13M8 17v3M16 17v3M6 20h13M8 9h7l5 6H7L3 11H1M12 9v6"/>'
    : id === 'drone-swarm' || id === 'hunter-swarm' ? '<path d="m12 3 3 3-3 3-3-3 3-3ZM5 11l3 3-3 3-3-3 3-3Zm14 0 3 3-3 3-3-3 3-3ZM12 16l3 3-3 3-3-3 3-3Z"/>'
    : id === 'carpet-bomber' || id === 'tri-pass' ? '<path d="m12 2 2 8 8 4v2l-8-2v5l3 2H7l3-2v-5l-8 2v-2l8-4 2-8Z"/>'
    : id === 'piloted-drone' || id === 'yardhawk' ? '<path d="M8 8l8 8M8 16l8-8"/><circle cx="6" cy="6" r="4"/><circle cx="18" cy="6" r="4"/><circle cx="6" cy="18" r="4"/><circle cx="18" cy="18" r="4"/>'
    : id === 'adrenaline' ? '<path d="M2 12h5l3-8 4 16 3-8h5"/>'
    : '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M12 1v5M12 18v5M1 12h5M18 12h5"/>';
  return `<svg class="streak-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shape}</svg>`;
}

export function killstreakLoadoutPanelMarkup(): string {
  const slots = PASS65_KILLSTREAK_SLOT_DEFINITIONS.map((slot, index) => {
    const options = slot.allowedIds.map((id) => {
      const definition = PASS65_KILLSTREAK_CATALOG.definitions.find((entry) => entry.id === id)!;
      const selected = DEFAULT_KILLSTREAK_LOADOUT.slots[index] === id ? ' selected' : '';
      return `<option value="${id}"${selected}>${escapeHtml(definition.displayName.toUpperCase())} · ${definition.cost} KILLS</option>`;
    }).join('');
    const choices = slot.allowedIds.map(id => {
      const definition = PASS65_KILLSTREAK_CATALOG.definitions.find(entry => entry.id === id)!;
      return `<button type="button" class="streak-choice" data-streak-slot="${slot.slot}" data-streak-choice="${id}" aria-pressed="false">
        ${killstreakIcon(id)}<span>${escapeHtml(definition.displayName)}</span><small>${definition.cost} kills</small><b class="streak-chosen" aria-hidden="true">✓</b>
      </button>`;
    }).join('');
    return `<section class="killstreak-slot-card" data-killstreak-slot-card="${slot.slot}" aria-label="Killstreak slot ${slot.slot}">
      <span>SLOT ${slot.slot} · KEY ${slot.slot + 2}</span>
      <div class="streak-choices">${choices}</div>
      <select data-killstreak-slot="${slot.slot}" aria-label="Killstreak slot ${slot.slot}" aria-describedby="killstreak-detail-${slot.slot}" hidden>${options}</select>
      <small id="killstreak-detail-${slot.slot}" data-killstreak-detail="${slot.slot}"></small>
    </section>`;
  }).join('');
  return `<div id="menu-panel-streaks" class="menu-panel" role="tabpanel" aria-labelledby="menu-tab-streaks" data-menu-panel="streaks" hidden>
    <div class="kit-heading"><div><b>KILLSTREAKS</b><span>Choose one reward in each slot. Earn kills to unlock them during a match.</span></div><button type="button" id="streak-defaults">USE DEFAULTS</button></div>
    <div class="killstreak-loadout-layout">
      <section class="killstreak-equipped-chain" aria-label="Equipped killstreak chain">
        <div class="killstreak-slot-grid">${slots}</div>
        <p id="killstreak-loadout-status" class="killstreak-loadout-status" aria-live="polite">LOADOUT READY · KEYS 3–7 FOLLOW SLOT ORDER</p>
      </section>
    </div>
  </div>`;
}

function renderDetails(root: ParentNode, controller: KillstreakLoadoutController): void {
  controller.selected.slots.forEach((id, index) => {
    const definition = PASS65_KILLSTREAK_CATALOG.definitions.find((entry) => entry.id === id)!;
    const detail = root.querySelector<HTMLElement>(`[data-killstreak-detail="${index + 1}"]`);
    const preview = root.querySelector<HTMLElement>(`[data-killstreak-preview="${index + 1}"]`);
    if (preview) {
      preview.dataset.killstreak = definition.id;
      preview.setAttribute('aria-label', `${definition.displayName} tactical demonstration`);
    }
    if (detail) {
      const description = KILLSTREAK_DESCRIPTIONS[definition.id];
      const activation = definition.id === 'nuke' ? 'ARMED' : definition.activation.toUpperCase();
      detail.textContent = `${activation} · ${killstreakTimingLabel(definition.id)} · ${definition.displayName}${description ? ` — ${description}` : ''}`;
    }
  });
}

export type KillstreakMenuBinding = Readonly<{
  sync: () => void;
  setMatchActive: (active: boolean) => void;
}>;

export function bindKillstreakLoadoutMenu(
  root: ParentNode,
  controller: KillstreakLoadoutController,
  onChange: (id: Pass65KillstreakId, slot: 1 | 2 | 3 | 4 | 5) => void = () => undefined,
): KillstreakMenuBinding {
  const selects = [...root.querySelectorAll<HTMLSelectElement>('[data-killstreak-slot]')];
  const status = root.querySelector<HTMLElement>('#killstreak-loadout-status');
  const choices = [...root.querySelectorAll<HTMLButtonElement>('[data-streak-choice]')];
  const defaults = root.querySelector<HTMLButtonElement>('#streak-defaults');
  let matchActive = false;
  const sync = (): void => {
    const selected = controller.selected;
    selects.forEach((select, index) => {
      select.value = selected.slots[index];
      select.disabled = matchActive;
      // HF-316 owner correction: the sibling heavy slot's current pick is no
      // longer a disabled (silently unpickable) option — choosing it now swaps
      // the two heavy slots via KillstreakLoadoutController.select.
      for (const option of [...select.options]) option.disabled = false;
    });
    choices.forEach(button => {
      button.disabled = matchActive;
      button.setAttribute('aria-pressed', String(selected.slots[Number(button.dataset.streakSlot) - 1] === button.dataset.streakChoice));
    });
    if (defaults) defaults.disabled = matchActive;
    renderDetails(root, controller);
    if (status) status.textContent = matchActive
      ? 'MATCH ACTIVE · SELECTION FROZEN'
      : 'LOADOUT SAVED · KEYS 3–7 FOLLOW SLOT ORDER';
  };
  choices.forEach(button => button.addEventListener('click', () => {
    const select = selects.find(entry => entry.dataset.killstreakSlot === button.dataset.streakSlot);
    if (!select || matchActive) return;
    select.value = button.dataset.streakChoice!;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }));
  defaults?.addEventListener('click', () => {
    if (matchActive) return;
    selects.forEach((select, index) => {
      select.value = DEFAULT_KILLSTREAK_LOADOUT.slots[index];
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
  for (const select of selects) {
    select.addEventListener('change', () => {
      const slot = Number(select.dataset.killstreakSlot) as 1 | 2 | 3 | 4 | 5;
      const id = select.value as Pass65KillstreakId;
      // sync() rewrites the status line, so outcome messages (swap notice or
      // rejection) are applied after it to stay visible.
      let statusOverride: string | null = null;
      try {
        const result = controller.select(slot, id);
        // HF-316 owner correction: a sibling heavy-slot conflict swaps the two
        // picks instead of being blocked; tell the player what moved where.
        if (result.swappedSlot !== null) statusOverride = `SWAPPED WITH SLOT ${result.swappedSlot}`;
        onChange(id, slot);
      } catch (error) {
        statusOverride = error instanceof Error ? error.message.toUpperCase() : 'SELECTION REJECTED';
      }
      sync();
      if (statusOverride !== null && status) status.textContent = statusOverride;
    });
  }
  sync();
  return Object.freeze({
    sync,
    setMatchActive: (active: boolean) => { matchActive = active; sync(); },
  });
}
