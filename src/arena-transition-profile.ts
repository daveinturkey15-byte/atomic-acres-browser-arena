import type { ArenaId } from './map-selection';

export type ArenaTransitionProfilePhase =
  | 'shared-gameplay-assets'
  | 'previous-webgpu-fence'
  | 'arena-construction'
  | 'interactive-world-construction'
  | 'physics-construction'
  | 'authority-commit'
  | 'visual-definition'
  | 'quality-presentation'
  | 'material-tuning'
  | 'art-texture-settle'
  | 'weapon-catalog-prewarm'
  | 'presentation-batching'
  | 'match-authority-reset'
  | 'prewarm-batched-effects'
  | 'prewarm-tracers'
  | 'prewarm-impacts'
  | 'prewarm-grenade-explosion'
  | 'prewarm-support-explosion'
  | 'prewarm-death-drops'
  | 'prewarm-nuke'
  | 'prewarm-overdrive'
  | 'prewarm-grenade-world'
  | 'prewarm-killstreaks'
  | 'prewarm-bot-world-weapons'
  | 'prewarm-smoke'
  | 'prewarm-explosive-bolts'
  | 'coverage-submit-fence'
  | 'retire-previous-arenas'
  | 'commit-bookkeeping'
  | 'rollback'
  | 'finalize';

export type ArenaTransitionPhaseSample = Readonly<{
  phase: ArenaTransitionProfilePhase;
  startedAt: number;
  completedAt: number;
  durationMs: number;
}>;

export type ArenaTransitionProfileSnapshot = Readonly<{
  generation: number;
  arenaId: ArenaId;
  startedAt: number;
  completedAt: number | null;
  durationMs: number;
  outcome: 'active' | 'committed' | 'rolled-back' | 'failed';
  phases: readonly ArenaTransitionPhaseSample[];
}>;

type ActiveProfile = {
  generation: number;
  arenaId: ArenaId;
  startedAt: number;
  phase: ArenaTransitionProfilePhase;
  phaseStartedAt: number;
  phases: ArenaTransitionPhaseSample[];
};

function rounded(value: number): number {
  return Number(Math.max(0, value).toFixed(3));
}

export class ArenaTransitionProfiler {
  private active: ActiveProfile | null = null;
  private completed: ArenaTransitionProfileSnapshot | null = null;

  begin(generation: number, arenaId: ArenaId, now: number, phase: ArenaTransitionProfilePhase): void {
    if (!Number.isSafeInteger(generation) || generation < 1 || !Number.isFinite(now)) {
      throw new Error('Arena transition profile requires a valid generation and monotonic timestamp');
    }
    this.active = { generation, arenaId, startedAt: now, phase, phaseStartedAt: now, phases: [] };
  }

  enter(phase: ArenaTransitionProfilePhase, now: number): void {
    if (!this.active) return;
    this.closePhase(now);
    this.active.phase = phase;
    this.active.phaseStartedAt = Math.max(this.active.phaseStartedAt, now);
  }

  finish(now: number, outcome: Exclude<ArenaTransitionProfileSnapshot['outcome'], 'active'>): ArenaTransitionProfileSnapshot | null {
    if (!this.active) return null;
    this.closePhase(now);
    const completedAt = Math.max(this.active.startedAt, now);
    this.completed = Object.freeze({
      generation: this.active.generation,
      arenaId: this.active.arenaId,
      startedAt: this.active.startedAt,
      completedAt,
      durationMs: rounded(completedAt - this.active.startedAt),
      outcome,
      phases: Object.freeze([...this.active.phases]),
    });
    this.active = null;
    return this.completed;
  }

  snapshot(now: number): ArenaTransitionProfileSnapshot | null {
    if (!this.active) return this.completed;
    const sampleNow = Math.max(this.active.phaseStartedAt, now);
    const phases = [...this.active.phases, Object.freeze({
      phase: this.active.phase,
      startedAt: this.active.phaseStartedAt,
      completedAt: sampleNow,
      durationMs: rounded(sampleNow - this.active.phaseStartedAt),
    })];
    return Object.freeze({
      generation: this.active.generation,
      arenaId: this.active.arenaId,
      startedAt: this.active.startedAt,
      completedAt: null,
      durationMs: rounded(sampleNow - this.active.startedAt),
      outcome: 'active',
      phases: Object.freeze(phases),
    });
  }

  private closePhase(now: number): void {
    if (!this.active) return;
    const completedAt = Math.max(this.active.phaseStartedAt, now);
    this.active.phases.push(Object.freeze({
      phase: this.active.phase,
      startedAt: this.active.phaseStartedAt,
      completedAt,
      durationMs: rounded(completedAt - this.active.phaseStartedAt),
    }));
  }
}
