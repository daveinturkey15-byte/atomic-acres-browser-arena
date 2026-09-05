# Independent gate audit - candidate 7 (Claude Opus)

**Auditor:** Claude Opus, independent lane (no source, test, threshold, fence, budget or fixture modified).
**Range audited:** `3e2fd273` (HITL 5, last owner-tested build, 2026-09-04) -> `452d7aba` (candidate 7).
**Commits in range:** 651.
**Question:** was any gate weakened (verifier / threshold / fence / budget / timeout / test) to get green?
**Method:** git read-only (`git show <base>:<file>`, `git diff`, `git log -S`) plus file reads. No browsers, no GPU, no full test suite (another lane owns it). Machine under memory pressure; targeted runs only.

Claim-states used throughout: **[VERIFIED]** = I read the bytes at both ends of the range (or ran the check). **[OPEN]** = not proven here.

---

## 1. Constants table

Every "value at 3e2fd273" below was read with `git show 3e2fd273:<file>` / `git grep <sym> 3e2fd273`, not from a report.

| # | Gate | Current value | file:line (HEAD 452d7aba) | Value at 3e2fd273 | Changed? | Verdict |
|---|------|---------------|---------------------------|-------------------|----------|---------|
| 1 | WebGPU completion fence | `12_000` ms at every flush site; `PRESENTATION_STALL_MS = 12_000`; `waitForSubmittedWork` default still `4_000` | `src/rendering/render-runtime.ts:1175, 1873, 1898, 2026`; `src/legacy-main.ts:11090, 30151, 30208, 30237` | `12_000` at `render-runtime.ts:1174, 1866, 1891`, default `4_000` at `:2019`; **4** `flushWebGpuFrames(12_000)` sites in `legacy-main.ts` | no (4 sites at both ends) | **SAME** [VERIFIED] |
| 2 | In-combat pipeline tripwire (0) | `pipelinesInCombat = sampled.pipelines - combatBaseline`, baseline taken *after* warm-up | `scripts/qa/audit-graphics-profiles.mjs:224-227, 274-275, 315` | byte-identical (`git diff 3e2fd273...HEAD -- scripts/qa/audit-graphics-profiles.mjs` is empty) | no | **SAME** [VERIFIED] - but see the caveat below |
| 3 | nuketown2 pipeline budget (54) | `pipelineBudgetCeiling: 54`; asserted `toBe(54)`; `NUKETOWN2_MAX_DISTINCT_MATERIAL_GRAPHS = 54` | `src/rendering/clustered-lights.ts:29`; `src/nuketown2-pipeline-budget.test.ts:170-173`; `src/nuketown2-materials/index.ts:142` | `NUKETOWN2_MAX_DISTINCT_MATERIAL_GRAPHS = 54` at `src/nuketown2-materials/index.ts:142`, asserted at `nuketown2-pipeline-budget.test.ts:253`. `clustered-lights.ts` did not exist. | ceiling no; **structure yes** | **SAME value / REFACTORED structure** [VERIFIED] - see signature below |
| 4 | `LINE_CEILING` legacy-main ratchet | `37_396` (`RATCHET_SLACK = 250`) | `src/legacy-main-size-ratchet.test.ts:78` (slack `:86`) | `37_396`, slack `250`, same lines | no | **SAME** [VERIFIED] |
| 5 | Coplanar SAME-MATERIAL-VISIBLE class at 0 | `expect(visible).toHaveLength(0)` over `auditNuketown2Coplanar()` rows | `src/nuketown2-fidelity.test.ts:3104-3120`; engine `src/nuketown2-coplanar-audit.ts` | **did not exist** - `3e2fd273` had only the CLI `scripts/qa/find-coplanar-pairs.ts`; no `src/**coplanar**` module and no `same-material-visible` string anywhere | added | **NEW** (a class previously dismissed as benign is now a hard zero) [VERIFIED] |
| 6 | Collider/visual parity: invisible colliders 0, walk-through beyond ledger 0 | `toEqual([])` both directions; ledger = 17 triaged entries; roster `ALL_ARENA_IDS = ARENA_IDS` (derived, not a literal list) | `src/collider-visual-parity-gate.test.ts:120, 137`; ledger `:28-99`; roster `scripts/qa/collider-visual-parity-core.ts:734` | identical - `git diff 3e2fd273...HEAD` over the gate, `collider-visual-parity-core.ts` and `ballistic-parity-ledger.ts` is **empty**; `reason:` count 17 at both ends | no | **SAME** [VERIFIED] |
| 7 | Corridor ratio band 1.825 +-3 % | ratio band `< 0.03`, absolute widths `< 0.05`; `REFERENCE_CORRIDOR_L = 0.553`, `REFERENCE_HOUSE_WIDTH_L = 0.303` | `src/nuketown2-fidelity.test.ts:2752, 2754, 2768, 2769, 2778` | `0.553` / `0.303` at `:2606, :2608`; `< 0.05` at `:2627-2628`; `< 0.03` at `:2637` | no | **SAME** [VERIFIED] |
| 8 | Verge ceilings (36 furniture / 51 aggregate) | `vergeFurniture.length <= 36`, `vergeBodies.length <= 51`, dressing ids excluded by reading `NUKETOWN2_GROUND_DRESSING` | `src/nuketown2-fidelity.test.ts:2820-2827` | one count, `vergeBodies.length <= 43`, at `:2664` | **yes**, in `6d3e1ad8` | **TIGHTER on the class the gate names, RAISED on the aggregate** - see analysis [VERIFIED] |
| 9 | Cold-admission smoke: 10,000 ms budgets and patience | `maximumColdTransitionMs = 10_000`, `maximumMenuDeploymentPrewarmMs = 10_000`; patience `60_000` / `90_000`; trials clamped to 3..5 | `scripts/qa/verify-pass65-cold-webgpu-admission.mjs:14, 15, 165, 222` | identical numbers, identical lines | budgets **no**; subject and assertion set **yes** | **SAME budgets, CHANGED SUBJECT** - see analysis [VERIFIED] |
| 10 | MP soak gate: 180 s / 120 ms RTT / 1 % loss / 1.5 m / one-RTT damage | `playDurationMs: 180_000`, `positionBoundM: 1.5`, `rttMs: 120`, `packetLossPct: 1`, `damageLatency <= rtt` | `scripts/qa/mp-soak-assertions.mjs:6, 8, 9, 79-86`; `scripts/qa/mp-soak-gate.mjs:82` | **did not exist** - `git ls-tree 3e2fd273 -- scripts/qa` lists only `pass25a-soak-*` and `run-network-chaos-soak.ts` | added | **NEW** [VERIFIED] |

