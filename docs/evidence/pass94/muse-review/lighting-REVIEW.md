# Muse review — PASS 94 LIGHTING lane (nuketown2-lighting)

Scope: `C:/Users/david/projects/aa-claude-light`, branch
`contrib/dave-gaming-pc/claude/nuketown2-lighting` @ `974c56fa`.
Base: `origin/contrib/dave-gaming-pc/claude/nuketown2-owner-round2` @ `5da84097`
(`pass93-candidate` does not exist on origin; REPORT.md states this first — agreed).
Diff: 7 files, +1562/−4. Shared-line touch: `src/legacy-main.ts` only (8 lines).
Read: full diff over `src` + `scripts`, `docs/evidence/pass94/nuketown2-lighting/REPORT.md`,
`src/nuketown2-lighting/{presets,writes,index}.ts`, both test files,
`src/rendering/lighting-conditions.ts`, `src/rendering/screen-space-post.ts` (contract surface),
`src/graphics-settings-registry.ts` (ladder), prewarm contracts.
No builds, no browsers, no npm install, no suite runs. `src/` untouched by this review.

## Claim-state verdicts

### (1) Combat-readability floor — VERIFIED
- Constant: `src/nuketown2-lighting/presets.ts:121-122`
  `NUKETOWN2_SHADE_READABILITY_FLOOR = NUKETOWN2_AUTHORED.ambientIntensity * NUKETOWN2_AUTHORED.exposure`
  = `0.42 * 1.08` = **0.4536**.
- Metric: `src/nuketown2-lighting/writes.ts:354-360` `nuketown2ComposedShadeResponse()` —
  authored ambient × resolved ambient scale × Rec.709 luma of resolved ambient tint ×
  authored exposure × resolved exposure scale. Correct definition of "the shade".
- Tests: `src/nuketown2-lighting/writes.test.ts:149-206` — floor in every sky, 128-step
  weather sweep, every shipped `SWEPT_SKY_DARKEN` rung, anchor touches floor exactly
  (`toBeCloseTo(...,12)`), late-morning refuses stop-down (`exposureScale === 1` vs
  physical 0.199), overcast bounded by re-meter ratio (< 1.547), skylight-lift case proven.
- Numbers check: anchor 0.4536, late-morning 0.6221, overcast 0.6196 per REPORT table;
  both excursions ~37% above floor. The two-term lift (`writes.ts:252-269`, `SHADOW_LIFT_GAIN = 1.15`,
  `SKYLIGHT_LIFT_EXPONENT = 0.35`) is the right call — term 1 is exactly zero for late-morning
  (key rose to ceiling) and term 2 carries it. No weakness here.

### (2) Frozen light set — VERIFIED
- `src/nuketown2-lighting/writes.test.ts:117-127` pins as source property: no `from 'three'`,
  no `new THREE.`, no `new (Directional|Ambient|Hemisphere|Point|Spot|Rect)Light`, no
  `NodeMaterial`/`ShaderMaterial`, no `three/tsl` in `presets.ts`/`writes.ts`/`index.ts`.
- Grep confirms: only matches are the test's own patterns. Module returns shipped
  `LightingConditionWrites` only (`writes.test.ts:129-138` key-list + `Object.isFrozen`).
- `src/legacy-main.ts:4201-4212` dispatch preserves gate/telemetry/equality path;
  `?todhour=` hosted-lobby rule behaviour-identical (comment shortened, code same).
  Uniform writes only. Holds.

### (3) Cold-compile fence — VERIFIED (vacuous, correctly tested)
- No `NodeMaterial`/TSL/pipeline construction exists, so no menu-time precompile entry is owed.
  Prewarm list (`src/presentation-prewarm-contract.test.ts`,
  `src/rendering/cold-session-precompile-reach.ts`) correctly unchanged; grep for
  `nuketown2-lighting|Nuketown2` in both returns nothing, which is the expected state, and the
  no-new-pipeline source test is what makes the absence checkable. The follow-up that WOULD owe
  an entry (practical `uniform()` wiring, REPORT OPEN 2) was deliberately not spent. Correct fence.

### (4) Graphics-profile contract — VERIFIED (advisory-tier caveat, see F2)
- Lane does not touch `src/graphics-settings-registry.ts`. Ladder
  Performance / Balanced (HF-418) / Quality / Max + folded RAY TRACED tiers untouched.
- Per-sky `bakedIndirect` tiers (`presets.ts:229,249,276`: high/low/high) and filmic scales are
  gated in `presets.ts:353-451` against `BAKED_INDIRECT_MAXIMUM_GAIN` (0.55),
  `MINIMUM_COMPOSED_BLOOM_THRESHOLD` (1.02), `GODRAY_MAXIMUM_ADDITIVE_GAIN` (0.22),
  `DISPLAY_VIGNETTE_MAXIMUM` (0.5), `MAXIMUM_COMPOSED_MIDTONE_CONTRAST` (0.3), full
  `LIGHTING_CONDITION_BOUNDS`. Profile/definition/post/baked-indirect suites cited green in REPORT
  (8+8 files, 158+117 tests). No profile-only collision/render fork. Holds.

