# Consumer patch notes for root — lighting mount correction

For the integrator taking `contrib/dave-gaming-pc/claude/night-integration-20260912` into
`aa-world-studio`. Reviewed 2026-09-13 against root `8fbbbbdbf2305d776230ceb3765f7c695e2e3a1c`.
Companion: `INTEGRATION-ACCEPTANCE-REVIEW.md` in this directory.

## What lands

One commit's worth of change, two files, `+174 / −9`:

* `src/world-studio/lighting/index.ts` — practicals mount on the authored ceiling plane
  (`CLEAR_STOREY_HEIGHT = 3.00`, `GARAGE_CLEAR_HEIGHT = 3.24`) instead of pass 1's standard
  residential 2.55 / 2.1 / 2.4; candela re-derived as `I' = I·(d'/d)²` so the illuminance delivered
  at every focal plane is exactly what pass 1 authored; the duplicated mount expression collapses
  into `lampY()` / `mountHeight()` / `fixtureKind()`.
* `src/world-studio/lighting/lighting.test.ts` — `+99 / −0`, four new tests under
  `practical mount plane`. No existing assertion relaxed.

## Cherry-pick safety

Clean. `src/world-studio/lighting/**`, `src/world-studio/pbr-library.ts`,
`src/world-studio/architecture/**`, `src/world-studio/interiors/**` and `src/rendering/**` are
byte-identical between the lane base and root `8fbbbbdb`, so this applies without conflict and was
tuned against current root source.

## What does *not* change

No renderer state, no clock, no global light, no gameplay, no loader lifecycle, no
staging/retirement path, no ownership boundary, no new three API. `distance` and `decay: 2` are
untouched. Shadow, draw-call, occlusion-policy and fixture-count budgets are untouched.
Peak intensity 29.02 × 1.45 = **42.1**, under the suite's 69.6 ceiling.

## Verify after applying

```
node node_modules/vitest/vitest.mjs run src/world-studio/lighting/lighting.test.ts
```

Expect **36 passed (36)**. Keep the run narrow — a wide run OOMs the fork pool on this machine and
a partial "N passed" line with pool errors is not green. `tsc -p tsconfig.json --noEmit` is clean.

## Visual falsifier — run this before calling it accepted

Nothing in this change has been seen. Capture the `world-studio-west-living` and
`world-studio-west-bedroom` review cameras (`rendering/arenas/world-studio.ts:24-26`).

> If the fixtures intersect or clip through the ceiling slab, or the pools read **dimmer** than the
> pass-1 capture, then the mount plane or the compensation is wrong. **Revert the change as a unit
> — do not tune it further.** The two halves (mount plane, candela compensation) are only correct
> together.

## Known residual you are accepting

The compensation covers `1/d²` but not three's finite-`distance` window
(`getDistanceAttenuation`). Measured shortfall at the focal plane: living ×0.971, bedroom ×0.933,
dining ×0.916, kitchen ×0.874, study/bedroom2 ×0.811, garage ×0.842. Cancelling it means raising
`baseDistance` in step with the throw, which widens the leak radius — deliberately left for a frame
to settle, not guessed.

## Root-side follow-ups this lane could not make

Documented only; **none implemented here**, all outside the lane's write scope.

1. **Export `SLAB` from `architecture/house.ts`** (one line). `SLAB` (0.22) and the garage roof
   thickness (0.2) are module-private, so the lighting rig and its test restate them. If `SLAB`
   changes alone, the rig drifts silently and the test drifts with it. This is the one change that
   would make the new mount plane fail closed for the right reason.
2. **Reconcile the arena lighting definition.** `rendering/arenas/world-studio.ts:12` declares
   world-studio practicals `policy: 'emissive-only', maximumDistance: 0, castsShadow: false`, while
   the shipped rig runs 4 shadowed-local + 10 clustered active local lights. Nothing enforces the
   definition today — `arena-contrast-lighting.ts:123-160` returns early unless
   `profile === 'blender'` and never walks the arena root — so this is latent, not live. Removing
   that early return without reconciling first would contradict the rig.
3. **Shadow budget.** `STUDIO_LIGHTING_PRESET.maximumShadowLights = 4` vs the arena default 3
   (`rendering/arenas/shared.ts:31`). Either override `maximumShadowLights` for this arena or drop
   a key *pair*. Cutting 4 → 3 in the preset would light one house's living room with a shadowed
   key and the other's without; the two sides of the map are meant to be identical.
4. **Ambient floor.** `ambientIntensity 0.6` / `sunIntensity 2.62`
   (`rendering/arenas/world-studio.ts:10-11`) may be what makes interiors read pale. Raising fills
   to fight it is a frame judgement and was deliberately not guessed here.

## Weather behaviour, so nobody misreads it

The rig's `update()` gates on frozen-object identity, and that gate is **correct**: the router
memoises on `(preset, presentation)` and `legacy-main.ts:5104` publishes the memoised
`route.environment` itself, so identity changes exactly when weather or presentation changes.

But `derivePracticalTuning` reads `environment.hour`, a **per-preset constant**. There is no
continuous clock, so the practicals do not ramp as in-world time passes — they re-apply only on a
preset or presentation change, one frame after it (`arena.ts:203` updates lighting before reading
the environment at `:204`). That is root's existing design, not a regression from this change.
Do not file "practicals don't respond to time of day" against this lane.

## Unrelated, but noticed while reviewing — houses prose fix

`docs/technique-lab/houses/HANDOFF.md:485-486` records stale export hashes (teal `5,545,104 B /
5f987101ab0f…`, yellow `5,519,604 B / eb7afd7299ca…`). The bytes on disk are teal **5,670,156 B /
`38cc4c2d941524434bad5a51772e07fe3a35a7775c0ccca9a239fbb9731a5c27`** and yellow **5,644,860 B /
`c7d7c219978a6e0738faa338e40f96e861e6a316a2560576c9bd55d90540b08f`**, which is exactly what
`catalog.json` revision 3 records. **The export is correct — fix the prose, do not re-export.**
