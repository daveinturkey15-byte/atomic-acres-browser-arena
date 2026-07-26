import { AUDIO_BUS_IDS } from './pass65-settings';

export type SettingApplyMode = 'live' | 'pipeline-rebuild' | 'arena-reload';

export type SettingDefinition = Readonly<{
  key: string;
  applyMode: SettingApplyMode;
  authorityAffecting: false;
}>;

const graphicsSettings = [
  'preset', 'renderScale', 'adaptiveResolution', 'targetFps', 'shadows',
].map((key): SettingDefinition => Object.freeze({
  key: `graphics.${key}`,
  applyMode: 'arena-reload',
  authorityAffecting: false,
}));

const audioSettings = AUDIO_BUS_IDS.flatMap((bus): readonly SettingDefinition[] => [
  Object.freeze({ key: `audio.gains.${bus}`, applyMode: 'live', authorityAffecting: false }),
  Object.freeze({ key: `audio.mutes.${bus}`, applyMode: 'live', authorityAffecting: false }),
]);

const accessibilitySettings = [
  'reducedMotion', 'reducedDamageFlash', 'reducedSensoryEffects', 'damageFlashScale', 'weaponMotionScale',
].map((key): SettingDefinition => Object.freeze({
  key: `accessibility.${key}`,
  applyMode: 'live',
  authorityAffecting: false,
}));

export const PASS65_SETTING_DEFINITIONS: readonly SettingDefinition[] = Object.freeze([
  ...graphicsSettings,
  ...audioSettings,
  ...accessibilitySettings,
]);

export function validatePass65SettingDefinitions(): readonly string[] {
  const issues: string[] = [];
  const keys = PASS65_SETTING_DEFINITIONS.map((definition) => definition.key);
  if (new Set(keys).size !== keys.length) issues.push('duplicate-setting-key');
  for (const bus of AUDIO_BUS_IDS) {
    if (!keys.includes(`audio.gains.${bus}`)) issues.push(`missing-audio-gain:${bus}`);
    if (!keys.includes(`audio.mutes.${bus}`)) issues.push(`missing-audio-mute:${bus}`);
  }
  if (PASS65_SETTING_DEFINITIONS.some((definition) => definition.authorityAffecting !== false)) {
    issues.push('authority-affecting-setting');
  }
  return Object.freeze(issues);
}
