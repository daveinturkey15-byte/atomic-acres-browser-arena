# Muse Spark skeptic review — LOOK lane (HF-481)

Branch `contrib/dave-gaming-pc/claude/nuketown2-look`, reviewed at `3f316734`.
Scope: lane commits `648c78c0` (aerial-perspective cut 1), `9ab96d5b`
(particles), `76d7212e` (cut 2: duel gate), `3f316734` (ANALYSIS/REPORT/captures).
`1db7e288` (whole-branch review) and `e16c8d5c` (pass93 merge) are context, not
lane code. Method: read-only source review against
`docs/evidence/pass94/quality-gap/ANALYSIS.md` + `REPORT.md`. No builds, no
browser, no installs (lane rule). Claim-states: `[VERIFIED]` = traced in source,
`[REPORT]` = lane's measured claim I could not re-run, `[INFERENCE]` = my read.

## 1. Additive-only, no new pipeline/target/precompile — [VERIFIED]

Traced end to end:

- `src/rendering/atmosphere/aerial-perspective.ts` builds one TSL expression
  (`buildAerialPerspectiveNode`) over the scene pass's existing view-Z. It never
  constructs a render target, MRT attachment, material, or light.
- Composition is a pure add in `src/rendering/pass64-tsl-scene.ts:1069-1077`:
  `withAtmosphere = withReflections.add(atmosphereLight)`, placed after the
  contact-occlusion multiply and before the bloom add. There is no `mix`, no
  transmittance multiply anywhere in the module — `T(d)` is never built, only
  `L_in(d)`.
- `screenSpaceMrtRequirement` (`src/rendering/screen-space-post.ts:145-160`) is
  untouched by the lane: `{normal, material, velocity}` only. No new attachment,
  no new bandwidth.
- Stage registration is names only: `grade-profile.ts:99`
  (`LINEAR_SOURCE_STAGE_ORDER`), `grade-profile.ts:114`
  (`OPTIONAL_LINEAR_SOURCE_STAGES`), `pass64-tsl-scene.ts:152`
  (`pass64LinearSourceStages`), `screen-space-post.ts:170` + `:470`
  (`screenSpacePostStages` + built graph). No new pipeline object, no new
  precompile entry — the precompile (`pass64-tsl-scene.ts:1404-1427`) compiles
  the scene-pass root and the composite expression rides inside it. First-frame
  compile of a larger composite shader is the only cost, and it is not a new
  entry.
- Kill path is real zero-cost: `screen-space-post.ts:464` builds the node only
  `if (runtime.aerialPerspective.gain > 0)`; the WebGL2 route takes
  `AERIAL_PERSPECTIVE_OFF` (`aerial-perspective.ts:222`, all weights 0), and
  pre-first-`setAtmosphere` frames get exactly zero (uniforms built black,
  `atmosphereReady=false`, `screen-space-post.ts:461-463,705`).

The "no new pipeline" claim holds. This is arithmetic in the existing composite.

## 2. Combat readability: the haze cannot hide a far silhouette — [VERIFIED]

Quoted bound (`aerial-perspective.ts:78-107`, asserted in test at
`aerial-perspective.test.ts:36-38`):

> Reference pair: operator in open shade at 0.12 linear against background at
> 0.16 linear. Weber contrast today is |0.16−0.12|/0.16 = 0.250. Adding L to
> BOTH preserves the 0.04 difference: 0.04/(0.16+L) ≥ 0.14 ⟹ L ≤ 0.1257,
> rounded down to `AERIAL_PERSPECTIVE_MAXIMUM_INSCATTER = 0.12`.

Why "adds to both" is true: the term is composited with `.add()`, never mixed,
so the 0.04 difference is preserved pointwise and only the ratio shrinks, with
a floor of 0.14 — 7× the ~0.02 detection threshold and above the lane's own
0.10 floor. The shipped fog it sits beside is strictly harsher: `THREE.Fog`
58..148 mixes 35.6% at 90 m (`test.ts:45`), destroying difference as well as
ratio.

