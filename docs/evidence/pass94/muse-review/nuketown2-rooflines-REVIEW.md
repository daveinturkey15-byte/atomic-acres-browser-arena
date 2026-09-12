# Muse review — pass94 nuketown2 rooflines + exterior stairs lane

Branch: `contrib/dave-gaming-pc/claude/nuketown2-rooflines` (in `C:/Users/david/projects/aa-claude-roofs`).
Range reviewed: `git log --oneline 6d3e1ad8..HEAD` =
`e3a7b536` (wip design + gate handoff, REPORT only),
`9be624e3` (rooflines), `07a6eaa0` (stairs).
Full diff over `src` (5 files total incl. REPORT): `src/nuketown2-roofs.ts` (new, 301 lines),
`src/nuketown2-arena.ts`, `src/nuketown2-fidelity.test.ts`, `src/nuketown2-roofs.test.ts` (new).
REPORT: `docs/evidence/pass94/nuketown2-rooflines/REPORT.md` (334 lines).
No builds, browsers, or test runs performed (per brief boundary); all claims below are source-level.
Claim-states: VERIFIED = read in source at cited line; DERIVED = computed from cited values;
OPEN = needs browser/GPU capture (REPORT §4, five views) — explicitly out of scope here.

## 1. The four gate findings from the design lane — VERIFIED honoured

- **(a) Parity Direction C has no above-reach exclusion → rakes must be `shots: true`.**
  VERIFIED. `scripts/qa/collider-visual-parity-core.ts:456-458` skips Direction-B entries with
  `box.min.y >= ABOVE_REACH_MIN_Y_M` (2.6, `:66`), while Direction C (`:547-548`) computes
  `combatMinY = max(box.min.y, 0)`, `combatMaxY = min(box.max.y, 2.6)` with no above-reach skip.
  Both rakes comply: `src/nuketown2-roofs.ts:90-91`
  (`solid: false as const, shots: true,` under `name: 'house A roof front rake'`) and
  `:103-104` (rear rake, same flags). Capsule bands (`:145-146`, `shots: false`, 0.20 m height)
  and panels (`:124-125`, `shots: false`, ~0.213 m AABB) stay free under the 0.9 m census floor —
  matches REPORT §3.1 items 2/4/5.
- **(b) Symmetry exception must be a fourth named list derived from a table, with a class check.**
  VERIFIED. `src/nuketown2-roofs.ts:160-161` derives
  `NUKETOWN2_ROOF_SYMMETRY_EXCEPTION_NAMES` from `NUKETOWN2_ROOF_BODY_TABLE`;
  `src/nuketown2-fidelity.test.ts:1875-1880` keeps the exact-equality asymmetric-set assertion
  closed (spread of the derived list, still `.toEqual`), and `:1886` + `:1900-1902` adds the
  `roofs` class with a name-prefix closure check so the list cannot be grown by renaming a wall.
  One-sided emitters exist as required: `northOnly` (`nuketown2-roofs.ts:192`) /
  `southOnly` (`:208`).
- **(c) Stringers non-solid (spawn-standoff / HF-477 wedge reason).** VERIFIED.
  `src/nuketown2-roofs.ts:270-273`: both stringers
  `{ solid: false, shots: true, ballisticMaterial: 'wood', rotation: [0, 0, stairAngle] }`.
  Handedness correct: `stairAngle = NUKETOWN2_HANDEDNESS * angleRadians` (`:264`) with Z-negation
  on the south copy (`:237-236` `pairedStairBox`), consistent with `M R_z(t) M = R_z(-t)`;
  X-rotations on the rakes need no handedness factor (REPORT §2.1 note) and `northOnly` passes
  rotation through unchanged — correct under x-mirror.
- **(d) No coping to remove; fascia kept; patio already existed.** VERIFIED.
  `grep -n coping src/nuketown2-arena.ts` returns exactly one hit, the yard pool
  (`src/nuketown2-arena.ts:2845` `pair(builder, 'yard pool coping', …)`); the front fascia
  (`:1395-1396` `house front roof fascia … [HOUSE_WIDTH + 0.16, 0.12, 0.10]`) is untouched by the
  diff, and the patio edit refines bands 7→13 (`:1737`) instead of inventing a disc.

