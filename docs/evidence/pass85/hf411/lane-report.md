# Lane X — HF-411 Firing Range grating fall-through + walkable parity sweep

Worktree `C:/Users/david/projects/aa-claude-parity`, branch
`contrib/dave-gaming-pc/claude/hf411-walkable-parity`, base `75a4e508` (PASS 84 shipped).
Status: **done** (repair pass applied after skeptic review, 2026-09-02 17:30–18:35 BST).

This is the tracked copy. `artifacts/lane-report.md` is the same text at a git-ignored
path; `docs/evidence/pass85/hf411/` is where the committed evidence lives.

## 0. What the repair pass changed (read this first if you saw the earlier report)

The skeptic's verdict was ACCEPT_WITH_FIXES. Every blocker and major is addressed, and
where a claim was refuted it is corrected here rather than defended.

| # | Skeptic finding | What was done | State |
|---|---|---|---|
| 1 | "Movement authority only" is false — `builder.colliders` also drives blast occlusion, grenade sweeps, spawn threat scoring and LOS; and movement-without-shot authority breaks the AGENTS.md matching-authority clause | The netting now gets **matching shot authority** (`fence` ballistic surface, same bounds, same tilt) plus raycast authority; the false wording is gone from source, from this report and from the new commit; the per-weapon cost of the crossing is **measured and pinned** | **VERIFIED** |
| 2 | Nothing ever booted the app; the brief asked for a debug-API teleport in the running game | New headless boot smoke `tests/e2e/hf411-firing-range-netting.spec.ts`: teleports onto both panels at 8 points each, standing and crouched, in the built game. **Run both ways** — fails on the pre-fix build (24/32 probes fall 2.8–3.1 m), passes on the fixed build (0/32) | **VERIFIED** |
| 3 | `atomic-acres 51 censused / 36 supported` does not reproduce | Re-measured: **44 / 29 / 15**. The skeptic is right; the old row was stale. Table corrected, section 6 exclusion tallies re-checked | **VERIFIED (correction)** |
| 4 | `WalkResult.remainingM` recorded, never asserted | The walk test now asserts it, with the 12 legitimately-blocked legs ledgered by name and cause | **VERIFIED** |
| 5 | `WALKABLE_MAX_SLOPE_DEG 20` vs the controller's 50 is a coverage gap absent from the open items | Now an open item **and** a gate assertion that pins the gap and forbids narrowing it | **VERIFIED** |
| 6 | `UNSUPPORTED_SHARE_FLOOR 0.02` is a size-relative sensitivity floor (~1.1 m² on the camo panel) that the report never stated | Added an absolute **largest-contiguous-hole** measure (4-connected flood fill, 0.5 m² floor) alongside the share; stated as a limit below | **VERIFIED** |
| 7 | The Report deliverable lived only under git-ignored `artifacts/` | This file, tracked at `docs/evidence/pass85/hf411/lane-report.md` | **VERIFIED** |
| — | "Direction B's very *first* name rule excludes /floor\|deck-plank\|ground\|terrain/" | Wrong: the first rule is water, the walkable rule is second. Corrected in the source comment and in section 5 | **CORRECTION** |
| — | "Grating semantics … an established pattern the art already uses" | Wrong: all 79 `shots: false` sites are paired with `solid: false`. That claim is withdrawn — and the fix no longer needs it (see finding 1) | **CORRECTION** |

## 1. Root cause — VERIFIED

Owner: *"on firing range sometimes you go to run onto a metal fence layed as a floor on the
roof level of the map and you fall through it, fix all that shit."*

Firing Range = `test1`. The map authors **48** elevated walkable visuals. Exactly **two**
had no movement authority: `test1-camo-net-tarp`, the camo netting over the container yard,
authored as dressing in `src/test-maps-art.ts`.

| measure | value |
|---|---|
| panels | 2, at `(21, 2.95, ±8)` |
| size | 9.0 × 6.4 × 0.06 m, tilted 2.0° about Z |
| top face | 2.79 m (west) → 3.11 m (east) |
| unsupported share of top face | **97%** (971/999 samples each) |
| largest contiguous hole | **55.95 m²** — measured by re-running the sweep with `adoptWalkableDressing` neutered; one hole, not a scatter |
| hole AABB | x 16.52…25.48, z ±4.82…±11.18 |
| drop | **3.0 m** to the hardpan (`-0.02`) |
| collider | none — `addBox(...)` presentation mesh, never through `block()` |