### Row 2 caveat - the tripwire is a measurement, not a failing assertion

`pipelinesInCombat` is computed and written into the evidence row, and the prose in
`src/graphics-settings-registry.test.ts:257` and `src/rendering/raytracing/raytracing-profile.ts:608`
says "the tripwire requires zero pipelines compiled in combat". A repository-wide grep for
`pipelinesInCombat` / `inCombatPipelines` / `combatBaseline` finds it in exactly two files, both
measurement scripts (`audit-graphics-profiles.mjs`, `measure-baked-indirect.mjs`); no test asserts
it equals 0. So the tripwire is enforced by a human reading the evidence JSON, not by CI. That is
**unchanged across the range** - it was equally unenforced at `3e2fd273` - so it is not a weakening
introduced by these 651 commits, but it is **[OPEN]** as a gate: a lane could regress in-combat
pipeline compilation and nothing would go red.

### Row 3 signature - what the pipeline-budget refactor moved

`src/nuketown2-pipeline-budget.test.ts` went 310 -> 191 lines. The ceiling itself (`54`) is
byte-identical at both ends and is now asserted twice (`toBe(54)` on the new
`NUKETOWN2_CLUSTERED_LIGHTING_SETTINGS.pipelineBudgetCeiling`, and the original
`toBeLessThanOrEqual(NUKETOWN2_MAX_DISTINCT_MATERIAL_GRAPHS)` over the built arena). What moved:

