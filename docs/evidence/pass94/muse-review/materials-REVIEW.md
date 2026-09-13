# PASS 94 Muse review — nuketown2-materials lane

Branch: `contrib/dave-gaming-pc/claude/nuketown2-materials` (worktree `aa-claude-mat`).
Base: `origin/contrib/dave-gaming-pc/claude/pass93-candidate` (verified present: `876397c8`).
Range reviewed: `origin/contrib/dave-gaming-pc/claude/pass93-candidate..HEAD`, 10 commits:

- `4a4cc5ef` feat(nuketown2): TSL material library with three-scale wear and visible albedo steps
- `698178d5` fix: author box faces, not just ground planes
- `b42e678b` fix: timber, painted metal and glazing wear on box faces too
- `f15aab56` feat: cross-mown checker lawn from the BO2-2025 aerial
- `d3c925ab` fix: backdrop plain cannot carry lattice noise
- `909808c5` fix: lap shadow readable, stop drifting fence colour
- `32105cdf` fix: lawn wear was mud, not desire lines
- `3e4f2a7b` docs: materials lane report and gate evidence
- `c968eed8` docs: seven Nuke Town review captures and honest read
- `41900257` docs: pin which head each gate ran at, shared node_modules loss

Diff over `src`+`scripts`: 27 files, 2227 insertions, 649 deletions. Deleted:
`src/nuketown2-facade-materials.ts`, `src/nuketown2-street-materials.ts`. Added:
`src/nuketown2-materials/` (12 files: spec, wear, index, 8 families, 1 test).
Also read: `docs/evidence/pass94/nuketown2-materials/REPORT.md` (full, incl. OPEN 1-8),
skill at canonical store `Documents/desky-bootstrap-clone/Skills/game-development/photoreal-procedural-scene-forge/SKILL.md`
plus `references/method-steps.md` and `references/port-table.md`.

Note on paths [VERIFIED]: the lane brief names the skill at
`C:/Users/david/.claude/skills/photoreal-procedural-scene-forge/SKILL.md`.
That path does not exist on this machine (`.claude/skills` junctions to
`.agents/skills`, which has no such entry). The identical content was read from
the canonical shared store above. No skill text is quoted beyond measurements.

Claim-states: `[VERIFIED]` = read off source/test/diff in this worktree;
`[INFERENCE]` = reviewer judgement; `[ABSENT]` = looked for, not found.

## 1. Every family vs the skill's ranges and the albedo-wear rule

