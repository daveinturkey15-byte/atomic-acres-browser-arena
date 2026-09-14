/**
 * HF-325 — the host → successor authority mirror.
 *
 * WHAT THIS SOLVES
 * ----------------
 * `host-migration.ts` can already decide *who* succeeds a dead host. What it
 * cannot do is give that successor anything to be host *of*. The 90s
 * `HostMatchCheckpoint` is written to the host's own `localStorage` and never
 * crosses the wire, so a promoted guest would have to rebuild scores, health,
 * killstreak/railgun/flare/timed-weapon authority from its own partial client
 * view — which differs per guest. That is precisely how the owner's reported
 * "de synced" is manufactured. `authorizeSelfPromotion` therefore refuses with
 * `no-authority-to-adopt` until a real mirror exists.
 *
 * This module is that mirror, and nothing more:
 *
 *   1. `mirrorHostAuthorityToSuccessor` — a pure reshaping of a host checkpoint
 *      so the *successor's* member entry becomes `hostPlayer` and the outgoing
 *      host becomes just another guest, while the result still validates as a
 *      legitimate `HostMatchCheckpoint`. Every other member, score and authority
 *      sub-state survives byte-identical.
 *   2. `rebaseMirroredCheckpointClock` — the cross-machine clock fence. The
 *      checkpoint stores relative durations rebased against `savedAtEpochMs`
 *      with `Date.now()`. That is safe on ONE machine; across two it turns
 *      wall-clock skew into apparent downtime. See "THE CLOCK PROBLEM".
 *   3. `mirrorGrantsAuthorityTo` — the predicate that a caller uses to compute
 *      `SelfPromotionSample.holdsMirroredAuthority`. A mirror only counts for
 *      the peer it actually names, at the term it actually carries.
 *
 * WHAT IS STILL DELIBERATELY MISSING
 * ----------------------------------
 * No transport, no role flip, no stand-down. Those are `protocol.ts`,
 * `network.ts` and `legacy-main.ts` and are owned elsewhere. The kill switch
 * stays OFF: `authorizeSelfPromotion` keeps refusing until the wire message, the
 * role flip AND the stale-host stand-down path all exist. A mirror alone does
 * not make promotion safe — it only removes the reason promotion could never be
 * safe.
 *
 * THE CLOCK PROBLEM
 * -----------------
 * `restoreGuestAuthorities`, `restoreRailgunAuthority`,
 * `restoreTimedMapWeaponAuthorities` and `resolveHostMatchResumeTiming` all
 * compute `downtimeMs = nowEpochMs - checkpoint.savedAtEpochMs`. Both terms come
 * from the same machine in the crash-recovery case, so the difference is real
 * downtime. Ship the document to another machine and the difference becomes
 * `realDowntime + (receiverClock - senderClock)`:
 *
 *   - receiver clock AHEAD  → fabricated downtime. Respawn timers expire early,
 *     the match clock jumps forward, and past `HOST_MATCH_CHECKPOINT_TTL_MS` the
 *     checkpoint is discarded outright as expired. Fabricated expiry.
 *   - receiver clock BEHIND → `nowEpochMs < savedAtEpochMs`, which every restore
 *     helper answers with `null`. Total adoption failure. Worse, a naive "just
 *     shift it forward" fix would push the expiry arbitrarily far into the
 *     future, silently extending a 90-second lease.
 *
 * The fix is to never compare two clocks at adoption time. On receipt the
 * successor re-expresses `savedAtEpochMs` (and the resume-token digest expiries
 * that are pinned to it) in ITS OWN clock, using a measured offset when one is
 * available and an age of zero when one is not. After that every downtime
 * subtraction reads two samples of a single clock, exactly as in the local
 * crash-recovery case, and the skew is gone rather than merely bounded.
 */