* **Dropped:** the two `materialGraphKey` instrument tests ("is blind to node identity and
  sensitive to baked constants", "feeds the uniform the same linear value the literal carried"),
  which used nuketown2 swatch materials. **Replaced, not lost:** HEAD's "measures constants and
  uniforms differently" (`:138-139`) asserts the same two properties of the same function against
  the vehicle-forge fixture.
* **Dropped:** `expect(distinct.size, 'graphs must be shared, not one per material').toBeLessThan(rows.length)`.
  **Implied at HEAD:** `keys.length >= 60` (`:117`) with `new Set(keys).size <= 54` (`:118`) forces
  sharing strictly.
* **Dropped:** the named role-pair identities (`sidingA === sidingB`, `drive === driveDecal`, the
  painted-metal family). **Replaced by a stronger aggregate:** `>= 18` registry roles collapsing to
  `<= 8` graphs (`:106-107`). The aggregate is harder to satisfy than the pairs were, but the test
  no longer pins *which* roles share, so a future change could re-partition the families and still
  pass. Minor loss of specificity; **not** a threshold weakening.
* Nothing is `.skip`ped, `.only`ed, or inverted.
* Cosmetic drift worth one line: the test at `:110` is named "keeps the complete built arena below
  the measured 40-graph ceiling" while asserting against `54`. The name is stale, the assertion is
  the same one that stood at `3e2fd273`.

### Row 8 analysis - the verge split is tighter where it counts, and the aggregate is a documented ratchet

At `3e2fd273` the gate was a single count of every mesh name containing `" verge "`, ratcheted at
**43**. That 43 was, per `6d3e1ad8`'s own accounting, 36 pieces of furniture plus 7
`NUKETOWN2_GROUND_DRESSING` lawn decals that share the prefix. `6d3e1ad8` (the HF-491 roadside
bays) re-tiled the same square metres of stem verge lawn from 3 tiles into 11, adding 8 decals and
zero props.

* **Furniture axis: strictly TIGHTER.** 43 effective -> 36, and the exclusion is now computed by
  reading the arena's own `NUKETOWN2_GROUND_DRESSING` table rather than by a name pattern, so a
  prop cannot be renamed into the dressing gap.
* **Aggregate axis: RAISED, 43 -> 51.** This is honestly a ratchet raise, not a tightening, and I
  would not repeat the commit message's flat "strictly TIGHTER" without that qualifier. What makes
  it defensible rather than a weakening: (a) the raise is exactly +8, matching the +8 lawn tiles,
  with zero headroom; (b) the class the gate exists to police - waist-high props closing the
  corridor at eye level - is now bound at 36 instead of 43; (c) the laundering route the single
  count allowed (delete a lawn tile, add a prop, stay at 43) is closed. Net: **not a weakening**,
  but the aggregate line is a raise and should be read as one.
* **[OPEN]:** I did not execute this test, so "zero headroom" (that the built arena measures
  exactly 36 and exactly 51) is the commit's claim, not my measurement.

### Row 9 analysis - the cold smoke kept its budgets and changed its subject

`scripts/qa/verify-pass65-cold-webgpu-admission.mjs` is the only QA script in this list whose diff
is non-empty (+25 / -18). The two 10,000 ms budgets, the 60 s / 90 s patience and the 3..5 trial
clamp are untouched. What changed is what the smoke *runs*:

* Cold arena `atomic-acres` -> `nuketown2`; second arena `skyline-terminal` -> `raid2`.
* **Assertions removed:** `after.originalArtLoaded` (dropped from the playable-arena check and not
  replaced), `after.atomicQualityStreaming !== 'ready'`, and
  `!after.blenderEnvironment.qualityArtRootVisible`.
* **Assertions added:** a playable-scene authority triple - `authoritativeArenaRoots === 1`,
  `authoritativeArenaRootIsGameplayRoot === true`, `duplicateArenaRoots === false` - plus
  `proceduralRootActuallyVisible` and `overlappingPrimaryArenaRoots` tightened from truthiness to
  strict `!== false`.
* **Exact-count tripwires moved with content, still exact:** menu prewarm `phases.length` 3 -> 4;
  the effect-prewarm group list 8 -> 10 entries with `death-drops` -> `death-drops-glass`, still
  compared as an ordered `JSON.stringify` equality.

Two of the three removed assertions (`atomicQualityStreaming`, `qualityArtRootVisible`) are
Atomic-Acres-specific concepts that cannot be asserted on a nuketown2 run, so their removal follows
from the subject change. `originalArtLoaded` is **not** arena-specific and was simply dropped.
Verdict: the numeric budgets are **SAME**; the *coverage* of Atomic Acres' cold Quality-art path by
this smoke is **LOOSER** (it is no longer exercised here at all). Whether another gate picks that
path up is resolved in section 2.

## 2. Test-file diff audit

Scope: `git diff 3e2fd273...HEAD --stat -- '*.test.ts' '*.test.mjs' scripts/qa vitest.config.* package.json`
= **85 files, +8,367 / -653**. Every hunk of every file was scanned mechanically (the whole diff was
dumped once and parsed) and the 19 files that removed an assertion line were then read by hand.

### 2.0 Mechanical sweeps over the whole diff

* **`.skip` / `.only` / `.todo` / `.failing` / `xit` / `xdescribe`: ZERO added, ZERO removed.**
  `grep -E "^[+-][[:space:]]*(it|test|describe)\.(skip|only|todo|failing|concurrent)"` over the full
  diff returns nothing at all. [VERIFIED]
* **`vitest.config.*`: not in the diff** - no reporter, threshold, pool, timeout or include/exclude
  change. `package.json` gained 4 lines, none of them a test-script change (no `expect`/assert lines
  in its diff). [VERIFIED]
* **Removed assertion lines: 68, across 19 of the 85 files.** Every one is accounted for below.
  The other **66 files have NO finding** - they are pure additions (the new netcode-diagnostics,
  gamepad, nuke-event, breakable-windows, roofs, stair-traversal, movement-feel, static-matrix-freeze,
  clustered-lights, audio-offline-render, hf504 and mp-soak suites) or comment-only edits.

### 2.1 Findings

**F1 - LOOSER. A guard was deleted with no replacement.**
`src/nuketown2-pipeline-budget.test.ts` - `it('keeps the graph-TOPOLOGY variants as separate shaders')`
was removed in full, taking its eight-pair `mustDiffer` table with it
(`garageDoor`/`roofGlazing`, `drive`/`kerb`, `drive`/`block`, `kerb`/`block`, `fence`/`trim`,
`lawn`/`planter`, `lawn`/`ground`, `coachGlass`/`asphalt`). Its own comment said exactly what it was
for: *"a future 'optimisation' could buy its budget by flattening the arena's actual detail"*. At HEAD
there is **no lower bound on distinct registry graphs at all** - `materialGraphKey` appears in this one
file, and its only surviving `not.toBe` (`:138`) compares two vehicle-forge constants, not arena roles.
The replacement assertion (`new Set(keys).size <= 8`, `:106`) bounds the count from ABOVE, i.e. it
rewards precisely the flattening the deleted test forbade. **This is the one gate in the range that
lost coverage with nothing standing in its place.** Commit: the HF-491 pipeline-budget rewrite;
`git log -S"keeps the graph-TOPOLOGY variants"` locates it. [VERIFIED]

**F2 - LOWERED numbers, in lockstep with the real roster, exclusion asserted.**
Five roster floors moved **9 -> 8**:
`scripts/qa/arena-roster.mjs:59` (`MINIMUM_SELECTABLE_ARENAS`),
`scripts/qa/eye-clearance-roster.mjs` (`MINIMUM_EYE_CLEARANCE_ARENAS`),
`scripts/qa/sweep-eye-clearance-spots.ts` (`MINIMUM_SWEPT_ARENAS`),
`scripts/qa/cross-browser-gate-contract.test.mjs:114`,
`scripts/qa/eye-clearance-sweep-contract.test.mjs:113, 165, 468, 476`.
Cause: `09980a5a feat(menu): HF-495 map order - lead Nuke Town Rebuild and park old Raid` sets
`selectable: false` on the `test2` row (`src/map-selection.ts:416`), taking parked registry rows from
2 to 3 and the derived selectable roster from 9 to 8. This has the exact silhouette of a weakening, so
it deserves the owner's eye - but it is not one, on four counts I checked directly:
1. the floors are *alarms on the derived scrape collapsing*, and the code's own rule is that a floor
   left above the real roster "reds every run and gets switched off, which is not a stronger gate";
2. `test2` was not merely dropped from the required sets - its exclusion is **positively asserted** in
   three places (`assert.ok(!selectable.includes('test2'))` in both contracts, plus
   `assert.ok(hiddenArenaIds().includes('test2'), 'the original Raid is parked, not removed')`), the
   same pattern already used for farcrysis and the original Nuketown;
3. `MINIMUM_ARENA_IDS = 11` (the *registry* floor) did not move, so the arena cannot be deleted;
4. `src/arena-selectability.test.ts` gained a dedicated test pinning the flag, the id and the decoder.
   **[OPEN] for the owner:** parking the original Raid is attributed in-code to "owner, 2026-09-04",
   but commit `09980a5a` carries a one-line body and a Codex co-author trailer with no quoted
   directive. If Dave did not ask for the original Raid to leave the picker, F2 becomes a real
   weakening and five floors go with it.

**F3 - LOOSER coverage in the cold-admission smoke** (detail in section 1, row 9). `originalArtLoaded`
was dropped from the playable-arena check and not replaced; Atomic Acres' cold Quality-art path is no
longer exercised by this smoke at all. `grep -rn "originalArtLoaded"` finds it still asserted in
`src/blender-environment.test.ts` and the runtime, but **not** in any cold-session browser smoke.
[VERIFIED] that it left this file; **[OPEN]** whether the browser-level coverage exists elsewhere.

**F4 - NEW EXEMPTIONS in the hardcoded-roster detector.**
`scripts/qa/arena-roster-contract.test.mjs`'s `BOUNDED_SUBSET_ALLOWANCES` (the allowlist of files
permitted to hardcode an arena subset) **lost 2 entries and gained 5**, net +3:
removed `cross-browser-gate-contract.test.mjs` and `eye-clearance-sweep-contract.test.mjs` (tighter -
those files now comply); added `capture-lane-ab-time-of-day.mjs`, `hf410-near-plane-ab-diff.mjs`,
`publish-lane-ab-frames.mjs`, `raid2-layout-metrics.ts`, `scan-lane-ab-band-readability.mjs`. Each
carries a written reason and all five are bounded A/B capture experiments rather than coverage
rosters, which is the category the allowlist exists for. Not a weakening on its face; **[OPEN]** that
three of the five reasons cite "HF-495" as the trigger for exempting a file it did not otherwise
touch, which is the kind of drive-by exemption worth one owner glance. [VERIFIED] the counts.