Skill rules used [VERIFIED from skill + method-steps]:
wear at three scales — grain 0.5–1.5 mm, scuff 20–80 mm, traffic 0.5–3 m;
albedo-visible wear floor 10%, carrier 10–30% ("Anything the frames must show is
a 10-30% albedo step or geometry. Roughness is the second layer, never the
carrier."); per-family PBR starts (method-steps §6 table): exterior painted wall
rough 0.92 metal 0; concrete 0.9 metal 0; clear glass prop rough 0 metal 0,
transmission 1 (0.95 leaves milky skin), ior 1.5; painted blind slat rough
0.55–0.7 (dust map) metal 0; car paint dark-under-clearcoat rough 0.7 metal 0,
clearcoat 0.7/0.1, specularIntensity 0.05; matte black/rubber 0.55/0.9 metal
0.1/0; no textures loaded; combat bound inverts (§6: 5 EV sun-to-shade correct
for a photograph and wrong for an arena — re-meter, prove every grade
non-hiding, never weaken a gate).

Branch specs [VERIFIED from `src/nuketown2-materials/families/*.ts`, sums match
REPORT.md §2 table]:

- siding (`families/siding.ts:46-56`): rough 0.74 metal 0.0; grain 0.9 mm/0.030,
  scuff 45 mm/0.055, traffic 1.6 m/0.070, soil 0.070 → step 22.5%.
- roof (`families/roof.ts:37-43`): 0.90/0.02; 1.1 mm/0.040, 60 mm/0.065,
  2.2 m/0.055, soil 0.075 → 23.5%.
- asphalt (`families/asphalt.ts:40-46`): 0.95/0.02; 1.0 mm/0.035, 35 mm/0.050,
  2.6 m/0.060, soil 0.080 → 22.5%.
- marking (`families/asphalt.ts:135-141`): 0.86/0.02; 1.0 mm/0.035, 50 mm/0.070,
  1.4 m/0.075, soil 0.110 → 29.0%.
- concrete (`families/concrete.ts:49-59`): 0.92/0.01; 1.0 mm/0.030, 40 mm/0.050,
  2.0 m/0.055, soil 0.090 → 22.5%.
- timber-fence (`families/timber.ts:35-46`, variant fence): 0.90/0.0; 1.2 mm/0.045,
  55 mm/0.065, 1.8 m/0.075, soil 0.085 → 27.0%.
- timber-painted (variant painted-trim): 0.66/0.0; 1.2 mm/0.028, 55 mm/0.055,
  1.8 m/0.060, soil 0.075 → 21.8%.
- glass (`families/glass.ts:33-44`): 0.045/0.0; 0.8 mm/0.030, 30 mm/0.050,
  1.2 m/0.060, soil 0.075 → 21.5%.
- painted-metal (`families/painted-metal.ts:34-46`): 0.42/0.08; 0.9 mm/0.025,
  50 mm/0.080, 1.5 m/0.055, soil 0.070 → 23.0% (registry overrides:
  garageDoor rough 0.34, sign 0.62, busTrim 0.48/metal 0.25 — `index.ts:150-170`).
- lawn (`families/lawn.ts:54-60`): 0.97/0.0; 1.0 mm/0.035, 60 mm/0.070,
  traffic 2.4 m 0.085 (turf/scrub) / 0.060 (hedge), soil 0.110/0.080 →
  turf 30.0%, scrub 30.0%, hedge 24.5%.

Verdict on (1) [VERIFIED]: every scale sits inside its band
(`spec.ts:179-183` WEAR_BANDS grain 0.0005–0.0015, scuff 0.020–0.080, traffic
0.5–3.0; `assertSpec` throws at construction, `spec.ts:197-220`); every step
clears the 10% floor and none exceeds 30% except turf/scrub at exactly 30.0%
(at the ceiling, allowed). `MAX_ALBEDO_DARKENING = 0.45` asserted per spec and
clamped in shader (`spec.ts:189`, `wear.ts` clamp per REPORT §2). No textures:
registry sweep asserts all 9 map slots null per role (test §5 below). Combat
readability: no new lights (sweep asserts not-`THREE.Light`), no exposure/post
touch, darkening ceiling enforced — skill §6 honoured structurally.

Three deviations a skeptic must record [VERIFIED, judgement as INFERENCE]:
(a) siding rough 0.74 vs skill exterior-wall start 0.92 — glossier than the
reference start, unexplained in code; (b) glass rough 0.045 metal 0 with NO
transmission (skill: transmission 1, ior 1.5) — lane uses opaque/alpha glazing
with grime riding opacity (`glass.ts:61-109`, coachGlass opaque
`transparent:false` in registry) which is a defensible readability/perf choice
but is not the skill's glass; (c) busTrim metal 0.25 (test window [0,0.30])
is high for "factory paint film is dielectric, metal 0.08" (`painted-metal.ts:42`) —
reads as a chrome-trim exception that should be one comment. None breaks the
10% rule; all three should be pinned comments, not silent numbers. See Findings.

## 2. TSL-only, allocations, runtime writes

[VERIFIED]: zero hits for `ShaderMaterial|onBeforeCompile|ShaderChunk|GLSL|RawShader`
in `src/nuketown2-materials/`. Every family constructs
`MeshStandardNodeMaterial` and assigns `colorNode` (+ `roughnessNode`, glass
adds conditional `opacityNode`) once at construction
(e.g. `families/siding.ts:146`, `roof.ts:95`, `asphalt.ts:109,163`,
`concrete.ts:149`, `timber.ts:106`, `glass.ts:99`, `painted-metal.ts:119`,
`lawn.ts:128`). TSL comes from `three/tsl` with one cast boundary per module;
`wear.ts:30-44` documents the idiom. No `uniform(...)` declarations in the
library at all (grep: none) — hence no per-frame `.value` writes (grep: none).
No `requestAnimationFrame|onBeforeRender|update(` CPU-per-frame paths in the
library; `index.ts:121-127` documents "Called ONCE per arena build. Nothing
allocates per frame: every wear term is a node expression compiled into the
shader at construction." Backdrop rule (`wear.ts:120-157`, `BACKDROP_READ_DISTANCE_M = 30`)
stubs near-field scales analytically instead of evaluating them — the 12-second
first-submission stall receipt in `spec.ts:99-101` is the reason. Verdict:
TSL-only passes; no-per-frame-allocation passes; uniform-only passes vacuously
(no mutable uniforms exist).

## 3. Hook lines in `src/nuketown2-arena.ts` + conflict risk

Hook lines [VERIFIED by grep on HEAD]:
- `147`: `import { createNuketown2MaterialRegistry } from './nuketown2-materials';`
  (replaces 4-symbol street-materials + 3-symbol facade-materials blocks; drops
  unused `standard` at `~108`).
- `1013`: `function nuketown2Materials(): Nuketown2Materials {`
- `1034`: `const forged = createNuketown2MaterialRegistry();` (replaces local
  `withOffset` helper + 12 `const x = create...()/standard(...)` locals).
- Return-table roles now reading `forged.*`: `1066` ground, `1070` lawn,
  `1081` asphalt, `1084` kerb, `1085` drive, `1086` driveDecal, `1092` sidingA,
  `1093` sidingB, `1099` garageDoor, `1101` trim, `1102` trimDecal, `1103` roof,
  `1108` fence, `1109` block, `1111` busTrim, `1116` coachGlass, `1123` sign,
  `1127` planter. HF-434 comment retained/extended at `1027-1033`.
- `2798`: `const m = nuketown2Materials();` (consumer, unchanged shape).

Conflict risk [VERIFIED diffs vs `pass93-candidate`, judgement INFERENCE]:
- nuketown2-techniques (adds `nuketown2-vegetation`, `nuketown2-grime-decals`,
  `nuketown2-yard-props`, `nuketown2-pool-water`): edits the SAME import band
  `~113-160` this lane edited and the same `nuketown2Materials()`/house region.
  Textual merge conflict is certain. Semantic: techniques still imports the two
  modules this lane DELETES (`nuketown2-facade-materials`,
  `nuketown2-street-materials`) — merge order matters; techniques must be
  rebased onto the registry (or vice versa) and its new decal/prop/vegetation
  consumers pointed at `forged.*` roles or their own modules, not at the dead
  files. Pool-water move (`nuketown2-pool-water.ts`) is adjacent, not
  overlapping — low risk once imports resolve.
- nuketown2-lighting (adds `nuketown2-lighting/presets+writes`, touches
  `rendering/arenas/nuketown2.ts` which this lane also touches ~41 lines):
  same arena header/import band touched (lighting deletes the HF-473 two-frames
  comment this lane preserves). Textual conflict likely. Semantic separation is
  clean (materials adds no lights; lighting adds no materials) — keep it that
  way; the shared file is only a merge vehicle.
- vehicle-forge (touches `nuketown2-arena.ts` header/layout imports/exports and
  `rendering/arenas/nuketown2.ts`): same header/import band conflict. Semantic:
  `busTrim`/`coachGlass`/`garageDoor` sit on the arena↔vehicle boundary (coach
  trim/glass answered by the materials registry at `index.ts:163-170` while
  vehicles own the shells). Integrator must decide the boundary once and not
  let both lanes dress the same panel. No evidence either lane touches the
  other's new directory (`nuketown2-materials/` vs `vehicle-forge/`).

## 4. House colours

[VERIFIED]: this branch pins `sidingA 0x46809f` (blue) and `sidingB 0xf4be36`
(yellow) — `index.ts:152-153`, arena `1092-1093`, registry test
`nuketown2-materials.test.ts:245-249`, fidelity gate
`src/nuketown2-fidelity.test.ts:904-905`. REPORT.md OPEN 3 (p.274-280) is
explicit: the reference (`docs/references/nuketown-2025/FINDINGS.md` +
`nt2025-aerial-boii.jpg`) says orange-over-cream and white/cream, not blue and
yellow — so the branch knowingly preserves the WRONG hues. Ledger HF-477 named
in the brief: [ABSENT] — no `HF-477` hit in `docs/`, `acceptance/` or `src/`
in this worktree, and `docs/references/` itself is absent here, so the
reference claim could not be independently verified beyond REPORT's quotation.
Clash with the accuracy lane? [INFERENCE]: no, by design — the lane leaves the
hexes to the fidelity gate and the accuracy lane, and the siding family already
supports a storey-banded wainscot break snapped to a real course (REPORT: "one
call away"). That is the correct ownership split. But it means SHIP of this
lane alone still ships wrong-coloured houses with better wear — the integrator
must sequence the accuracy lane's hex decision, not assume this lane fixed it.

## 5. Tests: ranges or existence?

Ranges [VERIFIED from `nuketown2-materials.test.ts:50-252`]: per-family table
with roughness/metal windows (siding 0.55–0.90/0–0.05, roof 0.80–1.00/0–0.05,
asphalt 0.85–1.00, marking 0.75–1.00, concrete 0.85–1.00, timber fence
0.80–1.00, painted trim 0.50–0.80, glass 0.02–0.10/metal exactly 0,
painted-metal 0.25–0.65/0–0.30, lawn 0.90–1.00); three-scale band assertions
against `WEAR_BANDS` + nonzero albedo swing per scale; step ≥ 0.10 and
darkening ≤ 0.45 per family; read-distance/backdrop arithmetic
(`featurePixels(0.060,55)≈1.76`, floor = arena camera 37°/1080 lines);
sRGB→linear decode agreement with `THREE.Color`; registry sweeps (every role
answered, distinct instances, named for the coplanar instrument). Plus no-map,
no-light, HF-434 offsets verbatim, house hexes, coachGlass dielectric+opaque.
The 10% floor and physical bands were tightened once mid-lane, never loosened
(REPORT §5) — credible.

The gap is what the tests do NOT do: the albedo step is computed from SPEC
DATA (`albedoWearStep`), not measured from compiled shader output — a family
that wires `wear.albedoMul` wrong still passes the step test; `colorNode` /
`roughnessNode` truthiness is an existence check, not a binding proof. And the
roughness/metal windows are lane-authored, not skill-quoted (see §1 deviations)
— the test proves self-consistency, not independent skill conformance.
Sufficient as a regression gate, insufficient as a fidelity proof. The 17/17
native-WebGPU captures at `32105cdf` are the actual fidelity evidence, reviewed
honestly (lap-shadow regression caught, lawn mud pulled back, hedges still flat,
carriageway invisible in shade — REPORT §4).

## Findings (file:line — why — smallest fix)

1. `docs/evidence/pass94/nuketown2-materials/REPORT.md:308-330` (OPEN 8) —
   boot smoke + stock-boot ran at `d3c925ab`, not at final head `32105cdf`;
   the three later commits change shader terms only, but "terms only" is still
   a claim, and the capture run does not assert zero console errors. Fix:
   integrator re-runs `pass74-arena-boot-smoke -g nuketown2` and
   `qa:stock-boot` at the merge head; do not merge on the capture receipt alone.
2. `src/nuketown2-materials/families/siding.ts:51` (rough 0.74) — 0.18 under
   the skill's exterior-wall start (0.92) with no comment. Fix: one comment
   citing the measured reference or move toward 0.8+; else the next tuner
   "fixes" it blind.
3. `src/nuketown2-materials/families/glass.ts:38-44,61-109` — dielectric
   correct (metal 0 gated), but no transmission/ior (skill: transmission 1,
   ior 1.5); coachGlass ships opaque by design. Fix: one comment block stating
   readability/perf rationale (transparent-queue avoidance already half-said at
   `61-69`) so no one "restores" transmission later.
4. `src/nuketown2-materials/index.ts:163-166` (busTrim metal 0.25) — top of the
   test window against the file's own "film is dielectric, 0.08" rule.
   Fix: one comment (chrome-trim exception) or drop to ≤0.15.
5. `src/nuketown2-materials/families/lawn.ts:54-60` (hedge variant) — REPORT
   admits hedges read flat green; hedge carries the least structure by design
   (closed variant: traffic 0.060/soil 0.080). Fix (non-blocking): leave to the
   vegetation/techniques lane, but file the handoff — a lawn variant will never
   read as foliage mass.

## Verdict: SHIP-WITH-FIXES

Three reasons: (1) the physical contract holds — all families inside all three
bands with 21.5–30.0% albedo-carried wear, TSL-only, no textures, no lights,
HF-434 verbatim, coplanar instrument byte-identical modulo role names; (2) the
gates that did run are green and honestly reported (`tsc` clean, 49-family +
109-named vitest green, 17/17 native-WebGPU captures with frame-by-frame
regressions owned, no gate weakened); (3) the two blockers are integration, not
authorship — smoke/stock-boot must be re-run at the merge head (shared
`node_modules` lost playwright mid-lane, REPORT §8), and the lane must be
rebased against techniques/lighting/vehicle-forge across the shared
`nuketown2-arena.ts` import/material band with the hex decision left to the
accuracy lane. Ship after those three, not before.
