import { describe, expect, it } from 'vitest';
import { DEFAULT_KEY_BINDINGS, rebindAction } from '../../key-bindings';
import { promptGlyph, selectInputScheme, strikeCancelGlyph, supportCycleGlyph, supportHelpCaption, supportSlotGlyph } from './glyphs';
import { applyHudInputScheme, applyStrikeTargetingCancelGlyph, STRIKE_HELP_KBD_SELECTOR } from './hud-glyphs';
import { detectPadLayout } from './mapping';

describe('prompt glyph selection', () => {
  const xbox = detectPadLayout('Xbox Wireless Controller 045e', 'standard');
  const ps = detectPadLayout('Wireless Controller 054c', 'standard');
  const sw = detectPadLayout('Pro Controller 057e', 'standard');

  it('names keys and mouse buttons under the keyboard scheme, honouring rebinds', () => {
    expect(promptGlyph('interact', 'keyboard', xbox, DEFAULT_KEY_BINDINGS)).toMatchObject({ label: 'F', scheme: 'keyboard', family: null });
    expect(promptGlyph('fire', 'keyboard', null, DEFAULT_KEY_BINDINGS).label).toBe('LMB');
    expect(promptGlyph('ads', 'keyboard', null, DEFAULT_KEY_BINDINGS).label).toBe('RMB');
    expect(promptGlyph('reload', 'keyboard', null, DEFAULT_KEY_BINDINGS).label).toBe('R');
    const rebound = rebindAction(DEFAULT_KEY_BINDINGS, 'interact', 'KeyE');
    expect(rebound).not.toBeNull();
    expect(promptGlyph('interact', 'keyboard', null, rebound!).label).toBe('E');
  });

  it('names the detected pad family face under the gamepad scheme', () => {
    expect(promptGlyph('interact', 'gamepad', xbox, DEFAULT_KEY_BINDINGS)).toMatchObject({ label: 'X', family: 'xbox', buttonIndex: 2 });
    expect(promptGlyph('interact', 'gamepad', ps, DEFAULT_KEY_BINDINGS)).toMatchObject({ label: '□', family: 'playstation', buttonIndex: 2 });
    expect(promptGlyph('interact', 'gamepad', sw, DEFAULT_KEY_BINDINGS)).toMatchObject({ label: 'Y', family: 'nintendo' });
    expect(promptGlyph('fire', 'gamepad', xbox, DEFAULT_KEY_BINDINGS).label).toBe('RT');
    expect(promptGlyph('fire', 'gamepad', ps, DEFAULT_KEY_BINDINGS).label).toBe('R2');
    expect(promptGlyph('ads', 'gamepad', sw, DEFAULT_KEY_BINDINGS).label).toBe('ZL');
    // Unbound on the fallback table → visible dash, not a crash.
    const psDirectInput = detectPadLayout('Wireless Controller 054c', '', 6);
    expect(promptGlyph('support-activate', 'gamepad', psDirectInput, DEFAULT_KEY_BINDINGS)).toMatchObject({ label: '—', buttonIndex: null });
  });

  it('falls back to keyboard labels when asked for gamepad glyphs with no pad', () => {
    expect(promptGlyph('interact', 'gamepad', null, DEFAULT_KEY_BINDINGS).scheme).toBe('keyboard');
    expect(supportSlotGlyph(0, 'keyboard', xbox)).toBe('3');
    expect(supportSlotGlyph(4, 'keyboard', null)).toBe('7');
    expect(supportSlotGlyph(2, 'gamepad', xbox)).toBe('▲');
  });

  // PASS 84 skeptic finding: five support caps all rendered the ACTIVATE glyph
  // on a pad, so the HUD showed five identical keys for five different slots.
  it('gives the highlighted support slot the ACTIVATE glyph and the others the cycle pair', () => {
    expect(supportSlotGlyph(0, 'gamepad', xbox, true)).toBe('▲');
    expect(supportSlotGlyph(0, 'gamepad', xbox, false)).toBe('◀/▶');
    expect(supportCycleGlyph(xbox)).toBe('◀/▶');
    // Keyboard caps keep their own slot number whatever the highlight says.
    expect(supportSlotGlyph(3, 'keyboard', xbox, false)).toBe('6');
  });

  // PASS 84 skeptic finding: the caption hardcoded d-pad prompts that are
  // unbound on exactly the non-standard Bluetooth pads the fallbacks exist for.
  it('names only support controls the pad in hand actually has', () => {
    expect(supportHelpCaption('keyboard', null)).toBe('KEYS 3–7');
    expect(supportHelpCaption('keyboard', xbox)).toBe('KEYS 3–7 · PAD ◀/▶ SELECT · ▲ ACTIVATE');
    expect(supportHelpCaption('gamepad', xbox)).toBe('PAD ◀/▶ SELECT · ▲ ACTIVATE · KEYS 3–7');
    // A fallback table with a hat-axis d-pad leaves the support actions unbound.
    const psDirectInput = detectPadLayout('Wireless Controller 054c', '', 6);
    expect(psDirectInput.buttons['support-activate']).toBeNull();
    expect(supportHelpCaption('gamepad', psDirectInput)).toBe('PAD SUPPORT BUTTONS UNBOUND · REBIND IN OPTIONS · KEYS 3–7');
  });

  it('the most recently used input decides the scheme; an idle pad never steals prompts', () => {
    expect(selectInputScheme(false, 100, 50)).toBe('keyboard');
    expect(selectInputScheme(true, 0, 0)).toBe('keyboard');
    expect(selectInputScheme(true, 100, 50)).toBe('gamepad');
    expect(selectInputScheme(true, 100, 150)).toBe('keyboard');
    expect(selectInputScheme(true, 150, 150)).toBe('gamepad');
  });
});

