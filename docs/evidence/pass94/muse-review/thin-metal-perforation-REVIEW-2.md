# Muse review 2 — thin-metal perforation whole-lane verdict at df1326dd (HF-467)

Reviewer: Meta Muse Spark 1.3 (skeptic). Worktree: `C:/Users/david/projects/aa-claude-perforate`, branch `contrib/dave-gaming-pc/claude/thin-metal-perforation`. HEAD verified: `df1326dd`.
Scope: `git log --oneline origin/contrib/dave-gaming-pc/claude/pass93-candidate..HEAD` (17 commits, `1bd382e8`..`df1326dd`), `git diff origin/contrib/dave-gaming-pc/claude/pass93-candidate...HEAD -- src scripts` (7 src files, +1447/−22 per stat; 11 files / +2056 with reports), `docs/evidence/pass94/candidate/REPORT.md`, `artifacts/lane-report.md` (202 lines, follow-ups `DONE F-06/F-08/F-10` + gates), earlier reviews `docs/evidence/pass94/muse-review/thin-metal-REVIEW.md` (DO-NOT-SHIP, F-01..F-10), `thin-metal-REVIEW-2.md` (SHIP), `thin-metal-REVIEW-3.md` (SHIP, F-06/F-08/F-10 landed). Special attention: commits after `0169112b`. Read-only; no builds, no test runs, no `src/` edits, no installs.

Note on filenames: the task named `thin-metal-perforation-REVIEW.md` as the earlier review; that path does not exist. The actual earlier reviews are `thin-metal-REVIEW.md` / `-2.md` / `-3.md`. This file (`thin-metal-perforation-REVIEW-2.md`) is new; nothing overwritten.

## Verdict: SHIP

1. The whole lane at `df1326dd` holds every blocking fix REVIEW-2 and REVIEW-3 verified (F-01 stale-reject at `src/thin-metal-perforation.ts:638`, F-02 exact-count+identity at `:640-643`, F-03 `nextHoleId` max-advance at `:654`, F-04 `ThinMetalPerforationStateMessage` in `src/protocol.ts:1446`, F-07 rollback symmetry in `src/thin-metal-perforation-runtime.ts:76-90`, F-06/F-08/F-10 landed + pinned). The only commit after `0169112b` is docs-only, so nothing executable regressed since the last SHIP.
2. All five asked checks hold with source receipts below: alpha-tested cutout with no combat pipeline variant (2 admission-compiled programs, tripwire 0); no coplanar pair (12 mm normal offset + `FINDINGS 0`); perforate-class collider rule named with wiring; docs-only fix-round with no loosened test/threshold/fixture; cold-path texture cost bounded and inventoried.
3. No ratchet, test, threshold, or fixture movement in this lane: `LINE_CEILING` unchanged at 37,365, `src/legacy-main.ts` measures 37,362 (−3 slack), `CEILING_HISTORY` untouched, existing suites unmodified (only two new files + wiring hunks). No clean-up-by-lowering anywhere.

## (1) Alpha-test / pipeline variant — PASS, tripwire 0

`src/thin-metal-perforation.ts:412-418`:
```ts
const discMaterial = new THREE.MeshStandardMaterial({
  map: this.stencil,
  alphaTest: 0.5,
  metalness: 0.4,
  roughness: 0.9,
  side: THREE.DoubleSide,
});
```
Sibling `src/thin-metal-perforation.ts:407-409`: `thin-metal-hole-rim` (`MeshStandardMaterial`, metalness 0.92) on `TorusGeometry(1, 0.14, 6, 16)`; cutout disc on `CircleGeometry(1, 20)`. Stencil is a 32×32 `DataTexture` (`:355-382`), no DOM canvas, no custom GLSL, no TSL node, no `compileAsync`/precompile entry, no render-profile branch — zero hits for `TSL|compileAsync|precompile` in either thin-metal file.
New pipeline permutation: exactly 2 `MeshStandardMaterial` programs (rim + cutout), compiled with the rest of the preset at admission — the audit tripwire (`src/graphics-settings-registry.ts:922-923`: "the audit tripwire requires zero pipelines compiled in combat") holds at 0 in combat by construction. Bounded residual, already receipted: on a later arena switch without a full precompile the 2 materials compile on first visible frame (REVIEW-1 F-06, closed by the F-06 inventory/dispose test). No fix needed.

## (2) Coplanar pairs / z-fighting — PASS, checker classes at 0

`docs/evidence/pass94/candidate/gate-coplanar.txt:2-6`: `HOUSE-INTERIOR 0`, `STREET 0`, `pairs<=0.03m: 92 · FINDINGS (different materials, no offset): 0 · FENCED: 66 · SAME-MATERIAL (benign): 26`. The lane adds no arena geometry — presentation lives in its own scene-level group (`src/thin-metal-perforation.ts:404-424`, `thin-metal-perforation:<arenaId>`) — and every hole instance is offset 12 mm off the panel plane along the panel normal (`:441-443`: `+ placement.normal.* * 0.012` for x/y/z). A 12 mm decal offset cannot form a ≤0.03 m top-face coplanar pair with the backing wall, and the rim/disc pair share one composed matrix per hole (`:447-452`), so they cannot fight each other. No fix needed.

