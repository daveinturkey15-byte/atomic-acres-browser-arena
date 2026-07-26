import { describe, expect, it } from 'vitest';
import { AUDIO_BUS_IDS } from './pass65-settings';
import { ADVANCED_GRAPHICS_CONTROLS } from './graphics-settings-registry';
import { PASS65_SETTING_DEFINITIONS, validatePass65SettingDefinitions } from './pass65-settings-inventory';
import { AUDIO_BUS_IDS as SOUND_EVENT_AUDIO_BUS_IDS } from './sound-event-inventory';

describe('Pass 65 setting inventory', () => {
  it('registers every exposed bus gain and mute without gameplay authority', () => {
    expect(AUDIO_BUS_IDS).toBe(SOUND_EVENT_AUDIO_BUS_IDS);
    expect(validatePass65SettingDefinitions()).toEqual([]);
    const audio = PASS65_SETTING_DEFINITIONS.filter((definition) => definition.key.startsWith('audio.'));
    expect(audio).toHaveLength(AUDIO_BUS_IDS.length * 2);
    expect(audio.every((definition) => definition.applyMode === 'live' && !definition.authorityAffecting)).toBe(true);
  });

  it('declares the real renderer controls as arena reloads and sensory controls as live', () => {
    const graphics = PASS65_SETTING_DEFINITIONS.filter((definition) => definition.key.startsWith('graphics.'));
    const accessibility = PASS65_SETTING_DEFINITIONS.filter((definition) => definition.key.startsWith('accessibility.'));
    expect(graphics.map(({ key }) => key)).toEqual([
      'graphics.preset', ...ADVANCED_GRAPHICS_CONTROLS.map(({ key }) => `graphics.${key}`),
    ]);
    expect(graphics.every(({ applyMode }) => applyMode === 'arena-reload')).toBe(true);
    expect(graphics.slice(1).every(({ runtimeConsumer }) => typeof runtimeConsumer === 'string' && runtimeConsumer.length > 0)).toBe(true);
    expect(graphics.every(({ runtimeEvidence }) => (runtimeEvidence?.length ?? 0) > 0)).toBe(true);
    expect(accessibility).toHaveLength(5);
    expect(accessibility.every(({ applyMode }) => applyMode === 'live')).toBe(true);
  });
});