**F5 - Fingerprint re-pinned correctly, re-measurement obligation not met.**
`src/graphics-profile-contract.test.ts:47-53` - all four `PINNED_CONTROL_SET_HASHES` changed in the
range (`performance 445a9754 -> 8b9050cb`, `balanced 0753ee34 -> 09c22d33`, `high 430da2ad -> 7ca68dea`,
`max 03ee2e10 -> 2ec0fa43`), and `docs/GRAPHICS_PROFILES_2026-09-03.md` had exactly those four table
cells edited and nothing else. The pin's own contract says a changed hash "means a profile now renders
something different from what the player was told it renders, and the doc row has to be re-measured";
the measured rows were not re-measured, the doc is still dated 2026-09-03, and the only in-file
justification is the stale HF-438/PASS 92 note. The likely cause is legitimate - `graphics.clusteredLighting`
joined the pipeline-rebuild control set (`src/pass65-settings-inventory.test.ts:44, 57`), which moves
every profile's hash. **I ran this file to settle whether the pins were hand-faked: they were not.**
`npx vitest run src/graphics-profile-contract.test.ts` -> **14 passed**, so the pins agree with
`graphicsControlSetHashes()` as computed at HEAD. [VERIFIED by execution] Verdict: regenerated, not
laundered; the shortfall is documentation, not a threshold.
Note the final values were written by `f597c6b6 Revert "Merge ... taa-resolve"`, so they arrived
through a revert's conflict resolution rather than a deliberate re-pin commit - which is why running
it mattered.