The duel envelope is structural, not tuned
(`aerial-perspective.ts:178-209,279`): smoothstep gate 18→45 m, exactly zero
inside 18 m. Delivered worst case at 25 m is 0.009/0.015/0.018 linear
(Low/High/Ultra, `[REPORT]`) against the 0.036 engagement allowance — 2–4×
inside, proved against the UNCLAMPED curve so it does not lean on the clamp
(`test.ts:120-127`: same tuning ungated breaks the bound). Past the ~89 m
sightline into the sun the curve genuinely wants more than 0.12 and the
per-channel `min` in the shipped expression is what stops it — stated openly in
the header and tested (`test.ts:100-113`). A clamp that binds monotonically
preserves order; it cannot invert a silhouette.

One honest ceiling, shared with the lane: at street-level combat framings
(15–35 m, inside the gate) the measured delta is ~1.1 mean sRGB codes
(`[REPORT]` §6). Correct behaviour, and the limit of what far-field wash can do
on a 50 m map.

## 3. "9 of 11 techniques" — three claims checked — [VERIFIED]

Against `graphics-settings-registry.ts` presets + the post chain:

1. **SSR throttled, SSGI off at Quality.** Registry `high` (Quality):
   `screenSpaceReflections: 'low', screenSpaceGi: 'off'` (`:890-891`).
   Post chain gates both behind `runtime.*.enabled && sources.sceneNormal`
   (`screen-space-post.ts:375,414`). Confirmed.
2. **DOF off, motion blur 0 at Quality.** Registry Quality:
   `depthOfField: false, motionBlur: 0` (`:894`); motion blur also 0 on every
   rung except Max (`:745,855,894,947`). Post chain: `depthOfFieldEnabled` false
   returns the input untouched; motion-blur block skipped when disabled
   (`:336, ~640`). Confirmed.
3. **Shafts low at Quality, off below; bloom present and disciplined.**
   Registry: `volumetricLightShafts: 'low'` at Quality (`:891`), `'off'` at
   Performance (`:742`) and Balanced (`:852`); `bloomQuality: 'cinematic'` at
   Quality (`:892`). Shaft block requires `active.godrays.enabled && usable`
   shadow-casting sun or builds nothing (`screen-space-post.ts:556-575`).
   Confirmed.

Also confirmed in passing: fog-missing claim (stock linear fog 58..148, pinned
by the lighting lane's own anchor — `presets.ts` on
`origin/.../nuketown2-lighting`: "fog 0xb1c0be 58..148"); particle-invisible
claim (old 0.014 m / 0.09–0.10 alpha in the pre-image of the `9ab96d5b` diff).

## 4. Per-frame allocation / uniform churn — [VERIFIED] clean

- `buildAerialPerspectiveNode` allocates all uniforms once at graph build;
  `beforeRender` (`screen-space-post.ts:700-705`) writes `.value` into the
  preallocated `Vector3/Color/Matrix4` uniforms — no `new` on the hot path.
  Scratch vectors (`scratchDirection/scratchTarget/scratchCamera`) are
  module-closure reused. Per frame: one `getWorldPosition`, one matrix copy,
  two color copies, a few scalar writes.
- `setAtmosphere` (`:595-598`) runs only on arena-definition apply
  (`pass64-tsl-scene.ts:1134-1135`): two copies into a closure-owned `Color`
  and a float. No per-frame allocation anywhere in this stage.
- Observation (not a defect): `sunWhite` is fed `next.lighting.sunIntensity`
  while `update()` divides live `sun.intensity` by it, so at steady state the
  scale is ~1 and the Mie term carries sun *chroma* only. That is consistent
  with the stated design (ceiling in 0..1 normalised radiance), just worth
  knowing: noon-vs-dusk haze variation comes from colour, not intensity.

## 5. Lighting-lane conflict — [VERIFIED] none, one follow-up

- No collision: the lighting lane (`origin/.../nuketown2-lighting`,
  `writes.ts`) emits uniform-only `LightingConditionWrites` (sun/ambient/fog
  *colour*, exposure) and explicitly does not own fog near/far, sky geometry,
  or any post stage. The look lane never touches `scene.fog`. Both can land.
