/**
 * Applies the active input scheme to every HUD prompt cap (PASS 84 Lane E).
 * The legacy HUD markup keeps its `<kbd>` elements; this module only rewrites
 * their text and data attributes, so layout, lifecycle and the surface
 * registry are untouched. Prompt sentences built at runtime in legacy-main
 * ask `interactLabel()` for the right word instead of hardcoding "F".
 */

import type { KeyBindingProfile } from '../../key-bindings';
import { promptGlyph, supportSlotGlyph, type InputScheme, type PromptAction } from './glyphs';
import type { PadLayout } from './mapping';

export type HudGlyphTarget = Readonly<{ selector: string; action: PromptAction }>;

/** Every static `<kbd>` the HUD shows and the action it names. */
export const HUD_GLYPH_TARGETS: readonly HudGlyphTarget[] = Object.freeze([
  Object.freeze({ selector: '#support-interaction-prompt kbd', action: 'interact' }),
  Object.freeze({ selector: '#pickup-prompt kbd', action: 'interact' }),
  Object.freeze({ selector: '#gunner-gun-control kbd', action: 'fire' }),
  Object.freeze({ selector: '#gunner-missile-status kbd', action: 'ads' }),
]);

export type HudGlyphState = Readonly<{
  scheme: InputScheme;
  layout: PadLayout | null;
  keyProfile: KeyBindingProfile;
}>;

let current: HudGlyphState = Object.freeze({ scheme: 'keyboard', layout: null, keyProfile: {} as KeyBindingProfile });

function decorate(cap: HTMLElement, action: PromptAction, state: HudGlyphState): void {
  const glyph = promptGlyph(action, state.scheme, state.layout, state.keyProfile);
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

/** Rewrites every HUD cap for the given scheme. Idempotent; cheap enough to call on every change. */
export function applyHudInputScheme(doc: Document, state: HudGlyphState): void {
  current = state;
  doc.documentElement.dataset.inputScheme = state.scheme;
  if (state.layout) doc.documentElement.dataset.padFaces = state.layout.family;
  else delete doc.documentElement.dataset.padFaces;
  for (const target of HUD_GLYPH_TARGETS) {
    doc.querySelectorAll<HTMLElement>(target.selector).forEach((cap) => decorate(cap, target.action, state));
  }
  doc.querySelectorAll<HTMLElement>('.support-list [data-support-slot] kbd').forEach((cap) => {
    const slot = Number(cap.closest<HTMLElement>('[data-support-slot]')?.dataset.supportSlot ?? '1') - 1;
    cap.textContent = supportSlotGlyph(slot, state.scheme, state.layout);
    cap.classList.toggle('pad-glyph', state.scheme === 'gamepad' && state.layout !== null);
    if (state.scheme === 'gamepad' && state.layout) {
      cap.dataset.family = state.layout.family;
      cap.dataset.button = String(state.layout.buttons['support-activate'] ?? '');
    } else {
      delete cap.dataset.family;
      delete cap.dataset.button;
    }
  });
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
