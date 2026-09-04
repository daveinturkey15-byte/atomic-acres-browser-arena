# PASS 96 - SH-L2 irradiance volume (HF-486 / HF-503)

Lane: `contrib/dave-gaming-pc/claude/sh-l2-irradiance-volume`, based on
`origin/contrib/dave-gaming-pc/claude/nuketown2-lighting` at `7f9b14b6`.
Provenance: the staged SH-L2 implementation was authored by Claude Code (Opus);
the wiring pass is Codex (Luna 5.6), machine `dave-gaming-pc`, 2026-09-04.
Impact class: **runtime, wired in this branch** - see section 6.

---

## 1. The premise was stale, and that is the first finding

The lane brief said `"light probe" matches nothing in src/` and that we have **no
coverage** of an SH irradiance volume. **That is not true of this branch.**

`src/rendering/lighting/baked-indirect.ts` (HF-418 / Lane AL) is a complete,
shipping, baked irradiance probe volume: a CPU path trace against the analytic
proxy scene, SH-**L1**, packed into three RGBA float `Data3DTexture`s, sampled
through TSL `texture3D`, with a runtime, a digest cache, a chunked bake under a
3 ms per-frame budget, a settings-registry control, and 2,921 lines of tests.
It does not use the words "light probe", which is why the grep missed it.

Everything below is written as an **extension of that lane**, not a rival to it.
Per the AKP reconciliation rule, the existing record was not blind-overwritten.

### What is genuinely missing, and is what this lane adds

| Gap | Status before | This lane |
|---|---|---|
| Band 2 (9 coefficients) | L1 only, **explicitly declined in writing** | added, with the declined reasons answered - section 2 |
| Sampling in the **material graphs** | screen-space composite off an albedo *proxy* | node samples `positionWorld` / `normalWorld` - section 3 |
| Normal-offset sampling | absent | half a probe spacing along the shading normal |
| Occlusion from arena colliders | analytic proxy massing, capped at 24 shapes | bake takes any `ProxyScene`; bounces the occluders' own albedos |
| Off switch without a pipeline rebuild | `applyMode: 'pipeline-rebuild'` | uniform-only, `applyMode: 'live'` - section 3 |

---

## 2. Answering the recorded decision against L2, rather than overwriting it

`baked-indirect.ts` chose L1 and gave two reasons. Both are addressed
mechanically, not by argument.

**Reason 1 - "L2 buys angular sharpness that trilinear interpolation between
probes three metres apart immediately destroys."** Correct, and it stays
correct. `resolveShL2Band()` makes the band a function of the **realised grid
spacing**, not of taste: above `SH_L2_MAXIMUM_USEFUL_SPACING_M` (2.5 m) the grid
reports `band: 'l1'`. An arena that cannot afford a fine grid does not get a
second band and does not pay for one. Pinned by
*"drops to band L1 when the realised spacing is too coarse to carry L2"*.

**Reason 2 - "it cannot ring into negative irradiance the way an unclamped L2
reconstruction routinely does."** This is the real objection, and the mechanism
it says is missing is **windowed SH** (Sloan, *Stupid Spherical Harmonics
Tricks*, GDC 2008). `deringShL2InPlace()` does not trust a window constant: it
searches a ladder of Hanning windows, widest (least destructive) first, and
takes the first that passes. If none passes it **zeroes band 2**, degrading the
probe to exactly the L1 reconstruction the recorded decision would have shipped.

### The criterion is relative, and that is deliberate

The first implementation asserted *absolute* non-negativity. It failed, and the
failure was informative enough to record: **L1 rings too.** A narrow bright
source projected onto four coefficients undershoots hard on the opposite
normal - `evaluateShL1` hides it behind `max(0, ...)`, which is legitimate, but
it means an absolute bar is a standard the *shipping* band does not meet either.
Holding L2 to it is unreachable without windowing the signal into nothing.

