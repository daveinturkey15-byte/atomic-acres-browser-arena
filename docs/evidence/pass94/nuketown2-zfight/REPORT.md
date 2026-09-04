# HF-497 — nuketown2 z-fight sweep (SAME-MATERIAL / FENCED classes)

Worktree `C:\Users\david\projects\aa-claude-zfight`, branch
`contrib/dave-gaming-pc/claude/nuketown2-zfight`, base
`origin/contrib/dave-gaming-pc/claude/pass93-candidate` @ `3e2fd273`.
No builds, no browsers, no GPU were used; nothing outside this worktree was touched.

## Instrument change (strengthening)

`scripts/qa/find-coplanar-pairs.ts` now reports a new FINDING class, HF-497
**SAME-MATERIAL-VISIBLE**: a same-material coplanar pair whose bodies are BOTH
rendered (neither carries `userData.presentationOnly`) and whose race region can
actually draw (see below), with no polygonOffset fence on either side. The
scan/classify core was extracted to `src/nuketown2-coplanar-audit.ts` and is
imported by BOTH the instrument and the new vitest pin, so they cannot drift.
Classification is derived from the built roster (materials, flags, box volumes) —
no name lists — so any other arena inherits the same rule over its own geometry;
this instrument builds only nuketown2, so no other arena's counts can move.

Mechanics of "race region can draw" (`raceRegionVisible`):

- Plan overlap below `MIN_RACE_AREA_M2` (0.02 m2) is `CONTACT`, not a race:
  a butt joint or edge contact of adjoining members. The floor sits in a
  measured gap — the arena's largest member-to-member contact is the balcony
  rail corner at 0.12 m x 0.12 m = 0.0144 m2; its smallest authored surface
  race is 0.1 m2.
- The overlap rectangle is sampled (cell centres, <= 5 cm pitch, 2–9 per axis).
  The upper face must not be strictly inside an opaque third body; when the
  tops differ, the lower face must additionally not be strictly inside the
  UPPER body or a third body. See-through bodies (any transparent material —
  window glass, grime films) never occlude. This is the mechanical form of the
  owner's rule that a fence only prevents tearing when it is actually opaque
  between the two surfaces.

## Before / after (quoted gate output)

Before (legacy instrument, base head 3e2fd273):

```
# nuketown2 coplanar top-face pairs (HF-434 instrument)
# HOUSE-INTERIOR pairs<=0.03m (offsets ignored): 0
# STREET pairs<=0.03m (offsets ignored): 0
# boxes=819 · pairs<=0.03m: 191 · FINDINGS (different materials, no offset): 0 · FENCED (material offset): 165 · SAME-MATERIAL (benign): 26
Exit code: 0
```

Strengthened instrument on the unfixed arena (exit now fails, as designed):

```
# HF-497 SAME-MATERIAL-VISIBLE FINDINGS (both rendered, race visible, no offset): 8
# CONTACT (same-material edge/butt contact under the 0.02 m2 race floor): 8
# boxes=819 · pairs<=0.03m: 191 · FINDINGS (different materials, no offset): 0 · FENCED (material offset): 165 · SAME-MATERIAL-VISIBLE: 8 · CONTACT: 8 · SAME-MATERIAL (benign): 10
Exit code: 1
```

After the fixes below:

```
# nuketown2 coplanar top-face pairs (HF-434 instrument)
# HOUSE-INTERIOR pairs<=0.03m (offsets ignored): 0
# STREET pairs<=0.03m (offsets ignored): 0
# HF-497 SAME-MATERIAL-VISIBLE FINDINGS (both rendered, race visible, no offset): 0
# CONTACT (same-material edge/butt contact under the 0.02 m2 race floor): 4
# boxes=819 · pairs<=0.03m: 191 · FINDINGS (different materials, no offset): 0 · FENCED (material offset): 177 · SAME-MATERIAL-VISIBLE: 0 · CONTACT: 4 · SAME-MATERIAL (benign): 10
Exit code: 0
```

Geometry is untouched throughout: 819 boxes and 191 pairs before and after; only
material objects moved.

## Pairs changed (names, tier, offset)

All three fixes use the arena's existing integer polygonOffset tier `-1` (the
HF-434 decal tier: a surface riding on a solid), applied to a per-body CLONE so
the shared registry roles (`trim`, `fence`, `drive`) stay clean exactly as
`nuketown2-materials.test.ts` pins them. Same paint, same geometry — only the
depth tie-break moved. Each `pair()` call emits both mirrors, so one authoring
change fixes the north and south pair together.

1. Perimeter wall corners — 4 pairs:
   `nuketown2 north perimeter wall long` x `nuketown2 north perimeter wall end`,
   `nuketown2 north perimeter wall long` x `nuketown2 south perimeter wall end`,
   `nuketown2 south perimeter wall long` x `nuketown2 north perimeter wall end`,
   `nuketown2 south perimeter wall long` x `nuketown2 south perimeter wall end`.
   dy = 0.0000 m, overlap = 0.2 m2 per corner (0.4 m x 0.4 m post), top 3.200 m —
   street-visible. Fix: `perimeter wall end` gets cloned material
   `nuketown2-perimeter-wall-end`, `polygonOffset = true`, factor/units `-1`.
   The END top wins every corner race deterministically on both backends.
   Claim-states: rendered/reachable VERIFIED from geometry (3.2 m wall on the
   playable bound; house roofs and eaves visible from the street above it);
   class change VERIFIED by instrument output (rows now FENCED); visual result
   NOT VERIFIED (no browser/GPU permitted in this task) — [INFERENCE] an
   identical-material clone with a depth tie-break cannot change appearance.

