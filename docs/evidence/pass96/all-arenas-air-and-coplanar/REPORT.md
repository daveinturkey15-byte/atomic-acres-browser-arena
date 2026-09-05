# Pass 96 — all-arenas air and coplanar sweep (look F2, HF-486/503)

Lane: `contrib/dave-gaming-pc/claude/all-arenas-air-and-coplanar`
Worker: GLM 5.3 Flash via OMP (`dave-gaming-pc`), bounded: no builds, no browsers, no GPU.
Base: `465ae6b7` (`origin/contrib/dave-gaming-pc/claude/pass93-candidate`).
Worktree: `C:/Users/david/projects/aa-claude-airsweep` (fresh `npm ci`; no other worktree touched).

## Lane provenance (claim-state: VERIFIED)

- The branch name and worktree path were occupied by a superseded earlier attempt
  (tip `1feeef3e` "release(pass94): record blocked rerun gate", unpushed, both its
  commits already contained in `origin/…/pass93-candidate` and `origin/…/gameplay-feel`).
  That attempt's uncommitted Task-1 edits were preserved to
  `scratchpad/aa-claude-airsweep-superseded-work.patch` before anything was reset;
  the work was then re-derived on the fresh base rather than blind-applied.
  Nothing of the earlier attempt was destroyed unrecorded.

---

## Task 1 — ambient air visible on every arena

`nuketown2` was the only arena whose ambient particles cleared the 2 px visible-pixel
floor at the 12 m reading distance (`subtendedPixels(radius, 12)` at 1280x720, 70 deg
FOV). The SAME radius/alpha fix is applied to every other arena's ambient entries,
derived by looping `ARENA_PARTICLE_PROFILES` (no hardcoded roster). **Every density is
byte-identical** - the diff touches only `radiusM` and `opacity` (plus comments), so
instance, draw and buffer budgets did not move.

After the fix: motes subtend **2.23 px** and drift **4.71 px** at 12 m everywhere
(floor: 2 px); alphas sit at the family ceilings (motes 0.11 of 0.11, drift 0.15 of
0.16), both under the 0.16 fine-matter readability bound.

| arena | motes r/a before | motes r/a after | drift r/a before | drift r/a after |
|---|---|---|---|---|
| atomic-acres | 0.016 / 0.085 | 0.026 / 0.11 | ash 0.045 / 0.12 | ash 0.055 / 0.15 |
| skyline-terminal | 0.014 / 0.08 | 0.026 / 0.11 | lint 0.038 / 0.10 | lint 0.055 / 0.15 |
| rustworks-1v1 | 0.018 / 0.09 | 0.026 / 0.11 | foam 0.050 / 0.13 | foam 0.055 / 0.15 |
| gun-range | 0.012 / 0.11 | 0.026 / 0.11 | lint 0.030 / 0.09 | lint 0.055 / 0.15 |
| farcrysis | 0.015 / 0.10 | 0.026 / 0.11 | leaf 0.075 / 0.16 | leaf 0.055 / 0.15 |
| high-seas | 0.017 / 0.095 | 0.026 / 0.11 | foam 0.055 / 0.15 | unchanged |
| test1 | 0.016 / 0.10 | 0.026 / 0.11 | seed 0.040 / 0.11 | seed 0.055 / 0.15 |
| test2 | 0.015 / 0.09 | 0.026 / 0.11 | seed 0.045 / 0.12 | seed 0.055 / 0.15 |
| map3 | 0.015 / 0.09 | 0.026 / 0.11 | seed 0.042 / 0.10 | seed 0.055 / 0.15 |
| raid2 | 0.015 / 0.09 | 0.026 / 0.11 | seed 0.044 / 0.11 | seed 0.055 / 0.15 |
| nuketown2 | 0.026 / 0.11 | unchanged (reference) | seed 0.055 / 0.15 | unchanged (reference) |

Densities before/after per family, all arenas: unchanged (VERIFIED by diff review:
`git diff` shows only `radiusM`/`opacity` tokens moved; `nuketown2` density pin
`0.72`/`0.42` still green).