So the delivered guarantee is the one the record actually claims: **after
windowing, the L2 reconstruction is never more negative than the unwindowed L1
reconstruction of the same probe, in any direction, on any channel.** Adding the
second band can therefore never make a probe darker anywhere than shipping
without it - which is the property the combat-safety envelope needs.

**Measured on the real arena bake: 0 probes demoted, at both tiers.** 453 of
3,520 probes needed a window at 48 rays; 287 of 3,520 at 128 rays. No probe ever
had to drop the band.

---

## 3. What was built

| File | What |
|---|---|
| `src/rendering/lighting/sh-l2-irradiance.ts` | band-2 basis + convolution, projection, evaluation, dering search, grid derivation, bake, digest, 7-plane packing |
| `src/rendering/lighting/sh-l2-irradiance.test.ts` | 26 tests |
| `src/rendering/lighting/sh-l2-irradiance-node.ts` | 7 x RGBA16F `Data3DTexture`, TSL sampling node, receipt |
| `src/rendering/lighting/sh-l2-irradiance-node.test.ts` | 15 tests |
| `src/rendering/lighting/indirect-term.ts` | shared Nuke Town `MeshStandardNodeMaterial` lighting model and CPU reference term |
| `src/rendering/lighting/indirect-term.test.ts` | 24-factory roster, choke-point math, uniform state and graph-hook tests |
| `src/rendering/lighting/nuketown2-sh-l2-occluders.ts` | bake-only authored shell, door, window and footprint occluder set |
| `src/rendering/lighting/sh-l2-irradiance-runtime.ts` | real-sky-lux bake setup, cache/bind lifecycle and live tier control |
| `src/rendering/lighting/nuketown2-sh-l2-runtime.test.ts` | authored occluder, real-lux and interior/exterior bake-fence tests |
| `src/rendering/lighting/nuketown2-sh-l2-pipeline-budget.test.ts` | zero-pipeline delta budget test |
| `src/rendering/tsl-migration-inventory.ts` + `src/rendering/pass64-tsl-scene.ts` | truthful shared-graph inventory and fail-closed traversal wiring |
| `src/graphics-settings-registry.ts` + `src/pass65-settings.ts` | live `graphics.shL2Irradiance` control and preset contract |
| `src/legacy-main.ts` + `src/rendering/nuketown2-frame-presentation.ts` | runtime installation and legacy-main ratchet hoist |

### The packing is ours (HF-472)

The shared build that prompted this row reads **seven RGBA slices out of one
padded 3D atlas** with hand-tuned slice-padding constants, which costs it
hardware trilinear filtering across the slice axis. Declined explicitly. Ours is
**seven RGBA 3D textures**, each nx*ny*nz, so every fetch is hardware
trilinear on all three axes with no padding constants at all:

```
plane 0..2 : one per COLOUR CHANNEL, (L0, L1y, L1z, L1x)
             <- byte-identical to the three textures baked-indirect-node.ts binds
plane 3..6 : the fifteen L2 floats, channel-major, plus one literal-zero pad
```

Planes 0-2 being identical is the **compatibility property**, checked rather
than asserted in prose: one bake can feed both consumers, and a volume with its
L2 band zeroed reconstructs bit-for-bit what `evaluateShL1` reconstructs.

### The off switch is a uniform, not a topology change

The HF-418 control is `applyMode: 'pipeline-rebuild'` because building its layer
adds a **composite stage**. This node is a uniform multiply and a texture fetch
inside a graph that already exists, so `setEnabled(false)` leaves the graph, the
bindings and the pipeline untouched. Strength remains a separate uniform, and
the default/unconfigured state is disabled. That makes the control `applyMode:
'live'` and safe to move mid-match (tripwire 0). Pinned by *"turns off through a
uniform without touching the bound textures"*.

---

## 4. Measurements (Nuke Town Rebuild, `NUKETOWN2_BOUNDS` 36 x 84 m)

Grid derived from the real arena bounds at 2 m spacing, 0-6 m vertical, 1 m pad:

```
grid 20x4x44  probes=3520  band=l2  bytes=197120 (192.5 KiB)
spacing 2.000, 2.000, 2.000   origin -19.00, 0.00, -43.00
rays=48  bounces=1  elapsed=969ms   deringed=453/3520  demoted=0  digest=a307bb5e
rays=128 bounces=2  elapsed=2452ms  deringed=287/3520  demoted=0  digest=6fe16c98
```

| Budget | Limit | Actual |
|---|---|---|
| Bake, inside the 12 s admission fence | 12,000 ms | **969 ms** (LOW) / **2,452 ms** (HIGH), single-shot, single-threaded |
| Memory, one volume | 4 MiB | **192.5 KiB** |
| Memory, two resident bakes (day + dusk) | 8 MiB | **385 KiB** |
| Per-frame cost | - | 7 texture fetches + ~30 MADs per shaded pixel; **no per-frame allocation** |
| New pipelines | 0, or 1 precompiled | **0 added** (nothing wired yet - section 6) |

Bake time is **provenance, never an assertion**. No wall-clock assertion appears
in any test in this lane: PASS 89 recorded that a bake-time measurement on a
shared workstation measures the machine, and that lesson is honoured here.

### Time of day

The bake takes `conditionId` and the full `BakeLighting` struct, and the digest
includes both, so each of the three authored Nuke Town skies
(`late-morning` / `golden-hour` / `overcast`) is a distinct cache key. At 969 ms
a **rebake between matches** is the shipping route; two resident bakes at
385 KiB make a cross-fade affordable if it is ever wanted. **A rebake never runs
mid-combat** - the cost is stated here precisely so it does not have to be
guessed later.

---

## 5. A real bug found on the way

The colour-bleed test failed with the red-wall and grey-wall volumes coming out
**bit-identical**, which is not a tolerance problem - it means the albedo was
never read. Cause: `analytic-proxy-scene`'s box intersector returns the hit
normal oriented **along** the ray, not against it (a -z ray into a box's +z
face returns `(0,0,-1)`).

For a mirror trace that is harmless, because the reflection formula is
sign-symmetric - which is why the ray-traced lane never noticed. For a **diffuse
bounce** it is fatal and silent: `dot(normal, sun)` comes out negative on every
sun-facing surface, every bounce returns black, and the volume bakes to pure
sky. A plausible-looking result that is entirely wrong.

Fixed in this lane's tracer only (`dot(n, dir) < 0 ? n : -n`). **The shared
intersector was deliberately not changed** - the ray-traced lane depends on the
existing convention and this lane has no business changing it underneath.

> **Gotcha (Symptom -> Cause -> Correction -> Verify).** A baked GI volume looks
> plausible but is pure sky and ignores every albedo -> the shared intersector
> returns normals oriented along the ray, so every diffuse N.L is negative ->
> flip the hit normal against the incident direction in the diffuse consumer ->
> bake the same geometry twice with different albedos; identical output means
> the bounce is dead.

---

## 6. Wired (claim-state)

**[VERIFIED] Choke point.** `src/rendering/lighting/indirect-term.ts` owns one
shared `MeshStandardNodeMaterial` lighting model. It calls the frozen three.js
`PhysicalLightingModel` indirect path first, then adds the SH-L2 term at
`positionWorld` / `normalWorld` behind shared `strength` and `enabled` uniforms.
When disabled or unbound the added term is exactly zero, so the frozen light set
and `scene.environment` path remains the fallback.

**[VERIFIED] Factory coverage.** The structural test derives the roster from the
four material modules and finds 24 unique `create*Material()` factories. Every
factory calls `createNuketown2IndirectMaterial`; no factory constructs a direct
`MeshStandardNodeMaterial`, and the shared graph is recorded in the traversal
inventory with zero pipeline IDs.

**[VERIFIED] Live control.** `graphics.shL2Irradiance` is registered as Off / Low
/ High with `applyMode: 'live'`, a runtime consumer, runtime evidence and
Performance / Balanced / High / Max values of Off / Low / Low / High. Changing
the setting calls `setEnabled` / `setStrength` on uniforms only. The graph node,
textures and pipeline bindings are unchanged by the off-switch test.

