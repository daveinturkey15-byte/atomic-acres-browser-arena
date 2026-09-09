/**
 * Through-wall reveal TARGET SELECTION.
 *
 * Owner 2026-08-30: "see through walls is still there and good on piloted
 * drone but gone on chopper gunner and rail gun, it should not keep
 * regressing". Every firearm-authorized reveal (DMR thermal, railgun scope,
 * chopper-gunner possession) feeds ONE presentation layer, so the answer to
 * "who is revealed right now" is a single decision shared by three optics.
 * While that decision lived inline in legacy-main it could only be exercised
 * by playing all three, which is why it kept diverging per optic.
 *
 * This module owns that decision and nothing else. It takes the observer, the
 * derived match mode, the activation flags and a candidate roster as
 * parameters and returns the target list. It never imports legacy-main, never
 * reads ambient game state, needs no DOM and no renderer, so the historical
 * "reveal works on one optic and not another" shape is a plain unit test.
 *
 * Selection policy is unchanged from legacy-main (a move, not a rewrite):
 *   - the reveal is off unless at least one optic is active;
 *   - the railgun applies its own eligibility predicate, but ONLY when it is
 *     the sole active optic - a concurrent DMR or chopper reveal outranks it;
 *   - relation is team-vs-observer except in FFA, where everyone is hostile;
 *   - the first record for an id wins, so a roster that lists an actor twice
 *     cannot buy it a second reveal slot.
 */
import type { MatchMode } from '../private-match';
import type { Team } from '../protocol';
import { railgunThermalTargetEligible } from '../railgun-authority';
import {
  THERMAL_GHOST_MAX_TARGETS,
  type ThermalGhostRelation,
  type ThermalGhostTarget,
} from '../thermal-ghost-presentation';

/** The reveal only distinguishes "teams matter" from "everyone is hostile". */
export type ThermalRevealMode = 'tdm' | 'ffa';

/** Which optics are currently asking for a through-wall reveal. */
export type ThermalRevealActivation = Readonly<{
  dmrThermalActive: boolean;
  railgunRevealActive: boolean;
  chopperThermal: boolean;
}>;

export type ThermalRevealObserver = Readonly<{ id: string; team: Team }>;

/**
 * One live actor the reveal may draw. `root` is the actor's own scene node -
 * the presentation layer clones its skinned children, so this is the same
 * object the third-person body is drawn from.
 */
export type ThermalRevealCandidate = Readonly<{
  id: string;
  team: Team;
  kind: 'player' | 'bot';
  alive: boolean;
  root: ThermalGhostTarget['root'];
  /** Death/respawn generation, for stale-reveal rejection downstream. */
  lifeId: number;
  /** Replication continuity, for stale-pose rejection downstream. */
  continuityId: number;
}>;

/** A retained corpse operator, used only to compile pipelines at admission. */
export type ThermalRevealPrewarmCorpse = Readonly<{
  team: Team;
  root: ThermalGhostTarget['root'];
}>;

/**
 * Solo play and Domination both reveal along team lines; only FFA drops them.
 * Both reveal paths derived this identically inline, which is exactly the kind
 * of duplicated premise that lets one path drift.
 */
export function deriveThermalRevealMode(
  gameMode: 'solo' | 'host' | 'client',
  privateMatchMode: MatchMode,
): ThermalRevealMode {
  return gameMode === 'solo' || privateMatchMode === 'domination' ? 'tdm' : privateMatchMode;
}

/** Relation drives the reveal tint; in FFA nobody is an ally. */
export function thermalRevealRelation(
  mode: ThermalRevealMode,
  observerTeam: Team,
  targetTeam: Team,
): ThermalGhostRelation {
  return mode !== 'ffa' && targetTeam === observerTeam ? 'friendly' : 'hostile';
}

/** True when any optic is asking for the shared reveal layer. */
export function thermalRevealActive(activation: ThermalRevealActivation): boolean {
  return activation.dmrThermalActive || activation.railgunRevealActive || activation.chopperThermal;
}

/**
 * The live reveal set. Returns an empty array when no optic is active, which
 * is the caller's cue to release the presentation layer.
 *
 * Candidate order is the caller's order and is preserved: the presentation
 * layer caps at THERMAL_GHOST_MAX_TARGETS, so which actors survive a crowded
 * frame depends on it.
 */
export function selectThermalRevealTargets(
  activation: ThermalRevealActivation,
  observer: ThermalRevealObserver,
  mode: ThermalRevealMode,
  candidates: Iterable<ThermalRevealCandidate>,
): ThermalGhostTarget[] {
  const targets: ThermalGhostTarget[] = [];
  if (!thermalRevealActive(activation)) return targets;
  // The railgun's eligibility predicate is the railgun's own authority policy.
  // It must not narrow a DMR or chopper reveal that happens to be running at
  // the same time, so it applies only when the railgun is alone.
  const railgunOnly = activation.railgunRevealActive
    && !activation.dmrThermalActive
    && !activation.chopperThermal;
  for (const candidate of candidates) {
    if (!candidate.alive) continue;
    if (targets.some((target) => target.id === candidate.id)) continue;
    if (railgunOnly && !railgunThermalTargetEligible(
      observer,
      // Only live candidates reach here, matching the literal legacy-main
      // passed at this site.
      { id: candidate.id, team: candidate.team, alive: true, kind: candidate.kind },
      mode,
    )) continue;
    targets.push({
      id: candidate.id,
      relation: thermalRevealRelation(mode, observer.team, candidate.team),
      root: candidate.root,
      lifeId: candidate.lifeId,
      continuityId: candidate.continuityId,
    });
  }
  return targets;
}

/**
 * The admission-time prewarm set: compile the relation-invariant exact-model
 * and orange-halo programs behind the opaque deployment surface instead of on
 * the player's first ADS.
 *
 * Deliberately NOT the live policy - prewarm wants every live id plus enough
 * retained corpse operators to fill the target slots, so an empty private
 * lobby still submits both programs before its first guest. No eligibility
 * predicate applies, because compiling a program the player turns out not to
 * be allowed to see costs nothing and skipping it costs a first-ADS hitch.
 */
export function selectThermalRevealPrewarmTargets(
  observer: ThermalRevealObserver,
  mode: ThermalRevealMode,
  candidates: Iterable<ThermalRevealCandidate>,
  corpses: readonly ThermalRevealPrewarmCorpse[],
): ThermalGhostTarget[] {
  const targets: ThermalGhostTarget[] = [];
  for (const candidate of candidates) {
    if (!candidate.alive) continue;
    targets.push({
      id: candidate.id,
      relation: thermalRevealRelation(mode, observer.team, candidate.team),
      root: candidate.root,
      lifeId: candidate.lifeId,
      continuityId: candidate.continuityId,
    });
  }
  for (const [index, corpse] of corpses.entries()) {
    if (targets.length >= THERMAL_GHOST_MAX_TARGETS) break;
    targets.push({
      id: `thermal-prewarm-corpse-${index}`,
      // Corpse records carry no mode: the materials being compiled are
      // relation-invariant, so this only picks which of two identical
      // programs is submitted.
      relation: corpse.team === observer.team ? 'friendly' : 'hostile',
      root: corpse.root,
    });
  }
  return targets;
}
