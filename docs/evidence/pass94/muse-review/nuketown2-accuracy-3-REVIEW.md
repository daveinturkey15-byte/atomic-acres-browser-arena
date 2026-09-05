# Muse review - `nuketown2-accuracy-3` (third pair of eyes)

**Reviewer:** Meta Muse Spark 1.3, 2026-09-04. **Branch:**
`contrib/dave-gaming-pc/claude/nuketown2-accuracy-3`. **Head reviewed:** `39d0b113`
(lane `8de62756` + report `c4d3bdb1` + verify fix `39d0b113`; no Luna follow-up
commits on top at review time). **Method:** static only, no builds/browsers/GPU
per the lane contract - every number below re-derived by hand or by dependency-free
arithmetic, every claim checked against the diff `75fbaf59..HEAD` (the lane) and the
reference files. The verifier's gate re-runs (tsc, 9-file vitest, coplanar script)
are taken as read; this review covers only what the verifier did NOT.

**Scope note:** the brief asked for a diff vs
`origin/contrib/dave-gaming-pc/claude/pass93-candidate`. That diff is 418 files -
it contains the whole turning-head + rooflines + bays lineage, not this lane. The
lane itself is exactly four files (`git diff 75fbaf59..HEAD --name-only`):
`docs/evidence/pass95/nuketown2-accuracy-3/REPORT.md`,
`docs/evidence/pass95/nuketown2-accuracy-3/VERIFY.md`,
`src/nuketown2-fidelity.test.ts`, `src/nuketown2-layout.ts`.
All findings below are scoped to the lane; inherited conditions are labelled as such.

## VERDICT: SHIP-WITH-FIXES (agreeing with the verifier)

### Reason 1 - the derivation reproduces to 4 dp and every pinned offset survives it

Recomputed from `src/nuketown2-layout.ts:517-542` with no shared code:
wall 1 (corner) `-12.149094`, wall 2 (rear mouth) `-11.662490`, seat `-11.612490`,
1.0125 m deeper than -10.6. The REPORT's `-12.149 / -11.6625 / -11.6125` match.
Coach stays derived (`src/nuketown2-layout.ts:616-617`:
`x = TRUCK.x + 6.4`, `z = TRUCK.z - 5.4`, i.e. 0.1778/0.1500 L intact) and the
overdrive core follows by construction (`src/overdrive.ts:84-86` reads
`NUKETOWN2_CENTRAL_TRUCK.x/.z/.roofY` through `nuketown2HandedX`). The lane's test
diff is pure addition (one new `it` + one import, zero `-` removal lines) and the
verify pass tightened the ratchet 0.87 -> 0.868 (strengthening). Nothing loosened.

### Reason 2 - the residue is honestly ratcheted and its scope is now in writing

The coach ratchet (`src/nuketown2-fidelity.test.ts:804-806`, `<= 0.868`) is above
zero, so the residue is admitted, not hidden; the solid-vs-envelope scope split
(32 % vs 4.5 %) is written into both the REPORT (§2 correction box) and the gate's
own comment after the verify fix. A capture will still show bumper on the lune -
but nobody reading the branch can claim they were not told.

### Reason 3 - the two blockers are both outside this lane and neither needs a rebuild

(a) `src/walkable-surface-parity-gate.test.ts` is red (3 tests, 24 floors/holes) and
arrived with the merged rooflines work - reproduced at `75fbaf59` by the verifier,
untouched by this lane's four files. It needs triage (fix or ledger rows, REPORT
TODO 2), not a revert of the truck seat. (b) The 1.01 m move of the map's biggest
cover piece went out without running `spawn-layout-quality` / `bot-spawn-presence`
(see Finding 4). Both are pre-publish gate runs, not redesign. The wrong-base
issue (REPORT TODO 1, geometry-2 divergence) stands as an orchestrator decision.

---

## Finding 1 - measurements table: reference column conflates two sources (low)

**File:** `docs/evidence/pass95/nuketown2-accuracy-3/REPORT.md:49-64` (table),
`src/nuketown2-layout.ts` comments as noted.

**What I checked:** `FINDINGS.md` (`aa-claude-research/docs/references/nuketown-2025/`)
contains **zero** pixel ratios - verified by search (no `0.303/0.553/0.363/0.178/
0.150/0.325/0.076/px of 400` anywhere in it). Q4 (`FINDINGS.md:155-211`) is
qualitative VERIFIED (lollipop exists, coach/truck/saloon/classic present,
appliance banks colour-coded) plus explicit OPENs (mailboxes, inset). Every L ratio
in the REPORT table comes from `docs/nuketown-rebuild/REFERENCE_SCHEMATIC.md:123-137`
(BO7/BO2 minimap px-of-400: 121/221/145/50-58/130/72/58/71/60) and the layout
comments that cite it (house `layout.ts:202-204`, corridor `layout.ts:335-338`,
truck `layout.ts:424-438`, stem:bulb `layout.ts:164-167`). Note the schematics's own
caveats (§3 caveat 1: ~0.038 L stroke inflation) are handled in code, not in REPORT §1.
Also: there is **no** `docs/references/nuketown-2025/` copy in this worktree (confirmed
absent) - so the build lane indeed worked without FINDINGS, exactly as suspected.

