# HANDOFF: props wave 1 (garden set first, 2026-09-12 ~21:00 UTC)

Owner: OMP muse-spark, worktree C:/Users/david/projects/worktrees/aa-props-night-20260912,
branch contrib/dave-gaming-pc/omp/props-night-20260912, base 6e9b2cafd318ca2b2f67f9eedcf8d624fee30453.
No commits/pushes; scoped diff left for root integration.

## Finished inspectable asset (curator rank 1, reason in catalog.json)

Garden table + 4 armchairs + red parasol, one composed GLB:

- scripts/blender/world-studio/props/build_garden_set.py (deterministic script)
- source-assets/world-studio/props/garden-set.blend (1.3 MB reconstructable source)
- public/assets/world-studio/blender/props/garden-set.glb (324,652 B,
  sha256 a135003ca97f68f4692684fa10a94421818046ce633b775612b2e71a3e2f9c25)
- public/assets/world-studio/blender/props/garden-set-thumb.png (243,553 B actual
  CPU Cycles render, inspected: canopy/chairs/table read correctly)
- public/assets/world-studio/blender/props/textures/ (4 PNGs: parasol weave
  basecolor + roughness, chair weave roughness, brushed-bronze roughness)
- public/assets/world-studio/blender/props/catalog.json (schemaVersion 1, 1 asset)
- src/world-studio/prop-assets/garden-set.ts (loader helper, mirrors
  blender-assets/index.ts disposal/presentation pattern incl. texture disposal)
- src/world-studio/prop-assets/garden-set.test.ts (5/5 pass)
- docs/technique-lab/props/garden-set-placement.md, skill-receipt.md, HANDOFF.md

Census (Blender 5.1.2, --background --threads 4, seed 20260912): 61 objects,
4202 verts, 8148 tris, 3 Principled PBR materials, true vertex bounds
x/y +/-1.446 m, z 0.0–2.405 m, ground contact exact.

## Tests actually run

- Blender 5.1.2 background build + export + 512x384 Cycles CPU thumbnail
  (threads FIXED 4, 48 samples + denoise): exit 0, BUILD_REPORT recorded above.
- npx vitest run src/world-studio/prop-assets/garden-set.test.ts: 5 passed.
- npx tsc --noEmit: zero errors in prop-assets files (out-of-scope errors ignored
  per brief, untouched).
- npm run pipeline:preflight (contribute, lane props-night-20260912): ok clean.
- AKP check: OMP/dave-gaming-pc PASS trusted. Audit AMBER rows are other
  harnesses' stale receipts, not this lane.

## Defects found and fixed in-wave (evidence above)

- Script nested one level deeper than bus precedent: REPO parents[3] wrote outputs
  under scripts/; fixed to parents[4], strays deleted.
- Seat pads missing parts.append sat at origin (census caught min-z -0.035); fixed.
- Census used bbox corners (reported phantom +/-1.72 on rotated canopy); now true
  vertex bounds (+/-1.446).
- Valance was a capped disc (would read as ceiling); opened via bmesh cap delete.

## Unresolved falsifiers / needed root wiring

- Runtime load + deck captures pending (root owns arena.ts, manifest, release).
- Weave legibility at gameplay distance unproven; 48-sample thumbnail is small.
- Collision proxy is arena-owner work (cylinder advice in placement note).
- catalog.json covers garden set only; fence/gate, AC unit, clothesline not started.

## Next best improvement (wave 2)

Weathered wood fence/gate section reusing the weave/fBm texture technique with a
wood-grain variant, same export/census/thumbnail pipeline; then retro AC unit.

# WAVE 2 — quality pass + fence/gate + utility AC (2026-09-12 ~21:55 UTC)

Call 2 of at most 3. Branch contrib/dave-gaming-pc/omp/props-night-20260912,
base 6e9b2cafd318ca2b2f67f9eedcf8d624fee30453. No commits/pushes/merges;
wave-1 receipt above preserved verbatim. Garden set untouched (garden-set.glb
still 324,652 B, sha256 a135003c…3e2f9c25).

## New finished inspectable assets

Fence/gate run (props-fence-gate-r1) and retro AC condenser
(props-utility-ac-r1), same deterministic pipeline as wave 1:

- scripts/blender/world-studio/props/build_fence_gate.py (53 objects, 5300
  tris, bounds x +-2.761 m, y -0.989/+0.075 m, z 0-1.97 m, ground exact)
- scripts/blender/world-studio/props/build_utility_ac.py (40 objects, 5980
  tris, bounds x +-0.6 m, y +-0.5 m, z 0-0.9245 m, ground exact)
- source-assets/world-studio/props/fence-gate.blend (1,071,146 B)
- source-assets/world-studio/props/utility-ac.blend (1,158,301 B)
- public/assets/world-studio/blender/props/fence-gate.glb (299,976 B, sha256
  071c7e5192544d723272905701caf991f5c90c437dbab12c955ef96a30653f1d)
- public/assets/world-studio/blender/props/utility-ac.glb (288,564 B, sha256
  8efd63ecb9fbf9c2240c2de56ab9acafe3d102b2761f07994ad705043d0bf9df)
- fence-gate-thumb.png (248,792 B) and utility-ac-thumb.png (224,098 B):
  actual 512x384 Cycles CPU renders, vision-inspected (wood grain brown, gate
  ajar with straps, AC louvers/grille/lamp all read correctly, no magenta)
- textures/: 5 new PNGs (fence_wood_basecolor/roughness 101,160 B total,
  ac_paint_basecolor/roughness + ac_concrete_roughness 105,018 B total)
- catalog.json: 3 rows, ranks 1 garden / 2 fence / 3 AC. Ranks are documented
  curator judgment with per-row reasons, never a measured claim. sourceUrls is
  [] on all rows: original artwork, no external pin exists; inventing a public
  URL would be fabrication. Technique lineage lives in skill-receipt.md.
- src/world-studio/prop-assets/fence-gate.ts + .test.ts, utility-ac.ts +
  .test.ts: same additive loader/disposal/presentation contract as
  garden-set.ts (per-file self-containment matches the wave-1 convention; not
  refactored into a shared module to avoid touching frozen wave-1 files).
- fence-gate-placement.md, utility-ac-placement.md: origin/yaw/clearance/
  collision-proxy advice for the arena owner.

## Commands actually run (Blender 5.1.2, hash ec6e62d40fa9)

- "C:/Program Files/Blender Foundation/Blender 5.1/blender.exe" --background
  --factory-startup --threads 4 --python scripts/blender/world-studio/props/build_fence_gate.py
- same with build_utility_ac.py. Exit 0, BUILD_REPORT per asset (see above).
- npx vitest run src/world-studio/prop-assets/{garden-set,fence-gate,utility-ac}.test.ts:
  3 files, 16/16 pass.
- npx tsc --noEmit: zero error lines under src/world-studio/prop-assets/
  (out-of-scope errors elsewhere ignored per brief, untouched).
- Throwaway GLB/catalog validator (stdlib only, deleted after use): parsed both
  GLBs independently (magic, version, triangle-mode primitives, per-vertex world
  bounds via node transforms, material/image counts) and every catalog row
  (schema keys, deploy-relative URLs, export+thumb existence, SHA-256 rebind).
  Result ALL_VALID: GLB world bounds match the Blender census to <5 mm, tris
  5300/5980 and material counts 2/7 agree, SHAs match the catalog.
- npm run pipeline:preflight (contribute, lane props-night-20260912): REFUSES,
  worktree has 5 changed paths. Expected mid-lane state, not a defect: the 5
  paths are exactly this lane's allowed untracked outputs (docs, public,
  scripts, source-assets, src namespaces above). Wave 1 reported clean because
  it ran before outputs existed. Root integration commits these paths.

## Defects found and fixed in-wave (all with file evidence above)

- transform_apply(scale=True) bakes location+rotation: operator defaults are
  location=True, rotation=True. First wave-2 builds double-offset every part
  moved after creation (AC fan blades floated at 1.77 m, louvers buried in the
  cabinet, fence brace thrown off-frame). Fix: explicit
  transform_apply(location=False, rotation=False, scale=True) BEFORE bevel
  (scale must be applied first or bevel widths distort). GOTCHA candidate for
  AKP promotion (text below); the wave-1 garden set is affected only in table
  feet clocking (cardinal instead of 45-degree points, 4-fold symmetric under
  the 1.1 m top: invisible, preserved as-is; limitation recorded in catalog).