Why it reads as a floor, and why "sometimes": the art justified leaving it non-solid with
*"its underside sits at 2.92 m — above the 2.6 m reachable ceiling"*. That is false by
measurement. The yard's reachable ceiling is **the top of container A at 2.60 m**, which the
four-rung climb ladder (0.70 → 1.45 → 2.15 → 2.60) exists to put a player on. From those
boots the netting's west edge is **0.19 m** up — inside the 0.42 m autostep — and it reads as
a floor running 9 m east over open air. Cross the panel over the container and you step onto
a floor; approach from anywhere else and you never touch it. That is the "sometimes".

No other elevated surface on test1 was unsupported: tower deck 2.90, annex roofs 2.64, stores
roofs 3.50, spawn shed roofs 3.30, firing-line roof 3.46, container tops 2.60, container
stacks 5.20, backstop berm 2.60 — all fully supported before and after.

## 2. Evidence — VERIFIED, at two levels

### 2.1 Module level (Rapier, shipped `CharacterPhysics`, shipped `physicsColliders`)

`docs/evidence/pass85/hf411/before.json` and `after.json`. They are the **gate's own samples**,
written by `beforeAll` in the traversal test, so no number here was measured by anything else.
Stand + crouch, 22 roof-level surfaces, 9 probe points each (centre, 4 edge midpoints, 4
corners), 2 s hold, plus edge-to-edge walks on both axes.

| | before | after |
|---|---|---|
| walkable visuals censused / fully supported | 48 / **46** | 48 / **48** |
| geometric fall-through findings | **2** | **0** |
| drop samples fallen through | **32 / 396** (2.6–3.2 m) | **0 / 396** |
| walk legs fallen through | **8 / 88** | **0 / 88** |
| movement colliders | 240 | 244 |

`before.json` was written on the PASS 84 tree by the pre-repair instrument, so it carries no
`largestHoleM2` field; `after.json` was regenerated by the current one. The comparison rows
above are unaffected — the connected-component measure changed **no finding on any arena**
(section 6.1).

Only side effect anywhere on the map: the eastern strip of each container-A roof now rests on
the netting — feet **2.62 → 2.67 m**, a 5 cm rise. Every other one of the 396 samples is
byte-identical between runs.

### 2.2 Booted game (new this pass — the brief's step 2) — VERIFIED

`tests/e2e/hf411-firing-range-netting.spec.ts`, run **headless** against a local preview of the
real build, driving the shipped `__ATOMIC_ACRES_DEBUG__` API. Evidence:
`docs/evidence/pass85/hf411/boot-before.json` and `boot-after.json` (7 KB each).

| | pre-fix build | fixed build |
|---|---|---|
| panel points with movement authority (`collisionProbeAt`) | **4 / 16** | **16 / 16** |
| teleport probes that fell through | **24 / 32** | **0 / 32** |
| fall distance | **2.80 – 3.06 m**, landing at feet y 0.026–0.058 (the hardpan) | none |
| feet after 2 s | — | **2.863 – 3.147 m**, i.e. 2.5 cm above the analytic panel top at every point, tracking the 2° tilt |

The pre-fix run was produced by temporarily passing an empty name list to
`adoptWalkableDressing`, rebuilding the preview, and running the same spec; the source was then
restored from a byte copy and the fixed run re-taken. **The boot smoke is not a tautology: it
fails on the tree the owner reported.**

Machine constraints honoured and worth recording:

- **Headless only.** Playwright's own chromium project is headless here; `QA_HEADED` was never
  set. Four orphaned headless Chrome processes and both preview servers this lane started were
  stopped before returning; `netstat` shows no listener on 4173 or 4183 and no `--headless`
  chrome remains.
- **`PASS73_NATIVE_WEBGPU=1` is REQUIRED for this spec** and is still headless. MEASURED: the
  bundled headless Chromium on this box offers **no WebGPU adapter at all** — `navigator.gpu`
  present, all three `requestAdapter()` hints null, WebGL falling back to SwiftShader — so the
  game shows GAMEPLAY RENDERER BLOCKED and never reaches the debug API. Installed Chrome
  headless acquires a real adapter. Recorded in the spec's header.