## 2. Rake rating vs the roof deck — HELD (flags + name) BUT surface mismatched (F1)

Quoted as required (`src/nuketown2-roofs.ts:84-91`, rear mirrors at `:97-104`):

```
name: 'house A roof front rake',   // contains 'roof'
material: 'roof' as const,
solid: false as const,
shots: true,                        // no explicit ballisticMaterial
```

This matches the deck in mechanism: the deck (`src/nuketown2-arena.ts:1298-1299`
`pair(builder, 'house roof deck', …, [m.roof, m.roofGlazing])`, default options ⇒ solid+shots)
is likewise rated with no explicit `ballisticMaterial`, via `box()` in
`src/additional-maps.ts:115-118` → `:133-148` (`impactSurface = classifyImpactSurface({name,…})`,
`material: options.ballisticMaterial` = undefined both sides). VERIFIED the flags and the name
contain 'roof', and the new test pins exactly 2 rated roof bodies (`src/nuketown2-roofs.test.ts:97`).

## 3. Stair walkability — VERIFIED no regression path

- Ramp collider unchanged: the arena diff deletes only the old presentation tread loop
  (`src/nuketown2-arena.ts:~1784`, `pair(builder, 'yard stair ${i}' …)`) and leaves the two
  collision-only ramps byte-identical (`:1769-1778`, `userData.collisionOnly = true` on both,
  exact rotated OBBs kept in `physicsColliders` only). Envelope constants re-derive cleanly:
  17 risers (`:590-591`, `YARD_STAIR_RISERS = 17`, `GOING = 4.2/16`), `RUN = going*16 = 4.2`
  exactly, so `footX = -9.4`, ramp run/angle, patio centre, shed clearance and the |z|=25 spawn
  standoff are bit-identical — the 194/262.5 mm choice (2R+G = 650 mm) holds the envelope where
  180/280 would have needed 5.04 m (REPORT §2.3 DERIVED, checked against shed footprint end
  −11.9 and the 1.2 m floor). New test pins `footX = -9.4`, 2 ramps, `collisionOnly`, and 6 new
  shot surfaces (`src/nuketown2-roofs.test.ts:115`, `:128-133`).
- Handrail does not collide: `src/nuketown2-roofs.ts:276-279` handrail
  `{ solid: false, shots: true, ballisticMaterial: 'wood' }` on the outboard side only
  (`outboardZ`, inboard is the house back-wall plane — correct to omit); rail posts
  `:281-288` `solid: false, shots: false`; every stair mesh asserts
  `nuketown2ExteriorStairSolid === false` (`nuketown2-roofs.test.ts:125`).
  Sticky-stairs risk: none added — all 76 stair bodies are presentation/shot only.

## 4. New node graph or pipeline — VERIFIED none

All roof/stair bodies go through `box()` (`THREE.BoxGeometry` only); no `CylinderGeometry`,
no new material, no new TSL graph. Wiring reuses existing roles
(`src/nuketown2-arena.ts:3006-3015`: `roof: m.roof, roofGlazing: m.roofGlazing, timber: m.fence`).
Diff `--name-only` over the range lists only REPORT + the four `src` files above — no
pipeline/material/budget file touched. Capsule chord-banding follows the HF-477 patio idiom
(8 bands × 0.20 m, glazing on top two — `nuketown2-roofs.ts:133-144`), so the `size()` reader in
`solidMeshes()` keeps working. (One cost of "no new material": F2 below.)

## 5. Test loosened — VERIFIED none

- `src/nuketown2-fidelity.test.ts`: strictly extends — derived exception spread into the exact
  asymmetric expectation (`:1879`) plus a new closing class assertion (`:1900-1902`). No
  threshold, timeout, count, or tolerance weakened; carriageway/third-house/vehicle payments
  untouched (`:1915-2060` still exact).