- Fence rendered all-magenta: an edit repair dropped `tex.image = base_img`,
  leaving a linked-but-empty texture node. Caught by thumbnail vision
  inspection, fixed, rebuilt, re-inspected clean. Lesson: Blender scripts do
  not prove Blender ran AND a green export does not prove materials bound;
  only the rendered thumbnail plus node audit counts.
- Stale matrix_world: direct loc/rot assignment is invisible to matrix_world
  until view_layer.update(); the first AC census reported a phantom 1.77 m
  bound while DNA was correct. Fix: update() at census head. (The 1.77 m
  number was doubly confusing because the transform_apply bug above was live
  at the same time; DNA-vs-matrix-vs-verts separation identified each.)
- Validator overestimation: transforming accessor AABB corners through rotated
  nodes inflates bounds (fence post caps: 2.82 vs true 2.76). Fixed by exact
  per-vertex world walk; GLB and census agree.
- Edit-repair fragility (process): two line-anchored repairs landed wrong
  (dead helper absorbed, census line dropped). Each was caught by py_compile +
  structural grep before any Blender run. No bad build shipped.

## Unresolved falsifiers / needed root wiring

- Runtime load + in-yard captures pending (root owns arena.ts, manifest,
  release). Validator proves file correctness, not in-game visibility.
- Grain/weave legibility at gameplay distance unproven for all three assets.
- Collision proxies are arena-owner work (advice in the three placement notes).
- Clothesline not attempted: 45-minute wave budget spent on two finished
  assets plus four real bug fixes. Best next improvement if a wave 3 runs.
- AKP check/audit: not re-run this wave (no control files changed, native
  bootstrap from wave 1 still current); preflight refusal documented above.

## Root wiring guidance

- Import createFenceGate/createUtilityAc where garden set is wired; URLs are
  deploy-relative, disposal/presentation contract identical.
- Keep catalog.json ranks as curator order; do not present them as measured.
- Suggested acceptance views: fence run at a teal-yard boundary with the leaf
  toward camera; AC beside a chimney proxy; both alongside the garden set for
  palette coherence (weathered brown + beige-grey against bronze/red accents).

# WAVE 3 — Build15 capture critique + promotion readiness (2026-09-12, FINAL call 3/3)

Scope: critique evidence only — not an acceptance, not a promotion. No assets,
scripts, GLBs, or renders created, modified, or re-run; no Blender, browser, GPU,
server, or provider calls; no commits, pushes, or deploys. Waves 1–2 above
preserved verbatim, with all prop artifacts (3 GLBs + blends + thumbs + textures +
catalog + 3 loaders/tests + 3 placement notes + skill-receipt). No
dispatch/props-night-20260912-* receipt files exist on disk (searched); the
candidate wave1/wave2 preserved JSONs are untouched. This call changed nothing
outside this section.

Claim states: VERIFIED = stdlib-measured in this call or byte-compared.
CLAIMED = directly viewed pixels or a lane-handoff statement, unmeasured.
OPEN = not evidenced.

## Build15 capture evidence

Manifest `captures/build15-review/capture-manifest.json` (VERIFIED via stdlib
JSON parse): contract `arena-viewpoint-regression-capture-v1`, verdict `PASS`,
label `night15-review`, SHA `861b6680192c003ef6940d915b22e849b41d6589`, backend
`webgpu` (nvidia blackwell), viewport 1280x720, seed `viewpoint`, exposure 1.04
on all 8 shots, fixedTime 63000 ms, settle 3500 ms, capturedAt
`2026-09-12T22:10:07Z`, 8/8 shots ok, frameVariety `pass`, 82726 ms, errors `[]`.
Capture SHA equals the integration lane's start/end head (integration HANDOFF:
ending head == starting head, diff uncommitted) — same build. Whether the
uncommitted substitution code was live on the capture server is OPEN (repair
receipt completed 22:15, after these 22:10 captures; devtools check below
settles it). Per-shot seed is 6401; committedFrames/frames run 245/379 →
1197/1329 across the 8 cameras.

PNGs under `captures/build15-review/world-studio/` (VERIFIED: IHDR via struct =
1280x720 all 8; full sha256 below):