**F6 - REVIEW GAP, not a gate: a new QA script is un-diffable.**
`scripts/qa/mp-evidence-analyse.mjs` shows as `Bin 0 -> 19255 bytes` in the stat. It contains **one
raw NUL byte at offset 4354**, inside a control-character regex class written with literal bytes
instead of escapes, so git classifies the whole file as binary. 19,255 bytes of new multiplayer
evidence-analysis logic therefore entered the branch with **no reviewable diff** - by this audit or
any other. Nothing about it weakens a gate; it defeats diff review of itself. Cheap fix: write the
class as `\x00-\x1f\x7f-\x9f`. [VERIFIED]

**F7 - Narrowed, explained, and re-pinned: the cold-session precompile root.**
`src/presentation-prewarm-contract.test.ts:673` - `precompileExactScenePass(` occurrences in the cold
WebGPU warm frame went `toHaveLength(1)` -> `toHaveLength(2)`, and the invariant "both surviving cases
take the WHOLE SCENE ... no arena's relief is narrower than the one it ships with today" was replaced
by "a cold session ... is scoped to the admitted arena root". A new exact-source assertion pins the
new call
(`await withArenaFrustumCullingDisabled(scene, () => scenePassPrecompile.precompileExactScenePass(arena.root));`).
This is a real narrowing of the relief that the 12 s fence depends on, but it is asserted, explained
and directionally guarded ("a future edit that ... widens the cold root fails here"). Not a weakened
threshold; flagged because it touches the fence's blast radius. [VERIFIED]

**F8 - minor.** `src/ui/surface-registry.test.ts:72` - the "one unique DOM root per surface"
`toHaveLength(1)` check now branches: surfaces of `kind === 'diagnostics-overlay'` are checked against
`element.id = NETCODE_OVERLAY_ELEMENT_ID` in the overlay source instead, because that root is created
in JS and has no markup literal. Substitute assertion present; uniqueness is no longer proven for that
one surface. Same commit adds a full contract test for the overlay. [VERIFIED]

### 2.2 Changes that are TIGHTER or neutral (checked, no finding)

* `src/nuketown2-fidelity.test.ts` (+484): tolerance `toBeLessThan(0.35)` -> `toBeLessThan(0.20)`
  (twice, **tighter**); the hardcoded `length: 16` kerb-island roster replaced by
  `NUKETOWN2_TURNING_HEAD_SEGMENTS` (**derived, not literal**); `overlap()` replaced by
  `overlapsFootprint()`, which keeps `.toBe(0)` and adds circular-footprint support (**strictly more
  cases**); box extents now taken from `Box3.setFromObject` with a non-box fallback rather than
  `geometry.parameters`, so non-parametric bodies stop silently escaping the scan. The verge ceiling
  is section 1, row 8.
* `src/private-match.test.ts:98, 114`: two assertions **inverted from `true` to `false`** - a lone
  ready host may no longer start, and the host readiness bit must now agree with every connected
  guest - plus one new assertion. Inverted in the **stricter** direction.
* `src/local-reload-authority.test.ts`: `requestId` / `cancelRequestId` threaded through the pending
  record; the frozen-object equality now asserts two more fields. Tighter.
* Source-pinned string tests re-pointed at modules extracted out of `legacy-main.ts`, 1:1, no
  assertion lost: `src/spawn-layout-quality.test.ts` (-> `mp-lobby-authority-views.ts`),
  `src/host-match-recovery-main-integration.test.ts` (-> `mp-remote-pickup-authority.ts`),
  `src/gun-range-test-bay-main-integration.test.ts` and `src/ui/hud-sway-release-wiring.test.ts`
  (renamed symbols).
* `MULTIPLAYER_PROTOCOL_VERSION` `18 -> 19` in `src/combat/legacy-weapon-adapter.test.ts`,
  `src/combat/weapon-catalog.test.ts`, `src/network-lifecycle.test.ts` - a version bump, same
  assertion shape in all three.
* PASS 93 -> PASS 94 rotation in `src/build-identity-handshake.test.ts`, `src/changelog.test.ts`,
  `src/project-map.test.ts`, `src/release-topology.test.ts`. Same assertion counts; the backup pin
  rotates `pass92Backup` -> `pass93Backup`, `KEEP_AT_LEAST {"pass92"}` -> `{"pass93"}`,
  `LIVE_TREE pass93` -> `pass94`. `changelog.test.ts` even **keeps** the old
  "arenas load again in stock Chrome" assertion by re-homing it onto the `pass93` entry rather than
  deleting it.
