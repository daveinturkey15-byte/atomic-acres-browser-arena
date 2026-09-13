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
  it('presents all four channels for a mid-match flare spawn', () => {
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

  /**
   * HF-339's literal ask is "unmistakable to EVERY player". That is a
   * determinism property, not a content one: the presenter must depend only
   * on the replicated authority transition, so a host, a guest and a late
   * joiner all compute byte-identical channels from the same state. If a
   * viewer-specific input ever leaks in (local team, local holder, local
   * settings), two players stop being told the same thing.
   */
  it('computes identical channels for every player from the same replicated state', () => {
    const definition = TIMED_MAP_WEAPON_DEFINITIONS['flare-gun'];
    const input = {
      weaponId: 'flare-gun' as const,
      displayName: 'Orion Flare Pistol',
      totalShots: definition.totalShots,
      phase: 'active' as const,
      pickupPosition: definition.spawnPosition,
    };
    const host = presentRareWeaponAnnouncement(input);
    const guest = presentRareWeaponAnnouncement({ ...input });
    const lateJoiner = presentRareWeaponAnnouncement({ ...input });
    expect(guest).toEqual(host);
    expect(lateJoiner).toEqual(host);
    // Every channel is populated, so no player is left with a silent or
    // invisible announcement while another gets the full one.
    expect(host.banner).not.toBeNull();
    expect(host.audioCue).not.toBeNull();
    expect(host.minimapPing).not.toBeNull();
    expect(host.feed.text).toBe(RARE_WEAPON_BANNER_HEADLINE);
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
