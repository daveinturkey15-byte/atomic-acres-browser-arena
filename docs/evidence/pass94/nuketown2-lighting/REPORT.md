# PASS 94 - Lane LIGHTING: the Nuke Town Rebuild's sun, sky and exposure

Worktree `C:/Users/david/projects/aa-claude-light`, branch
`contrib/dave-gaming-pc/claude/nuketown2-lighting`.

**Base deviation, stated first.** The brief named
`contrib/dave-gaming-pc/claude/pass93-candidate` as the PASS 94 candidate head.
That ref does not exist on origin (fetched and pruned 2026-09-04; the nearest
names are `pass93-chrome153-hotfix` and `nuketown2-tiptop`). Every other PASS 94
nuketown2 lane open today - `nuketown2-ballistics`, `nuketown2-handedness` - has
`5da84097` as its merge base, so this lane branched from
`origin/contrib/dave-gaming-pc/claude/nuketown2-owner-round2` @ `5da84097`
("fix(nuketown2): owner round 2 - record street grazing evidence"), which is that
same head. **This is an assumption about which head the integrator will merge
onto, not a verified instruction - reconcile it before merge.**

## What changed

`src/nuketown2-lighting/` - a pure, THREE-free module owning this arena's look.

| | LATE MORNING | GOLDEN HOUR (anchor) | OVERCAST |
|---|---|---|---|
| capture hour (`?todhour=`) | 10.5 | 17.6 | 14.0 |
| sun elevation | 52 deg | 11 deg | 26 deg, beam extinguished 0.62 |
| horizontal illuminance | 101 000 lx | 20 100 lx | 13 000 lx (all diffuse) |
| EV100 = log2(E/2.5) | 15.302 | 12.973 | 12.344 |
| physical re-meter ratio | 0.199 | 1.000 | 1.546 |
| applied `sunIntensityScale` | 1.1500 | 1.0000 | 0.8730 |
| applied `shadowFloorScale` | 1.3781 | 1.0000 | 1.2067 |
| applied `exposureScale` | 1.0000 | 1.0000 | 1.0305 |
| sun elevation delta | +41.0 deg | 0.0 deg | +15.0 deg |
| sun azimuth delta | -34 deg | 0 deg | -8 deg |
| fog near/far, haze at 91.4 m | 72/190, 0.164 | 58/148, **0.371** | 50/145, 0.436 |
| **composed shade response** | 0.6221 | **0.4536** | 0.6196 |
| practical emissive floor | 1.75 | 1.40 | 1.61 |
| baked-indirect default | high @ 0.50 | low @ 0.38 | high @ 0.50 |

- **The anchor is the shipped frame.** GOLDEN HOUR is `src/rendering/arenas/nuketown2.ts`
  verbatim - sun `0xfff1ce` @ 3.2, ambient `0x8fb0bf` @ 0.42, fog `0xb1c0be`
  58..148, exposure 1.08, `estate-golden-hour` - mirrored into `NUKETOWN2_AUTHORED`
  and pinned field-by-field against that definition. Its resolved writes pass
  `lightingConditionsAreIdentity()`, so selecting it renders the PASS 93 arena to
  the bit and every existing capture baseline is untouched. Its haze at the map's
  longest run is 0.371, which is the number the definition header itself claims.
- **Exposure is derived.** EV100 by incident metering (C = 250, ISO 100). The
  physical re-meter ratio bounds the applied scale from above; the competitive
  clamp bounds it from below. LATE MORNING physically wants 0.199 - a real camera
  stopping down 2.3 stops at noon - and is given exactly 1.0, because stopping
  down is precisely the move that hides a defender. The extra light goes into the
  key and the dome instead.
- **The clamp is a number, not an adjective.** `NUKETOWN2_SHADE_READABILITY_FLOOR`
  = authored ambient x authored exposure = 0.42 x 1.08 = **0.4536**. The composed
  shade response - authored ambient x resolved ambient scale x Rec.709 luma of the
  resolved ambient tint x authored exposure x resolved exposure scale - is asserted
  at or above it for every sky, at every shipped weather rung, and across a
  128-step sweep of the blend. It is touched *exactly* at the anchor, so the floor
  **is** the shipped arena. Both excursion skies sit 37 % above it.
- **Two independent reasons the shade rises, and the larger wins.** The shipped
  model lifts ambient by the key's drop; that term is exactly zero under LATE
  MORNING, whose key *rose*. The second term is this arena's own physics: a 52 deg
  sun's dome delivers 2.5x the anchor's diffuse illuminance, dampened ^0.35 to land
  inside `shadowFloorScale`'s envelope. `late-morning` is the case a key-drop-only
  model cannot see at all.
- **Weather blends toward the authored cloud deck** rather than neutralising toward
  identity, because this arena *has* an authored storm sky. At the top shipped rung
  (`skyDarkenAmount` 0.58) every sky lands on OVERCAST's writes exactly. The
  readability claim is checked over the whole blend, not at the ends.