- GPU had 9–10 GB free before each launch (`nvidia-smi`), ComfyUI's queue was empty, one
  browser at a time, no process killed that this lane did not start.

**Review-camera frames: still not produced (OPEN).** The diff appends two `Box2` entries per
array and one `BallisticSurface` per panel; it moves, hides, resizes and re-materials nothing,
so the rendered arena cannot have changed. If the forging review is applied strictly, the
integrator should take the container-yard cameras in both profiles.

## 3. The fix — VERIFIED

`src/test-maps.ts` only. The visual is not moved, hidden, levelled or resized; the art module
is untouched.

- `TEST1_WALKABLE_DRESSING = ['test1-camo-net-tarp']` — names only.
- `adoptWalkableDressing(builder, names, 'fence')` derives everything **from the mesh in the
  graph**: its own geometry extent, world placement and world rotation, in the same `Box2`
  (extent + rotation about centre) convention `box()` writes and `CharacterPhysics.create`
  reads. An art pass that moves or tilts the panel moves the authority with it; one that
  renames or deletes it drops the authority and re-fires the gate. No number is re-typed.
- The collider carries the panel's 2° tilt, so its top follows the visual instead of missing
  it by ±0.16 m at the ends.

### 3.1 What authority this grants, in full — CORRECTED

The earlier report and commit said "movement authority only". **That was false**, and the
skeptic is right about why. There is no movement-only channel:

1. **`physicsColliders`** → the Rapier world. This is the movement half the owner asked for.
2. **`colliders`** → the general world-solid list. `activeWorldColliders()` in
   `src/legacy-main.ts` reads it for explosion/blast occlusion (13123, 13142, 15343), the
   swept-sphere grenade and projectile test (17286, 22090), spawn validity and `visibleThreats`
   scoring (15966, 15988, 16024, 19058, 19072), interaction and bot line-of-sight (11740,
   19544, 19645) and carpet-bomber damage occlusion (2210). **On test1 the netting now occludes
   blasts, stops grenade sweeps, counts in spawn threat-visibility scoring and blocks LOS
   across the container yard.** That is what a floor does; it is stated here because it was not
   stated before, and it is not separately measured.
3. **`shotSurfaces`** → the analytic ballistic authority (**new this pass**). AGENTS.md
   requires matching movement and shot authority for every substantial player-reachable
   object, and the overhead-dressing exemption stopped applying the moment the panel became a
   floor. Without it, a player standing on the netting could be shot through the floor under
   their boots with nothing to register the hit.
4. **`raycastMeshes` + `blocksShots`** → knife and world raycasts. The art module had set
   `mesh.raycast = () => undefined`; the adoption restores it.

### 3.2 What the shot authority costs a round — MEASURED, pinned in the test

Rated **`fence`** explicitly (0.18 entry + 0.38/m). It is passed explicitly because
`classifyBallisticMaterial` has no rule matching "net": a rule-classified panel would fall
through to `reinforced` and turn camo netting into the hardest cover on the map. 0.06 m of
fence costs **0.203 energy**. Measured for every weapon in the catalogue, fired vertically
through a panel (the "shoot the player standing on it" case), asserted as a whole table in
`src/test1-roof-traversal.test.ts`:

| weapon | damage lost crossing the netting |
|---|---|
| m14-ebr | **21.2%** |
| scattergun | 9.4% |
| mini-uzi | 8.2% |
| machine-pistol | 7.0% |
| smg / mp5 / pistol | 6.2% / 6.0% / 5.1% |
| flashlight-pistol / magnum | 4.6% / 4.0% |
| m4a1 / carbine / minigun / lmg / ak-47 | 3.2% / 3.1% / 2.8% / 2.6% / 2.4% |
| slug-shotgun / sniper | 2.3% / 1.9% |
| railgun | 0% |
| **crimson-flamethrower, explosive-crossbow, flamethrower, flare-gun** | **stopped** |

Two rows deserve the owner's attention rather than being buried:

- **The M14 EBR loses 21.2%.** That is the weapon's own design, not the netting's: its
  penetration power is 0.55 against 2.15–9.4 for every other bullet weapon (it is the
  deliberately poor wallbanger), so a fixed 0.203 entry cost is a fifth of its budget. It is
  also the weapon HF-398 has just buffed, so the interaction is worth a look.