* `src/map-selection.test.ts`: catalog reordered (HF-495), the compatibility fallback now resolves to
  `nuketown2`, and a **new** exact-order `SELECTABLE_ARENAS` assertion was added. `ARENA_SELECTIONS.length`
  is still pinned at 11 and display names are still asserted unique. (Stale test title: "falls back
  safely to Nuke Town" now falls back to Nuke Town Rebuild.)
* `scripts/qa/find-coplanar-pairs.ts` (-252 lines): the CLI's scan/classify body moved into
  `src/nuketown2-coplanar-audit.ts` and the CLI now imports it, which is what makes the vitest pin and
  the instrument share one core. The CLI gained two new report classes (`SAME-VISIBLE`, `CONTACT`).
  Deleted lines are the extracted implementation, not assertions.
* **Hardcoded gate rosters that miss the newest arenas: none found.** The parity gate derives from
  `ARENA_IDS` (`src/arena-identity.ts:8`), whose head is now `nuketown2, raid2, ...` (11 ids), and
  `collider-visual-parity-core.ts:684-715` really does build `nuketown2` and `raid2`. Only the
  docblock prose ("all six arenas") is stale. The arena-roster contract's `MINIMUM_ARENA_IDS = 11`
  floor is unchanged.
* **Fixtures/inventories hand-edited rather than regenerated: none found**, with F5 as the near miss
  (regenerated, but the measurement behind it was not refreshed). The only new fixtures
  (`scripts/qa/fixtures/mp-soak/{valid,invalid}-bundle.json`) belong to the new soak gate.
* **Tests whose subject was replaced by a stub: none found.**

## 3. Cross-check against the candidate-7 REPORT

Source: `docs/evidence/pass94/candidate7/REPORT.md`. Note the REPORT's implicit baseline is
**candidate 6**, while this audit's baseline is **HITL 5 (`3e2fd273`)**, the last build the owner
actually tested. Several of the mismatches below are that difference and nothing worse; they are
listed anyway because the owner reads the REPORT against the build he last played.

### 3.1 Mismatches

**M1 - "No fence, timeout, budget, or assertion was changed" is not true over the HITL-5 range.**
The sentence sits under the cold-admission FAIL (`cold transition 24065.5ms exceeded 10000ms`).
The *numbers* are indeed untouched - both 10,000 ms budgets and the 60 s / 90 s patience are
byte-identical (section 1, row 9) - but the same script lost three assertions and changed the arena
it measures, in `f74f25bf fix(hitl6): align cold admission with nuke rebuild`, which is **inside**
this range and **not** an ancestor of `3e2fd273` (verified with `git merge-base --is-ancestor`).
So the 24.07 s figure is a **nuketown2** cold transition against a budget that was set and last
demonstrated on **atomic-acres**, and `originalArtLoaded` is no longer asserted at all in that smoke.
The blanket wording invites the reader to compare 24.07 s with the old numbers as like-for-like.
Suggested correction: say the budget is preserved and the subject changed.

**M2 - "the preserved 180 s duration, 120 ms RTT, 1% loss, 1.5 m bound and one-RTT damage bound".**
"Preserved" is right against candidate 6 and wrong against HITL 5: the entire MP soak gate
(`scripts/qa/mp-soak-gate.mjs`, `mp-soak-assertions.mjs`, both contract tests and the two fixtures)
**did not exist at `3e2fd273`** (section 1, row 10). It is a new gate, not a preserved one - which is
better news than "preserved", and it means the three red rows (replication, rejoin damage, stair fire)
are newly *visible* failures rather than regressions the owner should read as new breakage.

**M3 - "no pipeline creation in the sample" (perf rung) rests on a measurement nothing enforces.**
Section 1, row 2: `pipelinesInCombat` is computed by `audit-graphics-profiles.mjs` and written into
evidence, but **no test asserts it is 0**, at either end of the range. The REPORT's claim is
consistent with the instrument and I have no reason to doubt the number; the gap is that a future
regression on this axis would not turn anything red. Not a contradiction - a caveat the REPORT does
not carry.

### 3.2 Where the REPORT and this audit agree (checked, no mismatch)

* **The 12 s fence.** REPORT: "hit the preserved 12,002 ms queue fence (`687 fenced draws`) ... This
  is the known cold fence condition, not a widened threshold." Section 1, row 1 confirms `12_000` at
  every site at both ends of the range, and `waitForSubmittedWork`'s default still `4_000`.
  **Corroborated.**
* **The `legacy-main.ts` size ratchet.** REPORT: `capture-harness-warmup` was left out because "its
  11-line debug registry hook broke the unchanged `legacy-main.ts` size ratchet", and `mp-rejoin` was
  reverted partly on the same ratchet. Section 1, row 4: `LINE_CEILING` is `37_396` at both ends with
  `RATCHET_SLACK` still `250`. **Two lanes were dropped rather than the ceiling raised** - the
  strongest positive signal in this whole audit. **Corroborated.**
* **The graphics fingerprints.** REPORT: `taa-resolve` was excluded on "16 full-Vitest failures
  including stale profile fingerprints/inventory". Finding F5: the four control-set hashes did move in
  this range and their final values were written by that lane's revert (`f597c6b6`) - so I ran
  `npx vitest run src/graphics-profile-contract.test.ts` and got **14 passed**, i.e. the pins agree
  with `graphicsControlSetHashes()` at HEAD. The REPORT's account holds and no fingerprint was
  laundered. **Corroborated by execution.**
* **The coplanar gate.** REPORT's CLI output shows `HF-497 SAME-MATERIAL-VISIBLE FINDINGS: 0`, which
  is the class section 1 row 5 records as **NEW** in this range (a class that was previously reported
  as benign). The CLI and the vitest pin now share one core (`src/nuketown2-coplanar-audit.ts`), so
  the report line and the gate cannot drift. **Corroborated, and stronger than the REPORT claims.**
* **The 2 skipped tests in the full run** (`621 passed | 1 skipped`, `6243 passed | 2 skipped`) are
  the two pre-existing `it.skip`s in `src/killstreak-demo-published-media.test.ts`; both are present
  at `3e2fd273` (`git show 3e2fd273:... | grep -c "it.skip"` = 2). **No skip was added in this range**
  (section 2.0). **Corroborated.**
* **The verge ceiling** does not appear in the REPORT at all, so there is nothing to contradict; the
  43 -> 36/51 split is recorded in section 1, row 8 for the owner's attention.
* **SHAs.** The REPORT names runtime candidate `ae795724` while the branch head I audited is
  `452d7aba` ("build(hitl7): candidate 7 morning evidence"), whose parent is `ae795724`. Consistent -
  the evidence commit sits on top of the runtime build.

### 3.3 Gates the REPORT calls green that section 1 or 2 contradicts

**None.** Every gate the REPORT reports GREEN (tsc, coplanar, full vitest, build, identity guard,
capture manifests, blind A/B) is either unchanged in this range or newly added, and the two gates the
REPORT reports RED (cold admission, MP soak) are red against thresholds this audit confirms were not
moved. The mismatches above are about **framing and baseline**, not about a green claim standing on a
weakened gate.

## 4. Final table and overall verdict

| Gate | Value at HEAD | file:line | Changed in `3e2fd273..452d7aba`? | Verdict |
|---|---|---|---|---|
| WebGPU completion fence | 12,000 ms (4 flush sites + `PRESENTATION_STALL_MS`) | `src/rendering/render-runtime.ts:1175, 1873, 1898`; `src/legacy-main.ts:11090, 30151, 30208, 30237` | no | **SAME** |
| In-combat pipeline tripwire | 0, measured only | `scripts/qa/audit-graphics-profiles.mjs:224-227, 274-275` | no (script byte-identical) | **SAME** (unenforced at both ends) |
| nuketown2 pipeline budget | 54 | `src/rendering/clustered-lights.ts:29`; `src/nuketown2-pipeline-budget.test.ts:118, 173`; `src/nuketown2-materials/index.ts:142` | ceiling no, structure yes | **SAME value, REFACTORED** |
| Registry graph-TOPOLOGY distinctness | *absent* | (deleted from `src/nuketown2-pipeline-budget.test.ts`) | **yes - removed** | **LOOSER (F1)** |
| `LINE_CEILING` legacy-main ratchet | 37,396 (slack 250) | `src/legacy-main-size-ratchet.test.ts:78, 86` | no | **SAME** |
| Coplanar SAME-MATERIAL-VISIBLE class | 0 | `src/nuketown2-fidelity.test.ts:3119` | added | **NEW (tighter)** |
| Coplanar STREET / HOUSE-INTERIOR / different-material findings | 0 | `scripts/qa/find-coplanar-pairs.ts` | core extracted, classes kept | **SAME + NEW class** |
| Collider/visual parity - invisible colliders | 0 | `src/collider-visual-parity-gate.test.ts:120` | no (empty diff) | **SAME** |
| Collider/visual parity - walk-through beyond ledger | 0, ledger 17 entries | `src/collider-visual-parity-gate.test.ts:137`, ledger `:28-99` | no | **SAME** |
| Corridor width band | ratio +-3 %, absolute +-5 % | `src/nuketown2-fidelity.test.ts:2768, 2769, 2778` | no | **SAME** |
| Verge furniture ceiling | <= 36 | `src/nuketown2-fidelity.test.ts:2825` | yes (`6d3e1ad8`) | **TIGHTER** (effective 43 -> 36) |
| Verge aggregate ceiling | <= 51 | `src/nuketown2-fidelity.test.ts:2827` | yes (`6d3e1ad8`) | **RAISED 43 -> 51**, zero headroom, +8 matches +8 lawn decals |
| Nuketown2 plan-tolerance band | `< 0.20` | `src/nuketown2-fidelity.test.ts` | yes | **TIGHTER** (was `< 0.35`) |
| Cold-admission budgets | 10,000 ms x2 | `scripts/qa/verify-pass65-cold-webgpu-admission.mjs:14, 15` | no | **SAME** |
| Cold-admission smoke coverage | nuketown2 + raid2 | same file, `f74f25bf` | yes - subject changed, 3 assertions dropped | **LOOSER (F3)** |
| Cold-session precompile root | 2 calls, cold scoped to `arena.root` | `src/presentation-prewarm-contract.test.ts:673-676` | yes | **NARROWED, re-pinned (F7)** |
| MP soak: 180 s / 120 ms / 1 % / 1.5 m / one-RTT | as stated | `scripts/qa/mp-soak-assertions.mjs:6, 8, 9, 79-86`; `mp-soak-gate.mjs:82` | added | **NEW** |
| Selectable-arena roster floors | 8 (x5 sites) | `scripts/qa/arena-roster.mjs:59`; `eye-clearance-roster.mjs`; `sweep-eye-clearance-spots.ts`; `cross-browser-gate-contract.test.mjs:114`; `eye-clearance-sweep-contract.test.mjs:113, 165, 468, 476` | **yes, 9 -> 8** | **LOWERED in lockstep with the derived roster; exclusion asserted (F2)** |
| Registry arena-id floor | 11 | `scripts/qa/arena-roster.mjs:56` | no | **SAME** |
| Hardcoded-roster allowlist | -2 / +5 entries | `scripts/qa/arena-roster-contract.test.mjs:183-400` | yes, net +3 exemptions | **LOOSER by 3 files (F4)** |
| Graphics control-set hash pins | 4 hashes re-pinned | `src/graphics-profile-contract.test.ts:47-53` | yes | **REGENERATED, verified by running the test (14 passed); doc not re-measured (F5)** |
| `MULTIPLAYER_PROTOCOL_VERSION` | 19 | 3 test files | yes, 18 -> 19 | **SAME shape** (version bump) |
| Release topology pins | PASS 94 live / PASS 93 backup | `src/release-topology.test.ts` | yes, rotation | **SAME shape** |
| `.skip` / `.only` / `.todo` | none added | whole diff | **no** | **SAME** |

### Overall verdict

**No gate was weakened to get green, with one real exception and two that need the owner's word.**
[VERIFIED] Across 651 commits and 85 changed test/QA files, every headline threshold the owner cares
about is byte-identical to the last build he tested: the 12 s WebGPU fence, the two 10,000 ms
cold-admission budgets, the 54-pipeline ceiling, the 37,396-line ratchet with its 250-line slack, the
corridor +-3 % band, and the collider/visual parity gate with its 17-entry ledger (that file, its core
and the ballistic ledger produce a completely empty diff over the range). No `.skip`, `.only`, `.todo`
or `.failing` was added anywhere. Two gates got materially **stronger**: the HF-497
same-material-visible coplanar class is now a hard zero where it used to be dismissed as benign, and
the verge furniture line is capped at 36 where it was effectively 43. Two whole gates are **new**: the
MP soak bundle and the coplanar audit core. And the strongest evidence of good faith is in what was
*not* done - [VERIFIED] `capture-harness-warmup` and `mp-rejoin` were both excluded because they broke
the `legacy-main.ts` size ratchet, and `taa-resolve` was reverted on stale fingerprints, rather than
any of those three limits being moved to accommodate them.

**The one genuine loosening is F1** [VERIFIED]: `src/nuketown2-pipeline-budget.test.ts` lost
`it('keeps the graph-TOPOLOGY variants as separate shaders')` and its eight-pair `mustDiffer` table
with no replacement anywhere in the repository. That test was the *only* lower bound on distinct
shader graphs, and its stated purpose was to stop a future pass buying pipeline budget by flattening
the arena's real detail. Its replacement (`<= 8 registry families`) bounds the same quantity from the
opposite side. In a range whose dominant pressure was cold-admission time - the gate that is still red
at 24.07 s - deleting the guard against flattening detail to save pipelines is exactly the wrong guard
to lose. It should be restored before publish; it costs nothing at runtime.

**Two more need Dave, not me.** F2 [OPEN]: five roster floors dropped 9 -> 8 because the original Raid
was parked. Everything around that change is done correctly - the exclusion is positively asserted in
three places, the registry floor of 11 did not move, and a dedicated test pins the flag - but the
in-code attribution "owner, 2026-09-04" rests on a one-line commit body with a Codex trailer and no
quoted directive. If parking the original Raid was Dave's call, F2 is clean; if it was not, five gate
floors moved down on an agent's judgement. F5 [OPEN]: all four graphics control-set fingerprints
changed and their final values were written by a revert's conflict resolution, not a deliberate
re-pin. I ran that test - 14 passed, so the pins are honest - but the pin's own contract says a moved
hash obliges a re-measurement of the audit doc's rows, and only the hash column was edited.

Three smaller items for the record: the cold-admission smoke silently changed subject from Atomic
Acres to Nuke Town Rebuild and dropped `originalArtLoaded`, so the 24.07 s reading is not
like-for-like with the budget's origin (F3); the hardcoded-roster allowlist gained three net
exemptions (F4); and `scripts/qa/mp-evidence-analyse.mjs` carries a raw NUL byte that makes git treat
19 KB of new QA logic as binary, so it entered the branch with no reviewable diff (F6). None of those
is a threshold change.

**[OPEN] - what this audit did not prove.** I did not run the full suite (another lane owns it) or any
browser gate, so every "zero headroom" claim (verge 36/51 in particular), the in-combat pipeline count,
and the cold-admission and soak numbers are read from lane evidence rather than measured here. The
in-combat pipeline tripwire is [OPEN] as a gate at *both* ends of the range: it is written into
evidence and read by a human, never asserted by a test. Only one test was executed for this audit
(`src/graphics-profile-contract.test.ts`, 14 passed), chosen because it was the one finding where the
difference between "regenerated" and "hand-edited" could not be settled by reading.
