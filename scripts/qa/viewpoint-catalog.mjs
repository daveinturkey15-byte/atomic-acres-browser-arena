// Canonical viewpoint catalog for the arena visual-regression instrument.
//
// Every entry mirrors an AUTHORED deterministic review camera in
// src/rendering/arenas/*.ts (`camera('<id>', position, target, purpose,
// exposure)`). Those cameras pin position, target, fov, near/far, a fixed
// visual time, a seed and an exposure, so two captures of the same commit at
// the same camera are pixel-comparable — that is the entire foundation this
// instrument stands on.
//
// This file must never drift from the authored definitions:
// scripts/qa/arena-viewpoint-regression.test.mjs scans the arena sources and
// fails if any authored camera id is missing here or any entry here is stale.

export const VIEWPOINT_CATALOG = Object.freeze({
  'atomic-acres': Object.freeze([
    'nuke-town-overview',
    'nuke-town-aqua-upper-roof',
    'nuke-town-aqua-wall-closed',
    'nuke-town-aqua-door-open',
  ]),
  farcrysis: Object.freeze([
    'farcrysis-beach-golden',
    'farcrysis-jungle-dapple',
    'farcrysis-core-interior',
    'farcrysis-seaplane-throwback',
  ]),
  'gun-range': Object.freeze([
    'gun-range-overview',
    'gun-range-armory-support',
    'gun-range-lane-wall',
    'gun-range-neon-lanes',
    'gun-range-lateral-targets',
    'gun-range-test-bay-corridor',
    'gun-range-test-bay-door-approach',
    'gun-range-test-bay-door-relief',
    'gun-range-test-bay-door-bay-face',
    'gun-range-test-bay-overview',
  ]),
  'high-seas': Object.freeze([
    'high-seas-starboard-overview',
    'high-seas-stern-main-deck',
    'high-seas-upper-deck-occlusion',
    'high-seas-bow-lane',
  ]),
  'rustworks-1v1': Object.freeze([
    'rustrig-overview',
    'rustrig-tower-support',
    'rustrig-container-wall',
    'rustrig-container-dynamic-northwest',
    'rustrig-container-dynamic-southeast',
    'rustrig-mounted-work-lights',
    'rustrig-deck-surface',
  ]),
  'skyline-terminal': Object.freeze([
    'terminal-overview',
    'terminal-cabin-ceiling',
    'terminal-concourse-wall-closed',
    'terminal-boarding-open',
    'terminal-port-wing-authority',
    'terminal-starboard-wing-authority',
  ]),
});

export const CATALOG_ARENAS = Object.keys(VIEWPOINT_CATALOG);

export const CATALOG_VIEWPOINT_COUNT = CATALOG_ARENAS.reduce(
  (sum, arena) => sum + VIEWPOINT_CATALOG[arena].length,
  0,
);
