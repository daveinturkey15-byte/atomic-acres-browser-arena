import { arenaLightingProfile } from './blender-lighting';
import { ARENA_BOUNDS, COVER_LAYOUT, GARAGE_LAYOUT, HOUSE_LAYOUT, PATROL_LAYOUT, SPAWN_LAYOUT } from './arena-layout';
import {
  BOT_DAMAGE_MULTIPLIER,
  GRENADE_MAX_DAMAGE,
  GRENADE_RADIUS,
  MATCH_DURATION_MS,
  MATCH_SCORE_LIMIT,
  MATCH_WARMUP_MS,
  MELEE_COOLDOWN_MS,
  MELEE_DAMAGE,
  MELEE_RANGE,
  SIMULATION_HZ,
  WEAPONS,
  movementProfile,
} from './gameplay';
import { createHouseArchitecture } from './house-navigation';
import { SOLO_BOT_COUNT } from './bot-ai';
import {
  FIELD_SUPPORT,
  HUNTER_SWARM_BLAST_RADIUS,
  HUNTER_SWARM_COUNT,
  HUNTER_SWARM_DIRECT_DAMAGE,
  HUNTER_SWARM_DIRECT_RADIUS,
  HUNTER_SWARM_PRONE_MULTIPLIER,
  HUNTER_SWARM_SPLASH_DAMAGE,
  NUKE_DAMAGE,
  NUKE_WARNING_MS,
  TRI_PASS_BLAST_RADIUS,
  TRI_PASS_MAX_DAMAGE,
} from './field-support';
import {
  DEATH_DROP_INTERACTION_RANGE,
  DEATH_DROP_LIFETIME_MS,
  DEATH_DROP_SCAVENGE_HORIZONTAL_RANGE,
  DEATH_DROP_SCAVENGE_VERTICAL_RANGE,
  MAX_DEATH_DROPS,
} from './death-drops';
import { FIELD_KITS } from './loadout';
import { REMOTE_INTERPOLATION_RATE, STATE_BROADCAST_INTERVAL_MS } from './network-sync';
import { CHARACTER_PHYSICS_CONFIG, STANCE_SHAPES } from './physics';
import { renderProfileConfig, resolveRenderProfile, type RenderProfile } from './render-profile';
import {
  OVERDRIVE_DAMAGE_MULTIPLIER,
  OVERDRIVE_DURATION_MS,
  OVERDRIVE_PICKUP_RADIUS,
  OVERDRIVE_POSITION,
  OVERDRIVE_SPAWN_INTERVAL_MS,
} from './overdrive';

const renderProfiles: readonly RenderProfile[] = ['performance', 'blender', 'compat'];
const movementContexts = {
  walk: { crouched: false, prone: false, ads: false, sprinting: false, grounded: true },
  sprint: { crouched: false, prone: false, ads: false, sprinting: true, grounded: true },
  ads: { crouched: false, prone: false, ads: true, sprinting: false, grounded: true },
  crouch: { crouched: true, prone: false, ads: false, sprinting: false, grounded: true },
  prone: { crouched: false, prone: true, ads: false, sprinting: false, grounded: true },
  airborne: { crouched: false, prone: false, ads: false, sprinting: false, grounded: false },
} as const;

export function buildGameplayContract(): Record<string, unknown> {
  const houses = HOUSE_LAYOUT.map((entry) => createHouseArchitecture(entry.team, entry.x, entry.z, entry.facing));
  return {
    schemaVersion: 2,
    authority: 'Pass 24 gameplay feel with owner-approved Pass 25A through Pass 31 deltas',
    simulation: {
      hz: SIMULATION_HZ,
      maximumFrameDtSeconds: 0.05,
      maximumCatchupSteps: 6,
    },
    movement: Object.fromEntries(Object.entries(movementContexts).map(([id, context]) => [id, movementProfile(context)])),
    physics: {
      controller: CHARACTER_PHYSICS_CONFIG,
      stances: STANCE_SHAPES,
    },
    combat: {
      botDamageMultiplier: BOT_DAMAGE_MULTIPLIER,
      soloBotCount: SOLO_BOT_COUNT,
      weapons: Object.values(WEAPONS).map((weapon) => ({ ...weapon })),
      grenade: { radius: GRENADE_RADIUS, maximumDamage: GRENADE_MAX_DAMAGE },
      melee: { cooldownMs: MELEE_COOLDOWN_MS, range: MELEE_RANGE, damage: MELEE_DAMAGE },
      match: { warmupMs: MATCH_WARMUP_MS, durationMs: MATCH_DURATION_MS, scoreLimit: MATCH_SCORE_LIMIT },
      overdrive: {
        spawnIntervalMs: OVERDRIVE_SPAWN_INTERVAL_MS,
        durationMs: OVERDRIVE_DURATION_MS,
        damageMultiplier: OVERDRIVE_DAMAGE_MULTIPLIER,
        pickupRadius: OVERDRIVE_PICKUP_RADIUS,
        position: [OVERDRIVE_POSITION.x, OVERDRIVE_POSITION.y, OVERDRIVE_POSITION.z],
      },
    },
    inventory: {
      fieldKits: FIELD_KITS,
      deathDrops: {
        lifetimeMs: DEATH_DROP_LIFETIME_MS,
        interactionRange: DEATH_DROP_INTERACTION_RANGE,
        scavengeHorizontalRange: DEATH_DROP_SCAVENGE_HORIZONTAL_RANGE,
        scavengeVerticalRange: DEATH_DROP_SCAVENGE_VERTICAL_RANGE,
        maximumActive: MAX_DEATH_DROPS,
      },
      fieldSupport: {
        rewards: FIELD_SUPPORT,
        triPass: { blastRadius: TRI_PASS_BLAST_RADIUS, maximumDamage: TRI_PASS_MAX_DAMAGE },
        hunterSwarm: {
          count: HUNTER_SWARM_COUNT,
          directRadius: HUNTER_SWARM_DIRECT_RADIUS,
          blastRadius: HUNTER_SWARM_BLAST_RADIUS,
          directDamage: HUNTER_SWARM_DIRECT_DAMAGE,
          splashDamage: HUNTER_SWARM_SPLASH_DAMAGE,
          proneMultiplier: HUNTER_SWARM_PRONE_MULTIPLIER,
        },
        nuke: { warningMs: NUKE_WARNING_MS, damage: NUKE_DAMAGE, hostileOnly: true },
      },
    },
    networking: {
      stateBroadcastIntervalMs: STATE_BROADCAST_INTERVAL_MS,
      remoteInterpolationRate: REMOTE_INTERPOLATION_RATE,
    },
    arena: {
      bounds: ARENA_BOUNDS,
      houseLayout: HOUSE_LAYOUT,
      garageLayout: GARAGE_LAYOUT,
      coverLayout: COVER_LAYOUT,
      spawnLayout: SPAWN_LAYOUT,
      patrolLayout: PATROL_LAYOUT,
      houses: houses.map((house) => ({
        id: house.id,
        team: house.team,
        origin: house.origin,
        dimensions: house.dimensions,
        solids: house.solids.map((solid) => ({ id: solid.id, position: solid.position, size: solid.size, collidable: solid.collidable, kind: solid.kind, rotation: solid.rotation })),
        openings: house.openings,
        anchors: house.anchors,
        routes: house.routes,
      })),
    },
    rendering: {
      defaultProfile: resolveRenderProfile('', null),
      profiles: Object.fromEntries(renderProfiles.map((profile) => [profile, {
        config: renderProfileConfig(profile),
        lighting: arenaLightingProfile(profile),
      }])),
    },
  };
}
