import { describe, expect, it } from 'vitest';
import { DEFAULT_KEY_BINDINGS, rebindAction } from '../../key-bindings';
import { promptGlyph, selectInputScheme, supportSlotGlyph } from './glyphs';
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

  it('the most recently used input decides the scheme; an idle pad never steals prompts', () => {
    expect(selectInputScheme(false, 100, 50)).toBe('keyboard');
    expect(selectInputScheme(true, 0, 0)).toBe('keyboard');
    expect(selectInputScheme(true, 100, 50)).toBe('gamepad');
    expect(selectInputScheme(true, 100, 150)).toBe('keyboard');
    expect(selectInputScheme(true, 150, 150)).toBe('gamepad');
  });
});
