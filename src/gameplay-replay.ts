import {
  SIMULATION_HZ,
  MELEE_COOLDOWN_MS,
  WEAPONS,
  beginReload,
  completeReload,
  computeDamage,
  computeRecoilImpulse,
  computeSpread,
  integrateHorizontalVelocity,
  meleeStrike,
  movementProfile,
  recoverRecoilImpulse,
  sampleWeaponPellet,
  type HitZone,
  type ReloadState,
  type RecoilImpulse,
  type Stance,
} from './gameplay';
import type { WeaponId } from './protocol';
import { createRandomStreams, type DeterministicRng } from './deterministic-rng';
import { canonicalStateHash } from './canonical-state';

export type ReplayMovementContext = {
  stance: Stance;
  ads: boolean;
  sprinting: boolean;
  grounded: boolean;
};

export type ReplayCommand =
  | { type: 'move'; ticks: number; x: number; z: number; context: ReplayMovementContext }
  | { type: 'wait'; ticks: number }
  | { type: 'switch'; weapon: WeaponId }
  | { type: 'fire'; distance: number; zone: HitZone; context: Omit<ReplayMovementContext, 'grounded'> }
  | { type: 'reload' }
  | { type: 'melee'; distance: number }
  | { type: 'respawn' };

export type GameplayReplayState = {
  tick: number;
  nowMs: number;
  position: { x: number; z: number };
  velocity: { x: number; z: number };
  weapon: WeaponId;
  ammo: Record<WeaponId, number>;
  reserve: Record<WeaponId, number>;
  reload: ReloadState | null;
  nextFireAt: number;
  lastShotAt: number;
  sustainedShots: number;
  recoil: RecoilImpulse;
  targetHp: number;
  lastMeleeAt: number;
  admittedShots: number;
  principalRayOffsets: Array<{ x: number; y: number }>;
  peripheralSpreadSamples: Array<{ x: number; y: number }>;
  transitions: string[];
  rngState: number;
};

export type ReplayTickHash = { tick: number; hash: string };
export type GameplayReplayResult = {
  state: GameplayReplayState;
  hash: string;
  timeline: ReplayTickHash[];
  checkpoints: Array<{ commandIndex: number; tick: number; hash: string }>;
  shotSchedule: string[];
};

const weaponIds = Object.keys(WEAPONS) as WeaponId[];
const stepSeconds = 1 / SIMULATION_HZ;
const stepMs = 1_000 / SIMULATION_HZ;
const rounded = (value: number): number => Number(value.toFixed(9));

export function createGameplayReplayState(seed = 'atomic-acres-pass24'): { state: GameplayReplayState; rng: DeterministicRng } {
  const rng = createRandomStreams(seed).gameplay;
  const ammo = Object.fromEntries(weaponIds.map((id) => [id, WEAPONS[id].mag])) as Record<WeaponId, number>;
  const reserve = Object.fromEntries(weaponIds.map((id) => [id, WEAPONS[id].reserve])) as Record<WeaponId, number>;
  return {
    rng,
    state: {
      tick: 0,
      nowMs: 0,
      position: { x: 0, z: 0 },
      velocity: { x: 0, z: 0 },
      weapon: 'carbine',
      ammo,
      reserve,
      reload: null,
      nextFireAt: 0,
      lastShotAt: -1_000_000_000,
      sustainedShots: 0,
      recoil: { pitch: 0, yaw: 0 },
      targetHp: 100,
      lastMeleeAt: -1_000_000_000,
      admittedShots: 0,
      principalRayOffsets: [],
      peripheralSpreadSamples: [],
      transitions: [],
      rngState: rng.snapshot(),
    },
  };
}

