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
import {
  bindKillstreakDemoRail,
  killstreakDemoRailMarkup,
} from './killstreak-demo-presentation';

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

export function killstreakLoadoutPanelMarkup(): string {
  const slots = PASS65_KILLSTREAK_SLOT_DEFINITIONS.map((slot, index) => {
    const options = slot.allowedIds.map((id) => {
      const definition = PASS65_KILLSTREAK_CATALOG.definitions.find((entry) => entry.id === id)!;
      const selected = DEFAULT_KILLSTREAK_LOADOUT.slots[index] === id ? ' selected' : '';
      return `<option value="${id}"${selected}>${escapeHtml(definition.displayName.toUpperCase())} · ${definition.cost} KILLS</option>`;
    }).join('');
    const family = slot.slot === 1 ? 'RECON / MOMENTUM / PACKAGE'
      : slot.slot === 2 ? 'HUNTER / PILOT'
        : slot.slot <= 4 ? 'HEAVY SUPPORT · DISTINCT PICKS'
          : 'ULTIMATE · ONE OR THE OTHER';
    return `<label class="killstreak-slot-card" data-killstreak-slot-card="${slot.slot}">
      <span>SLOT ${slot.slot} · KEY ${slot.slot + 2}</span>
      <strong>${family}</strong>
      <select data-killstreak-slot="${slot.slot}" aria-label="Killstreak slot ${slot.slot}" aria-describedby="killstreak-detail-${slot.slot}">${options}</select>
      <small id="killstreak-detail-${slot.slot}" data-killstreak-detail="${slot.slot}"></small>
    </label>`;
  }).join('');
  return `<div id="menu-panel-streaks" class="menu-panel" role="tabpanel" aria-labelledby="menu-tab-streaks" data-menu-panel="streaks" hidden>
    <div class="kit-heading"><div><b>KILLSTREAKS</b><span>Five family-constrained rewards. Selection locks when the match starts.</span></div><small>Slots 3 and 4 must be different · Nuke and Drone Swarm share slot 5.</small></div>
    <div class="killstreak-loadout-layout">
      <section class="killstreak-equipped-chain" aria-label="Equipped killstreak chain">
        <div class="killstreak-slot-grid">${slots}</div>
        <p id="killstreak-loadout-status" class="killstreak-loadout-status" aria-live="polite">LOADOUT READY · KEYS 3–7 FOLLOW SLOT ORDER</p>
      </section>
      ${killstreakDemoRailMarkup(DEFAULT_KILLSTREAK_LOADOUT.slots[0])}
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
  const demo = bindKillstreakDemoRail(root, controller.selected.slots[0]);
  let matchActive = false;
  let previewedSlot = 1;
  const previewSlot = (select: HTMLSelectElement): void => {
    previewedSlot = Number(select.dataset.killstreakSlot);
    demo.show(select.value as SelectableKillstreakId);
    root.querySelectorAll<HTMLElement>('[data-killstreak-slot-card]').forEach((card) => {
      card.classList.toggle('is-previewed', Number(card.dataset.killstreakSlotCard) === previewedSlot);
    });
  };
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
    renderDetails(root, controller);
    const activePreview = selects.find((select) => Number(select.dataset.killstreakSlot) === previewedSlot) ?? selects[0];
    if (activePreview) previewSlot(activePreview);
    if (status) status.textContent = matchActive
      ? 'MATCH ACTIVE · SELECTION FROZEN'
      : 'LOADOUT SAVED · KEYS 3–7 FOLLOW SLOT ORDER';
  };
  for (const select of selects) {
    const card = select.closest<HTMLElement>('[data-killstreak-slot-card]');
    card?.addEventListener('pointerenter', () => previewSlot(select));
    card?.addEventListener('focusin', () => previewSlot(select));
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
      previewSlot(select);
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