- **Four weapons are now stopped by the netting.** All four are the catalogue's
  `power: 0, maximumSurfaces: 0` entries — an explosive bolt that detonates on contact, two
  fuel streams and a signal flare. They are already stopped by *every* rated surface in the
  game, so a floor stopping them is consistent, not a new rule. **No bullet weapon is
  stopped.** Both facts are asserted, with the `maxPenetratedSurfaces === 0` check beside them.

## 4. Tests — VERIFIED

- `src/test1-roof-traversal.test.ts` (**6** tests) — the experiential gate. Roof roster
  completeness; drop probes (stand + crouch, all 22 surfaces, grounded as well as
  not-fallen); edge-to-edge walks **including a new assertion that each leg actually covered
  its distance**, with the 12 legitimately blocked legs ledgered by name (backstop berm walked
  along its own 43 m length, the tower/stair head on the firing-line roof, the spawn-shed
  ridges, the stores' side walls) — a new blocked leg fails, a ledgered leg that starts
  completing fails as stale, and **no camo-net leg may be blocked**; roof-level eye clearance;
  a direct pin on the two netting colliders (footprint MATCHES the mesh rather than merely
  containing it — the 150 × 130 m hardpan slab contains every footprint on the map and would
  "explain" anything) **now including the matching shot/raycast authority**; and the new
  per-weapon penetration table.
- `src/walkable-surface-parity-gate.test.ts` (**10** tests) — the geometric gate on all nine
  arenas. test1/test2/map3 at zero with no ledger; other arenas on a named, reasoned,
  shrink-only ledger; non-zero-census assertion; arena-id/exclusion-collision guard; **plus
  three new ones**: a unit test for the flood fill (including that a diagonal touch is two
  holes and not one), "no contiguous hole at all on test1/test2/map3", and a pin on the
  disclosed slope gap.
- `tests/e2e/hf411-firing-range-netting.spec.ts` (**new**) — the headless boot smoke of
  section 2.2.
- `scripts/qa/walkable-surface-parity-core.ts`, `scripts/qa/audit-walkable-surface-parity.ts`
  (CLI, exit-coded), `scripts/qa/roof-traversal-probe.ts`.

## 5. Why the existing audits missed it — VERIFIED (wording corrected)

`scripts/qa/collider-visual-parity-core.ts` asks two questions and neither can see a floor:
Direction A walks **from collider to mesh**, so a surface with no collider is invisible to it
by construction; Direction B walks from mesh to collider but only censuses **tall (≥0.9 m),
narrow** meshes — cover you can walk through — and its **second** name rule (the first is
water) excludes `/floor|deck-plank|ground|terrain/` outright. A 0.06 m horizontal panel is
neither tall nor narrow. `WALKTHROUGH_MIN_HEIGHT_M = 0.9` confirmed; that gate passes green on
test1 either side of the fix. Direction D closes the gap.

## 6. Instrument calibration and its stated limits

Derived from `src/physics.ts`, none tuned to get green: `SUPPORT_TOLERANCE_M 0.20`
(< snapToGround 0.24 and autostep 0.42) · `WALKABLE_MIN_SPAN_M 0.90` (capsule diameter 0.76) ·
`STANDING_CLEARANCE_M 0.76` (prone pose) · `FALL_THROUGH_DROP_M 0.50` (no legal transition
produces it) · `WALKABLE_MAX_SLOPE_DEG 20` · `UNSUPPORTED_SHARE_FLOOR 0.02` ·
`UNSUPPORTED_HOLE_FLOOR_M2 0.5` (new).

Four false-positive classes were removed by measurement, not by raising a threshold:

1. **Bounding-box tops.** A floor must have real near-horizontal triangles covering ≥60% of
   its bbox top. Without it, farcrysis reported rounded rock caps and tree canopies as floors;
   they now show as the `no flat top face (rounded/sculpted cap)` exclusion, 276 on farcrysis
   in the current sweep.
2. **Ceilings and soffits.** A surface with solid geometry closer than 0.76 m above it cannot
   hold a body. Current sweep: 11 on atomic-acres, 6 on skyline-terminal, 4 on rustworks-1v1,
   3 on high-seas, 2 on test1, 2 on test2, 1 on farcrysis.
3. **Tilted panels.** The flat-top band is measured in the geometry's own frame; in world Y a
   2° tilt discarded 97% of a perfectly flat panel (and hid the HF-411 net itself).
4. **Arena-name collisions.** Every exclusion pattern is word-anchored. Unanchored `/sea/`
   excluded all 260 meshes of `high-seas` and `/sky/` all 277 of `skyline-terminal` — two
   shipped arenas reporting "0 findings" because they had been looked at zero times. Pinned
   shut by two gate assertions.

### 6.1 The two sensitivity floors, stated as limits

- **`UNSUPPORTED_SHARE_FLOOR = 0.02` is size-relative.** On the 9 × 6.4 m camo panel, 2% is
  about 1.1 m² of open air — the same defect class the owner reported, one order of magnitude
  smaller. The skeptic is right that the earlier report did not say so.
- **New absolute floor.** `largestConnectedRegion` flood-fills the sample grid (4-connected)
  and a **contiguous** hole above **0.5 m²** now fails regardless of how large the surface
  around it is. 0.5 m² sits under the 0.76 × 0.76 m standing footprint: a hole that size cannot
  swallow a standing player, and anything that can, does.
- **MEASURED: adding it changed no finding on any arena.** All nine arenas report exactly the
  counts they did before (section 7); every existing finding already tripped the share floor.
  It is future coverage, not a new result — and the gate now asserts test1/test2/map3 have
  **zero** contiguous unsupported patches, so the weaker floor is never what holds them clean.
- **Slope coverage gap, now disclosed and pinned.** The controller climbs to
  `maximumSlopeClimbDegrees = 50`; this sweep censuses only faces ≤ 20°, because steeper faces
  read as walls and ramps rather than floors. Everything in between is walkable in game and
  invisible to Direction D. A gate assertion pins both numbers so the gap cannot widen
  silently, and raising the sweep's limit (more coverage) is the only legal direction.

## 7. Cross-arena sweep — VERIFIED measurement, triage CLAIMED

`npx tsx scripts/qa/audit-walkable-surface-parity.ts`, re-run on this tree.
**The atomic-acres row is corrected: 44 / 29, not 51 / 36.** The old numbers were stale; the
skeptic reproduced 44 / 29 three times and so did this run. The findings count was right.

| arena | censused | supported | findings | owner / disposition |
|---|---|---|---|---|
| **test1** Firing Range | 48 | 48 | **0** | **fixed this lane** |
| **test2** Raid | 33 | 33 | **0** | mine — nothing to fix, was already clean |
| **map3** Map 3 | 52 | 52 | **0** | clean |
| atomic-acres | **44** | **29** | 15 | Nuke Town geometry → **Lane U**; bus deck lips → **Lane K** |
| skyline-terminal | 56 | 48 | 8 | **Lane J** — do not edit (brief) |
| gun-range | 16 | 15 | 1 | **Lane J** — do not edit (brief) |
| farcrysis | 26 | 18 | 8 | hidden arena (`selectable: false`) — Farcrysis lane |
| high-seas | 46 | 43 | 3 | High Seas lane |
| rustworks-1v1 | 25 | 24 | 1 | unowned — see below |

Detail for the other lanes (each row is in the gate's ledger with the same reason):

- **atomic-acres / Lane U (Nuke Town):** 4 × `garage-pitched-roof` at y 5.12 — a pitched roof
  modelled as two slabs over one prism collider, ridge 1.05 m proud. 8 × `barrier-cap` and
  1 × `cargo-crate` — lids overhanging their collider by 0.20–0.24 m (a step, not a fall; the
  drop equals the support tolerance exactly and lands on the barrier).
- **atomic-acres / Lane K (bus):** 2 × `coach-deck` — deck lip over the aisle collider,
  6% of the top face, 2.25 m nominal drop into the coach interior.
- **skyline-terminal / Lane J:** `skyline-presentation-batch-32` (a merged presentation batch,
  so its AABB is not one surface — likely a false positive of batching, worth confirming),
  2 × `skyline-quality-wing-*` and 5 × `skyline-quality-uld-*`, all 0.20 m lids proud of their
  colliders.
- **gun-range / Lane J:** `gun-range-ceiling` (42 × 70 m, y 7.32) — the range shell ceiling
  seen from above. Direction D has no reachability model and cannot tell that nothing reaches
  it; triaged as not-a-defect **by hand**, kept in the ledger rather than excused by a
  threshold.
- **farcrysis (hidden):** `farcrysis-art-tower-platform` (9 m², 4.95 m drop) and
  `farcrysis-art-tower-dish` (6.30 m drop) are the strongest real candidates on that arena;
  plus `farcrysis-art-cave-arch-top`, an unnamed shore slab, and 4 crate-stack lids 0.9 m
  proud.
- **high-seas:** 2 chart tables and 1 cabana table, tops 0.80–0.85 m proud of the table
  collider — a player who mounts the table falls off it.
- **rustworks-1v1:** `rustworks-derrick-service-platform`, 4.3 × 4.3 m at **y 11.32 with no
  collider at all** (3.05 m to the derrick below, 361/361 samples unsupported). No PASS 85
  lane owns it. If anything reaches it, it is a 3 m fall-through; if nothing does, it is orphan
  geometry the forging review already forbids. **Recommend a follow-up row.**

The triage column — which of these are real defects and which are unreachable geometry —
remains **CLAIMED, not measured**: Direction D has no reachability model (open item 2).

## 8. Roof-level eye clearance — VERIFIED, plus a gap worth a ledger row

`scripts/qa/sweep-eye-clearance-spots.ts` samples eye heights 1.70 / 1.16 / 0.61 in
**absolute world Y** (confirmed: the only three distinct `eyeY` values in
`artifacts/qa/eye-clearance/test1-spots.json`, 3694 spots, none above y 2.4). It has therefore
**never looked at a roof, a deck or a container top on any arena** — including in the 55+6
RED-spot triage. So the brief's roof-level clearance check was measured with a new instrument
(`measureRoofClearance`, samples inset by the 0.38 m capsule radius).

Every roof-level surface on test1 keeps the 1.82 m standing pose except three families:

| surface | clearance | cause |
|---|---|---|
| `test1 container a ±1` | **0.18 m** | **created by this fix, deliberately.** No stance fits; none needs to — 0.18 m is inside the 0.42 m autostep, so a player steps UP onto the netting (2.62 → 2.67 m). Before the fix that strip dropped them 3.0 m. |
| `test1 annex roof ±1` | 0.10 m | pre-existing: the tower deck slab overhangs the annex roof edge by 0.55 m (annex top 2.64, deck soffit 2.74). You step up onto the deck. |
| `test1-camo-net-tarp` ×2 | 0.02 m | pre-existing art: the netting's east metre is strung INTO the container stack it hangs from (2.60–5.20 m). Nothing can stand there either way. |

**No ceiling was changed.** The offline eye-clearance contract still passes (14/14) and the
generated spot roster grew only by the two new colliders' hug faces (120 → 122 colliders,
3694 legal spots, **0 colliders with no legal adjacent stance**).

## 9. Gotchas recorded in source (`scripts/qa/roof-traversal-probe.ts`, and the new spec)

**Symptom** `RuntimeError: unreachable` inside `world.step()` on *every* arena headless,
followed by "attempted to take ownership of Rust value while it was borrowed" from the
`dispose()` in `finally` — which replaces the real error.
**Cause** `installHeadlessArenaShims()` defines `globalThis.window`; `@dimforge/rapier3d-compat`
binds an internal path on first step and, with `window` present in Node, binds the browser one.
Measured: `globalThis.window = { location: { search: '' } }` alone is enough, and
`await RAPIER.init()` beforehand does **not** prevent it.
**Correction** step one throwaway world before installing the shims
(`prepareHeadlessArenaPhysics()`); never let a throwing `dispose()` mask the cause.
**Verify** `src/test1-roof-traversal.test.ts` builds test1 through the full factory path and
steps the controller; it fails outright if the order regresses.
Second: **Rapier cannot step under `tsx` in this workspace at all** — which is why the physics
probe runs under vitest only and the geometric sweep is the CLI.

New this pass, in the spec header:

- **Bundled headless Chromium has no WebGPU adapter on this machine.** `navigator.gpu` present,
  all three `requestAdapter()` hints null, WebGL on SwiftShader → the game renders
  GAMEPLAY RENDERER BLOCKED and the debug API never appears. `PASS73_NATIVE_WEBGPU=1` launches
  installed Chrome, which acquires a real adapter **headless**. Also: `/` on the preview server
  is the staged release CHOOSER, so a spec must pass `?release=latest` or it drives a build
  picker.
- **Stance before teleport.** Teleporting to the crouch eye height while the player is still
  standing puts the standing capsule's feet 0.49 m below the panel. Doing it that way round
  reported a uniform 0.503 m "fall" on all 16 standing rows — an artefact of the harness, not
  of the arena. The spec now sets the stance once per pass and verifies the eye actually
  dropped by the stance difference before it trusts a single crouch row.

## 10. Commits (this branch, in order)

| sha | subject |
|---|---|
| `e20424b0` | qa(pass85): add Direction D, a walkable-surface parity sweep … (HF-411) |
| `de42378b` | fix(test1): stop the Firing Range camo netting swallowing players … (HF-411) |
| `cf51d989` | test(pass85): gate Direction D on every arena … (HF-411) |
| `27b7d896` | fix(test1): give the Firing Range camo netting the SHOT authority its movement authority requires … (repair) |
| `d167feaa` | qa(pass85): measure the largest CONTIGUOUS hole, not only the unsupported share … (repair) |
| `32e68b89` | test(pass85): boot the game and stand on the Firing Range camo netting - headless, both ways (repair) |
| *(this commit)* | docs(pass85): track the Lane X report and correct the stale atomic-acres row (repair) |

## 11. Checks run on the repaired tree

- `npx tsc --noEmit` → **exit 0**.
- `npx vitest run src/test1-roof-traversal.test.ts src/walkable-surface-parity-gate.test.ts
  src/collider-visual-parity-gate.test.ts src/spawn-layout-quality.test.ts
  src/arena-layout.test.ts src/rendering/raytracing/arena-proxy-coverage.test.ts
  src/arena-selectability.test.ts src/ballistics.test.ts src/map-selection.test.ts`
  → **9 files, 187 tests, all passed**.
- `npm run qa:eye-clearance:contract` → **14/14**.
- `npx tsx scripts/qa/audit-walkable-surface-parity.ts` → exit 1 on the other lanes'
  pre-existing findings (the gate working); `--arenas test1,test2,map3` → exit 0.
- `QA_EXTERNAL_PREVIEW=1 BASE_URL=http://localhost:4183 PASS73_NATIVE_WEBGPU=1 npx playwright
  test tests/e2e/hf411-firing-range-netting.spec.ts --project=chromium` → **1 passed** on the
  fixed build, **1 failed** (24/32 falls) on the deliberately neutered build.
- Full vitest suite deliberately not run (machine rule). Headless only; every browser and
  server this lane started was stopped before returning; no process killed that this lane did
  not start.

## 12. Open items

1. **rustworks-1v1 `rustworks-derrick-service-platform`** — 18.5 m² at y 11.32 with no
   collider, 3.05 m drop, 361/361 samples unsupported. Needs an owner: fix it or prove nothing
   reaches it. **OPEN.**
2. **Reachability model.** Direction D cannot tell whether a player can GET to an elevated
   slab, so ~6 of the 37 cross-arena findings are triaged by hand as unreachable
   (`gun-range-ceiling` above all). A multi-level flood fill over collider tops would let the
   gate decide mechanically; the single-level `reachableFrom` in `spawn-layout-constraints.ts`
   is fixed-Y and cannot. **OPEN**, scoped out of this lane.
3. **The eye-clearance sweep never looks above grade** on any arena. Item 8's instrument
   exists now; folding it into `qa:eye-clearance` would extend the 55+6 RED-spot triage to
   roofs. **OPEN.**
4. `skyline-presentation-batch-32` is probably a batching artefact (a merged AABB, not one
   surface). Worth confirming so the ledger row can be deleted rather than carried. **OPEN**,
   Lane J.
5. **Slope band 20°–50°** is walkable in game and outside Direction D's census (section 6.1).
   Widening the sweep to the controller's own limit and triaging what appears is the fix.
   **OPEN.**
6. **Review-camera frames for the container yard** were not produced (section 2.2). The diff
   cannot change a pixel, but a strict forging review wants them. **OPEN**, integrator.
7. **`test1` blast/grenade/spawn-scoring side effects of the new world collider** (section 3.1)
   are reasoned, not measured. If the integrator wants them measured, the instrument is the
   spawn-quality gate plus a grenade sweep over the container yard. **OPEN.**