**[VERIFIED] Bake occlusion.** The bake-only proxy consumes the exported
`NUKETOWN2_SECTION`, `NUKETOWN2_DOORWAYS`, `NUKETOWN2_WINDOWS` and
`NUKETOWN2_BUILDING_FOOTPRINTS` tables. It does not import or widen
`RAY_TRACED_MAXIMUM_SHAPES`, and it omits the 220 x 220 m ground collider. The
interior probe is required to be darker than the matched exterior probe by a
stated ratio: interior mean `< 0.75 x` exterior mean at 256 rays and one bounce.

**[VERIFIED] Real photometry.** `bakeLightingFromNuketown2Sky()` calls
`resolveNuketown2Sky()` and derives the direct and sky scales from its authored
lux table, elevation, azimuth and tints. It does not use the quantised
reconstruction path.

**[VERIFIED] Ratchet hoist.** The touched Nuke Town setup and presentation branch
were moved into `sh-l2-irradiance-runtime.ts` and
`nuketown2-frame-presentation.ts`. `src/legacy-main.ts` is now exactly 37,100
lines; the ceiling remains 37,100 and no behaviour was deleted.

**[VERIFIED] Pipeline budget.** The existing seven TSL pipeline IDs remain seven,
the SH-L2 shared entry contributes zero IDs, and the Nuke Town feature row also
contributes zero IDs. The pass64 traversal assertion still fails closed if this
shared graph ever acquires an unregistered pipeline.

**[OPEN] Browser evidence.** The one permitted capture attempt did reach
installed Chrome WebGPU, but it is invalid acceptance evidence: the harness
mutated a named profile without switching it to `custom`, so both states
resolved to Low (`20x4x44:l2:1ca40182:76:0.280`), and the pre-repair graph
reported `inputs.diffuseColor.mul is not a function`. The four diagnostic PNGs
and manifest are retained only as failure evidence under
`capture-2026-09-04/`; their measured off-to-low deltas are **not claimed**.
The graph repair now uses the public r185 TSL nodes from the same WebGPU module,
but a valid on/off capture remains OPEN because the one-pair limit has been
consumed.

Diagnostic measurements only, not visual acceptance: the interior station
pair has mean absolute RGB difference **0.4507 / 255** (normalized 0.001767),
and the shadowed-exterior pair has **1.1058 / 255** (normalized 0.004337).
Neither change is attributed to SH-L2 because both frames used Low rather than
the requested Off / High comparison and the earlier graph emitted a TSL error.

**[OPEN] Adoption preflight.** AKP adoption and receipt checks passed for Codex
on `dave-gaming-pc`, but the repository preflight's branch-convention check is
not applicable to this Claude-named feature branch. This remains an explicit
handoff caveat rather than a claimed preflight pass.

---

## 7. Gates

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | **[VERIFIED] clean after the r185 public-TSL repair** |
| `npx vitest run` with the requested lighting/material/profile/precompile/pipeline/fidelity/ratchet paths plus SH-L2 tests | **[VERIFIED] 17 files, 186 passed** |
| Existing baked-indirect tests | **[VERIFIED] 4 files included; 2,921 lines across the complete `baked-indirect*.ts` source/test surface; 26 + 15 SH-L2 predecessor node tests also green** |
| `src/legacy-main-size-ratchet.test.ts` | **[VERIFIED] 5 passed; 37,100 lines against the unchanged 37,100 ceiling** |
| `git diff --check` | **[VERIFIED] clean before the post-repair commit** |
| `npm run pipeline:preflight -- --machine dave-gaming-pc --harness Codex` | **[OPEN] lockfile passed; guard rejected uppercase harness slug** |
| Same preflight with lowercase `codex` | **[OPEN] guard rejected the intentional `.../claude/...` branch prefix** |
| Native capture pair | **[OPEN] the only attempt exposed a harness/profile-state error and a pre-repair TSL graph error; no valid visual delta claimed** |
