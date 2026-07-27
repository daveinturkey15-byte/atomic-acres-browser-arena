import { WEAPON_CATALOG } from './combat/weapon-catalog';
import type { WeaponId } from './protocol';

export type WeaponReportProfile = Readonly<{
  body: number;
  bodyEnd: number;
  duration: number;
  crack: number;
  crackEndRatio: number;
  crackDuration: number;
  noise: number;
  lowpass: number;
  tail: number;
  tailDuration: number;
  transientHighpass: number;
  transientDuration: number;
  mechanismPrimaryHz: number;
  mechanismSecondaryHz: number;
  mechanismDelay: number;
}>;

const report = (profile: WeaponReportProfile): WeaponReportProfile => Object.freeze({ ...profile });

/**
 * One deliberately distinct synthesized report for every shipped weapon.
 * Cadence remains gameplay-owned; this registry owns timbre and mechanism
 * identity without hidden family fallbacks.
 */
export const WEAPON_REPORT_PROFILES: Readonly<Record<WeaponId, WeaponReportProfile>> = Object.freeze({
  carbine: report({ body: 116, bodyEnd: 46, duration: 0.13, crack: 1_750, crackEndRatio: 0.38, crackDuration: 0.035, noise: 0.23, lowpass: 2_900, tail: 560, tailDuration: 0.19, transientHighpass: 2_400, transientDuration: 0.028, mechanismPrimaryHz: 520, mechanismSecondaryHz: 430, mechanismDelay: 0.055 }),
  smg: report({ body: 142, bodyEnd: 64, duration: 0.095, crack: 2_450, crackEndRatio: 0.46, crackDuration: 0.027, noise: 0.17, lowpass: 3_900, tail: 820, tailDuration: 0.11, transientHighpass: 2_800, transientDuration: 0.022, mechanismPrimaryHz: 710, mechanismSecondaryHz: 840, mechanismDelay: 0.046 }),
  lmg: report({ body: 94, bodyEnd: 38, duration: 0.205, crack: 1_390, crackEndRatio: 0.28, crackDuration: 0.052, noise: 0.35, lowpass: 2_100, tail: 345, tailDuration: 0.35, transientHighpass: 1_320, transientDuration: 0.041, mechanismPrimaryHz: 315, mechanismSecondaryHz: 228, mechanismDelay: 0.09 }),
  scattergun: report({ body: 74, bodyEnd: 30, duration: 0.235, crack: 1_080, crackEndRatio: 0.31, crackDuration: 0.052, noise: 0.36, lowpass: 1_800, tail: 380, tailDuration: 0.34, transientHighpass: 1_350, transientDuration: 0.041, mechanismPrimaryHz: 315, mechanismSecondaryHz: 245, mechanismDelay: 0.23 }),
  sniper: report({ body: 58, bodyEnd: 20, duration: 0.28, crack: 3_200, crackEndRatio: 0.29, crackDuration: 0.031, noise: 0.28, lowpass: 2_250, tail: 300, tailDuration: 0.46, transientHighpass: 1_200, transientDuration: 0.038, mechanismPrimaryHz: 275, mechanismSecondaryHz: 355, mechanismDelay: 0.63 }),
  railgun: report({ body: 42, bodyEnd: 13, duration: 0.46, crack: 5_200, crackEndRatio: 0.38, crackDuration: 0.035, noise: 0.5, lowpass: 3_200, tail: 180, tailDuration: 0.9, transientHighpass: 4_800, transientDuration: 0.08, mechanismPrimaryHz: 92, mechanismSecondaryHz: 118, mechanismDelay: 0.075 }),
  pistol: report({ body: 188, bodyEnd: 82, duration: 0.098, crack: 2_550, crackEndRatio: 0.43, crackDuration: 0.026, noise: 0.16, lowpass: 4_300, tail: 720, tailDuration: 0.13, transientHighpass: 2_700, transientDuration: 0.023, mechanismPrimaryHz: 640, mechanismSecondaryHz: 790, mechanismDelay: 0.052 }),
  magnum: report({ body: 56, bodyEnd: 18, duration: 0.255, crack: 3_100, crackEndRatio: 0.27, crackDuration: 0.047, noise: 0.36, lowpass: 2_350, tail: 300, tailDuration: 0.42, transientHighpass: 1_300, transientDuration: 0.043, mechanismPrimaryHz: 300, mechanismSecondaryHz: 210, mechanismDelay: 0.22 }),
  'machine-pistol': report({ body: 174, bodyEnd: 74, duration: 0.072, crack: 2_700, crackEndRatio: 0.49, crackDuration: 0.021, noise: 0.13, lowpass: 4_300, tail: 760, tailDuration: 0.09, transientHighpass: 3_000, transientDuration: 0.019, mechanismPrimaryHz: 760, mechanismSecondaryHz: 910, mechanismDelay: 0.038 }),
  'mini-uzi': report({ body: 104, bodyEnd: 38, duration: 0.072, crack: 1_650, crackEndRatio: 0.31, crackDuration: 0.029, noise: 0.27, lowpass: 2_500, tail: 450, tailDuration: 0.16, transientHighpass: 1_700, transientDuration: 0.032, mechanismPrimaryHz: 390, mechanismSecondaryHz: 310, mechanismDelay: 0.065 }),
  mp5: report({ body: 126, bodyEnd: 52, duration: 0.125, crack: 1_550, crackEndRatio: 0.3, crackDuration: 0.037, noise: 0.12, lowpass: 2_500, tail: 460, tailDuration: 0.18, transientHighpass: 1_800, transientDuration: 0.035, mechanismPrimaryHz: 480, mechanismSecondaryHz: 560, mechanismDelay: 0.075 }),
  m4a1: report({ body: 104, bodyEnd: 40, duration: 0.14, crack: 2_050, crackEndRatio: 0.37, crackDuration: 0.037, noise: 0.21, lowpass: 3_100, tail: 510, tailDuration: 0.22, transientHighpass: 2_100, transientDuration: 0.031, mechanismPrimaryHz: 450, mechanismSecondaryHz: 535, mechanismDelay: 0.068 }),
  'ak-47': report({ body: 82, bodyEnd: 28, duration: 0.18, crack: 1_650, crackEndRatio: 0.32, crackDuration: 0.045, noise: 0.31, lowpass: 2_400, tail: 400, tailDuration: 0.31, transientHighpass: 1_600, transientDuration: 0.036, mechanismPrimaryHz: 350, mechanismSecondaryHz: 270, mechanismDelay: 0.094 }),
  minigun: report({ body: 102, bodyEnd: 42, duration: 0.105, crack: 1_350, crackEndRatio: 0.44, crackDuration: 0.024, noise: 0.26, lowpass: 2_100, tail: 480, tailDuration: 0.18, transientHighpass: 1_450, transientDuration: 0.021, mechanismPrimaryHz: 890, mechanismSecondaryHz: 1_060, mechanismDelay: 0.018 }),
  'm14-ebr': report({ body: 70, bodyEnd: 25, duration: 0.235, crack: 2_750, crackEndRatio: 0.3, crackDuration: 0.039, noise: 0.26, lowpass: 2_450, tail: 350, tailDuration: 0.38, transientHighpass: 1_400, transientDuration: 0.035, mechanismPrimaryHz: 320, mechanismSecondaryHz: 395, mechanismDelay: 0.14 }),
  'slug-shotgun': report({ body: 68, bodyEnd: 27, duration: 0.26, crack: 1_260, crackEndRatio: 0.28, crackDuration: 0.055, noise: 0.4, lowpass: 1_750, tail: 340, tailDuration: 0.4, transientHighpass: 1_200, transientDuration: 0.046, mechanismPrimaryHz: 290, mechanismSecondaryHz: 225, mechanismDelay: 0.28 }),
  'flashlight-pistol': report({ body: 76, bodyEnd: 26, duration: 0.22, crack: 2_880, crackEndRatio: 0.33, crackDuration: 0.041, noise: 0.29, lowpass: 2_700, tail: 320, tailDuration: 0.35, transientHighpass: 1_700, transientDuration: 0.037, mechanismPrimaryHz: 380, mechanismSecondaryHz: 305, mechanismDelay: 0.16 }),
  'explosive-crossbow': report({ body: 118, bodyEnd: 54, duration: 0.11, crack: 840, crackEndRatio: 0.52, crackDuration: 0.029, noise: 0.045, lowpass: 1_600, tail: 290, tailDuration: 0.14, transientHighpass: 900, transientDuration: 0.032, mechanismPrimaryHz: 240, mechanismSecondaryHz: 180, mechanismDelay: 0.09 }),
});

