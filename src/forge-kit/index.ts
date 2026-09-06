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
