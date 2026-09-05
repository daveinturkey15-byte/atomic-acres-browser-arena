/**
 * PASS 95 finish round, item 3 - dirty-flagged HUD writers.
 *
 * Static profile (numbers in docs/evidence/pass95/hud-menu-polish/REPORT.md,
 * "Finish round"): `updateHud` in `src/legacy-main.ts` runs at 10 Hz and
 * rewrites ~20 HUD text/style values every tick even when nothing changed -
 * ammo, health, labels, timer, objective, scores - plus a full
 * `#network-strip` innerHTML rebuild and one unguarded `--spread`
 * custom-property write on `#crosshair` (unregistered, therefore inheriting,
 * spent in four layout properties under a `transition: left/right/top/bottom`
 * - the F1 mechanism). Each write invalidates style for the HUD subtree
 * whether or not the value moved, which is exactly the shape of the residual
 * `recalcStyleCountPerFrame` 1.65 with ~2.2 ms of recalc left after perf lane
 * 5 bounded the sway channel.
 *
 * These helpers change nothing about WHAT is displayed: they skip only the
 * DOM write when the value is already there. All writers of one cached
 * element must go through the helper (or derive from the same state the 10 Hz
 * tick reads), otherwise a direct write can desynchronise the cache - the
 * match-start sites for #match-mode-label, #objective, #aqua-label and
 * #coral-label were converted for exactly this reason.
 */
const lastTextByElement = new WeakMap<Element, string>();

export function setHudText(element: HTMLElement, value: string): void {
  if (lastTextByElement.get(element) !== value) {
    lastTextByElement.set(element, value);
    element.textContent = value;
  }
}

const lastStyleByElement = new WeakMap<Element, Map<string, string>>();

export function setHudStyle(element: HTMLElement, property: string, value: string): void {
  let perElement = lastStyleByElement.get(element);
  if (perElement === undefined) {
    perElement = new Map<string, string>();
    lastStyleByElement.set(element, perElement);
  }
  if (perElement.get(property) !== value) {
    perElement.set(property, value);
    element.style.setProperty(property, value);
  }
}

export type RailgunStatusInput = {
  roundsRemaining: number;
  weapon: string;
  rechamberRemainingMs: number;
  adsResetRequired: boolean;
  railgunName: string;
};

/**
 * The railgun status line, hoisted out of `updateHud` so `legacy-main.ts`
 * stays under its size ratchet. Pure: same inputs, same string, no DOM. The
 * caller keeps owning `hidden`, exactly as before.
 */
export function railgunStatusCopy(input: RailgunStatusInput): string {
  if (input.roundsRemaining <= 0) return `${input.railgunName} DEPLETED · NO RESUPPLY`;
  if (input.weapon !== 'railgun') {
    return `SIDEARM ACTIVE · ${input.railgunName} ${input.roundsRemaining} ROUNDS`;
  }
  if (input.rechamberRemainingMs > 0) {
    return `${input.railgunName} RECHAMBER ${Math.ceil(input.rechamberRemainingMs / 100) / 10}s`;
  }
  if (input.adsResetRequired) return `${input.railgunName} RELEASE ADS`;
  return `${input.railgunName} THERMAL READY`;
}
