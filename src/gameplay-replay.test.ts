import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WEAPONS } from './gameplay';
import { GOLDEN_REPLAYS, runGameplayReplay, type ReplayCommand } from './gameplay-replay';
import { createRandomStreams } from './deterministic-rng';

const baselinePath = resolve(import.meta.dirname, '../baselines/pass25a/golden-replays.json');

describe('Pass 25A golden gameplay replays', () => {
  it('repeats every checked state hash and final state', async () => {
    const baseline = JSON.parse(await readFile(baselinePath, 'utf8')) as {
      replays: Record<string, {
        commands: unknown[];
        hash: string;
        finalState: unknown;
        timeline: unknown[];
        checkpoints: unknown[];
        shotSchedule: string[];
      }>;
    };
    for (const [name, commands] of Object.entries(GOLDEN_REPLAYS)) {
      const result = runGameplayReplay(`pass25a:${name}`, commands);
      expect(commands, `${name}: input trace`).toEqual(baseline.replays[name].commands);
      expect(result.hash, `${name}: final hash`).toBe(baseline.replays[name].hash);
      expect(result.state, `${name}: final state`).toEqual(baseline.replays[name].finalState);
      expect(result.timeline, `${name}: per-tick hashes`).toEqual(baseline.replays[name].timeline);
      expect(result.checkpoints, `${name}: command checkpoints`).toEqual(baseline.replays[name].checkpoints);
      expect(result.shotSchedule, `${name}: shot schedule`).toEqual(baseline.replays[name].shotSchedule);
    }
  });

  it('keeps every principal projectile inside the broadest authored weapon cone', () => {
    const result = runGameplayReplay('pass25a:principal-ray', GOLDEN_REPLAYS.weaponCycle);
    expect(result.state.principalRayOffsets.length).toBeGreaterThan(0);
    const maximumOffset = Math.tan(Math.max(...Object.values(WEAPONS).map((weapon) => weapon.maximumSpread)));
    expect(result.state.principalRayOffsets.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y) && Math.hypot(x, y) <= maximumOffset)).toBe(true);
  });

  it('uses the forked gameplay stream in production order and resets sustained fire after 260 ms', () => {
    const seed = 'pass25a:production-rng-order';
    const fire = { type: 'fire', distance: 18, zone: 'body', context: { stance: 'stand', ads: true, sprinting: false } } as const;
    const commands: ReplayCommand[] = [fire, { type: 'wait', ticks: 32 }, fire];
    const result = runGameplayReplay(seed, commands);
    const expected = createRandomStreams(seed).gameplay;
    for (let shot = 0; shot < 2; shot += 1) {
      expected.next(); // recoil draw precedes pellet draws in tryFire()
      expected.next();
      expected.next();
    }
    expect(result.state.rngState).toBe(expected.snapshot());
    expect(result.state.sustainedShots).toBe(0);

    const rapid = runGameplayReplay(seed, [fire, { type: 'wait', ticks: 12 }, fire]);
    expect(rapid.state.sustainedShots).toBe(1);
  });
});