- `src/nuketown2-roofs.test.ts` (new, 135 lines): all strict — rake sizes/rotations/valley y =
  6.55 (`:37-67`), 6 panels + 16 capsule bands with side/material splits (`:69-85`), exception
  `toEqual(tableNames)` + plan-area equality + all-`solid:false`/non-walkable + `min.y ≥ 6.5` +
  exactly 2 ballistic bodies (`:87-103`), 17-riser envelope + mesh census (4/32/32/2/4) +
  ramps + 6 stair shot surfaces (`:105-134`).

## Findings (file:line + why + smallest fix)

**F1 — Rake `impactSurface` does NOT match the deck (`concrete` vs `wood`).**
`src/combat-feedback.ts:34-43` has no `roof` branch: `house roof deck` rates via `/deck/` → `'wood'`
(`:39`), while `house A roof front/rear rake` (`src/nuketown2-roofs.ts:85,98`) match nothing and
fall through (roof metalness 0.02, `:37` in `nuketown2-facade-materials.ts`) → `'concrete'` (`:42`).
REPORT §3.1 ("name containing 'roof' … exactly how `house roof deck` is rated today …
`classifyImpactSurface` reads the NAME first") is therefore wrong about the mechanism, and hits on
the rakes get concrete SFX/penetration where the deck gives wood. Why it matters: every shot that
lands on the most visible new surface reports the wrong material. Smallest fix: rename the rakes
to include `deck` (e.g. `house A roof deck front rake` — keeps the `roof` substring the exception
table and any `roof` greps rely on) or pass an explicit wood hint/`ballisticMaterial` matching the
deck, and extend `nuketown2-roofs.test.ts:97-101` to assert
`rake.impactSurface === deck.impactSurface`.

**F2 — Six solar panels render in shingle material, not dark.**
`src/nuketown2-roofs.ts:123` sets every panel body `material: 'roof'`; the reference (REPORT §1-2)
asks for six *dark* panels and the lane's own §3.3 says to "reuse an existing dark role rather
than adding one". As built they read as shingle patches, failing capture item §4.2 ("six dark
panels in two rows of three"). Why it matters: identity feature silently absent while tests stay
green (no test asserts panel material/colour). Smallest fix: point the panel spec at an existing
dark role (e.g. the vehicle-glass/bus-trim dark already in the materials table — no new material,
no new pipeline), keep `shots: false`, and assert the dark role in `nuketown2-roofs.test.ts:69-85`.

**F3 (minor) — Roof-fairness payment is partly tautological and lives outside the symmetry gate.**
`NUKETOWN2_ROOF_PLAN_AREA_BY_SIDE` is `WIDTH*DEPTH` on both sides by construction, so
`nuketown2-roofs.test.ts:91-92` asserts a constant equals itself rather than measuring the emitted
`planArea` sums; apex heights (8.15 capsule vs ~7.77 rear-eave high edge) have no stated band; and
none of the REPORT §3.2 payments (equal plan area, apex band, zero colliders/walkable, nothing
ballistic below 6.5 m) are asserted in `src/nuketown2-fidelity.test.ts` itself — only the name
closure is. Why it matters: a future edit can grow the exception's mass while both gates stay
green. Smallest fix: assert in `nuketown2-roofs.test.ts` the per-side `planArea` sums and apex
heights within a stated band (and keep the existing `min.y ≥ 6.5` / solid-false / walkable-false
pins at `:94-101`).

## Verdict: SHIP-WITH-FIXES

1. Structure, collision, and gates are sound: ramps untouched, all 100+ new bodies non-solid and
   above the deck, Direction-C rating present on exactly the bodies that need it, symmetry
   exception table-derived and closed, no test weakened, no pipeline added.
2. The two real defects are small, bounded, and fixable without touching the envelope: F1 is a
   rename-or-hint plus one assertion; F2 is a material-role swap to an existing dark role plus one
   assertion — neither moves geometry, colliders, or the exception list.
3. What remains OPEN is visual only (REPORT §4 five captures + jump-on-deck probe) and was already
   declared OPEN by the lane; nothing in this diff makes that capture riskier, but F2 means the
   "six dark panels" capture currently fails on colour.

Scope note: reviewed the exact `6d3e1ad8..HEAD` range (3 commits above); `git status` clean apart
from this review file; `src/` untouched by the reviewer; one file written, as briefed.