**Why it matters:** REPORT §1's header ("FINDINGS Q4 and the schematic's first-party
minimap pixel ratios") reads as if FINDINGS pins the numbers. It does not; the
schematic does. And "Bulb diameter ... OPEN (FINDINGS open item 5)" is imprecise:
FINDINGS open item 5 (`FINDINGS.md:299`) is the head's *inset/offset inboard*, while
bulb diameter 0.450 L **is** measured in the schematic (`REFERENCE_SCHEMATIC.md:123**:
~180 px). The rows marked "VERIFIED, untouched" were not re-measured this pass -
they are held by pre-existing fidelity gates, which do exist
(`src/nuketown2-fidelity.test.ts:434-455` house/corridor/depth/garage,
`:699-700` coach offsets, `:520-532` truck z/length, `:2671-2684` corridor band).
That is honest if labelled as gate-held, not re-derived.

**Smallest fix:** one sentence in REPORT §1: "All Reference (L) figures are
REFERENCE_SCHEMATIC §3 minimap ratios, gate-held by `nuketown2-fidelity.test.ts`
and untouched this pass; FINDINGS Q4 contributes qualitative VERIFIED (presence,
chirality, lollipop shape) and the OPENs, not numbers." Correct the bulb-diameter
row to "0.450 L per schematic, inset OPEN per FINDINGS item 5".

## Finding 2 - walls 1+2 and seat reproduce; the "-12.49 / 0.88 m" shortfall is asserted, not derived (low)

**File:** `docs/evidence/pass95/nuketown2-accuracy-3/REPORT.md:139-162`,
`src/nuketown2-layout.ts:517-542`,
`src/nuketown2-fidelity.test.ts:750-772` (comment).

**What I checked:** independent arithmetic (centreX -8.5, r 8, TRUCK_Z 2.75, W 2.6,
box 6.5): wall 1 = `-12.149094`, wall 2 = `-11.662490`, seat = `-11.612490`,
wall gap 0.4866 m ("0.49 m" ✔), deeper by 1.0125 m ("1.01 m" ✔). The verifier's units
note also reproduces: proper radial mouth wall `-11.6921`, shipped seat conservative
by 0.0796 m (✔, matches REPORT §4b NOTE). The 0.150 L / 0.178 L coach offsets and the
overdrive derivation are intact per Verdict Reason 1.

**What does NOT reproduce:** "the coach would need the TRUCK at x <= -12.49 ...
shortfall 0.88 m". A disc-only solve for the coach's rear-outer corner inside the
disc gives truck x = -17.31, not -12.49 - because the binding geometry is the
disc-vs-**stem-rect** lune pocket (stem starts at `mouthX = -0.5`), not the disc
alone, and no lune-pocket inequality is written anywhere in code or REPORT. The
residue's *existence* is certain (the ratchet 0.868 > 0 proves it) and its *cause*
(bulb radius + pocket) is right; only the two decimal figures are un-derived.

**Smallest fix:** either write the pocket inequality (rear/front outer corner against
`max(disc, stem rect)`, solved for truck x) or soften to "the coach needs the truck
≈0.9 m deeper than the deepest seat, so the pair cannot both clear at r = 8".

## Finding 3 - bay-end walls: correctly unbuilt, ceiling intact, cut-list justification overstated (info)

**File:** `docs/evidence/pass95/nuketown2-accuracy-3/REPORT.md:210-226`;
`src/nuketown2-fidelity.test.ts:2743-2747`; `src/nuketown2-fidelity.test.ts:2839-2843`.

**What I checked:** "what was removed to pay for them" = **nothing** - the lane diff
touches no arena/verge file (four-file list above), adds no bodies, and the ceiling
is byte-intact (`toBeLessThanOrEqual(36)` furniture / `<= 51` bodies). The in-code
comment at `:2840-2841` ("low walls ... held for exactly this reason") agrees with
REPORT. Holding OPEN is correct.

**Why I still write this up:** REPORT's "cheapest legitimate candidates" (three
`verge appliance dial` decals + `verge mailbox flag`) are bodies the reference grades
**OPEN/absent**, not present: FINDINGS Q4's native-resolution verge census
(`FINDINGS.md:194-196`) lists kerbs, pavements, appliance banks, ornamental plants,
chain-and-post edging, manhole cover - no dials; mailboxes are explicitly OPEN
("no mailbox posts found", `FINDINGS.md:194-199`). Cutting invented bodies is
legitimate, but "with a reference justification" overstates it - the justification is
*absence*, and the walls themselves have no reference image either (no street
elevation at eye level exists per FINDINGS Q3 `FINDINGS.md:145-148` / Q4). No code
fix; keep OPEN and do not let a later lane cite this as reference-backed geometry.

## Finding 4 - alleys/balconies untouched, but the 1 m cover move skipped the spawn suites (medium-low)

**File:** lane diff (no `src/nuketown2-arena.ts`, no `src/collider-visual-parity-gate.test.ts`,
no `src/spawn-*.ts` change - zero diff in all three across `75fbaf59..HEAD`);
`src/nuketown2-fidelity.test.ts:273,549` (`MAX_STREET_CENTRE_RUN_METRES` band);
REPORT §3 items 3-4.

**What I checked:** no alley or balcony geometry added (diff proves the negative);
rear balconies + exterior flights pre-exist via HF-465 (`src/nuketown2-arena.ts:1697+`,
gated at `src/nuketown2-fidelity.test.ts:2390+`); street-side balconies correctly
withheld per FINDINGS Q3 OPEN; alley planter exists and the "76.2 m lane" cover
rationale is in-tree. Parity-gate and spawn files are untouched by the lane, and the
fairness bands are intact (centre-run `<= 21.2` at `:549`, corridor two-sided band at
`:2671+`, spawns at |z| = 24-31 per schematic `:316`).

**The gap:** the truck + coach (the two biggest/street-cover bodies) moved 1.01 m and
neither the lane's 9-file set nor the verifier's 6 collateral suites
(`overdrive-line-of-sight`, `railgun-authority`, `killstreak-flight-navigation`,
`destructible-shed-registry`, `map-selection`, `match-diagnostics-migration`) include
`spawn-layout-quality` / `bot-spawn-presence`. Spawn positions are untouched, but
sightlines run *over* moved cover. The verifier's "no collateral damage" sentence
(`VERIFY.md:66-70`) is therefore one suite short of what this lane moved.

**Smallest fix:** before publish, run `npx vitest run src/spawn-layout-quality.test.ts
src/bot-spawn-presence.test.ts` (plus the TODO 2 walkable-parity triage) on this
branch and append the counts to REPORT §5. No code change expected.

## Finding 5 - no test loosened; coplanar classes are as reported after the verify fix (info)

**File:** `src/nuketown2-fidelity.test.ts` (lane diff `75fbaf59..HEAD`, verify diff
`c4d3bdb1..39d0b113`); `scripts/qa/find-coplanar-pairs.ts:231-260`.

**What I checked:** lane test diff = one new `it` + one import, zero `-` lines
(confirmed: `git diff 75fbaf59..HEAD -- '*.test.ts'` has no removal). Verify diff =
comment corrections + `0.87 -> 0.868` tightening (strengthening only). The script
prints `BENIGN` (not `SAME-MATERIAL`) with an unconditional `overlap=` field
(`:232,:240-244`), so non-zero BENIGN overlaps are by design - the verifier's
refutation (18 non-zero, 4 at dy=0.0000 / 0.2-0.5 m² on perimeter walls, balcony
rail/cap, crate/butt pads) is structurally plausible and, crucially, **none of those
bodies is in the lane diff** (inherited). Load-bearing classes (HOUSE-INTERIOR 0,
STREET 0, FINDINGS 0, boxes=880/pairs=173/FENCED=115/BENIGN=58) reproduced exactly
per VERIFY.md. Geometry-2 already sweeps this class (`e46ca6c9`), so no action here.

---

## Pre-publish checklist (from TODOs 1-4, unchanged + Finding 4)

1. TODO 1 (orchestrator): re-land the two lane commits on `nuketown2-geometry-2`
   (`daf398ba`) - 379-file divergence, not a verify-pass edit.
2. TODO 2: triage `walkable-surface-parity-gate` (3 red / 24 floors) - rooflines'
   debt, ridden in by this lane's merge.
3. Run `spawn-layout-quality` + `bot-spawn-presence` (Finding 4) and record counts.
4. TODOs 3-4 (next lane): widen vehicle gate to emitted envelope, then pave the lune
   pockets as kerb returns - the only change that zeroes the residue.
5. Cosmetic: Finding 1 provenance sentence; Finding 2 shortfall derivation-or-soften.
