import {
  MAP_CARPET_BOMBER_KILLER_ID,
  type KillCause,
} from './kill-provenance';
import {
  emptyPlayerScore,
  recordPlayerDamage,
  type PlayerScore,
} from './private-match';
import type { Team } from './protocol';

export const MAP_CARPET_BOMBER_LABEL = 'Carpet Bomber';

export type DeathOutcomeCombatant = Readonly<{
  id: string;
  name: string;
  kind: string;
  team: Team | null;
  scoreEligible: boolean;
}>;

export type AuthoritativeDeathOutcome = Readonly<{
  actor: Readonly<{ id: string; name: string; kind: string }>;
  target: Readonly<{ id: string; name: string; kind: string }>;
  weaponOrEffect: string;
  feedText: string;
  scores: ReadonlyMap<string, PlayerScore>;
  scoreChanged: boolean;
  killerCredited: boolean;
  victimDeathRecorded: boolean;
}>;

export type AuthoritativeDeathOutcomePorts = Readonly<{
  recordDiagnostic: (outcome: AuthoritativeDeathOutcome) => void;
  replaceScores: (scores: ReadonlyMap<string, PlayerScore>) => void;
  broadcastScores: () => void;
  presentFeed: (text: string) => void;
}>;

type DeathIdentity = Readonly<{
  killer: string;
  victim: string;
  cause: KillCause;
}>;

function fallbackCombatant(id: string): DeathOutcomeCombatant {
  return { id, name: 'Unknown combatant', kind: 'unknown', team: null, scoreEligible: false };
}

function isMapOwnedCarpetBomberDeath(message: DeathIdentity): boolean {
  return message.killer === MAP_CARPET_BOMBER_KILLER_ID && message.cause.kind === 'environment';
}

function deathSource(message: DeathIdentity): string {
  if (isMapOwnedCarpetBomberDeath(message)) return 'carpet-bomber';
  if (message.cause.kind === 'gun') return message.cause.weapon;
  if (message.cause.kind === 'killstreak') return message.cause.effect;
  return message.cause.kind;
}

/**
 * Canonical score, diagnostic and feed projection used by processDeath.
 * Environment ownership is deliberately separate from player scoring: the map
 * records the victim death but never materialises as a PlayerScore row.
 */
export function resolveAuthoritativeDeathOutcome(input: Readonly<{
  role: 'offline' | 'host' | 'client';
  message: DeathIdentity;
  scores: ReadonlyMap<string, PlayerScore>;
  killer: DeathOutcomeCombatant | null;
  victim: DeathOutcomeCombatant | null;
  hostile: boolean;
}>): AuthoritativeDeathOutcome {
  const mapOwned = isMapOwnedCarpetBomberDeath(input.message);
  const resolvedKiller = input.killer ?? fallbackCombatant(input.message.killer);
  const resolvedVictim = input.victim ?? fallbackCombatant(input.message.victim);
  const actor = mapOwned
    ? { id: MAP_CARPET_BOMBER_KILLER_ID, name: MAP_CARPET_BOMBER_LABEL, kind: 'environment' }
    : { id: resolvedKiller.id, name: resolvedKiller.name, kind: resolvedKiller.kind };
  const target = { id: resolvedVictim.id, name: resolvedVictim.name, kind: resolvedVictim.kind };
  const scores = new Map(input.scores);
  let killerCredited = false;
  let victimDeathRecorded = false;

  if (input.role === 'host' && input.message.killer !== input.message.victim && resolvedVictim.scoreEligible) {
    if (mapOwned) {
      const victimScore = scores.get(input.message.victim) ?? emptyPlayerScore(input.message.victim);
      scores.set(input.message.victim, { ...victimScore, deaths: victimScore.deaths + 1 });
      scores.delete(MAP_CARPET_BOMBER_KILLER_ID);
      victimDeathRecorded = true;
    } else if (resolvedKiller.scoreEligible && input.hostile) {
      const killerScore = scores.get(input.message.killer) ?? emptyPlayerScore(input.message.killer);
      const victimScore = scores.get(input.message.victim) ?? emptyPlayerScore(input.message.victim);
      scores.set(input.message.killer, { ...killerScore, kills: killerScore.kills + 1 });
      scores.set(input.message.victim, { ...victimScore, deaths: victimScore.deaths + 1 });
      killerCredited = true;
      victimDeathRecorded = true;
    }
  }

  return Object.freeze({
    actor: Object.freeze(actor),
    target: Object.freeze(target),
    weaponOrEffect: deathSource(input.message),
    feedText: `${actor.name} eliminated ${target.name}`,
    scores,
    scoreChanged: killerCredited || victimDeathRecorded,
    killerCredited,
    victimDeathRecorded,
  });
}

/**
 * Commit the complete processDeath score/feed/diagnostic seam. The caller
 * chooses the exact presentation boundary so retained effect-specific audit
 * entries (for example Railgun attribution) can still precede the feed.
 */
export function commitAuthoritativeDeathOutcome(
  outcome: AuthoritativeDeathOutcome,
  ports: AuthoritativeDeathOutcomePorts,
): void {
  ports.recordDiagnostic(outcome);
  if (outcome.scoreChanged) {
    ports.replaceScores(outcome.scores);
    ports.broadcastScores();
  }
  ports.presentFeed(outcome.feedText);
}

/**
 * Preserve victim damage-taken accounting for map-owned Carpet damage without
 * inventing a map participant or crediting the activating player asymmetrically.
 */
export function recordAuthoritativeDamageScores(
  scores: ReadonlyMap<string, PlayerScore>,
  attackerId: string,
  victimId: string,
  damage: number,
): Map<string, PlayerScore> {
  const next = recordPlayerDamage(scores, attackerId, victimId, damage);
  if (attackerId === MAP_CARPET_BOMBER_KILLER_ID) next.delete(MAP_CARPET_BOMBER_KILLER_ID);
  return next;
}