import {
  FLARE_AUTHORITY_CHECKPOINT_SCHEMA_VERSION,
  type FlareShooterFeedbackCheckpoint,
} from './flare-authority-checkpoint';
import { WEAPONS } from './gameplay';
import { captureGuestCombatInventory } from './guest-combat-inventory-authority';
import {
  HOST_MATCH_CHECKPOINT_MAX_BYTES,
  HOST_MATCH_CHECKPOINT_TTL_MS,
  isHostMatchCheckpoint,
  type GuestAuthorityCheckpoint,
  type HostMatchCheckpoint,
  type HostPlayerCheckpoint,
  type ResumeTokenDigestCheckpoint,
} from './host-match-checkpoint';
import { MAX_HOST_TERM, isSuccessionMandate, type SuccessionMandate } from './host-migration';
import { DEFAULT_KILLSTREAK_LOADOUT } from './killstreak-loadout';
import {
  isKillstreakRuntimeCheckpoint,
  type KillstreakActorCheckpoint,
  type KillstreakRuntimeCheckpoint,
} from './killstreak-runtime';
import {
  ORDINARY_WEAPON_IDS,
  SPECIAL_WEAPON_IDS,
  WEAPON_IDS,
  isPlayerSnapshot,
  type OrdinaryWeaponId,
  type PlayerSnapshot,
  type SpecialWeaponId,
  type WeaponId,
} from './protocol';
import { type TimedMapWeaponId } from './timed-map-weapon-authority';

/**
 * How often a host should re-ship the mirror to its current mandate holder. The
 * mirror is a recovery artefact, not gameplay state, so it is cheap to be lazy;
 * what matters is that it is refreshed often enough that its age never
 * approaches the TTL while the host is healthy.
 */
export const HOST_AUTHORITY_MIRROR_INTERVAL_MS = 2_000;

/**
 * The outgoing host has no resume-token digest of its own in its checkpoint —
 * digests exist only for guests. When the caller cannot supply one, the mirror
 * stamps a digest no SHA-256 preimage can ever match, so the demoted host keeps
 * its roster reservation but must re-join through normal admission instead of
 * the resume path. Fail-closed: a slot it cannot instantly reclaim is strictly
 * better than an authentication bypass.
 */
export const UNCLAIMABLE_RESUME_TOKEN_DIGEST = '0'.repeat(64);

/**
 * Offsets beyond a day are not clock skew, they are a broken or hostile clock.
 * Such a sample is discarded and the mirror is treated as fresh-on-arrival,
 * which is the same conservative path taken when no offset was measured at all.
 */
export const MAX_TRUSTED_MIRROR_CLOCK_OFFSET_MS = 24 * 60 * 60 * 1_000;

const RESUME_DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const KILLSTREAK_ACTOR_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const MAX_HOST_RESPAWN_REMAINING_MS = 10_000;
const MAX_WEAPON_COUNTER = 10_000;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function isBoundedInteger(value: unknown, minimum: number, maximum: number): boolean {
  return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}

// ---------------------------------------------------------------------------
// Size discipline
// ---------------------------------------------------------------------------

/**
 * What the mirror is allowed to drop when it would otherwise breach the 64KB
 * cap, in the order it is allowed to drop it. Everything NOT in this list is
 * authority-critical and the mirror refuses rather than shed it:
 *
 *   members / scores          the match ledger itself; dropping any of it is
 *                             the desync the mirror exists to prevent.
 *   hostPlayer / guests       per-player pose, health and inventory authority.
 *   bots                      `bots.length === config.hostedBotCount` is a hard
 *                             schema invariant; a short array is not a smaller
 *                             checkpoint, it is an invalid one.
 *   resumeTokenDigests        without these the promoted host cannot
 *                             authenticate anyone's reconnect, so every other
 *                             guest silently loses its rejoin path.
 *   railgun / timedMapWeapons finite-ammo pickups plus their `processedShotIds`
 *                             replay guards; dropping them either duplicates a
 *                             rare weapon or re-opens a processed shot.
 *   matchClock                the Gun Range round clock, and mandatory for an
 *                             active Gun Range checkpoint.
 *   succession                the term fence. Without it a recovered host
 *                             restarts at term 0 and mints a colliding mandate.
 *
 * The droppable three are, in escalating order of regret:
 *   flare-shot-feedback  purely shooter-side finishing feedback for in-flight
 *                        flares. No score, no damage authority.
 *   flare-projectiles    in-flight flare continuation. Dropping it ends live
 *                        flares early — visible, but it cannot corrupt a ledger.
 *   killstreak           reward-ladder progress. Players lose earned streaks,
 *                        which is why it is last, but kills/deaths/damage all
 *                        survive in `scores`.
 */
export const MIRROR_DROPPABLE_SECTIONS = Object.freeze([
  'flare-shot-feedback',
  'flare-projectiles',
  'killstreak',
] as const);

export type MirrorDroppedSection = typeof MIRROR_DROPPABLE_SECTIONS[number];

// ---------------------------------------------------------------------------
// Mirror transform
// ---------------------------------------------------------------------------

