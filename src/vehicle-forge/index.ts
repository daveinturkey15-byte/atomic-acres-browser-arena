/**
 * vehicle-forge - vehicles built from data, not from boxes.
 *
 * PRESENTATION ONLY. Nothing exported here returns a collider, a shot surface,
 * a spawn or a navigation edge, and importing this module has no side effect:
 * every entry point is a pure function of its spec.
 */
export {
  ARCH_EXPONENT,
  ARCH_STATIONS,
  RING_POINTS,
  SHUT_LINE_CHAMFER,
  SHUT_LINE_DEPTH,
  SHUT_LINE_HALF,
  archLowerEdge,
  chamferedBar,
  classifyQuad,
  collectStations,
  flankHalfWidth,
  latheGeometry,
  loftBody,
  shutLineInset,
  stationRing,
  surfaceBandAtHeights,
  stripAtHeight,
  topAt,
} from './geometry';
export type { LoftResult, QuadKind, Ring, SpanZ, TopVertex, Vec2, VehicleSpec } from './geometry';

export { hubcapDome, lampParts, wheelParts } from './wheels';
export type { LampParts, WheelParts, WheelStyle } from './wheels';

export {
  createForgeChromeMaterial,
  createForgeGlassMaterial,
  createForgeGrooveMaterial,
  createForgeLampMaterial,
  createForgeLiningMaterial,
  createForgePaintMaterial,
  createForgeTyreMaterial,
  createForgeWheelDarkMaterial,
} from './materials';
export type { LampKind, PaintOptions } from './materials';

export { buildForgedVehicle, buildForgedWheelSet, createForgeMaterialSet, createForgeSharedMaterials, mergeForgedPlacements } from './build';
export type {
  BootSeam,
  CoachVehicleDetail,
  DoorHandleRow,
  ForgedPartBound,
  ForgedVehicle,
  ForgedVehicleMaterials,
  GutterDressing,
  IndicatorDressing,
  LampPlacement,
  GrilleDetail,
  MirrorDetail,
  PanelSeam,
  PillarDressing,
  PlateDressing,
  StackDressing,
  SurfaceBand,
  SaloonVehicleDetail,
  TrailerVehicleDetail,
  VehicleDressing,
  VehicleDetailDressing,
  VentDressing,
  WaistStripe,
  ForgeSharedBucket,
  ForgeSharedMaterials,
  ForgedPlacement,
  ForgedSkinPlacement,
  MergedForgedPlacements,
} from './build';

export {
  COACH_SPEC,
  FORGED_VEHICLE_SPECS,
  FORGED_VEHICLE_TRIANGLE_BUDGETS,
  SEDAN_SPEC,
  TRUCK_CAB_SPEC,
} from './specs';
