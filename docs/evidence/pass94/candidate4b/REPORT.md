# PASS 94 - HITL candidate 4b (integration)

Worktree C:/Users/david/projects/aa-claude-hitl, branch
contrib/dave-gaming-pc/claude/pass93-candidate, base 7733d37b (candidate 4).
Served on http://127.0.0.1:4300 from dist. Built as the BASE for the HITL 5
merge: it carries the deploy-fence fix and the art merges only. The owner FPS,
audio, bots, minimap and map-shape reports from HITL 4 belong to other lanes.

## Merges

| Lane | Head merged | Conflicts |
| --- | --- | --- |
| nuketown2-bo2-accuracy | 1ff7ca98 | 3 files, 11 hunks |
| nuketown2-look | 3f316734 | clean |
| nuketown2-techniques | 082408dc | 5 files |
| nuketown2-materials | a5d9d255 | 3 files |
| nuketown2-lighting | 7f9b14b6 | clean |

BOTH LANES MOVED AGAIN AFTER THIS BUILD. nuketown2-bo2-accuracy is now a1219fe8
and nuketown2-look is now df9cabdc. Those heads are NOT in 4b; they are left for
the HITL 5 integrator.

### How the conflicts were resolved

- MATERIALS vs ACCURACY ON THE HOUSE COLOUR. The materials lane refactored every
  role into createNuketown2MaterialRegistry(); the accuracy lane re-authored the
  same colours inline against the pre-refactor file. Kept the registry, moved the
  accuracy lane measured hexes into it (sidingA 0x9f6147 terracotta-orange,
  sidingB 0xeae3cf cream), and added roofGlazing, applianceRed and applianceBlue
  as registry roles, so the materials lane wear graphs dress the accuracy lane
  palette.
- TWO MECHANISMS FOR THE TWO-TONE HOUSE. The materials lane added a wainscotSrgb
  option; the accuracy lane split every house wall at the y = 3.0 storey line.
  Both deliver the same picture, so the geometry split ships and the option is
  declined FOR A STATED REASON: a present/absent mix is a graph-topology branch,
  i.e. a second siding pipeline on the cold-compile path this candidate fights.
- BALLISTICS. Every HF-467 rating candidate 4 added (vehicle, glass, concrete,
  thin-metal, wood) was re-applied by hand onto the accuracy lane replacement
  bodies: the lollipop carriageway and kerbs, the two street cars, the
  cantilevered porch, the balcony pier, the wheelie bins, the stem-end signage
  and the town sign.
- ACCEPTANCE MANIFEST acceptance/pass-94.json was an add/add conflict with two
  disjoint requirement sets. Unioned: the techniques lane seven rows renumbered
  R7-R13 behind the existing R1-R6.

## THE DEPLOY-FENCE DEFECT - fixed at cause, both halves

### (a) Ordering

configurePlayableArenaVisuals (src/legacy-main.ts) assigned
activeArenaVisualDefinition and then did every expensive, throwing thing - PMREM
regen, the runtime TSL traversal audit, sky-backdrop admission, the arena
environment assertion - before resetting the five activeArenaReview* fields at
the very END. None of it runs under a try, so a throw left the review state
describing the PREVIOUS arena while the definition named the new one. Those five
resets now sit beside the assignment, so the pair is one statement about which
arena is installed, on every path out.

The owner-visible symptom is fixed one level up. setArenaReviewCamera resolved a
station ONLY against activeArenaVisualDefinition - a single slot the transition
own rollback repoints when a deploy-time fence rejects. A review station is
numbers in a source file: src/rendering/arena-visual-stream.ts now keeps every
definition it loads (which happens BEFORE any fenced work) and exposes
findAuthoredArenaReviewCamera, and the setter falls back to it. false now means
no loaded arena declares that id, which is the only honest refusal.

### (b) Cold-compile cost

linearSwatch() returned vec3(r, g, b) - a graph CONSTANT. A literal value is part
of a node graph cache key and is printed into the WGSL, so every colour a family
factory was asked for compiled its own shader and its own pipeline.
uniformSwatch() (same decode, uniform(new THREE.Vector3(...))) replaces it for
the caller-parameterised colours, exactly as HF-477 had already done for
createNuketown2CarPaintMaterial. The same fix lands in
src/vehicle-forge/materials.ts, which nuketown2 asks for five paints.

Fixed family colours (primer, rust, gap shadow) stay literals, and the
graph-TOPOLOGY branches stay separate pipelines by design: siding wainscot,
concrete apron/kerb/block, timber fence/trim/deck, painted-metal panelled/plain,
glass transparent/opaque, lawn turf/scrub/hedge, and the readDistanceM >= 30
backdrop path.