export type HostAuthorityMirrorRefusal =
  /** The source document is not a valid host checkpoint. */
  | 'malformed-checkpoint'
  | 'malformed-mandate'
  /** The mandate is for another room; mirroring it would cross matches. */
  | 'mandate-room-mismatch'
  /** The named successor is the current host. There is nothing to hand over. */
  | 'successor-is-host'
  /** The mandate was not issued by the host that owns this checkpoint. */
  | 'mandate-not-from-this-host'
  | 'successor-not-in-roster'
  /** A disconnected member cannot be handed a live match. */
  | 'successor-not-connected'
  /** Roster says member, but no per-guest authority entry exists for them. */
  | 'successor-authority-missing'
  /** The outgoing host's loadout cannot be expressed as a guest snapshot. */
  | 'outgoing-host-not-representable'
  /** The mandate is older than the term this host has already reached. */
  | 'stale-term'
  /** The checkpoint's own succession names a different successor. */
  | 'succession-mismatch'
  | 'term-exhausted'
  | 'malformed-outgoing-host-digest'
  /** Over the 64KB cap even after every legitimate drop. */
  | 'oversized-mirror'
  /** Belt and braces: the reshaped document failed its own validator. */
  | 'mirror-failed-validation';

export type HostAuthorityMirrorInput = Readonly<{
  /** The live host checkpoint, exactly as it would be persisted locally. */
  checkpoint: HostMatchCheckpoint;
  /** The mandate naming the successor this mirror is for. */
  mandate: SuccessionMandate;
  /**
   * SHA-256 of a resume token the host has minted for its own post-handover
   * rejoin. Omit or pass null to stamp `UNCLAIMABLE_RESUME_TOKEN_DIGEST`.
   */
  outgoingHostResumeTokenSha256?: string | null;
}>;

export type HostAuthorityMirror = Readonly<{
  mirrored: true;
  /** Adoptable by `successorId` only. Still in the *host's* epoch clock. */
  checkpoint: HostMatchCheckpoint;
  /** The term the successor runs at once promoted: `mandate.term + 1`. */
  term: number;
  successorId: string;
  outgoingHostId: string;
  droppedForSize: readonly MirrorDroppedSection[];
  /** `JSON.stringify(...).length`, the same measure the 64KB cap uses. */
  serializedLength: number;
}>;

export type HostAuthorityMirrorResult =
  | HostAuthorityMirror
  | Readonly<{ mirrored: false; reason: HostAuthorityMirrorRefusal }>;

function weaponCounters(fill: (weapon: WeaponId) => number): Record<WeaponId, number> {
  const counters: Partial<Record<WeaponId, number>> = {};
  for (const weapon of WEAPON_IDS) {
    counters[weapon] = clamp(Math.floor(fill(weapon)), 0, MAX_WEAPON_COUNTER);
  }
  return counters as Record<WeaponId, number>;
}

/**
 * Special-weapon magazines are not carried in `GuestCombatInventory` — they are
 * owned by the railgun / timed-pickup authorities. Rather than invent numbers,
 * the promoted host's special ammo is derived from those authorities using the
 * same rule the running game uses: you have rounds iff you are the holder.
 */
function specialWeaponAmmo(
  checkpoint: HostMatchCheckpoint,
  playerId: string,
  weapon: SpecialWeaponId,
): Readonly<{ ammo: number; reserve: number }> {
  if (weapon === 'railgun') {
    const rounds = checkpoint.railgun.holderId === playerId
      ? Math.max(0, Math.floor(checkpoint.railgun.roundsRemaining))
      : 0;
    return { ammo: rounds, reserve: 0 };
  }
  const timed = checkpoint.timedMapWeapons?.[weapon as TimedMapWeaponId];
  if (!timed || timed.status !== 'held' || timed.holderId !== playerId) return { ammo: 0, reserve: 0 };
  const total = Math.max(0, Math.floor(timed.shotsRemaining));
  const magazine = Math.min(WEAPONS[weapon].mag, total);
  return { ammo: magazine, reserve: Math.max(0, total - magazine) };
}