## (3) Bullets vs colliders — PASS, perforate-class rule named

Rule chosen: shed `perforate` class — a bullet hole is not a doorway. Ballistic traces (bullets AND bot shot traces, both via `traceBallisticPath`) pass through an open hole; movement colliders stay; bot vision LOS never consults the aperture. Where:
- Union: `src/thin-metal-perforation-runtime.ts:96-102` (`buildWorldApertureQuery`: shed ∨ thin-metal), installed as `worldApertureQuery` at `src/legacy-main.ts:4582`, consumed by `traceWeaponPath` (`:4575-4580`).
- Routing: `src/legacy-main.ts:4670` (`ownsThinMetalPanel` skip guard) + `:4679` → `routeInteractiveWorldBallisticImpact` (`src/thin-metal-perforation-runtime.ts:126-155`: thin-metal-owns → `applyPanelImpact`, else house/debris paths, `accepted:false` passthrough preserved).
- Authority aperture: `src/thin-metal-perforation.ts:605-614` (plane rejection + `apertureContainsPanelPoint` over minted holes).
- Collider non-mutation: no lane line touches `activeWorldColliders`, movement colliders, or `botHasLineOfSight` (collider-only, cf. REVIEW-1 F-09). The two sign-plate surfaces are already `solid:false`; the solid sign board keeps its collider by design (`artifacts/lane-report.md:112-119` inference, unchanged). Therefore a visual hole IS shoot-through (correct), is NOT walk-through (correct), and does NOT open bot vision (correct per R3 §8). Mismatch modes asked about do not occur. No fix needed.

## (4) Fix-round after 0169112b — docs-only, no loosening, ratchet respected

`git log --oneline 0169112b..HEAD` = one commit: `df1326dd docs(pass94): Muse review - thin-metal follow-ups (GLM-6)`. `git show --stat df1326dd` = 1 file, `docs/evidence/pass94/muse-review/thin-metal-REVIEW-3.md | 38 ++++`; `git diff 0169112b..HEAD --stat -- src scripts tests` = empty. What changed: the 38-line REVIEW-3 write-up recording REVIEW-2's three TODOs as landed (F-06 receipt, F-08 hoist, F-10 revision-gating) — no runtime, test, threshold, fixture, or gate change of any kind, so no test/threshold/fixture was loosened (nothing to loosen; the earlier F-06/F-08/F-10 code commits `0d570e09`/`46fd135a`/`2cfec655` predate `0169112b` and each ADDED assertions: inventory-to-baseline, no-shed reset + source assertion, 5-hit silent-dent walk).
Ratchet respected: `src/legacy-main-size-ratchet.test.ts:78` `LINE_CEILING = 37_365` unchanged, `CEILING_HISTORY` untouched by the lane, `wc -l src/legacy-main.ts` = 37,362 (−3 slack, inside `RATCHET_SLACK` 250 with no lock-in trip). The lane's `src/legacy-main.ts` delta is +39/−22 wiring only (import, aperture union, routing, broadcast/guest, epoch, transition create/commit/rollback/dispose); the −115 hoist into `thin-metal-perforation-runtime.ts` is what keeps the ceiling green. No fix needed.

## (5) Cold-path cost of generated texture/LUT — bounded, inventoried, 0 ms measured

Where: `holeStencilTexture()` (`src/thin-metal-perforation.ts:355-382`) — 32×32 RGBA (1024 px) LCG-seeded torn-edge stencil (`seed = 0x9e3779b9`, `torn = 0.82 + next()*0.12`, alpha 0/140/255), built once per `ThinMetalHolePresentation` constructor (`:401`, `:404`), i.e. once per authority creation via `createAndAttachThinMetalPerforationRuntime` during arena selection (before the whole-scene precompile on first deploy).
How many ms: none measured and none claimed — the lane records no timing gate for it, correctly, because CPU cost is a single 1024-iteration integer loop (negligible, headless-safe by design) and the GPU cost is the 2 programs / 2 geometries / 1 texture inventoried by the F-06 test (`+2 meshes / +2 geometries / +2 materials / +1 stencil texture`, per-resource `dispose` exactly once, snapshot returns to baseline). First-deploy compile is covered by the whole-scene precompile; later-switch hitch is bounded at 2 programs. No fix needed; do not add a timing gate for a 1024-px LCG.

## Residual non-blocking notes (unchanged from REVIEW-2, still optional)

- N-01: `applyAuthoritativeEnvelope` uses `<=` (`:638`) where the shed uses strict `<` — duplicate-repair returns `false`, harmless (handler ignores the return). Optional fix: adopt `<` once a duplicate-accept test exists.
- N-02: exact-count without uniqueness (`:640-641`) — `[a:1, a:1]` would last-wins; unreachable without a hostile host (authorship rides `isHostAuthorityMessage` + `by === hostId`). Optional fix: one-line `new Set(panels.map(s => s.panelId)).size` check.
- Neither blocks this SHIP; both are one-liners for a later lane.
