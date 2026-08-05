import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WEAPON_CATALOG } from './combat/weapon-catalog';
import {
  WEAPON_REPORT_PROFILES,
  auditWeaponAudioProfiles,
  type WeaponReportProfile,
} from './weapon-audio-profiles';

function normalizedDistance(left: WeaponReportProfile, right: WeaponReportProfile): number {
  const a = Object.values(left);
  const b = Object.values(right);
  const squared = a.reduce((sum, value, index) => {
    const scale = Math.max(Math.abs(value), Math.abs(b[index]!), 1e-6);
    return sum + ((value - b[index]!) / scale) ** 2;
  }, 0);
  return Math.sqrt(squared / a.length);
}

describe('Pass 65 weapon report identity registry', () => {
  it('has exact catalog set equality and no shared full report signatures', () => {
    expect(auditWeaponAudioProfiles()).toEqual({
      missing: [],
      extra: [],
      duplicateSignatures: [],
      invalid: [],
      pass: true,
    });
    expect(Object.keys(WEAPON_REPORT_PROFILES).sort()).toEqual(WEAPON_CATALOG.map((weapon) => weapon.id).sort());
  });

  it('fails a synthetic future weapon closed until its report is authored', () => {
    const audit = auditWeaponAudioProfiles([
      ...WEAPON_CATALOG.map((weapon) => weapon.id),
      'future-pulse-rifle',
    ]);
    expect(audit.pass).toBe(false);
    expect(audit.missing).toEqual(['future-pulse-rifle']);
  });

  it('keeps every pair materially distinct and especially separates the three compact automatics', () => {
    const entries = Object.entries(WEAPON_REPORT_PROFILES);
    const pairDistances = entries.flatMap(([leftId, left], index) => entries.slice(index + 1).map(([rightId, right]) => ({
      pair: `${leftId}/${rightId}`,
      distance: normalizedDistance(left, right),
    })));
    const closest = pairDistances.sort((left, right) => left.distance - right.distance)[0]!;
    expect(closest.distance, closest.pair).toBeGreaterThan(0.075);
    expect(normalizedDistance(WEAPON_REPORT_PROFILES.smg, WEAPON_REPORT_PROFILES['mini-uzi'])).toBeGreaterThan(0.18);
    expect(normalizedDistance(WEAPON_REPORT_PROFILES.smg, WEAPON_REPORT_PROFILES.mp5)).toBeGreaterThan(0.18);
    expect(normalizedDistance(WEAPON_REPORT_PROFILES['mini-uzi'], WEAPON_REPORT_PROFILES.mp5)).toBeGreaterThan(0.18);
  });

  it('routes the runtime through the exhaustive registry without grouped weapon-family branches', () => {
    const source = readFileSync(new URL('./audio.ts', import.meta.url), 'utf8');
    expect(source).toContain('const profile = WEAPON_REPORT_PROFILES[weapon];');
    expect(source).not.toContain("weapon === 'smg' || weapon === 'mini-uzi' || weapon === 'mp5'");
    expect(source).not.toContain("weapon === 'magnum' || weapon === 'flashlight-pistol'");
  });
});
