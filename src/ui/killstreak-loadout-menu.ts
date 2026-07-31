import {
  PASS65_KILLSTREAK_CATALOG,
  PASS65_KILLSTREAK_SLOT_DEFINITIONS,
  type Pass65KillstreakId,
} from '../killstreak-catalog';
import {
  DEFAULT_KILLSTREAK_LOADOUT,
  type KillstreakLoadoutController,
} from '../killstreak-loadout';
import {
  bindKillstreakDemoRail,
  killstreakDemoRailMarkup,
} from './killstreak-demo-presentation';

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

/**
 * Owner request: plain-language descriptions of what each killstreak IS and
 * DOES, shown in the loadout menu so every reward is self-explanatory.
 */
const KILLSTREAK_DESCRIPTIONS: Readonly<Record<string, string>> = Object.freeze({
  'scout-sweep': 'Reveals every enemy on your minimap for 12s.',
  'adrenaline': '+10% damage and move speed, -10% reload time for 15s.',
  'care-package': 'Calls a supply crate you can capture for a bonus reward.',
  'yardhawk': 'Autonomous turret that hunts and shoots enemies for 15s.',
  'piloted-drone': 'Take first-person control of an armed drone for 30s.',
  'tri-pass': 'Three aircraft strafe a line you place on the map.',
  'carpet-bomber': 'Bombs saturate a target point - hurts everyone, including you.',
  'hunter-swarm': 'Five drones dive on the nearest enemies for 20s.',
  'chopper': 'Gun a chopper from first person; press its key again to take the gun.',
  'drone-swarm': '24 drones patrol and engage enemies for 60s.',
  'nuke': 'Instantly wipes every enemy on the map. The ultimate.',
});

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
      const description = KILLSTREAK_DESCRIPTIONS[definition.id] ?? '';
      detail.textContent = `${definition.activation.toUpperCase()} · ${definition.durationMs === 0 ? 'IMMEDIATE' : `${definition.durationMs / 1_000}s`} · ${definition.displayName}${description ? ` — ${description}` : ''}`;
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
    demo.show(select.value as Pass65KillstreakId);
    root.querySelectorAll<HTMLElement>('[data-killstreak-slot-card]').forEach((card) => {
      card.classList.toggle('is-previewed', Number(card.dataset.killstreakSlotCard) === previewedSlot);
    });
  };
  const sync = (): void => {
    const selected = controller.selected;
    selects.forEach((select, index) => {
      select.value = selected.slots[index];
      select.disabled = matchActive;
      const otherHeavy = index === 2 ? selected.slots[3] : index === 3 ? selected.slots[2] : null;
      for (const option of [...select.options]) option.disabled = otherHeavy !== null && option.value === otherHeavy;
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
      try {
        controller.select(slot, id);
        onChange(id, slot);
      } catch (error) {
        if (status) status.textContent = error instanceof Error ? error.message.toUpperCase() : 'SELECTION REJECTED';
      }
      previewSlot(select);
      sync();
    });
  }
  sync();
  return Object.freeze({
    sync,
    setMatchActive: (active: boolean) => { matchActive = active; sync(); },
  });
}
