import type { MatchPhase } from './gameplay';
import type { TimedMapWeaponId } from './timed-map-weapon-authority';

/**
 * HF-339 (Pass 74): "need clearer announce of rare weapon spawns mid game to
 * all in the match". Pure presentation contract for the rare-weapon spawn
 * announcement, driven off the already-replicated announcementSent transition
 * of the timed-map-weapon authority state - no protocol change. The consumer
 * (legacy-main applyTimedMapWeaponStates) renders the returned descriptors:
 * centre-screen banner, kill-feed line, audio sting and minimap ping.
 */
export const RARE_WEAPON_BANNER_HEADLINE = 'RARE WEAPON SPAWNED';
export const RARE_WEAPON_BANNER_DURATION_MS = 4_000;
export const RARE_WEAPON_AUDIO_CUE = 'rare-weapon-spawned';

export type RareWeaponAnnouncementInput = Readonly<{
  weaponId: TimedMapWeaponId;
  /** Catalog display name, e.g. "Orion Flare Pistol"; falls back to weaponId. */
  displayName: string;
  totalShots: number;
  phase: MatchPhase;
  /** Authority pickup position for the minimap ping, when known. */
  pickupPosition?: readonly [number, number, number] | null;
}>;

export type RareWeaponBanner = Readonly<{
  headline: typeof RARE_WEAPON_BANNER_HEADLINE;
  subline: string;
  durationMs: number;
}>;

export type RareWeaponAnnouncementPresentation = Readonly<{
  /**
   * Centre-screen banner; null outside warmup/active so a late transition can
   * never overwrite the match-end screen.
   */
  banner: RareWeaponBanner | null;
  /** The existing gold kill-feed line, preserved verbatim. */
  feed: Readonly<{ text: typeof RARE_WEAPON_BANNER_HEADLINE; tone: 'gold' }>;
  /** Announcements-bus sting id; gated with the banner. */
  audioCue: typeof RARE_WEAPON_AUDIO_CUE | null;
  /** Pulsing gold minimap marker at the pickup, when a position is given. */
  minimapPing: Readonly<{ position: readonly [number, number, number] }> | null;
}>;

function announcementWeaponName(input: RareWeaponAnnouncementInput): string {
  const display = input.displayName.trim();
  const name = display.length > 0 ? display : input.weaponId.replace(/-/g, ' ');
  return name.toUpperCase();
}

export function presentRareWeaponAnnouncement(
  input: RareWeaponAnnouncementInput,
): RareWeaponAnnouncementPresentation {
  const name = announcementWeaponName(input);
  const shots = Number.isSafeInteger(input.totalShots) && input.totalShots > 0
    ? ` · ${input.totalShots} SHOTS`
    : '';
  const phaseAdmitsFanfare = input.phase === 'warmup' || input.phase === 'active';
  const position = input.pickupPosition ?? null;
  const pingPosition = position !== null && position.length === 3 && position.every(Number.isFinite)
    ? Object.freeze([position[0], position[1], position[2]] as const)
    : null;
  return Object.freeze({
    banner: phaseAdmitsFanfare
      ? Object.freeze({
          headline: RARE_WEAPON_BANNER_HEADLINE,
          subline: `${name}${shots}`,
          durationMs: RARE_WEAPON_BANNER_DURATION_MS,
        })
      : null,
    feed: Object.freeze({ text: RARE_WEAPON_BANNER_HEADLINE, tone: 'gold' as const }),
    audioCue: phaseAdmitsFanfare ? RARE_WEAPON_AUDIO_CUE : null,
    minimapPing: pingPosition ? Object.freeze({ position: pingPosition }) : null,
  });
}