| | node materials | distinct graphs |
| --- | --- | --- |
| Registry, before | 21 | 19 |
| Registry, after | 21 | 15 |
| Arena, before | 96 | 55 |
| Arena, after | 96 | 52 |

Pinned by src/nuketown2-pipeline-budget.test.ts under
NUKETOWN2_MAX_DISTINCT_MATERIAL_GRAPHS = 54 (52 measured plus a stated margin of
two). The test first case proves the instrument is blind to node identity and
sensitive to baked constants, so it cannot decay into a tautology - the farcrysis
helper customProgramCacheKey cannot see this class of fix at all, because it
bottoms out in Node.customCacheKey() { return this.id; }.

THERE IS NO MENU-TIME PRECOMPILE REGISTRY IN THIS REPO. It is a documented
aspiration lane H2 recorded as struck from the job list. The real authority is
src/rendering/cold-session-precompile-reach.ts, and NUKETOWN2 JOINS IT on
candidate 4 own measurement (exceeded 12000 ms for submission 1, pending 12001
ms, fenced draws 568, twice, on hardware WebGPU). That runs
precompileExactScenePass through compileAsync -> createRenderPipelineAsync,
which Dawn compiles on worker threads OUTSIDE any fence. THE 12 s FENCE IS
UNTOUCHED and presentation-prewarm-contract.test.ts still pins it verbatim.

### Result

Candidate 4: 0/17 shots, setArenaReviewCamera returned false - authored camera
missing, on two attempts.
Candidate 4b, cold cache, hardware WebGPU: 26/26 shots, verdict PASS, no fence
rejection anywhere in the run.

## Cross-lane defects found and fixed at cause

1. TWO APPLIANCE BANKS. Both lanes independently built the FINDINGS Q4 cooker
   bank. The techniques lane one ships - collider, HF-467 structural-metal rating,
   plinth, control panels, two authored close-range stations - and the accuracy
   lane dressing-only copy is dropped, with the accuracy gates retargeted onto the
   shipped prop. RED on the ORANGE house lawn, per FINDINGS and both lanes.
2. A 63.3 m STANDING LINE FROM A SPAWN, against a 36 m ceiling. HF-477 retired the
   head car for two street cars and declared that the saloon inherits the
   counterweight job; it did not. Spawn 0,26 could see out of the south house
   front window, diagonally across the whole carriageway and into the far back
   yard. The saloon moves onto that line, x 2.0 -> 6.6, THE CENTRE OF A MEASURED
   6.0-7.2 WINDOW. The classic is untouched because it is the only body across
   z = 0 and therefore carries MAX_STREET_CENTRE_RUN_METRES; moving it was tried
   first and every position that closed the diagonal opened the centre run to
   22.0-24.0 m.
3. A SPAWN IN A CUPBOARD. The new 0.24 m balcony pier grazed spawn 0,-26 last
   sight line over 18 m by TWO CENTIMETRES, inside the clearLine own 0.05 m
   padding, and the exposure FLOOR failed at 17.72 m where every other spawn on
   that team reaches 22-30 m. Deleting the pier was measured and is not the fix -
   it opens the diagonal above - and scanning its position along the deck at
   0.2 m over the full span never satisfied both bounds. The free variable is the
   post SIZE: it is now bal.postSize, the 0.16 m timber post this file already
   authors for a deck.
4. THE HEDGE DRESSING HAD DRIFTED OFF THE ARENA. HF-477 retiled the front verge;
   src/nuketown2-vegetation.ts still carried the pre-HF-477 coordinates, so three
   hedge runs stood on no collider - reported as a dressing drift AND as twelve
   unrated ghost shot surfaces plus three untriaged walk-through meshes by the
   collider/visual parity gate. The rows now read the arena own values.
5. THE RELOCATED HYDRANT stood 1 cm above the appliance cabinet top face on a
   zero-area touch - two coplanar FINDINGS. Moved into the gap beside the street
   waste bin.
6. THE FORGED SEDAN STILL DRESSED THE RETIRED HEAD CAR. Both street cars now carry
   their own skin in their own paint, and the handedness claim moves onto them
   without losing an assertion.
7. GRIME-DECAL DOUBLE FIX. Candidate 4 and the techniques lane independently
   staggered the ground families by 1 mm. One record survives.
8. THE SOUTH-YARD REVIEW STATION had moved off an authored spawn; put back on one,
   keeping the accuracy lane aim.