export type WeaponAudioProfileAudit = Readonly<{
  missing: readonly string[];
  extra: readonly string[];
  duplicateSignatures: readonly string[];
  invalid: readonly string[];
  pass: boolean;
}>;

function signature(profile: WeaponReportProfile): string {
  return Object.values(profile).map((value) => Number(value).toFixed(6)).join('|');
}

export function auditWeaponAudioProfiles(
  weaponIds: readonly string[] = WEAPON_CATALOG.map((weapon) => weapon.id),
  profiles: Readonly<Record<string, WeaponReportProfile>> = WEAPON_REPORT_PROFILES,
): WeaponAudioProfileAudit {
  const expected = new Set(weaponIds);
  const actual = new Set(Object.keys(profiles));
  const missing = [...expected].filter((id) => !actual.has(id)).sort();
  const extra = [...actual].filter((id) => !expected.has(id)).sort();
  const invalid = [...expected].filter((id) => {
    const values = profiles[id] ? Object.values(profiles[id]) : [];
    return values.length === 0 || values.some((value) => !Number.isFinite(value) || value <= 0);
  }).sort();
  const bySignature = new Map<string, string[]>();
  for (const id of expected) {
    const entry = profiles[id];
    if (!entry) continue;
    const key = signature(entry);
    bySignature.set(key, [...(bySignature.get(key) ?? []), id]);
  }
  const duplicateSignatures = [...bySignature.values()]
    .filter((ids) => ids.length > 1)
    .map((ids) => ids.sort().join('+'))
    .sort();
  return Object.freeze({
    missing: Object.freeze(missing),
    extra: Object.freeze(extra),
    duplicateSignatures: Object.freeze(duplicateSignatures),
    invalid: Object.freeze(invalid),
    pass: missing.length === 0 && extra.length === 0 && duplicateSignatures.length === 0 && invalid.length === 0,
  });
}