function advanceOneTick(state: GameplayReplayState, timeline?: ReplayTickHash[]): void {
  state.tick += 1;
  state.nowMs = rounded(state.tick * stepMs);
  state.recoil = recoverRecoilImpulse(state.recoil, WEAPONS[state.weapon], stepSeconds);
  if (state.reload) {
    const result = completeReload(state.reload, state.nowMs, state.ammo[state.reload.weapon], state.reserve[state.reload.weapon]);
    if (result.completed) {
      state.ammo[state.reload.weapon] = result.ammo;
      state.reserve[state.reload.weapon] = result.reserve;
      state.transitions.push(`reload-complete:${state.reload.weapon}@${state.tick}`);
      state.reload = null;
    }
  }
  timeline?.push({ tick: state.tick, hash: canonicalStateHash(state) });
}

function advanceTicks(state: GameplayReplayState, ticks: number, timeline?: ReplayTickHash[]): void {
  for (let index = 0; index < Math.max(0, Math.floor(ticks)); index += 1) advanceOneTick(state, timeline);
}

export function applyReplayCommand(state: GameplayReplayState, rng: DeterministicRng, command: ReplayCommand, timeline?: ReplayTickHash[]): void {
  switch (command.type) {
    case 'move': {
      for (let index = 0; index < Math.max(0, Math.floor(command.ticks)); index += 1) {
        const context = command.context;
        const profile = movementProfile({
          crouched: context.stance === 'crouch',
          prone: context.stance === 'prone',
          ads: context.ads,
          sprinting: context.sprinting,
          grounded: context.grounded,
        });
        state.velocity = integrateHorizontalVelocity(state.velocity, { x: command.x, z: command.z }, profile, stepSeconds);
        state.position.x = rounded(state.position.x + state.velocity.x * stepSeconds);
        state.position.z = rounded(state.position.z + state.velocity.z * stepSeconds);
        advanceOneTick(state, timeline);
      }
      break;
    }
    case 'wait':
      advanceTicks(state, command.ticks, timeline);
      break;
    case 'switch':
      if (state.weapon !== command.weapon) {
        state.weapon = command.weapon;
        state.reload = null;
        state.sustainedShots = 0;
        state.transitions.push(`switch:${command.weapon}@${state.tick}`);
      }
      break;
    case 'fire': {
      const spec = WEAPONS[state.weapon];
      if (state.reload || state.nowMs + 1e-6 < state.nextFireAt || state.ammo[state.weapon] <= 0) break;
      state.ammo[state.weapon] -= 1;
      state.admittedShots += 1;
      const shotInterval = 60_000 / spec.rpm;
      if (state.nextFireAt === 0 || state.nowMs - state.nextFireAt > shotInterval * 2) state.nextFireAt = state.nowMs;
      state.nextFireAt += shotInterval;
      state.sustainedShots = state.nowMs - state.lastShotAt < 260 ? state.sustainedShots + 1 : 0;
      state.lastShotAt = state.nowMs;
      const impulse = computeRecoilImpulse(spec, state.sustainedShots, rng.next());
      state.recoil = {
        pitch: rounded(state.recoil.pitch + impulse.pitch),
        yaw: rounded(state.recoil.yaw + impulse.yaw),
      };
      const spread = computeSpread(spec, {
        ads: command.context.ads,
        moving: Math.hypot(state.velocity.x, state.velocity.z) > 1.2,
        crouched: command.context.stance === 'crouch',
        prone: command.context.stance === 'prone',
        sustainedShots: state.sustainedShots,
      });
      for (let pellet = 0; pellet < spec.pellets; pellet += 1) {
        const offset = sampleWeaponPellet(spec, pellet, spread, rng.next(), rng.next());
        const sample = { x: rounded(offset.x), y: rounded(offset.y) };
        if (pellet === 0) state.principalRayOffsets.push(sample);
        else state.peripheralSpreadSamples.push(sample);
      }
      state.targetHp = Math.max(0, state.targetHp - computeDamage(spec, command.distance, command.zone));
      state.transitions.push(`fire:${state.weapon}@${state.tick}`);
      break;
    }
    case 'reload': {
      const reload = beginReload(WEAPONS[state.weapon], state.ammo[state.weapon], state.reserve[state.weapon], state.nowMs);
      if (reload) {
        state.reload = reload;
        state.transitions.push(`reload-start:${state.weapon}@${state.tick}`);
      }
      break;
    }
    case 'melee': {
      const strike = meleeStrike(command.distance, state.nowMs, state.lastMeleeAt);
      if (state.nowMs - state.lastMeleeAt >= MELEE_COOLDOWN_MS) {
        state.lastMeleeAt = state.nowMs;
        state.transitions.push(`melee:${strike.hit ? 'hit' : 'miss'}@${state.tick}`);
      }
      if (strike.hit) state.targetHp = Math.max(0, state.targetHp - strike.damage);
      break;
    }
    case 'respawn':
      state.targetHp = 100;
      state.reload = null;
      state.nextFireAt = state.nowMs;
      state.lastShotAt = -1_000_000_000;
      state.sustainedShots = 0;
      state.recoil = { pitch: 0, yaw: 0 };
      for (const id of weaponIds) {
        state.ammo[id] = WEAPONS[id].mag;
        state.reserve[id] = WEAPONS[id].reserve;
      }
      state.transitions.push(`respawn@${state.tick}`);
      break;
  }
  state.rngState = rng.snapshot();
}