Size ratchet 37_371 -> 37_396, measured per change with its CEILING_HISTORY row:
+2 for the lighting re-merge, +23 for the fence ordering fix, 19 of them comment.

## Gates

    npx tsc --noEmit                                  TSC_EXIT=0
    find-coplanar-pairs   HOUSE-INTERIOR 0 - STREET 0 - FINDINGS 0
                          FENCED 165 - SAME-MATERIAL 26 - boxes=855
                          pairs under 0.03m: 191
    vitest, named nuketown2 gate list
                          Test Files  6 passed - Tests  107 passed
    vitest, FULL          Test Files  599 passed, 1 failed, 1 skipped of 601
                          Tests  6006 passed, 1 failed, 2 skipped of 6009
    npm run build                                     built in 4.10s
    pass74 boot smoke -g nuketown2, COLD cache        1 passed, 2.2m
    capture-arena-viewpoints --arenas nuketown2       OK 26/26 shots 181431 ms
                                                      verdict PASS, nvidia/blackwell

The one full-suite failure is src/audio-music-rotation-runtime.test.ts timing out
at 20 s UNDER FULL-SUITE LOAD; it takes 16.4 s and passes 8/8 in isolation. A
flake, unrelated to anything in this candidate.

COLD CACHE IS REAL: Playwright launches a fresh temporary user-data-dir per run,
so no Chromium disk shader cache survives between runs. The boot smoke and the
capture both needed PASS73_NATIVE_WEBGPU=1 - without it headless Chromium offers
no GPU adapter at all and the app fail-closes on GAMEPLAY RENDERER BLOCKED. That
is the flag the qa:pass74:arena-boot-smoke npm script is missing, which the
accuracy lane also recorded.

## What the captures show

docs/evidence/pass94/candidate4b/captures/nuketown2/, 26 stations, one frame each.

- ORANGE AND WHITE HOUSES, AND THE TWO-TONE. north-yard and street-centre read as
  FINDINGS Q2 describes: terracotta-orange upper storey over a cream ground storey
  on one house, cream throughout on the other.
- THE LOLLIPOP. overhead shows the cul-de-sac bulb with the coach and box truck
  standing in it, the stem running off, the kerb ring, and the third house beyond
  the head.
- THE CHIRALITY ANCHOR. street-centre carries the RED hob deck on the ORANGE house
  lawn; appliance-bank-north-close and -south-close show the red/blue pair close.
- DECK AND EXTERIOR STAIR on the end opposite the garage - north-yard,
  north-balcony - over an open undercroft.
- GARAGE RIGHT FROM BOTH SPAWNS - garage, and its 180-partner frames.
- Hedges, avenue, stepping stones, pool and yard props present; no tearing, no
  missing faces, no floating bodies in any of the 26 frames.

### Two things the captures show that this candidate does NOT fix

- THE GARAGE WING READS BRIGHT RED, not the neutral cream that HF-426 C2 and
  HF-477 both say it should be. garage.png is unambiguous. This is garageSiding /
  createNuketown2GarageWallMaterial, which no lane in this merge re-pointed.
- THE DARK SALOON PAINT LILACS. createForgePaintMaterial lifts the dominant
  channel to 10 per cent to keep dark pigment off the lilac threshold, and the
  navy 0x27394f sits low enough that the lift shows as a violet band - garage.png,
  the car on the apron. That file own header warns about exactly this failure; the
  new dark car is the first body low enough to trip it.

## OPEN

1. nuketown2-bo2-accuracy@a1219fe8 and nuketown2-look@df9cabdc landed after this
   build and are NOT in 4b. HITL 5 owes both merges.
2. The garage wing red and the saloon lilac paint, above - art-lane calls.
3. The pipeline reduction is real but modest, 55 -> 52 arena-wide. The next slice
   is outside the file scope taken here: src/nuketown2-yard-props.ts and
   src/nuketown2-interior-materials.ts build their own graphs rather than calling
   the families, and the hob red/blue pair alone is one surface in two colours =
   two pipelines. Until that lands, nuketown2 stays in
   cold-session-precompile-reach.ts and pays that entry added visual-definition
   time on a first load.
4. qa:stock-boot was NOT run for 4b - cut for time under the finish-fast
   instruction. The cold boot smoke and the 26/26 capture are the browser evidence.
5. The --enable-unsafe-webgpu flag in the native-WebGPU project can mask real
   driver bugs, a known gotcha on this machine. Every browser number here was taken
   with it, as every previous pass number was.