`src/particles/ambient-visibility.test.ts` extended: the all-arena loop now holds BOTH
ambient families of EVERY roster entry to `MINIMUM_SUBTENDED_PX` (motes were held only
`> 0`). The roster is derived from `ARENA_PARTICLE_PROFILES` itself - a new arena
cannot ship sub-pixel air, and a retired one leaves no stale row. The measured PASS 94
numbers are kept in the file's comment as the record of what was fixed.

### Task 1 gates (claim-state: VERIFIED, quoted)

```
$ npx tsc --noEmit                       -> exit 0 (TSC-GATE-PASS, 112.49 s)
$ npx vitest run src/ambient-visibility.test.ts src/particle-catalog.test.ts
  (plus graphics-profile-contract / legacy-main-size-ratchet, which vitest's
   argument filter runs only when named alone or in smaller groups on this base)
   ambient-visibility + particle-catalog:  Test Files 2 passed (2) | Tests 19 passed (19)
   graphics-profile-contract:              Test Files 1 passed (1) | Tests 14 passed (14)
   legacy-main-size-ratchet:               Test Files 1 passed (1) | Tests 5 passed (5)
                                           (names verified via --reporter=verbose)
Final tree re-run: ambient+catalog 19/19, graphics-profile-contract 14/14,
legacy-main-size-ratchet included in the task-2 29-file/230-test run below.
```

---

## Task 2 — coplanar sweep, all arenas; raid2 and farcrysis to zero

### Instrument (`scripts/qa/find-coplanar-pairs.ts`)

The script supported only nuketown2 (its CLI had `--out` but no arena argument), so it
was extended: `--arena <id>` (repeatable) and `--all` (the full `ARENA_IDS` roster,
derived from `src/arena-identity.ts`; an unknown id exits 2 with the roster printed).
The default no-flag run still measures exactly nuketown2, byte-compatible with the
pass-94 acceptance command. `scanArena(arenaId)` is exported so the pinning test
reuses the identical scan. HOUSE-INTERIOR and STREET are AUTHORED-footprint classes
and stay nuketown2-scoped; on other arenas they are structurally absent (0, named in
each header). Exit code: 0 only when every scanned arena reads 0 FINDINGS /
0 HOUSE-INTERIOR / 0 STREET.

Three instrument defects were found and fixed while taking the before measurements
(claim-state: VERIFIED against the built scenes; each fix names, never silently
drops, what it cannot audit):

1. **Non-finite boxes flooded FINDINGS.** Animated/parametric bodies (map3 shoreline,
   godrays) measured `top=NaN`; `dy > NEAR_METERS` is false for NaN, so each paired
   with EVERYTHING as `dy=NaN` FINDINGS. Non-finite boxes are now UNAUDITED `(non-finite)`.
2. **Authored-invisible geometry manufactured phantom FINDINGS.** Farcrysis boundary
   walls and `colliderProxy` bodies are `visible = false` on purpose (HF-360 idiom);
   they draw no fragments and cannot enter a visible depth race. They are now
   UNAUDITED `(invisible)`.