/** The successor's guest entry, reshaped into the checkpoint's `hostPlayer`. */
function promoteGuestToHostPlayer(
  guest: GuestAuthorityCheckpoint,
  checkpoint: HostMatchCheckpoint,
): HostPlayerCheckpoint {
  const snapshot = guest.snapshot;
  const special = new Map<WeaponId, Readonly<{ ammo: number; reserve: number }>>(
    SPECIAL_WEAPON_IDS.map((weapon) => [weapon, specialWeaponAmmo(checkpoint, snapshot.id, weapon)] as const),
  );
  const ordinary = new Set<WeaponId>(ORDINARY_WEAPON_IDS);
  return Object.freeze({
    id: snapshot.id,
    name: snapshot.name,
    team: snapshot.team,
    x: snapshot.x,
    y: snapshot.y,
    z: snapshot.z,
    // A guest's authority record carries no velocity: the host integrates guest
    // motion from admitted input, it never stores a guest's instantaneous
    // velocity. Zero is the only honest value, and it is also the conservative
    // one — a promoted player resumes standing, never launched.
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: snapshot.yaw,
    pitch: clamp(snapshot.pitch, -Math.PI / 2, Math.PI / 2),
    hp: guest.health.hp,
    alive: guest.health.alive,
    kills: snapshot.kills,
    deaths: snapshot.deaths,
    primary: snapshot.primary,
    secondary: snapshot.secondary,
    grenade: snapshot.grenade,
    weapon: snapshot.weapon,
    stance: snapshot.stance,
    grenades: guest.combatInventory.grenades,
    ammo: Object.freeze(weaponCounters((weapon) => ordinary.has(weapon)
      ? guest.combatInventory.ammo[weapon as OrdinaryWeaponId]
      : special.get(weapon)!.ammo)),
    reserve: Object.freeze(weaponCounters((weapon) => ordinary.has(weapon)
      ? guest.combatInventory.reserve[weapon as OrdinaryWeaponId]
      : special.get(weapon)!.reserve)),
    continuity: guest.continuity,
    seq: snapshot.seq,
    // The guest schema allows a respawn delay up to the whole TTL; the host
    // schema caps it at 10s because that is the game's longest respawn. Clamping
    // can only ever shorten a wait, never manufacture invulnerable time.
    respawnRemainingMs: guest.health.alive
      ? 0
      : clamp(Math.ceil(guest.health.respawnRemainingMs), 1, MAX_HOST_RESPAWN_REMAINING_MS),
    // Not tracked per guest. Zero forfeits spawn protection rather than
    // inventing it — the safe direction for the player who just got promoted.
    invulnerabilityRemainingMs: 0,
  });
}

/** The outgoing host, reshaped into an ordinary guest authority entry. */
function demoteHostPlayerToGuest(host: HostPlayerCheckpoint): GuestAuthorityCheckpoint | null {
  const snapshot: PlayerSnapshot & { stance: 'stand' | 'crouch' | 'prone' } = {
    id: host.id,
    name: host.name,
    team: host.team,
    x: host.x,
    y: host.y,
    z: host.z,
    yaw: host.yaw,
    // Guest snapshots bound pitch tighter (±1.5) than the host record (±π/2).
    pitch: clamp(host.pitch, -1.5, 1.5),
    hp: host.hp,
    kills: host.kills,
    deaths: host.deaths,
    primary: host.primary,
    secondary: host.secondary,
    grenade: host.grenade,
    weapon: host.weapon,
    stance: host.stance,
    seq: host.seq,
  };
  // The host record does not enforce the snapshot rule that an equipped weapon
  // must be one you actually carry. Refuse rather than emit an unvalidatable
  // guest entry.
  if (!isPlayerSnapshot(snapshot)) return null;
  return Object.freeze({
    snapshot: Object.freeze(snapshot),
    continuity: host.continuity,
    combatInventory: captureGuestCombatInventory(host.ammo, host.reserve, host.grenades),
    health: Object.freeze({
      hp: host.hp,
      alive: host.alive,
      respawnRemainingMs: host.alive ? 0 : Math.max(1, host.respawnRemainingMs),
      // The host record keeps no death timestamp, only the remaining delay. Age
      // zero reads as "died just now", which is the conservative reading: it
      // never back-dates a death into a window that has already elapsed.
      diedAgeMs: host.alive ? null : 0,
      // Likewise "damaged just now" / "advanced just now": zero ages mean the
      // regeneration ladder restarts rather than handing out free healing.
      lastDamageAgeMs: 0,
      lastAdvancedAgeMs: 0,
    }),
  });
}

/**
 * The validator requires the checkpoint's `hostPlayer` to own a killstreak actor
 * whose team and lifeId match. The successor may not have one (actors only exist
 * once a player has state), so synthesize a zero-progress actor for them. Zero
 * progress is the conservative direction: it can never grant a reward that was
 * not earned. If it cannot be synthesized the caller drops `killstreak`.
 */