2. Balcony rail cap — 2 SAME-VISIBLE pairs plus 4 CONTACT re-classes:
   `nuketown2 north balcony rail outboard` x `nuketown2 north balcony rail cap`
   and the south twin (dy 0.0000 m, overlap 0.5 m2, top 4.400 m — the house's
   eave/roof line is street-visible, and the balcony sits on the street frontage).
   The same clone also fences `balcony rail newel` x `cap` and
   `balcony rail return far` x `cap` (2 CONTACT pairs per side, 0.018 m2).
   Fix: `balcony rail cap` gets cloned material `nuketown2-balcony-rail-cap`,
   factor/units `-1`; the cap top wins the race over all three rail members.
   Claim-states: as above — class change VERIFIED by instrument; visual
   NOT VERIFIED, [INFERENCE] appearance-neutral.

3. Yard pads — 2 pairs:
   `nuketown2 north yard cover crate pad` x `nuketown2 north yard butt pad`
   and the south twin (dy 0.0000 m, overlap 0.5 m2, top 0.080 m, lawn level).
   Fix: the SMALLER body (`yard butt pad`, 1.96 m2 vs 6.21 m2) gets cloned
   material `nuketown2-yard-butt-pad`, factor/units `-1`; its top wins the
   shared plane. Claim-states: as above.

## Pairs audited and deliberately NOT changed

- Balcony rail butt joints — 4 CONTACT rows (per side: `outboard` x `newel`,
  `outboard` x `return far`; 0.0144–0.018 m2): member-to-member construction
  contact below the documented 0.02 m2 visible-race floor. VERIFIED measured
  from the authored constants (`BALCONY_RAIL_T = 0.12`).
- Window trim — 10 BENIGN rows: `house front window sill nose N` x
  `house front window stool N` (dy 0.005 m), `sill nose N` x
  `house front window apron N` (dy 0.030 m), and `house front door pediment
  trim` x `porch canopy head` (dy 0.020 m), north and south. The lower face is
  buried inside the upper body (stool/apron/canopy span the lower face's plane),
  and the sill/stool pairs are additionally separated by the wall itself: no
  view ray draws both faces, so no race is reachable. VERIFIED mechanically by
  the instrument's race-region sampling (rows classify BENIGN); [INFERENCE]
  matches the physical occlusion reading.
- FENCED class (165 rows before): every fence holds. The only same-tier pairs
  are the 8 grime rows (`tyre scuff`/`oil stain`/`slab cracking` on the drives
  and border paths, all at offset -3). These are transparent, no-depth-write
  films: a polygonOffset delta cannot order two such films, and the module
  already pins their mutual order the only way that works — MUSE FINDING 1's
  `GRIME_FAMILY_LIFT_M` separates the families by 0.001–0.002 m, and because
  every gameplay camera is above the ground plane, the higher film's centre is
  always the nearer to the eye, so the transparent painter sort draws it last
  deterministically on both backends. VERIFIED mechanism (lifts read from
  `src/nuketown2-grime-decals.ts`); visual NOT VERIFIED, [INFERENCE].
  Widening the lifts to the 0.01–0.03 m standard was considered and REJECTED:
  the module documents that grime must stay inside the 0.03 m audit window
  ("SEEN-and-FENCED rather than floating out of the audit"), and a larger lift
  would not strengthen a no-depth-write ordering that geometry already pins.
- Presentation-only bodies (vehicle trim flagged `userData.presentationOnly`)
  are excluded from the new class by the owner's own rule; they remain counted
  in the FENCED/BENIGN classes exactly as before.

## Gates (quoted)

```
$ npx tsc --noEmit
TSC_EXIT=0
```

```
$ npx tsx scripts/qa/find-coplanar-pairs.ts
# HOUSE-INTERIOR pairs<=0.03m (offsets ignored): 0
# STREET pairs<=0.03m (offsets ignored): 0
# HF-497 SAME-MATERIAL-VISIBLE FINDINGS (both rendered, race visible, no offset): 0
# CONTACT (same-material edge/butt contact under the 0.02 m2 race floor): 4
# boxes=819 · pairs<=0.03m: 191 · FINDINGS (different materials, no offset): 0
  · FENCED (material offset): 177 · SAME-MATERIAL-VISIBLE: 0 · CONTACT: 4
  · SAME-MATERIAL (benign): 10
Exit code: 0
```

```
$ npx vitest run src/nuketown2-fidelity.test.ts src/collider-visual-parity-gate.test.ts src/legacy-main-size-ratchet.test.ts
 Test Files  3 passed (3)
      Tests  45 passed (45)
VITEST_EXIT=0
```

```
$ npx vitest run src/nuketown2-fidelity.test.ts -t "SAME-MATERIAL-VISIBLE"
 Tests  1 passed | 33 skipped (34)
VITEST_EXIT=0
```

Adjacency checks (not part of the gate list, run because the fix touches
materials):

```
$ npx vitest run src/nuketown2-grime-decals.test.ts          -> 1 file / 8 tests passed
$ npx vitest run src/nuketown2-materials/nuketown2-materials.test.ts -> 1 file / 49 tests passed
```

No gate, threshold, assertion or tolerance was weakened; the only exit-code
change is the instrument FAILING on the new class, which is the strengthening
itself.

## Files

- `src/nuketown2-arena.ts` — three cloned materials (`nuketown2-perimeter-wall-end`,
  `nuketown2-balcony-rail-cap`, `nuketown2-yard-butt-pad`), each at tier -1.
- `src/nuketown2-coplanar-audit.ts` — new: shared scan/classify core.
- `scripts/qa/find-coplanar-pairs.ts` — reports through the shared core; adds
  SAME-MATERIAL-VISIBLE and CONTACT classes to the header, rows and exit code.
- `src/nuketown2-fidelity.test.ts` — pins `same-material-visible === 0` for
  nuketown2 via the shared core.
