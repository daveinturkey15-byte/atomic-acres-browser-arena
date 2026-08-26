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
    // Every graphics apply mode is the registry's, not a copy that can rot:
    // the old hard-coded exclusion list silently reclassified any new
    // topology-changing control as a live apply the moment one was added.
    const registryApplyMode = new Map(ADVANCED_GRAPHICS_CONTROLS.map(({ key, applyMode }) => [`graphics.${key}`, applyMode]));
    for (const definition of graphics.slice(1)) {
      expect(definition.applyMode, definition.key).toBe(registryApplyMode.get(definition.key));
    }
    expect(graphics.find(({ key }) => key === 'graphics.preset')?.applyMode).toBe('live');
    expect(graphics.find(({ key }) => key === 'graphics.antiAliasing')?.applyMode).toBe('pipeline-rebuild');
    expect(graphics.find(({ key }) => key === 'graphics.geometryDetail')?.applyMode).toBe('arena-reload');
    expect(graphics.find(({ key }) => key === 'graphics.ambientOcclusion')?.applyMode).toBe('pipeline-rebuild');
    // HF-364: adding or removing a screen-space raymarch changes MRT
    // attachments and render targets, so none of these may claim a live apply.
    for (const key of [
      'graphics.volumetricLightShafts', 'graphics.screenSpaceReflections', 'graphics.screenSpaceGi',
      'graphics.depthOfField', 'graphics.motionBlur', 'graphics.spatialUpscaling',
    ]) {
      expect(graphics.find((definition) => definition.key === key)?.applyMode, key).toBe('pipeline-rebuild');
    }
    // Everything that is NOT one of the declared topology owners must still be
    // a live apply, which is what the original exclusion list was protecting.
    const topologyOwners = new Set([
      'graphics.antiAliasing', 'graphics.geometryDetail', 'graphics.ambientOcclusion',
      'graphics.volumetricLightShafts', 'graphics.screenSpaceReflections', 'graphics.screenSpaceGi',
      'graphics.depthOfField', 'graphics.motionBlur', 'graphics.spatialUpscaling',
    ]);
    expect(graphics.filter(({ key }) => !topologyOwners.has(key))
      .every(({ applyMode }) => applyMode === 'live')).toBe(true);
    expect(graphics.slice(1).every(({ runtimeConsumer }) => typeof runtimeConsumer === 'string' && runtimeConsumer.length > 0)).toBe(true);
    expect(graphics.every(({ runtimeEvidence }) => (runtimeEvidence?.length ?? 0) > 0)).toBe(true);
    expect(accessibility).toHaveLength(5);
    expect(accessibility.every(({ applyMode }) => applyMode === 'live')).toBe(true);
    expect(PASS65_SETTING_DEFINITIONS.filter((definition) => definition.key.startsWith('privacy.'))).toEqual([
      expect.objectContaining({
        key: 'privacy.shareGlobalLeaderboard', applyMode: 'live', authorityAffecting: false,
        runtimeConsumer: 'consented-global-leaderboard-submission',
      }),
    ]);
  });
});