function killstreakWithSuccessorActor(
  killstreak: KillstreakRuntimeCheckpoint,
  successor: HostPlayerCheckpoint,
): KillstreakRuntimeCheckpoint | null {
  if (killstreak.actors.some((actor) => actor.actorId === successor.id)) return killstreak;
  if (!KILLSTREAK_ACTOR_ID_PATTERN.test(successor.id)) return null;
  const seeded: KillstreakActorCheckpoint = Object.freeze({
    actorId: successor.id,
    team: successor.team,
    lifeId: successor.continuity,
    loadout: DEFAULT_KILLSTREAK_LOADOUT,
    streak: 0,
    cycleProgress: 0,
    earned: Object.freeze([]),
    availableCharges: Object.freeze([]),
    careRewards: Object.freeze([]),
    adrenalineRemainingMs: 0,
    lastActivationSequence: -1,
    lastControlSequence: -1,
  });
  const candidate: KillstreakRuntimeCheckpoint = Object.freeze({
    ...killstreak,
    actors: Object.freeze([...killstreak.actors, seeded]
      .sort((left, right) => left.actorId.localeCompare(right.actorId))),
  });
  return isKillstreakRuntimeCheckpoint(candidate) ? candidate : null;
}

type MirrorParts = Readonly<{
  hostPlayer: HostPlayerCheckpoint;
  guests: readonly GuestAuthorityCheckpoint[];
  resumeTokenDigests: readonly ResumeTokenDigestCheckpoint[];
  flareShotFeedback: readonly FlareShooterFeedbackCheckpoint[];
  killstreak: KillstreakRuntimeCheckpoint | undefined;
  succession: Readonly<{ term: number; successorId: string | null }>;
}>;

function assembleMirror(
  source: HostMatchCheckpoint,
  parts: MirrorParts,
  dropped: readonly MirrorDroppedSection[],
): HostMatchCheckpoint {
  const dropFeedback = dropped.includes('flare-shot-feedback');
  const dropProjectiles = dropped.includes('flare-projectiles');
  const dropKillstreak = dropped.includes('killstreak');
  const killstreak = dropKillstreak ? undefined : parts.killstreak;
  const mirror: Record<string, unknown> = {
    schemaVersion: source.schemaVersion,
    protocolVersion: source.protocolVersion,
    savedAtEpochMs: source.savedAtEpochMs,
    expiresAtEpochMs: source.expiresAtEpochMs,
    roomCode: source.roomCode,
    // `activeAtEpochMs` and the `matchEpoch` derived from it are match IDENTITY,
    // not timing: nothing rebases against them, `killstreak.matchEpoch` is
    // pinned to them, and every guest already holds the host's value verbatim
    // from `lobby-start`. They must therefore survive migration untouched — see
    // `rebaseMirroredCheckpointClock`, which moves only the timing fields.
    activeAtEpochMs: source.activeAtEpochMs,
    matchEpoch: source.matchEpoch,
    phase: source.phase,
    elapsedSinceActiveMs: source.elapsedSinceActiveMs,
    lobbyRevision: source.lobbyRevision,
    config: source.config,
    members: source.members,
    scores: source.scores,
    hostPlayer: parts.hostPlayer,
    guests: parts.guests,
    bots: source.bots,
    resumeTokenDigests: parts.resumeTokenDigests,
    flareProjectiles: dropProjectiles
      ? Object.freeze({
        schemaVersion: FLARE_AUTHORITY_CHECKPOINT_SCHEMA_VERSION,
        snapshotSeq: source.flareProjectiles.snapshotSeq,
        effects: Object.freeze([]),
      })
      : source.flareProjectiles,
    flareShotFeedback: dropFeedback || dropProjectiles
      ? Object.freeze([])
      : parts.flareShotFeedback,
    railgun: source.railgun,
    succession: parts.succession,
  };
  if (source.timedMapWeapons !== undefined) mirror.timedMapWeapons = source.timedMapWeapons;
  if (source.matchClock !== undefined) mirror.matchClock = source.matchClock;
  if (killstreak !== undefined) mirror.killstreak = killstreak;
  return Object.freeze(mirror) as unknown as HostMatchCheckpoint;
}

