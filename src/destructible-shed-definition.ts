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
  thresholds: Object.freeze({ dentDamageQ: 20, perforateEnergyQ: 45, detachDamageQ: 220 }),
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
