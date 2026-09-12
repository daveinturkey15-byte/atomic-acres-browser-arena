import { describe, expect, it } from 'vitest';
import {
  GAMEPAD_BINDINGS_STORAGE_KEY,
  PAD_ACTIONS,
  clearPadBindingProfile,
  detectPadLayout,
  effectivePadLayout,
  identifyPad,
  isDefaultPadBindings,
  padButtonGlyph,
  rebindPadAction,
  resolvePadBindingProfile,
  savePadBindingProfile,
} from './mapping';

class FakeStorage implements Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  setItem(key: string, value: string): void { this.data.set(key, value); }
  removeItem(key: string): void { this.data.delete(key); }
}

describe('gamepad mapping tables', () => {
  it('identifies the common Bluetooth pad families from their id strings', () => {
    expect(identifyPad('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)')).toMatchObject({ family: 'xbox', model: 'xbox' });
    expect(identifyPad('Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)')).toMatchObject({ family: 'playstation', model: 'dualshock' });
    expect(identifyPad('DualSense Wireless Controller (Vendor: 054c Product: 0ce6)')).toMatchObject({ family: 'playstation', model: 'dualsense' });
    expect(identifyPad('Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)')).toMatchObject({ family: 'nintendo', model: 'switch-pro' });
    expect(identifyPad('USB Gamepad (Vendor: 0079 Product: 0011)')).toMatchObject({ family: 'generic', model: 'generic' });
    expect(identifyPad('')).toMatchObject({ family: 'generic' });
  });

  it('gives every standard-mapped pad the same semantic indices and family-specific glyphs', () => {
    const xbox = detectPadLayout('Xbox Wireless Controller', 'standard');
    const ps = detectPadLayout('Wireless Controller 054c', 'standard');
    const sw = detectPadLayout('Pro Controller 057e', 'standard');
    expect(xbox.buttons).toEqual(ps.buttons);
    expect(xbox.buttons).toEqual(sw.buttons);
    expect(xbox.axes).toEqual({ moveX: 0, moveY: 1, lookX: 2, lookY: 3 });
    expect(padButtonGlyph(xbox, xbox.buttons.jump)).toBe('A');
    expect(padButtonGlyph(ps, ps.buttons.jump)).toBe('✕');
    expect(padButtonGlyph(sw, sw.buttons.jump)).toBe('B');
    expect(padButtonGlyph(ps, ps.buttons.interact)).toBe('□');
    expect(padButtonGlyph(xbox, xbox.buttons.fire)).toBe('RT');
    expect(padButtonGlyph(ps, ps.buttons.fire)).toBe('R2');
  });

  it('binds every action on the standard layout except where a layout deliberately leaves it open', () => {
    const standard = detectPadLayout('Xbox', 'standard');
    for (const action of PAD_ACTIONS) expect(standard.buttons[action], action).not.toBeNull();
    // Fire/ADS on the triggers, reload/interact share the left face button.
    expect(standard.buttons.fire).toBe(7);
    expect(standard.buttons.ads).toBe(6);
    expect(standard.buttons.reload).toBe(standard.buttons.interact);
  });

  it('falls back to a non-standard table for DirectInput PlayStation pads with the right stick on axis 5', () => {
    const layout = detectPadLayout('Wireless Controller (Vendor: 054c Product: 05c4)', '', 6);
    expect(layout.layoutId).toBe('playstation-directinput');
    expect(layout.axes.lookY).toBe(5);
    expect(padButtonGlyph(layout, layout.buttons.jump)).toBe('✕');
    expect(padButtonGlyph(layout, layout.buttons.interact)).toBe('□');
    expect(layout.buttons['support-activate']).toBeNull();
    // Four-axis reports keep the vertical look on axis 3.
    expect(detectPadLayout('Wireless Controller 054c', '', 4).axes.lookY).toBe(3);
  });

  it('keeps the Switch and generic DirectInput fallbacks usable with the standard semantic vocabulary', () => {
    const sw = detectPadLayout('Pro Controller', '', 4);
    expect(sw.layoutId).toBe('switch-nonstandard');
    expect(padButtonGlyph(sw, sw.buttons.jump)).toBe('B');
    const generic = detectPadLayout('Logitech Dual Action', '', 4);
    expect(generic.layoutId).toBe('directinput-generic');
    expect(generic.buttons.jump).toBe(1);
    expect(padButtonGlyph(generic, generic.buttons.jump)).toBe('1');
    // Unknown-mapping Xbox-family pads keep the standard order.
    expect(detectPadLayout('Xbox 360 Controller (XInput STANDARD GAMEPAD)', '', 4).layoutId).toBe('standard');
  });

  it('labels unbound and out-of-table buttons safely', () => {
    const layout = detectPadLayout('Xbox', 'standard');
    expect(padButtonGlyph(layout, null)).toBe('—');
    expect(padButtonGlyph(null, 3)).toBe('—');
    expect(padButtonGlyph(layout, 25)).toBe('B25');
  });
});