/**
 * Reshape a host checkpoint so the mandate's successor becomes the host of
 * record.
 *
 * CONTRACT
 *   - `result.checkpoint.hostPlayer.id === mandate.successorId`.
 *   - The outgoing host appears in `guests` with its pose, score, continuity and
 *     capped inventory intact.
 *   - `members`, `scores`, `bots`, `config`, `railgun`, `timedMapWeapons`,
 *     `matchClock`, `roomCode`, `activeAtEpochMs`, `matchEpoch`,
 *     `elapsedSinceActiveMs` and `lobbyRevision` are carried through unchanged.
 *   - `resumeTokenDigests` loses the successor's entry (a host does not resume
 *     itself) and gains one for the outgoing host, preserving the schema's
 *     `digestIds === guestIds` invariant.
 *   - `succession` is stamped `{ term: mandate.term + 1, successorId: null }` —
 *     the term the successor runs at, with no outstanding mandate of its own.
 *   - `isHostMatchCheckpoint(result.checkpoint, source.protocolVersion)` holds,
 *     and `JSON.stringify(result.checkpoint).length <=
 *     HOST_MATCH_CHECKPOINT_MAX_BYTES`.
 *
 * The result is still expressed in the OUTGOING HOST's epoch clock. The receiver
 * must pass it through `rebaseMirroredCheckpointClock` exactly once on arrival
 * before storing or adopting it.
 */
export function mirrorHostAuthorityToSuccessor(input: HostAuthorityMirrorInput): HostAuthorityMirrorResult {
  const refuse = (reason: HostAuthorityMirrorRefusal): HostAuthorityMirrorResult =>
    Object.freeze({ mirrored: false, reason });

  const source = input?.checkpoint;
  if (!isHostMatchCheckpoint(source)) return refuse('malformed-checkpoint');
  if (!isSuccessionMandate(input.mandate)) return refuse('malformed-mandate');
  const mandate = input.mandate;

  if (mandate.roomCode !== source.roomCode) return refuse('mandate-room-mismatch');
  // Checked before provenance so that "the mandate names the sitting host" has
  // its own greppable reason instead of hiding behind a provenance failure.
  if (mandate.successorId === source.hostPlayer.id) return refuse('successor-is-host');
  if (mandate.issuedByHostId !== source.hostPlayer.id) return refuse('mandate-not-from-this-host');

  const member = source.members.find((candidate) => candidate.id === mandate.successorId);
  if (member === undefined) return refuse('successor-not-in-roster');
  if (!member.connected) return refuse('successor-not-connected');
  const successorAuthority = source.guests.find((guest) => guest.snapshot.id === mandate.successorId);
  if (successorAuthority === undefined) return refuse('successor-authority-missing');

  // G4, issuing half. A mandate below the term already reached is a replay of a
  // succession that has been superseded; mirroring it would hand the successor a
  // fence that a recovered old host could match.
  const priorTerm = source.succession?.term ?? 0;
  if (mandate.term < priorTerm) return refuse('stale-term');
  const namedSuccessor = source.succession?.successorId ?? null;
  if (namedSuccessor !== null && namedSuccessor !== mandate.successorId) return refuse('succession-mismatch');
  const term = mandate.term + 1;
  if (term > MAX_HOST_TERM) return refuse('term-exhausted');

  const outgoingDigest = input.outgoingHostResumeTokenSha256 ?? null;
  if (outgoingDigest !== null
    && (typeof outgoingDigest !== 'string' || !RESUME_DIGEST_PATTERN.test(outgoingDigest))) {
    return refuse('malformed-outgoing-host-digest');
  }

  const outgoingGuest = demoteHostPlayerToGuest(source.hostPlayer);
  if (outgoingGuest === null) return refuse('outgoing-host-not-representable');
  const hostPlayer = promoteGuestToHostPlayer(successorAuthority, source);

  const guests = Object.freeze([
    ...source.guests.filter((guest) => guest.snapshot.id !== mandate.successorId),
    outgoingGuest,
  ].sort((left, right) => left.snapshot.id.localeCompare(right.snapshot.id)));

  const resumeTokenDigests = Object.freeze([
    ...source.resumeTokenDigests.filter((digest) => digest.playerId !== mandate.successorId),
    Object.freeze({
      playerId: source.hostPlayer.id,
      sha256: outgoingDigest ?? UNCLAIMABLE_RESUME_TOKEN_DIGEST,
      expiresAtEpochMs: source.expiresAtEpochMs,
    }),
  ].sort((left, right) => left.playerId.localeCompare(right.playerId)));

  // A killstreak block whose reward ladder cannot be reseated for the successor
  // is dropped rather than emitted half-valid: everyone keeps kills, deaths and
  // damage in `scores`, only the reward ladder resets.
  const killstreak = source.killstreak === undefined
    ? undefined
    : killstreakWithSuccessorActor(source.killstreak, hostPlayer) ?? undefined;
  const killstreakUnreseatable = source.killstreak !== undefined && killstreak === undefined;

  // Shooter-side flare feedback is scoped to *guests* by the schema. The
  // successor's own contexts would point at the host once it is promoted, so
  // they go; every other shooter keeps theirs, and the in-flight flares
  // themselves — which can still deal damage — are untouched.
  const flareShotFeedback = Object.freeze(source.flareShotFeedback
    .filter((context) => context.ownerId !== mandate.successorId));

  const parts: MirrorParts = Object.freeze({
    hostPlayer,
    guests,
    resumeTokenDigests,
    flareShotFeedback,
    killstreak,
    succession: Object.freeze({ term, successorId: null }),
  });

  const ladder: readonly (readonly MirrorDroppedSection[])[] = [
    Object.freeze([]),
    Object.freeze(['flare-shot-feedback'] as const),
    Object.freeze(['flare-shot-feedback', 'flare-projectiles'] as const),
    Object.freeze(['flare-shot-feedback', 'flare-projectiles', 'killstreak'] as const),
  ];

  let lastValidated: HostMatchCheckpoint | null = null;
  for (const step of ladder) {
    const dropped: readonly MirrorDroppedSection[] = killstreakUnreseatable && !step.includes('killstreak')
      ? Object.freeze([...step, 'killstreak' as const])
      : step;
    const candidate = assembleMirror(source, parts, dropped);
    if (!isHostMatchCheckpoint(candidate, source.protocolVersion)) continue;
    lastValidated = candidate;
    const serializedLength = JSON.stringify(candidate).length;
    if (serializedLength > HOST_MATCH_CHECKPOINT_MAX_BYTES) continue;
    return Object.freeze({
      mirrored: true,
      checkpoint: candidate,
      term,
      successorId: mandate.successorId,
      outgoingHostId: source.hostPlayer.id,
      droppedForSize: dropped,
      serializedLength,
    });
  }
  // A document that validated but never fit is a size failure, not a shape one.
  return refuse(lastValidated === null ? 'mirror-failed-validation' : 'oversized-mirror');
}

