/**
 * deployment-briefing-surface.ts — HF-372.
 *
 * Owner: "need a decent loading screen for farcrysis and hijacked."
 *
 * Two of the three halves of that were already fixed: the two arenas now have
 * real preview media behind the loading surface, and `arena-deployment-briefing`
 * authors per-arena copy for it. The third half was that the briefing module had
 * no consumer — the deployment console still printed the same generic
 * "Preparing <name> authoritative arena state…" it printed before, on all six
 * maps. This is the seam that connects them.
 *
 * It deliberately writes into the console elements that ALREADY exist rather
 * than introducing new ones: the kicker `<small>` and the status `<span>` are
 * both free copy, while the `<em>` stage line and the progress outputs belong to
 * the loader and are never touched here. That keeps the change out of the
 * stylesheet entirely — no new selectors, nothing to restyle — and it is why
 * this returns plain strings the caller assigns to `textContent`.
 */
import { arenaDeploymentBriefing } from '../arena-deployment-briefing';
import type { ArenaId } from '../arena-identity';

export type DeploymentBriefingCopy = Readonly<{
  /** `#deployment-transition-kicker` — release identity plus what this map is. */
  kicker: string;
  /** `#deployment-transition-title` — unchanged, the arena's display name. */
  title: string;
  /** `#deployment-transition-status` — the approach, then the one-line brief. */
  status: string;
}>;

/** The subset of an element this surface writes. Keeps the module DOM-free for tests. */
export type DeploymentBriefingTarget = { textContent: string | null };

export type DeploymentBriefingTargets = Readonly<{
  kicker: DeploymentBriefingTarget;
  title: DeploymentBriefingTarget;
  status: DeploymentBriefingTarget;
}>;

/**
 * @param releaseKicker the existing "PASS nn // DEPLOYMENT STREAM" identity, kept
 * so the loading surface still says which build the player is looking at.
 * @param displayName the arena's menu name, which the title already shows.
 */
export function deploymentBriefingCopy(
  arenaId: ArenaId,
  displayName: string,
  releaseKicker: string,
): DeploymentBriefingCopy {
  const briefing = arenaDeploymentBriefing(arenaId);
  return Object.freeze({
    kicker: `${releaseKicker} · ${briefing.kicker}`,
    title: displayName.toUpperCase(),
    status: `${briefing.approach} — ${briefing.briefing}`,
  });
}

/** Writes the copy onto the console. Returns what it wrote, for assertions. */
export function applyDeploymentBriefing(
  targets: DeploymentBriefingTargets,
  arenaId: ArenaId,
  displayName: string,
  releaseKicker: string,
): DeploymentBriefingCopy {
  const copy = deploymentBriefingCopy(arenaId, displayName, releaseKicker);
  targets.kicker.textContent = copy.kicker;
  targets.title.textContent = copy.title;
  targets.status.textContent = copy.status;
  return copy;
}
