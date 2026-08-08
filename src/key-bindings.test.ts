import { describe, expect, it } from 'vitest';
import {
  DEFAULT_KEY_BINDINGS,
  GAMEPLAY_ACTIONS,
  actionHeld,
  actionMatchesCode,
  clearKeyBindingProfile,
  isDefaultProfile,
  rebindAction,
  resolveKeyBindingProfile,
  saveKeyBindingProfile,
  supportSlotForCode,
} from './key-bindings';

class FakeStorage implements Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  private readonly data = new Map<string, string>();
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  setItem(key: string, value: string): void { this.data.set(key, value); }
  removeItem(key: string): void { this.data.delete(key); }
}

describe('key-bindings', () => {
  it('resolves the default profile when nothing is stored', () => {
    expect(resolveKeyBindingProfile(new FakeStorage())).toBe(DEFAULT_KEY_BINDINGS);
  });

  it('keeps the frozen defaults immutable', () => {
    expect(() => {
      // @ts-expect-error frozen object cannot be mutated
      DEFAULT_KEY_BINDINGS['move-forward'] = ['KeyQ'];
    }).toThrow();
  });

  it('round-trips a custom profile through storage', () => {
    const storage = new FakeStorage();
    const rebound = rebindAction(DEFAULT_KEY_BINDINGS, 'move-forward', 'KeyQ');
    expect(rebound).not.toBeNull();
    expect(saveKeyBindingProfile(rebound!, storage)).toBe(true);
    const restored = resolveKeyBindingProfile(storage);
    expect(restored['move-forward']).toEqual(['KeyQ']);
    expect(restored['move-backward']).toEqual(['KeyS']);
    expect(isDefaultProfile(restored)).toBe(false);
  });

  it('rejects a rebind that conflicts with another action', () => {
    const next = rebindAction(DEFAULT_KEY_BINDINGS, 'jump', 'KeyW');
    expect(next).toBeNull();
  });

  it('rejects invalid key codes', () => {
    expect(rebindAction(DEFAULT_KEY_BINDINGS, 'jump', 'not a code!')).toBeNull();
  });

  it('falls back to defaults for corrupt stored profiles', () => {
    const storage = new FakeStorage();
    storage.setItem('atomic-acres.key-bindings.v1', '{not-json');
    expect(resolveKeyBindingProfile(storage)).toBe(DEFAULT_KEY_BINDINGS);
    storage.setItem('atomic-acres.key-bindings.v1', JSON.stringify({ 'move-forward': [] }));
    expect(resolveKeyBindingProfile(storage)).toBe(DEFAULT_KEY_BINDINGS);
  });

  it('clearKeyBindingProfile restores the default profile', () => {
    const storage = new FakeStorage();
    const rebound = rebindAction(DEFAULT_KEY_BINDINGS, 'reload', 'KeyE');
    saveKeyBindingProfile(rebound!, storage);
    expect(resolveKeyBindingProfile(storage)).not.toBe(DEFAULT_KEY_BINDINGS);
    clearKeyBindingProfile(storage);
    expect(resolveKeyBindingProfile(storage)).toBe(DEFAULT_KEY_BINDINGS);
  });

  it('actionHeld and actionMatchesCode consult the profile', () => {
    const profile = rebindAction(DEFAULT_KEY_BINDINGS, 'sprint', 'ShiftLeft')!;
    expect(actionMatchesCode('sprint', 'ShiftLeft', profile)).toBe(true);
    expect(actionHeld('sprint', new Set(['ShiftLeft']), profile)).toBe(true);
    expect(actionHeld('sprint', new Set(['KeyW']), profile)).toBe(false);
  });

  it('maps support keys to compact slots for defaults and custom bindings', () => {
    expect(['Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7'].map((code) => (
      supportSlotForCode(code, DEFAULT_KEY_BINDINGS)
    ))).toEqual([0, 1, 2, 3, 4]);
    expect(supportSlotForCode('Digit2', DEFAULT_KEY_BINDINGS)).toBeNull();

    const rebound = rebindAction(DEFAULT_KEY_BINDINGS, 'support-3', 'KeyH');
    expect(rebound).not.toBeNull();
    expect(supportSlotForCode('KeyH', rebound!)).toBe(2);
    expect(supportSlotForCode('Digit5', rebound!)).toBeNull();
  });

  it('covers every gameplay action with a label and default binding', () => {
    for (const action of GAMEPLAY_ACTIONS) {
      expect(DEFAULT_KEY_BINDINGS[action].length).toBeGreaterThan(0);
    }
  });
});