// ---------------------------------------------------------------------------
// Cross-machine clock rebase
// ---------------------------------------------------------------------------

export type MirrorClockSample = Readonly<{
  /** The RECEIVER's own `Date.now()` at the moment the mirror arrived. */
  receivedAtEpochMs: number;
  /**
   * Measured `receiverClock - senderClock`, in milliseconds, or null when no
   * offset has been established. `estimateHostClockOffset` in private-match.ts
   * produces `hostEpoch - localMidpoint`, i.e. `senderClock - receiverClock`, so
   * callers negate it here.
   */
  clockOffsetMs: number | null;
}>;

export type MirrorClockRebaseRefusal =
  | 'malformed-checkpoint'
  | 'malformed-clock-sample'
  /** The mirror is genuinely older than the TTL. Leases are not extended. */
  | 'mirror-expired'
  | 'rebase-failed-validation';

export type MirrorClockRebaseResult =
  | Readonly<{
    rebased: true;
    checkpoint: HostMatchCheckpoint;
    /** Age, in receiver-clock milliseconds, credited to the mirror. */
    appliedAgeMs: number;
    /** False when the offset was absent or beyond the trust bound. */
    offsetTrusted: boolean;
  }>
  | Readonly<{ rebased: false; reason: MirrorClockRebaseRefusal }>;