- Composition is deliberate: `pass64-tsl-scene.ts:1134-1135` takes the arena's
  authored `next.fog.color` as the haze colour and `next.lighting.sunIntensity`
  as the Mie normaliser, so lighting's colour writes flow into the haze for
  free. The two can never disagree about what the air looks like — at commit
  time.

**F1 (follow-up, minor) — haze inputs go stale under dynamic time/weather.**
`setAtmosphere` is called only on definition apply; the lighting applier
(`applyLightingConditionUniforms`) retints `scene.fog.color` per lighting
change independently. In fixed-sky matches this never matters. In
`random`/`cycle` (seed + `elapsedSeconds`-derived) or weather-blend-toward-
overcast modes, fog colour moves mid-match while `atmosphereSkyColor` stays at
the commit value.
`src/rendering/pass64-tsl-scene.ts:1134-1135` + `src/rendering/screen-space-post.ts:595-598,705`.
Smallest fix: re-issue `setAtmosphere(scene.fog.color, sunIntensity)` from
wherever the lighting writes are applied (or sample `scene.fog.color` in
`beforeRender` when the lighting epoch changes). One call site, no new state.

## Further findings

**F2 (open, not this lane's) — ten of eleven arenas still have sub-pixel air.**
`ambient-visibility.test.ts` table: gun-range worst at 1.03 px; only nuketown2
fixed (`particle-catalog.ts:308-311`: motes 0.026 m @ 0.11, drift 0.055 m @
0.15, densities byte-identical so draw/instance/buffer budgets unchanged —
[VERIFIED] in the diff). The game-wide "air exists" claim stays false outside
Nuke Town. Smallest fix: same radius/alpha edit per arena, owned by each
arena's lane.

**F3 (evidence gap, pre-existing on base) — 7 review cameras missing from the
nuketown2 definition** (`front-porch`, `north-balcony`, `coach-elevation`,
`truck-cab-near`, 3× `vehicle-*`); sweep 10/17 with identical base behaviour
(`[REPORT]` §4). The exact owner-checklist framings are absent from every
capture comparison. Not this lane's doing; blocks visual sign-off regardless.
Smallest fix: author the seven cameras in `src/rendering/arenas/nuketown2.ts`,
re-run the sweep.

**F4 (nit, no action) — frame cost "+0.75 ms p50 / +1.3 ms p95" is
noise-order.** Paired deltas (+1.7/+0.8/+0.6/−0.1) vs base spread 11.8–13.2 ms;
the lane's own "about a millisecond, not more" is the defensible reading.
Draw load identical (128 meshes / 11k instances / 0 pipeline creations,
`[REPORT]` §5), as expected for composite arithmetic. No action.

No other defects found. The HG denominator clamp (`1e-3`) + `min(4, …)` white-hole
guard, the height clamp at the camera plane, the fail-closed black-radiance
start, and the import-time two-sided sweep (ceiling + visibility floor,
`aerial-perspective.ts:379-400`) are all as claimed. The cut-1→cut-2 history
(1.0–1.4 sRGB-code invisibility → gate restructure) is arithmetically coherent:
concave `1−exp(−βd)` cannot be both visible at 90 m and quiet at 25 m without
the gate, and the test at `test.ts:115-127` proves the gate is load-bearing.

## Verdict: SHIP-WITH-FIXES

1. **Combat-safe by construction, bounded from both ends.** Derived 0.12
   ceiling + 0.036 engagement allowance + structural 18–45 m gate + per-channel
   clamp backstop, all swept at import time. The haze can wash contrast, never
   delete a silhouette.
2. **No structural cost.** No pipeline, target, MRT attachment, setting, or
   precompile entry; per-frame zero-alloc; particle densities byte-identical.
3. **Remaining work is follow-ups, not rework.** F1 is a one-call-site re-sync
   for dynamic TOD/weather; F2 belongs to the arena lanes; F3 pre-exists on
   base. None invalidate this lane's code. Ship the stage; file F1–F3 as tracked
   opens.
