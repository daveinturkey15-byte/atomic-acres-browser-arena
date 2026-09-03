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
// scripts/qa/arena-viewpoint-regression.test.mjs GLOBS src/rendering/arenas/,
// derives the arena roster from the modules it finds there, cross-checks that
// roster against ARENA_VISUAL_REGISTRY in src/rendering/arena-visual-stream.ts,
// and fails if any authored camera id is missing here or any entry here is
// stale.
//
// It did not always do that. Until 2026-08-31 the contract test held its own
// hand-written six-file `ARENA_SOURCES` map, so both sides of the completeness
// assertion descended from one six-arena decision and could never disagree.
// Test1 and Test2 had authored `reviewCameras` for a day and a half and no
// stage of this instrument - catalog, capture or diff - had ever seen them.
// The roster below is therefore a REVIEWED literal that a derivation checks,
// not a literal that checks itself; adding an arena module to
// src/rendering/arenas/ now fails this instrument until its cameras land here.

export const VIEWPOINT_CATALOG = Object.freeze({
  'atomic-acres': Object.freeze([
    'nuke-town-overview',
    'nuke-town-plan',
    'nuke-town-street-axis',
    'nuke-town-west-garden',
    'nuke-town-aqua-upper-roof',
    'nuke-town-aqua-wall-closed',
    'nuke-town-aqua-door-open',
  ]),
  farcrysis: Object.freeze([
    'farcrysis-beach-golden',
    'farcrysis-jungle-dapple',
    'farcrysis-core-interior',
    'farcrysis-seaplane-throwback',
    // HF-395/396 round 4 shore-band audit cameras (authored farcrysis.ts):
    // top-down proves vegetation bands hug the square shoreline; west-shoreline
    // proves it at eye level where beach grass meets the waterline.
    'farcrysis-island-topdown',
    'farcrysis-west-shoreline',
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
  // Map 3 (Lane V, PASS 85) authored four review cameras and landed on the
  // shipping line with NO entry here at all, so this instrument never saw the
  // arena: `catalog covers every authored review camera` has been RED since
  // that merge. Derived from src/rendering/arenas/map3.ts, in authored order.
  map3: Object.freeze([
    'map3-hub-vista',
    'map3-bay-nature',
    'map3-volume-hall',
    'map3-into-sun-hub',
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
  // Owner 2026-08-30 arenas (docs/TEST1_MAP_BRIEF.md, TEST2_MAP_BRIEF.md).
  // Absent from this catalog until 2026-08-31 - see the header note. Both
  // carry an into-sun probe authored against the sky/lighting pass that
  // changed the sun disc, the aureole and the backlit rims, which is exactly
  // the half of each rig that nothing was rendering or comparing.
  test1: Object.freeze([
    'test1-tower-overview',
    'test1-firing-line',
    'test1-container-occlusion',
    'test1-into-sun-hardpan',
  ]),
  test2: Object.freeze([
    'test2-estate-overview',
    'test2-pool-lane',
    'test2-garden-occlusion',
    'test2-into-sun-terrace',
  ]),
  // NUKETOWN2 (owner 2026-09-02, HF-407): the Nuke Town Rebuild's seven
  // authored cameras, landed in the SAME commit as the arena module, because
  // the note at the top of this file records what happens otherwise - Test1 and
  // Test2 had authored review cameras for a day and a half that no stage of
  // this instrument had ever seen.
  nuketown2: Object.freeze([
    'nuketown2-overhead',
    'nuketown2-north-yard',
    'nuketown2-south-yard',
    'nuketown2-street-centre',
    'nuketown2-north-upper-window',
    'nuketown2-south-upper-window',
    'nuketown2-into-sun-street',
  ]),
  // RAID2 (Lane AQ, HF-408): the Raid layout rethink. Ten cameras rather than
  // the usual four because this arena's whole claim is about ten specific
  // places, and the judgeset in docs/raid-rebuild/SPATIAL_PLAN.md section 5 is
  // what the pass is reviewed through. Derived from
  // src/rendering/arenas/raid2.ts, in authored order.
  raid2: Object.freeze([
    'raid2-estate-overview',
    'raid2-west-apron',
    'raid2-garage-fan',
    'raid2-defining-lane',
    'raid2-pool-deck-return',
    'raid2-courtyard',
    'raid2-house-spine',
    'raid2-upper-bedroom',
    'raid2-drive-balcony',
    'raid2-drive-approach',
  ]),
});

export const CATALOG_ARENAS = Object.keys(VIEWPOINT_CATALOG);

export const CATALOG_VIEWPOINT_COUNT = CATALOG_ARENAS.reduce(
  (sum, arena) => sum + VIEWPOINT_CATALOG[arena].length,
  0,
);
