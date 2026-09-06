/**
 * forge-kit - HF-536. Parameterised presentation prefabs the arenas share.
 *
 * A prefab returns PARTS, not meshes: offsets, sizes and the material ROLE it
 * wants. The arena emits them through its own `pair()` / `centred()` helpers,
 * so handedness, the 180-degree symmetry gate and the presentation-only flags
 * keep working exactly as they do for authored geometry, and a prefab can
 * never smuggle a collider or a new material into a map (ruleset sec. 1.2).
 */
export type { ForgeKitBox } from './lantern-head';
export {
  LANTERN_HEAD_DIFFUSER_DROP,
  LANTERN_HEAD_HOOD_H,
  LANTERN_HEAD_MOUTH,
  LANTERN_HEAD_TRIANGLES,
  lanternHeadParts,
} from './lantern-head';
export {
  LAMP_POOL_COLOR_HEX,
  LAMP_POOL_OPACITY,
  LAMP_POOL_RADIUS,
  LAMP_POOL_SLAB_H,
  LAMP_POOL_TRIANGLES,
  LAMP_POOL_Y,
  LAMP_POST_HIGHLIGHT,
  getLampPoolMaterial,
  lampPoolParts,
} from './lamp-pool';
export {
  GUTTER_DOWNPIPE,
  GUTTER_RUN_TRIANGLES,
  GUTTER_TROUGH,
  gutterRunParts,
  type GutterRunOptions,
} from './gutter-run';
export {
  KERB_CHAMFER,
  KERB_FACE_PROUD,
  KERB_JOINT_PROUD,
  KERB_STONE_LENGTH,
  kerbCourseParts,
  kerbCourseTriangles,
  type KerbCourseOptions,
} from './kerb-course';
export type { InteriorPart, InteriorRole } from './interior/prefabs';
export {
  ARMCHAIR_TRIANGLES,
  CHAIR_TRIANGLES,
  COFFEE_TABLE_TRIANGLES,
  DINING_TABLE_TRIANGLES,
  FLOOR_LAMP_TRIANGLES,
  GARAGE_INTERIOR_BOXES,
  GARAGE_INTERIOR_TRIANGLES,
  HOUSE_INTERIOR_BOXES,
  HOUSE_INTERIOR_TRIANGLES,
  INTERIOR_BOX_TRIANGLES,
  INTERIOR_ROLES,
  KITCHEN_RUN_TRIANGLES,
  OIL_STAIN_TRIANGLES,
  RACKING_BOXES_TRIANGLES,
  RUG_TRIANGLES,
  SHELF_UNIT_TRIANGLES,
  SOFA_TRIANGLES,
  WALL_ART_TRIANGLES,
  WORKBENCH_DRESSING_TRIANGLES,
  armchairParts,
  chairParts,
  coffeeTableParts,
  diningTableParts,
  floorLampParts,
  kitchenRunParts,
  oilStainParts,
  rackingBoxesParts,
  rugParts,
  shelfUnitParts,
  sofaParts,
  wallArtParts,
  workbenchDressingParts,
} from './interior/prefabs';
export {
  buildNorthHouseFacade,
  createFacadeMaterials,
  doorUnit,
  downpipe,
  facadeTriangleCount,
  gutterRun,
  lapSiding,
  shingleRoofSlab,
  windowUnit,
} from './facade';
export type { FacadeMaterials, FacadeRole, HouseFacadeOptions } from './facade';
// HF-536 night-facade-port: the same facade recipe as PARTS, for arenas.
export {
  FACADE_BOARD_BED,
  FACADE_BOARD_H,
  FACADE_BOARD_T,
  FACADE_COURSE_H,
  FACADE_MAX_PROUD,
  FACADE_REVEAL_SETBACK,
  FACADE_REVEAL_T,
  FACADE_SHINGLE_COURSE,
  facadePartsTriangles,
  lapSidingParts,
  panelDoorParts,
  shingleRoofParts,
  windowRevealParts,
} from './facade';
export type {
  FacadeFacing,
  FacadePart,
  FacadePartRole,
  LapSidingPartsOptions,
  PanelDoorPartsOptions,
  ShingleRoofPartsOptions,
  WindowRevealPartsOptions,
} from './facade';
// HF-536 night-gemini4: yard props kit
export {
  GARDEN_CHAIR_TRIANGLES,
  GARDEN_TABLE_TRIANGLES,
  HOSE_REEL_TRIANGLES,
  MAILBOX_POST_TRIANGLES,
  PLANTER_WITH_PLANT_TRIANGLES,
  SAND_PIT_TOYS_TRIANGLES,
  WASHING_LINE_TRIANGLES,
  WHEELIE_BIN_TRIANGLES,
  YARD_BOX_TRIANGLES,
  YARD_ROLES,
  gardenChair,
  gardenTable,
  hoseReel,
  mailboxPost,
  planterWithPlant,
  sandPitToys,
  washingLine,
  wheelieBin,
  type YardPart,
  type YardPropPlacement,
  type YardRole,
  yardPropPlacements,
} from './yard';
// HF-536 night-gemini5: street signage and furniture kit
export {
  BENCH_AND_BIN_TRIANGLES,
  BOLLARD_TRIANGLES,
  CHEVRON_BOARD_TRIANGLES,
  FIRE_HYDRANT_TRIANGLES,
  SPEED_ROUNDEL_TRIANGLES,
  STOP_SIGN_TRIANGLES,
  STREET_NAME_BLADE_TRIANGLES,
  STREET_SIGN_BOX_TRIANGLES,
  STREET_SIGN_ROLES,
  benchAndBin,
  bollard,
  chevronBoard,
  fireHydrant,
  speedRoundel,
  stopSign,
  streetNameBlade,
  streetSignPropPlacements,
  type StreetSignPart,
  type StreetSignPropPlacement,
  type StreetSignRole,
} from './street-signs';
// HF-536 night-muse-street: street wear kit (manholes, grates, tar, litter, chips, potholes)
export {
  DRAIN_GRATE_TRIANGLES,
  GUTTER_LITTER_TRIANGLES,
  KERB_CHIP_TRIANGLES,
  MANHOLE_COVER_TRIANGLES,
  POTHOLE_RING_TRIANGLES,
  STREET_BOX_TRIANGLES,
  STREET_RELIEF_M,
  STREET_ROLES,
  TAR_PATCH_TRIANGLES,
  drainGrate,
  gutterLitter,
  kerbChip,
  manholeCover,
  potholeRing,
  streetPropPlacements,
  tarPatch,
  type StreetPart,
  type StreetPropPlacement,
  type StreetRole,
} from './street';