export function runGameplayReplay(seed: string, commands: readonly ReplayCommand[]): GameplayReplayResult {
  const replay = createGameplayReplayState(seed);
  const timeline: ReplayTickHash[] = [{ tick: replay.state.tick, hash: canonicalStateHash(replay.state) }];
  const checkpoints: GameplayReplayResult['checkpoints'] = [];
  commands.forEach((command, commandIndex) => {
    applyReplayCommand(replay.state, replay.rng, command, timeline);
    checkpoints.push({ commandIndex, tick: replay.state.tick, hash: canonicalStateHash(replay.state) });
  });
  return {
    state: replay.state,
    hash: canonicalStateHash(replay.state),
    timeline,
    checkpoints,
    shotSchedule: replay.state.transitions.filter((transition) => transition.startsWith('fire:')),
  };
}

export const GOLDEN_REPLAYS: Readonly<Record<string, readonly ReplayCommand[]>> = {
  locomotion: [
    { type: 'move', ticks: 120, x: 0, z: 1, context: { stance: 'stand', ads: false, sprinting: false, grounded: true } },
    { type: 'move', ticks: 60, x: 0, z: 0, context: { stance: 'stand', ads: false, sprinting: false, grounded: true } },
    { type: 'move', ticks: 120, x: 0.6, z: 1, context: { stance: 'stand', ads: false, sprinting: true, grounded: true } },
    { type: 'move', ticks: 90, x: -1, z: 0, context: { stance: 'crouch', ads: false, sprinting: false, grounded: true } },
  ],
  weaponCycle: weaponIds.flatMap((weapon) => [
    { type: 'switch', weapon } as const,
    { type: 'fire', distance: 18, zone: 'body', context: { stance: 'stand', ads: true, sprinting: false } } as const,
    { type: 'wait', ticks: Math.ceil((60_000 / WEAPONS[weapon].rpm) / stepMs) } as const,
    { type: 'fire', distance: 18, zone: 'head', context: { stance: 'crouch', ads: true, sprinting: false } } as const,
    { type: 'reload' } as const,
    { type: 'wait', ticks: Math.ceil((WEAPONS[weapon].reload * 1_000) / stepMs) + 1 } as const,
  ]),
  interruption: [
    { type: 'fire', distance: 40, zone: 'limb', context: { stance: 'stand', ads: false, sprinting: true } },
    { type: 'reload' },
    { type: 'wait', ticks: 30 },
    { type: 'switch', weapon: 'pistol' },
    { type: 'wait', ticks: 80 },
    { type: 'melee', distance: 2 },
    { type: 'wait', ticks: 80 },
    { type: 'melee', distance: 1 },
    { type: 'respawn' },
  ],
};