### (5) Look / materials conflicts — NO TEXTUAL CONFLICT; SEMANTIC OVERLAP NOTED
- This lane touches only `legacy-main.ts` + new `src/nuketown2-lighting/`; `src/nuketown2-arena.ts`
  and `src/rendering/lighting-conditions.ts` untouched (arena stays `pinned: true`).
- Look lane: local branch `nuketown2-look` exists; **not on origin** — nothing to diff.
  Ownership overlap is real when it lands: sun/sky/fog tint, exposure, filmic
  (bloom/vignette/godray/contrast) are exactly what a sky/atmosphere/grade lane owns.
  Integrator must decide who wins per field; this lane's anchor-identity proof
  (`lightingConditionsAreIdentity`, `writes.test.ts:36-61`) makes it the safe default.
- Materials lane (`origin/.../nuketown2-materials` exists): REPORT OPEN 2 names the seam —
  `practicalEmissiveGain` (1.25/1.0/1.15, `presets.ts:228,248,274`) is authored/gated but not wired;
  wiring = `emissiveNode = vec3(2.6,2.1,1.4)` → `uniform()` in
  `src/nuketown2-interior-materials.ts` + a precompile entry. No conflict today, clean handoff documented.

### (6) Per-frame allocation — MINOR, see F1

## Findings

**F1 (minor) — `src/nuketown2-lighting/writes.ts:322-344`: resolve allocates per call, caller resolves per frame.**
`resolveNuketown2LightingConditions` builds one frozen record + six frozen `Rgb3` arrays per call.
Caller `src/legacy-main.ts:4280-4290` resolves every frame, then suppresses no-ops via
`lightingConditionWritesEqual`. Bounded (~7 small objects, no arrays-of-arrays, no strings), same
shape as the generic path it replaces for this arena — so no regression — but strictly nonzero
per-frame garbage. Smallest fix: memoize on the resolve inputs (arena/choice/seed/elapsed/skyDarken/fixedHour)
or hoist an input-equality check before resolving; keep the existing writes-equality gate as the second stage.
Not a ship-blocker.

**F2 (minor) — `src/nuketown2-lighting/presets.ts:229,249,276` + fog/practicals: tier/fog/practical data authored and gated but not written at runtime.**
`LightingConditionWrites` carries no `bakedIndirect`, no fog near/far, no `practicalEmissiveGain`
(keys pinned `writes.test.ts:131-136`). `nuketown2BakedIndirectComposite` is test-only; fog spans
(72/190, 58/148, 50/145) judged at the 91.4 m longest run; practicals unwired (REPORT OPEN 2, 3 —
  openly stated, credit). Smallest fix: keep as-is for merge (authoring data with gates is fine),
  file the wiring follow-up (practical `uniform()` + precompile; fog near/far ownership decision).
Do not wire inside this review.

**F3 (nit) — `src/legacy-main.ts:4201-4212`: hosted-lobby rationale comment shortened.**
Old comment explained WHY `?todhour=` is ignored in a hosted lobby (guest desync class, same as `?tod=`);
new one-line version preserves behaviour exactly but drops the reason a future editor needs.
Smallest fix (integrator, one line): restore the desync clause in the comment. No code change.

**Non-findings (checked, clean):** exposure clamp direction (never below 1, never above physical ratio,
`writes.ts:271-287`); weather blend saturates exactly at 0.58 onto overcast writes
(`writes.test.ts:209-233`); fog haze 0.164/0.371/0.436 inside 0.12–0.48 (`presets.ts:114`);
`LINE_CEILING` neutral (37,100 lines); `NUKETOWN2_LONGEST_SIGHTLINE_M = 91.4` sourced from definition header.

## Verdict: SHIP-WITH-FIXES

1. The combat floor is a number with teeth — 0.4536, touched exactly at the shipped anchor and proven
   across skies, weather rungs, and a 128-step blend — so the two new skies cannot hide a defender.
2. The frozen-set / cold-compile posture is proven as source property, not assertion: uniform writes only,
   anchor resolves to identity, no pipeline owed, shared touch is one import + a 13→12-line dispatch.
3. What remains is integrator-side, not lane-side: browser/review captures were never run (REPORT OPEN 1,
   GPU contention — honest OPEN), practical/fog values await their wiring/ownership decision (OPEN 2, 3),
   plus two nits (per-frame resolve allocation, one shortened comment). None invalidates the data; all are
   bounded follow-ups. Require the three `?todhour=10.5|14|17.6` captures + boot smokes before the arena rides
   a candidate, and take F1/F3 as fast follows.
