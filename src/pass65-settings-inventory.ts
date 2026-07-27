import { AUDIO_BUS_IDS } from './pass65-settings';
import {
  ADVANCED_GRAPHICS_CONTROLS,
  ADVANCED_GRAPHICS_RUNTIME_EVIDENCE,
  type GraphicsRuntimeEvidence,
} from './graphics-settings-registry';

export type SettingApplyMode = 'live' | 'pipeline-rebuild' | 'arena-reload';

export type SettingDefinition = Readonly<{
  key: string;
  applyMode: SettingApplyMode;
  authorityAffecting: false;
  runtimeConsumer?: string;
  runtimeEvidence?: readonly GraphicsRuntimeEvidence[];
}>;

const graphicsSettings: readonly SettingDefinition[] = Object.freeze([
  Object.freeze({
    key: 'graphics.preset', applyMode: 'arena-reload', authorityAffecting: false, runtimeConsumer: 'preset-resolver',
    runtimeEvidence: Object.freeze([Object.freeze({
      path: 'src/pass65-settings.ts',
      symbol: 'resolveDisplayedGraphicsPreset',
      telemetryPath: 'settings.displayedGraphicsPreset + render.profile',
    })]),
  }),
  ...ADVANCED_GRAPHICS_CONTROLS.map((definition): SettingDefinition => Object.freeze({
    key: `graphics.${definition.key}`,
    applyMode: definition.applyMode,
    authorityAffecting: false,
    runtimeConsumer: definition.runtimeConsumer,
    runtimeEvidence: ADVANCED_GRAPHICS_RUNTIME_EVIDENCE[definition.key],
  })),
]);

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

const privacySettings: readonly SettingDefinition[] = Object.freeze([
  Object.freeze({
    key: 'privacy.shareGlobalLeaderboard',
    applyMode: 'live',
    authorityAffecting: false,
    runtimeConsumer: 'consented-global-leaderboard-submission',
  }),
]);

export const PASS65_SETTING_DEFINITIONS: readonly SettingDefinition[] = Object.freeze([
  ...graphicsSettings,
  ...audioSettings,
  ...accessibilitySettings,
  ...privacySettings,
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
  for (const definition of graphicsSettings) {
    if (!definition.runtimeConsumer) issues.push(`orphan-graphics-setting:${definition.key}`);
    if ((definition.runtimeEvidence?.length ?? 0) === 0) issues.push(`missing-runtime-evidence:${definition.key}`);
  }
  return Object.freeze(issues);
}
