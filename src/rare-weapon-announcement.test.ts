import { describe, expect, it } from 'vitest';
import {
  RARE_WEAPON_AUDIO_CUE,
  RARE_WEAPON_BANNER_DURATION_MS,
  RARE_WEAPON_BANNER_HEADLINE,
  presentRareWeaponAnnouncement,
} from './rare-weapon-announcement';
import { TIMED_MAP_WEAPON_DEFINITIONS } from './timed-map-weapon-authority';

// HF-339 (Pass 74): rare-weapon spawn announcements must be unmistakable to
// every player - banner + feed + audio sting + minimap ping, all presented off
// the replicated announcementSent transition.
describe('rare weapon announcement presentation', () => {
  it('presents the full triple-channel announcement for a mid-match flare spawn', () => {
    const definition = TIMED_MAP_WEAPON_DEFINITIONS['flare-gun'];
    const presentation = presentRareWeaponAnnouncement({
      weaponId: 'flare-gun',
      displayName: 'Orion Flare Pistol',
      totalShots: definition.totalShots,
      phase: 'active',
      pickupPosition: definition.spawnPosition,
    });
    expect(presentation).toEqual({
      banner: {
        headline: 'RARE WEAPON SPAWNED',
        subline: 'ORION FLARE PISTOL · 6 SHOTS',
        durationMs: RARE_WEAPON_BANNER_DURATION_MS,
      },
      feed: { text: 'RARE WEAPON SPAWNED', tone: 'gold' },
      audioCue: 'rare-weapon-spawned',
      minimapPing: { position: [0, 3.08, 2] },
    });
    expect(RARE_WEAPON_BANNER_HEADLINE).toBe('RARE WEAPON SPAWNED');
    expect(RARE_WEAPON_BANNER_DURATION_MS).toBe(4_000);
    expect(RARE_WEAPON_AUDIO_CUE).toBe('rare-weapon-spawned');
    expect(Object.isFrozen(presentation)).toBe(true);
    expect(Object.isFrozen(presentation.banner)).toBe(true);
    expect(Object.isFrozen(presentation.feed)).toBe(true);
    expect(Object.isFrozen(presentation.minimapPing)).toBe(true);
  });

  it('presents the flamethrower shot count from its authority definition', () => {
    const definition = TIMED_MAP_WEAPON_DEFINITIONS.flamethrower;
    const presentation = presentRareWeaponAnnouncement({
      weaponId: 'flamethrower',
      displayName: 'M2 Flamethrower',
      totalShots: definition.totalShots,
      phase: 'warmup',
      pickupPosition: definition.spawnPosition,
    });
    expect(presentation.banner).toMatchObject({ subline: 'M2 FLAMETHROWER · 200 SHOTS' });
    expect(presentation.audioCue).toBe('rare-weapon-spawned');
  });

  it('keeps the banner and sting during warmup but never over the match-end screen', () => {
    for (const phase of ['warmup', 'active'] as const) {
      const presentation = presentRareWeaponAnnouncement({
        weaponId: 'flare-gun', displayName: 'Orion Flare Pistol', totalShots: 6, phase,
      });
      expect(presentation.banner).not.toBeNull();
      expect(presentation.audioCue).toBe('rare-weapon-spawned');
    }
    const ended = presentRareWeaponAnnouncement({
      weaponId: 'flare-gun',
      displayName: 'Orion Flare Pistol',
      totalShots: 6,
      phase: 'ended',
      pickupPosition: [0, 3.08, 2],
    });
    expect(ended.banner).toBeNull();
    expect(ended.audioCue).toBeNull();
    // The replicated feed line and state-derived ping survive the gate.
    expect(ended.feed).toEqual({ text: 'RARE WEAPON SPAWNED', tone: 'gold' });
    expect(ended.minimapPing).toEqual({ position: [0, 3.08, 2] });
  });

  it('omits the minimap ping without a finite pickup position', () => {
    expect(presentRareWeaponAnnouncement({
      weaponId: 'flare-gun', displayName: 'Orion Flare Pistol', totalShots: 6, phase: 'active',
    }).minimapPing).toBeNull();
    expect(presentRareWeaponAnnouncement({
      weaponId: 'flare-gun', displayName: 'Orion Flare Pistol', totalShots: 6, phase: 'active',
      pickupPosition: null,
    }).minimapPing).toBeNull();
    expect(presentRareWeaponAnnouncement({
      weaponId: 'flare-gun', displayName: 'Orion Flare Pistol', totalShots: 6, phase: 'active',
      pickupPosition: [0, Number.NaN, 2],
    }).minimapPing).toBeNull();
  });

  it('falls back to the weapon id and drops the shot segment on malformed content inputs', () => {
    const fallback = presentRareWeaponAnnouncement({
      weaponId: 'flare-gun', displayName: '   ', totalShots: 6, phase: 'active',
    });
    expect(fallback.banner).toMatchObject({ subline: 'FLARE GUN · 6 SHOTS' });
    for (const totalShots of [0, -3, 2.5, Number.NaN]) {
      const presentation = presentRareWeaponAnnouncement({
        weaponId: 'flamethrower', displayName: 'M2 Flamethrower', totalShots, phase: 'active',
      });
      expect(presentation.banner).toMatchObject({ subline: 'M2 FLAMETHROWER' });
    }
  });
});
