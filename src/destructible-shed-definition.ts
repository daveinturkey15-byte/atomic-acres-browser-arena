import {
  ARENA_MAX_AWAKE_SHED_BODIES,
  SHED_MAX_APERTURES,
  SHED_MAX_DENTS,
  SHED_MAX_MAJOR_CHUNKS,
  WORLD_COLLISION_CONSUMERS,
  type DestructibleShedDefinition,
} from './destructible-world';

const ROOF_COS = Math.sqrt(3) / 2;
const ROOF_SIN = 0.5;

/**
 * One canonical identity shared by placement, authority and presentation.
 * Arena builders may place or rotate this definition, but may not clone and
 * silently retune its surfaces or materials per map.
 */
export const FIELD_SHED_DEFINITION: DestructibleShedDefinition = Object.freeze({
  schemaVersion: 1,
  id: 'field-shed-v1',
  doorSurfaceId: 'door-south',
  surfaces: Object.freeze([
    Object.freeze({
      id: 'door-south', role: 'door' as const, detachableChunkId: 'chunk-door',
      frame: Object.freeze({ centre: { x: 0, y: 1.1, z: 2.1 }, uAxis: { x: 1, y: 0, z: 0 }, vAxis: { x: 0, y: 1, z: 0 }, halfU: 0.72, halfV: 1.1 }),
    }),
    Object.freeze({
      id: 'wall-north', role: 'wall' as const, detachableChunkId: 'chunk-north',
      frame: Object.freeze({ centre: { x: 0, y: 1.2, z: -2.1 }, uAxis: { x: -1, y: 0, z: 0 }, vAxis: { x: 0, y: 1, z: 0 }, halfU: 1.8, halfV: 1.2 }),
    }),
    Object.freeze({
      id: 'wall-east', role: 'wall' as const, detachableChunkId: 'chunk-east',
      frame: Object.freeze({ centre: { x: 1.8, y: 1.2, z: 0 }, uAxis: { x: 0, y: 0, z: -1 }, vAxis: { x: 0, y: 1, z: 0 }, halfU: 2.1, halfV: 1.2 }),
    }),
    Object.freeze({
      id: 'wall-west', role: 'wall' as const, detachableChunkId: 'chunk-west',
      frame: Object.freeze({ centre: { x: -1.8, y: 1.2, z: 0 }, uAxis: { x: 0, y: 0, z: 1 }, vAxis: { x: 0, y: 1, z: 0 }, halfU: 2.1, halfV: 1.2 }),
    }),
    Object.freeze({
      id: 'wall-south-left', role: 'wall' as const, detachableChunkId: null,
      frame: Object.freeze({ centre: { x: -1.26, y: 1.2, z: 2.1 }, uAxis: { x: 1, y: 0, z: 0 }, vAxis: { x: 0, y: 1, z: 0 }, halfU: 0.54, halfV: 1.2 }),
    }),
    Object.freeze({
      id: 'wall-south-right', role: 'wall' as const, detachableChunkId: null,
      frame: Object.freeze({ centre: { x: 1.26, y: 1.2, z: 2.1 }, uAxis: { x: 1, y: 0, z: 0 }, vAxis: { x: 0, y: 1, z: 0 }, halfU: 0.54, halfV: 1.2 }),
    }),
    Object.freeze({
      id: 'wall-south-header', role: 'wall' as const, detachableChunkId: null,
      frame: Object.freeze({ centre: { x: 0, y: 2.3, z: 2.1 }, uAxis: { x: 1, y: 0, z: 0 }, vAxis: { x: 0, y: 1, z: 0 }, halfU: 0.72, halfV: 0.1 }),
    }),
    // Pass 79 owner report ("I keep seeing through its walls"): the envelope
    // skinned four walls stopping at the 2.4 m eaves plus two roof sheets
    // rising to the 3.44 m ridge, and nothing at all between them. That left
    // 1.872 m^2 of open air at each end - 17.8% of the end cross-section,
    // permanently, on an undamaged shed (probed in
    // destructible-shed-definition.test.ts). These two panels are the gable
    // closures. They carry no detachable chunk because the six pre-authored
    // major chunks are frozen by SHED_MAX_MAJOR_CHUNKS and by the one-to-one
    // chunk/surface rule. Their frame is the gable BOUNDING box (2.40 m eaves
    // to 3.44 m ridge -> centre 2.92, halfV 0.52); clipping the rendered
    // outline down to the triangle is presentation's job, not the envelope's.
    Object.freeze({
      id: 'gable-north', role: 'wall' as const, detachableChunkId: null,
      frame: Object.freeze({ centre: { x: 0, y: 2.92, z: -2.1 }, uAxis: { x: -1, y: 0, z: 0 }, vAxis: { x: 0, y: 1, z: 0 }, halfU: 1.8, halfV: 0.52, outlineUVQ: Object.freeze([Object.freeze({ uQ: -10_000, vQ: -10_000 }), Object.freeze({ uQ: 10_000, vQ: -10_000 }), Object.freeze({ uQ: 0, vQ: 10_000 })]), }),
    }),
    Object.freeze({
      id: 'gable-south', role: 'wall' as const, detachableChunkId: null,
      frame: Object.freeze({ centre: { x: 0, y: 2.92, z: 2.1 }, uAxis: { x: 1, y: 0, z: 0 }, vAxis: { x: 0, y: 1, z: 0 }, halfU: 1.8, halfV: 0.52, outlineUVQ: Object.freeze([Object.freeze({ uQ: -10_000, vQ: -10_000 }), Object.freeze({ uQ: 10_000, vQ: -10_000 }), Object.freeze({ uQ: 0, vQ: 10_000 })]), }),
    }),
    Object.freeze({
      id: 'roof-east', role: 'roof' as const, detachableChunkId: 'chunk-roof-east',
      frame: Object.freeze({ centre: { x: 0.9, y: 2.92, z: 0 }, uAxis: { x: 0, y: 0, z: -1 }, vAxis: { x: -ROOF_COS, y: ROOF_SIN, z: 0 }, halfU: 2.22, halfV: 1.04 }),
    }),
    Object.freeze({
      id: 'roof-west', role: 'roof' as const, detachableChunkId: 'chunk-roof-west',
      frame: Object.freeze({ centre: { x: -0.9, y: 2.92, z: 0 }, uAxis: { x: 0, y: 0, z: 1 }, vAxis: { x: ROOF_COS, y: ROOF_SIN, z: 0 }, halfU: 2.22, halfV: 1.04 }),
    }),
  ]),
  preauthoredChunkIds: Object.freeze([
    'chunk-door', 'chunk-north', 'chunk-east', 'chunk-west', 'chunk-roof-east', 'chunk-roof-west',
  ]),
  // Pass 66.1 owner requirement: every catalogue firearm must punch a visible
  // see-through hole in sheet metal. The weakest round (12ga pellet, 22Q after
  // fmj scaling) must clear the perforate threshold; dents remain for sub-20Q
  // fragments and the detach threshold is unchanged.
  thresholds: Object.freeze({ dentDamageQ: 20, perforateEnergyQ: 21, detachDamageQ: 220 }),
  caps: Object.freeze({
    apertures: SHED_MAX_APERTURES,
    dents: SHED_MAX_DENTS,
    majorChunks: SHED_MAX_MAJOR_CHUNKS,
    arenaAwakeMajorBodies: ARENA_MAX_AWAKE_SHED_BODIES,
  }),
  consumers: WORLD_COLLISION_CONSUMERS,
});

export const FIELD_SHED_MATERIAL_POLICY_ID = 'field-shed-material-policy-v1';

export const FIELD_SHED_MATERIAL_IDS = Object.freeze({
  sheet: 'field-shed-sheet-corrugated-green-v1',
  frame: 'field-shed-frame-structural-steel-v1',
  floor: 'field-shed-floor-industrial-v1',
  apertureRim: 'field-shed-aperture-rim-exposed-metal-v1',
  dent: 'field-shed-dent-stressed-metal-v1',
  debris: 'field-shed-debris-corrugated-green-v1',
});

export const FIELD_SHED_BALLISTIC_MATERIAL_ID = 'thin-metal' as const;

/**
 * Thin corrugated panels amplify admitted blast damage relative to actors and
 * structural house fragments. The bounded authored chunk cap still limits how
 * much physical debris one explosion can create.
 */
export const FIELD_SHED_EXPLOSION_DAMAGE_MULTIPLIER = 5;
