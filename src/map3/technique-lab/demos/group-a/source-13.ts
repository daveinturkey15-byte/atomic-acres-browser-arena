/**
 * Source 13 — Gauntlet loop (`somethingbig.ai/gauntlet-loop`, `mshumer/Claude-of-Duty`).
 *
 * Primary sources read 2026-09-12. The article page was fetched and its embedded
 * HowTo schema carries the method as five named steps, verbatim titles:
 *   1. "Give it the goal, not your implementation"
 *   2. "Give it a real bar"            — something concrete it can inspect and compare against
 *   3. "Let the agent split the work"  — smallest pieces that can be judged separately
 *   4. "Never let the builder grade itself" — a fresh critic with no access to the builder's history
 *   5. "Let it keep going"             — do not fix rounds in advance; stop on result, on
 *                                        diminishing returns, or on spend
 * The example repository was read at pin `d9b237b75c9304ab8d9ef4cfa0c3568c7c11a853`:
 * `prompt.md` in full (the entire prompt that produced it) and `ARCHITECTURE.md`.
 * Licence: MIT (LICENSE read, 1,064 bytes). The article text is marketing, not
 * code authority.
 *
 * This is a harness technique, so the deliverable is the loop itself, executed.
 * `runGauntlet` below is a real bounded runner: round cap, wall-clock budget, a
 * frozen regression list that can only be added to, and a critic that is handed
 * ONLY the artefact — never the builder's history. It runs at construction time
 * on a tiny visual artefact (a silhouette the critic scores against a bar), and
 * the scene shows round 0 beside the accepted round with the round log attached.
 *
 * No model is called. Builder and critic are pure functions, which is exactly why
 * this proves the LOOP MECHANICS and nothing about agent quality.
 */

import {
  DisposalRegistry,
  countDrawables,
  countTriangles,
  makeRng,
  sideBySide,
  type Demo,
  type DemoContext,
  type ThreeNamespace,
} from './_shared';
import type * as THREE_NS from 'three';

export interface GauntletParams {
  /** Step 2: the bar. Concrete, inspectable, not a vibe. */
  bar: { minScore: number; requiredFeatures: string[] };
  maxRounds: number;
  wallClockMs: number;
  /** Step 5's stop condition: give up when rounds stop buying anything. */
  minImprovement: number;
}

export interface RoundLog {
  round: number;
  score: number;
  features: string[];
  regressionsBroken: string[];
  verdict: 'reject' | 'accept' | 'budget-exhausted' | 'stalled';
}

export interface Candidate {
  features: string[];
  /** Deliberately separate from the critic's score: a builder does not grade. */
  builderNotes: string;
}

/**
 * The critic. It receives the artefact and the bar. It does NOT receive the
 * builder's notes, its previous attempts, or its reasoning — step 4, enforced by
 * the signature rather than by instruction.
 */
export function critique(
  candidate: Pick<Candidate, 'features'>,
  bar: GauntletParams['bar'],
  frozen: string[],
): { score: number; missing: string[]; regressionsBroken: string[] } {
  const missing = bar.requiredFeatures.filter((f) => !candidate.features.includes(f));
  const regressionsBroken = frozen.filter((f) => !candidate.features.includes(f));
  const score = Math.max(0, 1 - missing.length / Math.max(1, bar.requiredFeatures.length));
  return { score, missing, regressionsBroken };
}

export function runGauntlet(
  params: GauntletParams,
  build: (round: number, missing: string[], previous: Candidate | null) => Candidate,
  now: () => number = () => Date.now(),
): { log: RoundLog[]; accepted: Candidate | null; frozen: string[] } {
  const started = now();
  const frozen: string[] = [];
  const log: RoundLog[] = [];
  let previous: Candidate | null = null;
  let bestScore = -1;

  for (let round = 0; round < params.maxRounds; round += 1) {
    const missing = round === 0 ? params.bar.requiredFeatures.slice() : critique(previous!, params.bar, frozen).missing;
    const candidate = build(round, missing, previous);
    const verdictDetail = critique(candidate, params.bar, frozen);

    // A broken frozen regression is never traded away for a higher score.
    if (verdictDetail.regressionsBroken.length > 0) {
      log.push({
        round,
        score: verdictDetail.score,
        features: candidate.features,
        regressionsBroken: verdictDetail.regressionsBroken,
        verdict: 'reject',
      });
      previous = previous ?? candidate;
      continue;
    }

    // Anything that passed once is frozen from here on.
    for (const feature of candidate.features) if (!frozen.includes(feature)) frozen.push(feature);

    const accepted = verdictDetail.score >= params.bar.minScore;
    const improvement = verdictDetail.score - bestScore;
    bestScore = Math.max(bestScore, verdictDetail.score);
    previous = candidate;

    if (accepted) {
      log.push({ round, score: verdictDetail.score, features: candidate.features, regressionsBroken: [], verdict: 'accept' });
      return { log, accepted: candidate, frozen };
    }
    if (now() - started > params.wallClockMs) {
      log.push({ round, score: verdictDetail.score, features: candidate.features, regressionsBroken: [], verdict: 'budget-exhausted' });
      return { log, accepted: null, frozen };
    }
    if (round > 0 && improvement < params.minImprovement) {
      log.push({ round, score: verdictDetail.score, features: candidate.features, regressionsBroken: [], verdict: 'stalled' });
      return { log, accepted: null, frozen };
    }
    log.push({ round, score: verdictDetail.score, features: candidate.features, regressionsBroken: [], verdict: 'reject' });
  }
  return { log, accepted: null, frozen };
}

