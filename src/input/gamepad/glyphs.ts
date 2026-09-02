/**
 * HUD prompt glyph selection (PASS 84 Lane E). Every prompt the HUD shows
 * must name the control in the player's hands: a key/mouse label while the
 * keyboard or mouse was used last, the detected pad family's face glyph while
 * the pad was used last. Glyphs are plain text styled by CSS — no imported
 * glyph fonts or images (repo contract: procedural UI only).
 */

import type { GameplayAction, KeyBindingProfile } from '../../key-bindings';
import { prettyKeyCode } from '../../legacy-pure-helpers';
import { padButtonGlyph, type PadAction, type PadLayout } from './mapping';

export type InputScheme = 'keyboard' | 'gamepad';

/** Prompt actions the HUD names. Mouse-only actions carry no keyboard binding. */
export type PromptAction = PadAction;

const KEYBOARD_ACTION_FOR_PROMPT: Readonly<Partial<Record<PromptAction, GameplayAction>>> = Object.freeze({
  jump: 'jump',
  crouch: 'crouch',
  prone: 'prone',
  reload: 'reload',
  interact: 'interact',
  'switch-weapon': 'weapon-2',
  grenade: 'grenade',
  melee: 'melee',
  sprint: 'sprint',
  'support-activate': 'support-1',
  scoreboard: 'scoreboard',
  emote: 'emote',
});

const MOUSE_LABELS: Readonly<Partial<Record<PromptAction, string>>> = Object.freeze({
  fire: 'LMB',
  ads: 'RMB',
  pause: 'ESC',
  'support-prev': '[',
  'support-next': ']',
});

export type PromptGlyph = Readonly<{
  /** Text to place inside the `<kbd>`. */
  label: string;
  scheme: InputScheme;
  /** Pad face family, or null for keyboard/mouse. */
  family: PadLayout['family'] | null;
  /** Physical button index on the pad, or null. */
  buttonIndex: number | null;
}>;

/** Resolves the label for one prompt action under the active scheme. */
export function promptGlyph(
  action: PromptAction,
  scheme: InputScheme,
  layout: PadLayout | null,
  keyProfile: KeyBindingProfile,
): PromptGlyph {
  if (scheme === 'gamepad' && layout) {
    const index = layout.buttons[action];
    return Object.freeze({ label: padButtonGlyph(layout, index), scheme, family: layout.family, buttonIndex: index });
  }
  const mouse = MOUSE_LABELS[action];
  if (mouse) return Object.freeze({ label: mouse, scheme: 'keyboard', family: null, buttonIndex: null });
  const keyboardAction = KEYBOARD_ACTION_FOR_PROMPT[action];
  const code = keyboardAction ? keyProfile[keyboardAction][0] : undefined;
  return Object.freeze({ label: code ? prettyKeyCode(code) : '—', scheme: 'keyboard', family: null, buttonIndex: null });
}

/**
 * Decides which scheme the HUD should name. The most recently used input wins;
 * a pad that is connected but idle does not take the prompts away from a
 * player who is still on the keyboard.
 */
export function selectInputScheme(
  padConnected: boolean,
  lastPadInputAt: number,
  lastKeyboardMouseInputAt: number,
): InputScheme {
  if (!padConnected) return 'keyboard';
  if (lastPadInputAt <= 0) return 'keyboard';
  return lastPadInputAt >= lastKeyboardMouseInputAt ? 'gamepad' : 'keyboard';
}

/**
 * Label for the prev/next support-cycle pair on a pad ("◀/▶", "LB/RB"), or a
 * dash when the layout leaves both unbound (hat-axis d-pads on non-standard
 * PlayStation/Switch tables).
 */
export function supportCycleGlyph(layout: PadLayout): string {
  const prev = layout.buttons['support-prev'];
  const next = layout.buttons['support-next'];
  if (prev === null && next === null) return '—';
  return `${padButtonGlyph(layout, prev)}/${padButtonGlyph(layout, next)}`;
}

/**
 * Short label for one support-slot key cap. Keyboard: the slot's own key
 * ("3".."7"). Pad: slots are not addressed directly — the highlighted slot
 * carries the ACTIVATE glyph and every other slot shows the prev/next pair
 * that reaches it, so five identical caps never appear.
 */
export function supportSlotGlyph(slotIndex: number, scheme: InputScheme, layout: PadLayout | null, selected = true): string {
  if (scheme === 'gamepad' && layout) {
    return selected ? padButtonGlyph(layout, layout.buttons['support-activate']) : supportCycleGlyph(layout);
  }
  return String(slotIndex + 3);
}

/**
 * The `.support-help` caption under the field-support rows. Names only
 * controls that exist on the pad in hand: a fallback layout with unbound
 * support buttons says so instead of advertising a d-pad the browser does
 * not report.
 */
export function supportHelpCaption(scheme: InputScheme, layout: PadLayout | null): string {
  const keys = 'KEYS 3–7';
  if (!layout) return keys;
  const activate = layout.buttons['support-activate'];
  const bound = activate !== null && (layout.buttons['support-prev'] !== null || layout.buttons['support-next'] !== null);
  const pad = bound
    ? `PAD ${supportCycleGlyph(layout)} SELECT · ${padButtonGlyph(layout, activate)} ACTIVATE`
    : 'PAD SUPPORT BUTTONS UNBOUND · REBIND IN OPTIONS';
  return scheme === 'gamepad' ? `${pad} · ${keys}` : `${keys} · ${pad}`;
}