describe('gamepad remap profile', () => {
  const layout = detectPadLayout('Xbox', 'standard');

  it('resolves an empty profile when nothing or garbage is stored', () => {
    const storage = new FakeStorage();
    expect(resolvePadBindingProfile(storage)).toEqual({});
    storage.setItem(GAMEPAD_BINDINGS_STORAGE_KEY, '{not json');
    expect(resolvePadBindingProfile(storage)).toEqual({});
    storage.setItem(GAMEPAD_BINDINGS_STORAGE_KEY, JSON.stringify({ version: 2, layouts: { standard: { jump: 3 } } }));
    expect(resolvePadBindingProfile(storage)).toEqual({});
    storage.setItem(GAMEPAD_BINDINGS_STORAGE_KEY, JSON.stringify({ version: 1, layouts: { standard: { jump: 'A', melee: 99, grenade: 5.5, fire: 2 } } }));
    expect(resolvePadBindingProfile(storage)).toEqual({ standard: { fire: 2 } });
  });

  it('rebinds, rejects conflicts, allows the reload/interact pair, and round-trips through storage', () => {
    const swapped = rebindPadAction({}, layout, 'jump', 3);
    expect(swapped.ok).toBe(false);
    if (!swapped.ok) expect(swapped).toMatchObject({ reason: 'conflict', conflictsWith: 'switch-weapon' });
    const free = rebindPadAction({}, layout, 'emote', 16);
    expect(free.ok).toBe(true);
    if (!free.ok) return;
    expect(free.profile).toEqual({ standard: { emote: 16 } });
    const effective = effectivePadLayout(layout, free.profile);
    expect(effective.buttons.emote).toBe(16);
    expect(isDefaultPadBindings(layout, free.profile)).toBe(false);
    // Sharing between reload and interact is by design.
    const shared = rebindPadAction(free.profile, layout, 'interact', layout.buttons.reload!);
    expect(shared.ok).toBe(true);
    // Rebinding back to the default removes the override entirely.
    const restored = rebindPadAction(free.profile, layout, 'emote', 11);
    expect(restored.ok).toBe(true);
    if (restored.ok) expect(restored.profile).toEqual({});
    expect(rebindPadAction({}, layout, 'jump', -1).ok).toBe(false);
    expect(rebindPadAction({}, layout, 'jump', 2.5).ok).toBe(false);

    const storage = new FakeStorage();
    expect(savePadBindingProfile(free.profile, storage)).toBe(true);
    expect(resolvePadBindingProfile(storage)).toEqual(free.profile);
    clearPadBindingProfile(storage);
    expect(resolvePadBindingProfile(storage)).toEqual({});
  });

  it('keeps overrides scoped to the layout they were made on', () => {
    const psLayout = detectPadLayout('Wireless Controller 054c', '', 6);
    const result = rebindPadAction({}, psLayout, 'prone', 12);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(effectivePadLayout(layout, result.profile).buttons.prone).toBe(13);
    expect(effectivePadLayout(psLayout, result.profile).buttons.prone).toBe(12);
    expect(isDefaultPadBindings(layout, result.profile)).toBe(true);
  });
});