| camera | bytes | sha256 |
|---|---|---|
| world-studio-overview | 962034 | e55efc509e228bcb1ea97dc28525a349671334763d7b7e200152871bc1b5b765 |
| world-studio-street | 853604 | 1fa1534845f1354ca640059881240bb6a5d564282edb5b8d8b6706bc357508a0 |
| world-studio-west-house | 940497 | 75f422174b1c84499f4a1bdcaa7b394220b24aff5093189c41b3d7d2bdd501fe |
| world-studio-east-house | 1025345 | ac878927fefbf7f4c69a8957782427ce7f19cef993acac74c20b2afc4533ebab |
| world-studio-west-living | 898600 | b980c5e10d34e7c12200fe39de5a89d66bc72f57fc838ae1fc9ff9c616082eb1 |
| world-studio-east-living | 899084 | bf2aaa424906fc9f88982dbbbb13eb00ff0471e763498df79e497bb07efb2c8c |
| world-studio-west-bedroom | 907598 | 9ca60072f9c32f9ca0454ab35582685a71230e45718132013d3a6470923fe691 |
| world-studio-west-yard | 896643 | c511a87d58b7cd83a9825e68c87044ab6e066c2cfd05f3f7324b9a4839c03e0e |

Pixel inspection: all 8 PNGs opened and viewed in-lane (bare reads ok).
Structured re-queries failed (402 insufficient balance), so no measured ROIs —
visual findings are CLAIMED, metadata above VERIFIED.

## Findings

| area | finding |
|---|---|
| silhouette / replacement | Both houses read as assembled two-storey pastel shells (teal W / yellow E) with white trim, railed balconies, and roofs; no flat/boxy read, no doubled-wall ghosting or shimmer in street/overview frames (CLAIMED). GLB-substituted vs procedural pixels: OPEN — devtools outcomes settle it. |
| contact grounding | Houses meet grade on foundation/sidewalk slabs; lawn, stepping-stone path, and pergola patio sit on grade; no floating geometry in the 5 exterior frames (CLAIMED, unmeasured). |
| material / reflections | Siding lap lines resolve at close range; white trim runs hot near clip; windows show real outdoor views (bedroom frames show the yellow house + red vehicle across the street), not opaque white. Supersedes the Build14 uniform-test-world "glass flat" note, which never applied to runtime (CLAIMED). Consistent with the integration procedural-dynamic-glass decision; pane break/repair unproven (OPEN). |
| interior assembly / sightlines | West-living, east-living, west-bedroom are enclosed finished rooms (floor, walls, ceiling, cased openings, doors, windows) with staged furniture: green sofa, wood table + book, sideboard + TV, lit pendant; wood bed with patterned cover. Supersedes the Build14 gallery "interior FAIL / exploded on void" — that was the staged interior-hero asset, not world-studio runtime. No "missing stairs" claim is repeated (see route row). Interior stair not in these 3 frames — OPEN; architecture review points cover it in the recipe. |
| lighting / exposure | Daylight exteriors with soft shadows; interiors mix daylight with warm pendant pools. One lighting defect: each pendant throws a hard-edged disc pool on the carpet (both living rooms) — shade reads small/dark for the pool it throws. Sole quality repair proposed below. No env washout (CLAIMED). |
| route / aperture / stair | Teal-rear exterior wooden stair + white rail PRESENT in west-yard — Build15 evidence, no missing-stair finding. Cased openings/doors visible. Garage-window empty-aperture consequence, 22-vs-20 pane reconciliation, and aperture/road-corridor/anchor probes: OPEN (no probe data in manifest). |
| draw / performance | No draw-call, console-error, or timing evidence in the manifest (frameVariety is a distinct-pixel check only). OPEN — browser QA owns it. |

## Next step for root (one bounded session)

Run the integration-HANDOFF "Root browser-QA recipe" steps 2–5 verbatim on the
Build15 candidate in Quality + Performance, with the single lighting micro-fix
in the same session: (1) devtools: `worldStudioHouseStatus == ready`,
teal/yellow `substituted == true` with "20 marker(s) bound, 2 unregistered" —
any `failed:`/`false` stops the session, read `.reason`; (2) capture the 6
`STUDIO_REVIEW_CAMERAS` + stair review points, compare vs procedural (dispose
presentation): doubled walls, pane z-fight, empty garage apertures, trim decal
offset, furniture retained, throttle-network pending-root check, one-GLB-404
check; (3) shoot + repair one pane per house; (4) widen the pendant
shade/beam (or drop its intensity) until the west-living carpet pool edge shows
a gradient at the identical camera with no other exposure change; before/after
at that camera. Pass checks: step-1 asserts all true; zero doubled walls; zero
pane z-fight; break/repair works in both houses; pending window renders
nothing; 404 keeps both procedurals; pool edge soft, exposure otherwise
pixel-equal. Owner gates: immutable preview at the exact SHA plus this receipt;
Pass 66 standing authorization waives only a further subjective round, never
these mechanical gates.