- **Frozen light set, uniform writes only.** Nothing in the directory imports
  `three`, constructs a light, a `NodeMaterial`, a `ShaderMaterial` or a TSL node -
  pinned as a property of the source in `writes.test.ts`. The module returns the
  shipped `LightingConditionWrites` and nothing else, so
  `applyLightingConditionUniforms()` consumes it with no change to its per-frame
  gate, its `lightingConditionWritesEqual` suppression, or its telemetry.
- **Cold-compile fence: no entry owed.** No new pipeline exists to precompile. The
  prewarm list (`src/presentation-prewarm-contract.test.ts`, and
  `src/rendering/cold-session-precompile-reach.ts` for the arena-scoped relief) is
  unchanged, and the no-new-pipeline test is what makes that checkable rather than
  asserted.
- Fog falloff, baked-indirect tier defaults, interior practical value composition
  and the filmic scales are authored per sky and gated against the shipped
  ceilings: `BAKED_INDIRECT_MAXIMUM_GAIN` (0.55),
  `MINIMUM_COMPOSED_BLOOM_THRESHOLD` (1.02), `GODRAY_MAXIMUM_ADDITIVE_GAIN` (0.22),
  `DISPLAY_VIGNETTE_MAXIMUM` (0.5), `MAXIMUM_COMPOSED_MIDTONE_CONTRAST` (0.3), and
  the full `LIGHTING_CONDITION_BOUNDS` envelope.

## Shared lines touched

`src/legacy-main.ts` **only**, and it is line-neutral:

- one import line, `NUKETOWN2_ARENA_ID` + `resolveNuketown2LightingConditions`;
- `resolveActiveLightingConditions()` (line ~4201) rewritten from 13 lines to 12 so
  the import costs nothing - it now asks this arena's resolver first and hands
  every other arena to `resolveLightingConditions()` unchanged. The `?todhour=`
  hosted-lobby rule is preserved verbatim in behaviour.

`legacy-main.ts` is still **exactly 37,100 lines**, so `LINE_CEILING` needs no
`CEILING_HISTORY` entry. **`src/nuketown2-arena.ts` is not touched at all** - the
practicals it already builds are the fixtures this rig composes against.
`src/rendering/lighting-conditions.ts` is not touched either: this arena stays
`pinned: true` in `ARENA_DAYLIGHT_PROFILES`, so the generic band and the
`scan-lane-ab-band-readability` evidence behind it are untouched.

## Gates

```
tsc --noEmit -p tsconfig.json          TSC_EXIT=0

npm run qa:text-integrity
{ "ok": true, "checked": 2843, "selfTest": true }

vitest run src/nuketown2-lighting/ src/graphics-profile-contract.test.ts \
  src/nuketown2-fidelity.test.ts src/rendering/lighting-conditions.test.ts \
  src/rendering/lighting-conditions-light-set.test.ts \
  src/rendering/lighting-conditions-replication.test.ts \
  src/legacy-main-size-ratchet.test.ts
 Test Files  8 passed (8)
      Tests  158 passed (158)

vitest run src/presentation-prewarm-contract.test.ts \
  src/rendering/arena-visual-definition.test.ts src/rendering/art-direction.test.ts \
  src/rendering/screen-space-post.test.ts src/rendering/screen-space-post-profile.test.ts \
  src/rendering/lighting/baked-indirect-profile.test.ts src/nuketown-fidelity.test.ts \
  src/rendering/cold-session-precompile-reach.test.ts
 Test Files  8 passed (8)
      Tests  117 passed (117)
```

New tests: `src/nuketown2-lighting/presets.test.ts` and
`src/nuketown2-lighting/writes.test.ts`, 40 cases - the exposure floor, the
physical derivation, the uniform-only/no-new-pipeline source property, the anchor
identity, the weather blend, and the fail-closed import-time sweeps.

## OPEN

1. **Browser gates OPEN.** `qa:pass74:arena-boot-smoke`, `qa:stock-boot` and the
   three review captures at `?todhour=10.5|14|17.6` were **not run**. Another
   lane's headless Playwright Chrome held the GPU for the whole window (two trees
   at 13:47, one still alive after). Per the one-headless-at-a-time rule these are
   OPEN rather than claimed. Nothing here has been visually inspected - no LOOK was
   performed, so no claim is made about how the three skies read on screen.
2. **`practicalEmissiveGain` is authored and gated but not yet wired.** Making it
   reach a fixture means turning `emissiveNode = vec3(2.6, 2.1, 1.4)` in
   `src/nuketown2-interior-materials.ts` into a `uniform()`, which changes the node
   graph and therefore *does* owe a menu-time precompile entry. This lane
   deliberately did not spend that; the values, their bloom-threshold floor and
   their ordering are tested, so the wiring is a mechanical follow-up.
3. **Per-sky fog near/far are authored, not written at runtime.** The shipped write
   record carries `fogTint` only - fog span belongs to weather - so the three spans
   are gated authoring data judged at the map's 91.4 m longest run. Applying them
   needs a decision about who owns `scene.fog.near/far` when weather and time of
   day disagree; that is a contract question, not a patch.
4. **Base head assumption** - see the deviation note at the top.