3. **Retired batch sources stay audited.** `batchPresentationOnlyBoxes` hides its
   sources (`visible = false`, `staticBatchRendered = true`) and draws the merged
   batch in their place; the instrument's contract is to audit members THROUGH those
   hidden sources (nuketown2's whole decal discipline lives there). The invisible
   exclusion spares them. nuketown2 classification is byte-identical to the pass-94
   records (`FENCED 165, SAME-MATERIAL 26, pairs 191, FINDINGS 0`); only 132
   authored-invisible, pairless decal field bounds moved from `boxes` into the named
   UNAUDITED list (819 -> 687).

### Per-arena counts (HF-434 instrument)

`FINDINGS` = different materials, no offset. Full outputs:
`before-sweep.txt` (base geometry, NaN-guard instrument), `after-sweep.txt`
(final instrument, raid2 clearance applied), plus `before-raid2.txt` /
`before-farcrysis.txt` per-arena detail.

| arena | FINDINGS first instrument | FINDINGS final instrument, base geom. | FINDINGS after | FENCED after | SAME-MATERIAL after | UNAUDITED after |
|---|---|---|---|---|---|---|
| nuketown2 | 0 | 0 | **0** | 165 | 26 | 198 |
| raid2 | 21 | 21 | **0** | 0 | 103 | 0 |
| atomic-acres | 3661 | 25 | 25 | 0 | 26 | 108 |
| skyline-terminal | 4543 | 39 | 39 | 264 | 27 | 94 |
| rustworks-1v1 | 11 | 11 | 11 | 0 | 49 | 33 |
| gun-range | 4149 | 43 | 43 | 0 | 23 | 70 |
| farcrysis | 10775 | 5 | **0** | 0 | 29 | 912 |
| high-seas | 428 | 8 | 8 | 0 | 67 | 52 |
| test1 | 60 | 21 | 21 | 0 | 83 | 67 |
| test2 | 805 | 33 | 33 | 0 | 99 | 39 |
| map3 | 963 | 1 | 1 | 0 | 4 | 117 |

HOUSE-INTERIOR 0 and STREET 0 on every arena, before and after (nuketown2's own
footprint classes included). The first-instrument column is retained as the honest
record of what the pre-fix instrument reported; the huge first-run numbers on
gun-range/atomic-acres/farcrysis/map3 were the two defects above, not visible
z-fighting.

### raid2 — 21 findings cleared (claim-state: VERIFIED, geometric)

All 21 pairs were flush TOP faces (`dy = 0.0000 m`): piers, posts and walls whose tops
sat exactly at the deck/slab tops they meet, all inside the instrument's 0.03 m race
window. Fixed with one named constant, `COPLANAR_CLEARANCE = 0.04 m` — past the
window and buried inside the other solid, the same resolution the farcrysis art
tower's rails already use where they lap:

- pergola piers x2: top `WALL_TOP` -> `WALL_TOP - 0.04`
- wing colonnade piers x3: same
- garage bay piers x3: same (the z=7 pier carried the finding)
- pavilion walls x4 (5 segments): same under `raid2 pavilion roof`
- pool bar walls x3: same under `raid2 pool bar roof`
- drive fountain plinth: `HARD_COVER` -> `HARD_COVER - 0.04` against the four planters
- pool entry steps sw/ne: top raised +0.04 clear of the paving (riser to coping still
  0.26 m — coping top `y1 = 0.3` (`src/raid2-arena.ts:484`) against step top
  `y1 = -0.28 + 0.28 + 0.04 = 0.04` (`src/raid2-arena.ts:488-489`), i.e. `0.30 - 0.04`;
  under the 0.42 m autostep; the "route not a pit" property holds)

No geometry hidden and no collider decoupled: `rect()` delegates to `box()` with the
same extents (`src/raid2-arena.ts:308-320`), so each shifted body's collider and shot
surface move WITH the visual by the same 0.04 m — inside the 0.06 m parity tolerance,
buried in the mating solid, with no hidden or decoupled collider. `raid2-fidelity`
(layout, reachability, palette) and `collider-visual-parity-gate` stay green.

### farcrysis — 5 findings cleared (claim-state: VERIFIED, no geometry moved)

All five "findings" were pairs between AUTHORED-INVISIBLE meshes and visible art:
4 x boundary walls (`farcrysis-bound-n/e/s/w`, `visible = false`, `cast: false`,
outside the playfield) and 1 x `farcrysis-art-tower-platform-collider` (the HF-360
invisible collider proxy under the art platform). None can z-fight on any camera.
With the instrument fixed (defect 2 above) farcrysis reads 0 FINDINGS with ZERO
geometry changes — nothing was hidden by this lane; the hidden geometry was authored
by earlier lanes and is now named in UNAUDITED instead of being measured as if it
could race.

### Pinning test — `src/arena-coplanar-findings.test.ts` (roster-derived)

Iterates `ARENA_IDS` (no hardcoded roster; the ceilings table is
`Record<ArenaId, ...>`, so a new arena without a row is a compile error and a retired
one cannot leave a stale row). For every arena it pins each finding class at or under
the measured value, and pins raid2 + farcrysis AT zero:

| arena | FINDINGS ceiling | HOUSE-INTERIOR / STREET ceiling |
|---|---|---|
| nuketown2 | 0 | 0 / 0 |
| raid2 | **0 (pinned)** | 0 / 0 |
| atomic-acres | 25 | 0 / 0 |
| skyline-terminal | 39 | 0 / 0 |
| rustworks-1v1 | 11 | 0 / 0 |
| gun-range | 43 | 0 / 0 |
| farcrysis | **0 (pinned)** | 0 / 0 |
| high-seas | 8 | 0 / 0 |
| test1 | 21 | 0 / 0 |
| test2 | 33 | 0 / 0 |
| map3 | 1 | 0 / 0 |

Measured 2026-09-04 at instrument base `465ae6b7` with the pass 96 raid2 clearance
present as uncommitted edits (geometry now committed as `a5c51eae`); ceilings are
never above the measured value, so any new flush pair fails its arena's row.

### Task 2 gates (claim-state: VERIFIED, quoted)

```
$ npx tsc --noEmit -> exit 0 (TSC-GATE-PASS, 75.67 s)

$ npx tsx scripts/qa/find-coplanar-pairs.ts            (nuketown2 default, after)
  # boxes=687 - pairs<=0.03m: 191 - FINDINGS (different materials, no offset): 0
  #   - FENCED (material offset): 165 - SAME-MATERIAL (benign): 26
  # HOUSE-INTERIOR 0, STREET 0                          -> exit 0
$ npx tsx scripts/qa/find-coplanar-pairs.ts --arena raid2
  # boxes=216 - pairs<=0.03m: 103 - FINDINGS: 0 - FENCED: 0 - SAME-MATERIAL: 103
  # HOUSE-INTERIOR 0, STREET 0                          -> exit 0
$ npx tsx scripts/qa/find-coplanar-pairs.ts --arena farcrysis
  # boxes=77 - FINDINGS: 0 - FENCED: 0 - SAME-MATERIAL: 29
  # HOUSE-INTERIOR 0, STREET 0                          -> exit 0
$ npx tsx scripts/qa/find-coplanar-pairs.ts --all --out docs/evidence/pass96/
  all-arenas-air-and-coplanar/after-sweep.txt           (full per-arena table above)
Before values: before-sweep.txt / before-raid2.txt / before-farcrysis.txt (quoted in
the per-arena table and raid2/farcrysis sections).

$ npx vitest run src/raid2*.test.ts src/farcrysis*.test.ts
    src/collider-visual-parity-gate.test.ts
    src/legacy-main-size-ratchet.test.ts
    src/arena-coplanar-findings.test.ts
  Test Files 29 passed (29) | Tests 230 passed (230)
```

Gate disclosure (claim-state: VERIFIED, pre-existing, not this lane's): two
self-described diagnostic probes (`farcrysis-elev-probe`, `farcrysis-shore-audit`;
"not an assertion suite") failed in this fresh worktree with `ENOENT` writing into
the untracked local `artifacts/` output directory. The directory was created locally
(and removed again after the run; its outputs are machine scratch, not committed).
They pass with it present and their failure mode is identical on the pristine base.

---

## Claim-state summary

- VERIFIED (measured): every table and gate quote above; instrument outputs at named
  head; densities byte-identical (diff-reviewed); raid2/farcrysis 0/0/0 after.
- VERIFIED (superseded): earlier blocked attempt's tip `1feeef3e` contained in the
  base; its uncommitted Task-1 edits preserved as a patch before reset.
- OPEN (not this lane's mandate): real findings remain on atomic-acres (25),
  skyline-terminal (39), gun-range (43), test2 (33), test1 (21), rustworks-1v1 (11),
  high-seas (8), map3 (1) - now pinned as ceilings and visible to any future lane.