const BAR = {
  minScore: 1,
  requiredFeatures: ['silhouette', 'material-contrast', 'grounded-contact', 'readable-scale'],
};

/** The artefact the loop is actually improving, so the loop is not abstract. */
function buildArtefact(
  THREE: ThreeNamespace,
  registry: DisposalRegistry,
  features: string[],
  seed: number,
): THREE_NS.Group {
  const rng = makeRng(seed);
  const group = new THREE.Group();

  const hasContrast = features.includes('material-contrast');
  const base = registry.track(
    new THREE.MeshStandardMaterial({ color: 0x6a6a70, roughness: hasContrast ? 0.85 : 0.5, metalness: 0.05 }),
  );
  const accent = registry.track(
    new THREE.MeshStandardMaterial({
      color: hasContrast ? 0x2e3338 : 0x6a6a70,
      roughness: hasContrast ? 0.3 : 0.5,
      metalness: hasContrast ? 0.8 : 0.05,
    }),
  );

  const scale = features.includes('readable-scale') ? 1 : 0.45;
  const bodyGeometry = registry.track(new THREE.BoxGeometry(0.3 * scale, 0.5 * scale, 0.22 * scale));
  const body = new THREE.Mesh(bodyGeometry, base);
  body.position.y = features.includes('grounded-contact') ? 0.25 * scale : 0.55;
  group.add(body);

  if (features.includes('silhouette')) {
    // A distinct read: a raised shoulder line and a canted head, not a box.
    const headGeometry = registry.track(new THREE.SphereGeometry(0.09 * scale, 10, 8));
    const head = new THREE.Mesh(headGeometry, accent);
    head.position.set(0.02 * scale, body.position.y + 0.32 * scale, 0);
    group.add(head);
    const armGeometry = registry.track(new THREE.BoxGeometry(0.08 * scale, 0.3 * scale, 0.08 * scale));
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(armGeometry, accent);
      arm.position.set(side * 0.2 * scale, body.position.y + 0.05 * scale, 0);
      arm.rotation.z = side * (0.25 + rng() * 0.1);
      group.add(arm);
    }
  }
  return group;
}

export function createDemo(context: DemoContext): Demo {
  const { THREE } = context;
  const registry = new DisposalRegistry();

  // The builder: adds one missing feature per round. Pure, deterministic, and
  // with no opinion about whether it succeeded.
  const build = (round: number, missing: string[], previous: Candidate | null): Candidate => {
    const features = previous ? previous.features.slice() : [];
    if (missing.length > 0) features.push(missing[0]);
    return { features, builderNotes: `round ${round}: added ${missing[0] ?? 'nothing'}` };
  };

  let clock = 0;
  const result = runGauntlet(
    { bar: BAR, maxRounds: 8, wallClockMs: 10_000, minImprovement: 0.01 },
    build,
    () => (clock += 50),
  );

  const first = buildArtefact(THREE, registry, result.log[0]?.features ?? [], context.seed);
  const final = buildArtefact(THREE, registry, result.accepted?.features ?? [], context.seed);
  first.name = 'before:round-0-artefact';
  final.name = result.accepted ? 'after:accepted-artefact' : 'after:not-accepted';

  const root = sideBySide(THREE, registry, first, final, 1.6);
  root.name = 'source-13:gauntlet-loop';
  root.userData.gauntlet = { log: result.log, frozen: result.frozen, bar: BAR };

  const metadata = {
    sourceId: 13,
    title: 'Gauntlet loop',
    method:
      'Bounded propose-falsify-verify: a concrete inspectable bar, work split into separately judgeable pieces, a fresh critic that is structurally denied the builder history, a frozen regression list that may only grow, and round plus wall-clock plus diminishing-returns stop conditions.',
    adaptation: 'adapted' as const,
    sources: [
      'https://somethingbig.ai/gauntlet-loop',
      'https://github.com/mshumer/Claude-of-Duty',
      'mshumer/Claude-of-Duty@d9b237b75c9304ab8d9ef4cfa0c3568c7c11a853 prompt.md, ARCHITECTURE.md (MIT)',
    ],
    limitation:
      'No model is called: builder and critic are pure functions, so this is evidence about loop mechanics - regression refusal, budget exhaustion, stall detection - and not about whether an agent would improve an artefact. The example repository upstream records low gameplay FPS and lazy-shader stalls, so reported visual iteration there does not prove gameplay, and the article text is marketing rather than code authority.',
    counters: {
      triangles: countTriangles(root),
      drawables: countDrawables(root),
      rounds: result.log.length,
      frozenRegressions: result.frozen.length,
      accepted: result.accepted ? 1 : 0,
    },
  };

  return {
    root,
    update(time: number) {
      first.rotation.y = time * 0.4;
      final.rotation.y = time * 0.4;
    },
    dispose() {
      registry.run();
    },
    metadata,
  };
}

export default createDemo;