## Source-to-skill promotion status: NOT PROMOTED, not promotable yet

- Author candidate (`skill-candidates/author/`): candidate-staged only. VERIFIED
  in-lane: `author-fixture-self-test.txt` ALL PASS + FIXTURE PASS; final GLB
  230044 B sha256 `b0fee3c7880d4f2b1c08734a10dc97982b8cd71a2203ecfe3faa88089dcedeb7`;
  renders 960x540 means 12.7/55.2 (exposure stats, not acceptance). CLAIMED from
  handoff (outputs in lane transcript, not on disk): contract validator 8/8 +
  kitchen gate 4/4. Blockers: SkillScan NOT run; live skill-regression NOT run
  (baseline untouched); three.js parseAsync + partition audit NOT done; no
  review-camera capture; route OPEN-unverified-by-host; owner acceptance NONE.
- Evaluator candidate (`skill-candidates/evaluator/`): candidate-staged only.
  VERIFIED: `validator-wave3-result.txt` (COMPILE_OK; 3 fixtures
  PASS-honestly-incomplete; negative control FAILs closed exit 1; 7 JSON
  parse OK) and `validator-wave2-result.txt`. Same blockers: no SkillScan, no
  live regression, no runtime visibility (Build14 gallery orbit only per
  handoff), route OPEN, owner NONE. No dream-loop skill exists (wave-1 grep:
  zero matches) — nothing to promote under that name.
- Resolved shared skills (VERIFIED re-read, author `source-inspection.md` §7 +
  evaluator handoff `wave3_skill_hashes_full`): `C:/Users/david/.codex/skills/atomic-acres-asset-authoring/SKILL.md`
  `57c1bb9e333ad99cd428f5cd03090d997ed0647d7b1be24581cd01b38dfd79c4`;
  `ai-3d-asset-generation-loop/SKILL.md`
  `c411b9d7d50a1dcc4c5e5b41e1f7f9a99558f6f75b208287182b73aaa8c22bc0`;
  `threejs-source-prop-ingestion/SKILL.md`
  `c98a730f53327ff7c7ea0e9f9a9be5da0bc9a0d70b5c1915381a26fc4fee7fbe`;
  `.system/skill-creator/SKILL.md`
  `cccd291077ec57c6f50ca6529f0f3fb93212da09473effb2fcec808e81b21288`;
  `desky-bootstrap-clone/Skills/quality/skillscan/SKILL.md`
  `21241d708f5764146b0789c017ca8fdb292a51f7cc516b9da12c90686f192d3a`;
  `visual-gauntlet-loop/SKILL.md`
  `6b546fc4d1e367ce1f2d892b874521a4d77484921f3c49a216b19c5774b22434`;
  `threejs-webgpu-interior-lighting-look/SKILL.md`
  `f0a9ebbe4aba8dc2ab8c1912e3a4936eeff726b51fd63ee4320c974b409ee732`;
  `threejs-procedural-vegetation/SKILL.md`
  `7aa8c750c461d9741ccd760354664372ff64813b3fa043c0b515202895b9881e`.
  Upstream: `https://docs.blender.org/manual/en/5.1/addons/import_export/scene_gltf2.html`,
  `https://threejs.org/docs/pages/GLTFLoader.html`,
  `https://threejs.org/docs/pages/MeshStandardMaterial.html`,
  `https://threejs.org/docs/pages/PMREMGenerator.html`.
  NOTE (OPEN): props `skill-receipt.md` wave-1 line cites prop-ingestion as
  `c98a730f53327ff7c7ea0e9f9a0d70b5c1915381a26fc4fee7fbe` (shorter) vs the
  wave-2/§7 full form above — wave-1 line looks truncated; re-hash before citing.
- Props-lane skills were used with receipts (waves 1–2); no promotion proposed.
  Candidate evidence is not acceptance.