/**
 * Re-express a mirrored checkpoint's timing fields in the RECEIVER's clock.
 *
 * Call this exactly once, on arrival, and persist the result. Every subsequent
 * `Date.now()` comparison then reads two samples of one clock, which is the
 * situation the restore helpers were written for.
 *
 * HOW SKEW IS NEUTRALISED
 *   trusted offset   `age = received - (savedAt + offset)` is the mirror's real
 *                    transit age, computed once, in receiver units. Both clocks
 *                    appear exactly once, so the skew cancels instead of
 *                    accumulating into every later downtime subtraction.
 *   no/absurd offset `age = 0`. The mirror is treated as fresh on arrival. Skew
 *                    of any magnitude, in either direction, becomes irrelevant
 *                    because the sender's clock is never read at all.
 *
 * WHY IT CANNOT FABRICATE EXPIRY
 *   `savedAtEpochMs` is rewritten to `received - age` with `age >= 0`, so the
 *   document is never dated into the receiver's future and downtime can never
 *   start out negative. A receiver hours ahead of the host no longer sees hours
 *   of phantom downtime, and the TTL is measured from a moment its own clock
 *   agrees existed.
 *
 * WHY IT CANNOT EXTEND A LEASE
 *   A negative apparent age is clamped to zero — never used to date the document
 *   forward — and an age at or beyond `HOST_MATCH_CHECKPOINT_TTL_MS` is REFUSED
 *   rather than clamped down. Clamping there is exactly how a stale document
 *   would get a fresh 90 seconds. Resume-token digest expiries move with
 *   `expiresAtEpochMs` because the schema pins them together, so they inherit
 *   the same bound. With a trusted offset the operation is age-preserving on
 *   repeat, so it cannot be ratcheted; without one, callers must not re-run it,
 *   which is why it is specified as receive-once.
 */
export function rebaseMirroredCheckpointClock(
  checkpoint: HostMatchCheckpoint,
  sample: MirrorClockSample,
): MirrorClockRebaseResult {
  const refuse = (reason: MirrorClockRebaseRefusal): MirrorClockRebaseResult =>
    Object.freeze({ rebased: false, reason });

  if (!isHostMatchCheckpoint(checkpoint)) return refuse('malformed-checkpoint');
  if (!sample || !isBoundedInteger(sample.receivedAtEpochMs, 1, 10_000_000_000_000)) {
    return refuse('malformed-clock-sample');
  }
  const rawOffset = sample.clockOffsetMs;
  if (rawOffset !== null && typeof rawOffset !== 'number') return refuse('malformed-clock-sample');
  const offsetTrusted = rawOffset !== null
    && Number.isFinite(rawOffset)
    && Math.abs(rawOffset) <= MAX_TRUSTED_MIRROR_CLOCK_OFFSET_MS;

  const rawAgeMs = offsetTrusted
    ? Math.round(sample.receivedAtEpochMs - (checkpoint.savedAtEpochMs + rawOffset))
    : 0;
  if (rawAgeMs >= HOST_MATCH_CHECKPOINT_TTL_MS) return refuse('mirror-expired');
  const appliedAgeMs = Math.max(0, rawAgeMs);

  const savedAtEpochMs = sample.receivedAtEpochMs - appliedAgeMs;
  if (!isBoundedInteger(savedAtEpochMs, 1, 10_000_000_000_000)) return refuse('malformed-clock-sample');
  const expiresAtEpochMs = savedAtEpochMs + HOST_MATCH_CHECKPOINT_TTL_MS;

  const rebasedRecord: Record<string, unknown> = {
    ...checkpoint,
    savedAtEpochMs,
    expiresAtEpochMs,
    resumeTokenDigests: Object.freeze(checkpoint.resumeTokenDigests.map((digest) => Object.freeze({
      ...digest,
      expiresAtEpochMs,
    }))),
  };
  const rebased = Object.freeze(rebasedRecord) as unknown as HostMatchCheckpoint;
  if (!isHostMatchCheckpoint(rebased, checkpoint.protocolVersion)) return refuse('rebase-failed-validation');
  return Object.freeze({ rebased: true, checkpoint: rebased, appliedAgeMs, offsetTrusted });
}

// ---------------------------------------------------------------------------
// Adoption predicate
// ---------------------------------------------------------------------------

/**
 * Whether `selfId` genuinely holds adoptable authority for `roomCode` at `term`.
 *
 * This is what a caller feeds into `SelfPromotionSample.holdsMirroredAuthority`.
 * It is deliberately identity- and term-bound: holding *a* mirror is not the
 * same as holding *your own* mirror, and a mirror stamped for an earlier
 * succession must not authorise a later one. A guest that intercepted somebody
 * else's mirror still fails here, and would still be refused by every follower's
 * `acceptPromotedHost`.
 */
export function mirrorGrantsAuthorityTo(
  checkpoint: unknown,
  selfId: string,
  roomCode: string,
  term: number,
): boolean {
  return isHostMatchCheckpoint(checkpoint)
    && typeof selfId === 'string' && selfId.length > 0
    && checkpoint.hostPlayer.id === selfId
    && checkpoint.roomCode === roomCode
    && checkpoint.succession !== undefined
    && isBoundedInteger(term, 1, MAX_HOST_TERM)
    && checkpoint.succession.term === term;
}
