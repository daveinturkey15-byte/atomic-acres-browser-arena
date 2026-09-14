/**
 * forge-kit - HF-536. Parameterised presentation prefabs the arenas share.
 *
 * A prefab returns PARTS, not meshes: offsets, sizes and the material ROLE it
 * wants. The arena emits them through its own `pair()` / `centred()` helpers,
 * so handedness, the 180-degree symmetry gate and the presentation-only flags
 * keep working exactly as they do for authored geometry, and a prefab can
 * never smuggle a collider or a new material into a map (ruleset sec. 1.2).
 */

export * from './lantern-head';
export * from './lamp-pool';
export * from './gutter-run';
export * from './kerb-course';
export * from './interior/prefabs';
export * from './facade';
export * from './facade-elevation';
export * from './yard';
export * from './street-signs';
export * from './street';
export * from './window';
export * from './eaves';
