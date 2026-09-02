import { describe, expect, it } from 'vitest';
import { GamepadInputRuntime } from './gamepad-input';
import { GAMEPAD_SETTINGS_IDS, bindGamepadSettingsPanel, gamepadSettingsMarkup } from './settings-panel';

describe('gamepad settings panel markup', () => {
  it('renders every control id the binder looks up, exactly once, inside one settings section', () => {
    const markup = gamepadSettingsMarkup();
    for (const id of Object.values(GAMEPAD_SETTINGS_IDS)) {
      expect(markup.match(new RegExp(`id="${id}"`, 'g')) ?? [], id).toHaveLength(1);
    }
    expect(markup.startsWith(`<section id="${GAMEPAD_SETTINGS_IDS.section}" class="settings-section"`)).toBe(true);
    expect(markup).toContain('TOUCH · STRONG');
    expect(markup).toContain('PAD · MEDIUM');
    expect(markup).toContain('MOUSE · NONE');
    expect(markup).toContain('RESET TO DEFAULTS');
  });

  it('declines to bind when the section is absent', () => {
    const runtime = new GamepadInputRuntime({ getGamepads: () => [], storage: null, now: () => 0 });
    const doc = { getElementById: () => null, querySelector: () => null } as unknown as Document;
    expect(bindGamepadSettingsPanel(doc, runtime)).toBeNull();
  });
});
