import { describe, it } from 'vitest';
import fc from 'fast-check';
import { WEAPONS, type HitZone, type Stance } from './gameplay';
import {
  applyReplayCommand,
  createGameplayReplayState,
  runGameplayReplay,
  type ReplayCommand,
  type ReplayMovementContext,
} from './gameplay-replay';
import type { WeaponId } from './protocol';

const configuredRuns = Number.parseInt(process.env.PASS25_PROPERTY_RUNS ?? '10000', 10);
const propertyRuns = Number.isFinite(configuredRuns) ? Math.max(1, Math.min(100_000, configuredRuns)) : 10_000;
const propertyTimeoutMs = propertyRuns >= 100_000 ? 240_000 : 60_000;
const weapons = Object.keys(WEAPONS) as WeaponId[];
const stances: Stance[] = ['stand', 'crouch', 'prone'];
const zones: HitZone[] = ['head', 'body', 'limb'];

const movementContextArbitrary = fc.record({
  stance: fc.constantFrom(...stances),
  ads: fc.boolean(),
  sprinting: fc.boolean(),
  grounded: fc.boolean(),
}) as fc.Arbitrary<ReplayMovementContext>;

const fireContextArbitrary = fc.record({
  stance: fc.constantFrom(...stances),
  ads: fc.boolean(),
  sprinting: fc.boolean(),
});

const commandArbitrary: fc.Arbitrary<ReplayCommand> = fc.oneof(
  fc.record({
    type: fc.constant('move' as const),
    ticks: fc.integer({ min: 0, max: 24 }),
    x: fc.double({ min: -1.5, max: 1.5, noNaN: true, noDefaultInfinity: true }),
    z: fc.double({ min: -1.5, max: 1.5, noNaN: true, noDefaultInfinity: true }),
    context: movementContextArbitrary,
  }),
  fc.record({ type: fc.constant('wait' as const), ticks: fc.integer({ min: 0, max: 180 }) }),
  fc.record({ type: fc.constant('switch' as const), weapon: fc.constantFrom(...weapons) }),
  fc.record({
    type: fc.constant('fire' as const),
    distance: fc.double({ min: 0, max: 140, noNaN: true, noDefaultInfinity: true }),
    zone: fc.constantFrom(...zones),
    context: fireContextArbitrary,
  }),
  fc.constant({ type: 'reload' as const }),
  fc.record({ type: fc.constant('melee' as const), distance: fc.double({ min: 0, max: 4, noNaN: true, noDefaultInfinity: true }) }),
  fc.constant({ type: 'respawn' as const }),
);

function assertStateInvariants(state: ReturnType<typeof createGameplayReplayState>['state']): void {
  if (![state.position.x, state.position.z, state.velocity.x, state.velocity.z, state.recoil.pitch, state.recoil.yaw].every(Number.isFinite)) {
    throw new Error('non-finite movement or recoil state');
  }
  if (state.tick < 0 || state.targetHp < 0 || state.targetHp > 100) throw new Error('tick or health outside contract');
  if (!state.principalRayOffsets.every(({ x, y }) => x === 0 && y === 0)) throw new Error('principal projectile left the authoritative centre ray');
  for (const weapon of weapons) {
    if (state.ammo[weapon] < 0 || state.ammo[weapon] > WEAPONS[weapon].mag) throw new Error(`${weapon} magazine outside contract`);
    if (state.reserve[weapon] < 0 || state.reserve[weapon] > WEAPONS[weapon].reserve) throw new Error(`${weapon} reserve outside contract`);
  }
}

describe(`generated gameplay-state sequences (${propertyRuns} runs)`, () => {
  it('preserves combat, movement and inventory invariants under conflicting actions', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 24 }), fc.array(commandArbitrary, { minLength: 1, maxLength: 60 }), (seed, commands) => {
        const replay = createGameplayReplayState(seed);
        for (const command of commands) {
          applyReplayCommand(replay.state, replay.rng, command);
          assertStateInvariants(replay.state);
        }
      }),
      { numRuns: propertyRuns, endOnFailure: true },
    );
  }, propertyTimeoutMs);

  it('replays every generated sequence to the same canonical hash', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 24 }), fc.array(commandArbitrary, { minLength: 1, maxLength: 40 }), (seed, commands) => {
        const first = runGameplayReplay(seed, commands);
        const second = runGameplayReplay(seed, commands);
        if (second.hash !== first.hash) throw new Error(`replay hash diverged: ${first.hash} != ${second.hash}`);
      }),
      { numRuns: Math.max(1_000, Math.floor(propertyRuns / 5)), endOnFailure: true },
    );
  }, propertyTimeoutMs);
});
