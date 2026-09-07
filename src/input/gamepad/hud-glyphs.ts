/**
 * Applies the active input scheme to every HUD prompt cap (PASS 84 Lane E).
 * The legacy HUD markup keeps its `<kbd>` elements; this module only rewrites
 * their text and data attributes, so layout, lifecycle and the surface
 * registry are untouched. Prompt sentences built at runtime in legacy-main
 * ask `interactLabel()` for the right word instead of hardcoding "F".
 */

import type { KeyBindingProfile } from '../../key-bindings';
import {
  promptGlyph,
  strikeCancelGlyph,
  supportHelpCaption,
  supportSlotGlyph,
  type InputScheme,
  type PromptAction,
  type StrikeTargetingMode,
} from './glyphs';
import type { PadLayout } from './mapping';

export type HudGlyphTarget = Readonly<{
  selector: string;
  action: PromptAction;
  /** Accessible name for the cap's enclosing group, phrased for the active control. */
  ariaLabel?: (label: string, scheme: InputScheme) => string;
}>;

/** Every static `<kbd>` the HUD shows and the action it names. */
export const HUD_GLYPH_TARGETS: readonly HudGlyphTarget[] = Object.freeze([
  Object.freeze({ selector: '#support-interaction-prompt kbd', action: 'interact' }),
  Object.freeze({ selector: '#pickup-prompt kbd', action: 'interact' }),
  Object.freeze({
    selector: '#gunner-gun-control kbd',
    action: 'fire',
    ariaLabel: (label: string, scheme: InputScheme) => (scheme === 'gamepad' ? `Gun on pad ${label}` : 'Gun on left mouse button'),
  }),
  Object.freeze({
    selector: '#gunner-missile-status kbd',
    action: 'ads',
    ariaLabel: (label: string, scheme: InputScheme) => (scheme === 'gamepad' ? `Missiles on pad ${label}` : 'Missiles on right mouse button'),
  }),
]);

/** Selector for the caption under the field-support rows. */
export const SUPPORT_HELP_SELECTOR = '#support-block .support-help';

export type HudGlyphState = Readonly<{
  scheme: InputScheme;
  layout: PadLayout | null;
  keyProfile: KeyBindingProfile;
}>;

let current: HudGlyphState = Object.freeze({ scheme: 'keyboard', layout: null, keyProfile: {} as KeyBindingProfile });

function decorate(cap: HTMLElement, target: HudGlyphTarget, state: HudGlyphState): void {
  const glyph = promptGlyph(target.action, state.scheme, state.layout, state.keyProfile);
  cap.textContent = glyph.label;
  if (target.ariaLabel) {
    const group = cap.closest<HTMLElement>('[role="group"]') ?? cap.parentElement;
    group?.setAttribute('aria-label', target.ariaLabel(glyph.label, glyph.scheme));
  }
  cap.classList.toggle('pad-glyph', glyph.scheme === 'gamepad');
  if (glyph.scheme === 'gamepad' && glyph.family) {
    cap.dataset.family = glyph.family;
    cap.dataset.button = glyph.buttonIndex === null ? '' : String(glyph.buttonIndex);
    cap.dataset.unbound = glyph.buttonIndex === null ? 'true' : 'false';
  } else {
    delete cap.dataset.family;
    delete cap.dataset.button;
    delete cap.dataset.unbound;
  }
}

/** Rewrites every HUD cap for the given scheme. Idempotent; cheap enough to call on every change. */
export function applyHudInputScheme(doc: Document, state: HudGlyphState): void {
  current = state;
  doc.documentElement.dataset.inputScheme = state.scheme;
  if (state.layout) doc.documentElement.dataset.padFaces = state.layout.family;
  else delete doc.documentElement.dataset.padFaces;
  for (const target of HUD_GLYPH_TARGETS) {
    doc.querySelectorAll<HTMLElement>(target.selector).forEach((cap) => decorate(cap, target, state));
  }
  doc.querySelectorAll<HTMLElement>('.support-list [data-support-slot] kbd').forEach((cap) => {
    const row = cap.closest<HTMLElement>('[data-support-slot]');
    const slot = Number(row?.dataset.supportSlot ?? '1') - 1;
    const selected = row?.classList.contains('controller-selected') ?? false;
    cap.textContent = supportSlotGlyph(slot, state.scheme, state.layout, selected);
    cap.classList.toggle('pad-glyph', state.scheme === 'gamepad' && state.layout !== null);
    if (state.scheme === 'gamepad' && state.layout) {
      cap.dataset.family = state.layout.family;
      cap.dataset.button = selected ? String(state.layout.buttons['support-activate'] ?? '') : '';
    } else {
      delete cap.dataset.family;
      delete cap.dataset.button;
    }
  });
  doc.querySelectorAll<HTMLElement>(SUPPORT_HELP_SELECTOR).forEach((caption) => {
    caption.textContent = supportHelpCaption(state.scheme, state.layout);
  });
}

/** Selector for the `<kbd>` inside the strike/support targeting caption. */
export const STRIKE_HELP_KBD_SELECTOR = '#strike-target-help kbd';

/**
 * Re-glyphs the strike-map caption's cancel cap. legacy-main rebuilds that
 * caption from string literals on every map draw, so this is called from the
 * draw rather than only when the scheme changes.
 */
export function applyStrikeTargetingCancelGlyph(doc: Document, mode: StrikeTargetingMode): void {
  const cap = doc.querySelector<HTMLElement>(STRIKE_HELP_KBD_SELECTOR);
  if (!cap) return;
  const glyph = strikeCancelGlyph(mode, current.scheme, current.layout, current.keyProfile);
  cap.textContent = glyph.label;
  cap.classList.toggle('pad-glyph', glyph.scheme === 'gamepad');
  if (glyph.scheme === 'gamepad' && glyph.family) {
    cap.dataset.family = glyph.family;
    cap.dataset.button = glyph.buttonIndex === null ? '' : String(glyph.buttonIndex);
    cap.dataset.unbound = glyph.buttonIndex === null ? 'true' : 'false';
  } else {
    delete cap.dataset.family;
    delete cap.dataset.button;
    delete cap.dataset.unbound;
  }
}

/** The word a runtime-built prompt sentence should use for one action ("F", "X", "□", "LMB"). */
export function promptLabel(action: PromptAction): string {
  return promptGlyph(action, current.scheme, current.layout, current.keyProfile).label;
}

export function interactLabel(): string {
  return promptLabel('interact');
}

export function currentHudGlyphState(): HudGlyphState {
  return current;
}