// PASS 84 skeptic finding 2026-09-02: the strike-map overlay still hardcoded
// <kbd>ESC</kbd> and was in no glyph target list, so a pad player was told to
// press a key he does not have. legacy-main rebuilds that caption from string
// literals on every map draw, which is why it is re-glyphed from the draw.
describe('strike-map targeting cancel glyph', () => {
  const xbox = detectPadLayout('Xbox Wireless Controller 045e', 'standard');
  const ps = detectPadLayout('Wireless Controller 054c', 'standard');

  it('names the control legacy-main actually listens to, per scheme and mode', () => {
    // Tactical map: Escape on a keyboard, the pad's pause button on a pad.
    expect(strikeCancelGlyph('map', 'keyboard', null, DEFAULT_KEY_BINDINGS).label).toBe('ESC');
    expect(strikeCancelGlyph('map', 'gamepad', xbox, DEFAULT_KEY_BINDINGS)).toMatchObject({ label: 'MENU', family: 'xbox' });
    // In-world Care Package crosshair: RMB cancels, and on a pad it is crouch.
    expect(strikeCancelGlyph('point', 'keyboard', null, DEFAULT_KEY_BINDINGS).label).toBe('RMB');
    expect(strikeCancelGlyph('point', 'gamepad', xbox, DEFAULT_KEY_BINDINGS).label).toBe('B');
    expect(strikeCancelGlyph('point', 'gamepad', ps, DEFAULT_KEY_BINDINGS)).toMatchObject({ label: '○', family: 'playstation' });
    // A pad claimed by the gamepad scheme with no detected layout falls back to
    // the mouse label rather than inventing a button.
    expect(strikeCancelGlyph('point', 'gamepad', null, DEFAULT_KEY_BINDINGS).label).toBe('RMB');
  });

  it('rewrites the caption cap in the DOM for the scheme in hand', () => {
    const cap = {
      textContent: 'ESC',
      classList: { pad: false, toggle(_name: string, on: boolean) { this.pad = on; } },
      dataset: {} as Record<string, string | undefined>,
    };
    const doc = {
      documentElement: { dataset: {} as Record<string, string | undefined> },
      querySelectorAll: () => [],
      querySelector: (selector: string) => (selector === STRIKE_HELP_KBD_SELECTOR ? cap : null),
    } as unknown as Document;

    applyHudInputScheme(doc, { scheme: 'keyboard', layout: null, keyProfile: DEFAULT_KEY_BINDINGS });
    applyStrikeTargetingCancelGlyph(doc, 'map');
    expect(cap.textContent).toBe('ESC');
    expect(cap.classList.pad).toBe(false);
    expect(cap.dataset.family).toBeUndefined();

    applyHudInputScheme(doc, { scheme: 'gamepad', layout: xbox, keyProfile: DEFAULT_KEY_BINDINGS });
    applyStrikeTargetingCancelGlyph(doc, 'map');
    expect(cap.textContent).toBe('MENU');
    expect(cap.classList.pad).toBe(true);
    expect(cap.dataset).toMatchObject({ family: 'xbox', unbound: 'false' });

    applyStrikeTargetingCancelGlyph(doc, 'point');
    expect(cap.textContent).toBe('B');

    // Back to the keyboard and every pad attribute is removed again.
    applyHudInputScheme(doc, { scheme: 'keyboard', layout: null, keyProfile: DEFAULT_KEY_BINDINGS });
    applyStrikeTargetingCancelGlyph(doc, 'point');
    expect(cap.textContent).toBe('RMB');
    expect(cap.dataset.family).toBeUndefined();
    expect(cap.dataset.unbound).toBeUndefined();
  });
});
