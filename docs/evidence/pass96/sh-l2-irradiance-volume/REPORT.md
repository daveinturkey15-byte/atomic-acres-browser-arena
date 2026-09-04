# PASS 96 - SH-L2 irradiance volume (HF-486 / HF-503)

Lane: `contrib/dave-gaming-pc/claude/sh-l2-irradiance-volume`, based on
`origin/contrib/dave-gaming-pc/claude/nuketown2-lighting` at `7f9b14b6`.
Harness: Claude Code (Opus), machine `dave-gaming-pc`, 2026-09-04.
Impact class: **runtime**, but **staged and not installed** - see section 6.

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
inside a graph that already exists, so `setStrength(0)` leaves the graph, the
bindings and the pipeline untouched. That makes the control `applyMode: 'live'`
and safe to move mid-match (tripwire 0). Pinned by *"turns off through a uniform
without touching the bound textures"*.

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

## 6. What is NOT done - the staged/installed boundary

**This lane is staged, not installed.** The node is built and tested; it is
**not** wired into any arena material, and no settings-registry control exists
yet. Nothing in the running game changes, and the pipeline delta is **0**.

That boundary is deliberate, and the reason is a finding in its own right:
**there is no per-material ambient choke point in this codebase.** Arena
materials get their indirect light from the frozen three.js light set
(`hemisphereLight` / `ambientLight`) and from `scene.environment`; nothing
composes an ambient node by hand. Installing this means editing the ~24
`create*Material()` factories in the four `src/nuketown2-*-materials.ts` files,
and any new pipeline id must be registered in
`src/rendering/tsl-migration-inventory.ts` or `assertRuntimeTslTraversal`
(`pass64-tsl-scene.ts:1505`) **fails closed**. That is a bounded but real piece
of work and it was not going to be done well in the time left. It is not
claimed.

### Next steps, in order

1. **Widen the occluder set for the bake path only.** `extractProxyScene` is
   capped at `maximumShapes: 24`, tuned for reflections. 24 boxes over Nuke Town
   will not capture two houses' interior walls, a garage, doorways and windows,
   so interiors will leak. The authored `NUKETOWN2_SECTION`,
   `NUKETOWN2_DOORWAYS`, `NUKETOWN2_WINDOWS` and `NUKETOWN2_BUILDING_FOOTPRINTS`
   are exported and are the right input. **Do not widen the shader-side
   `RAY_TRACED_MAXIMUM_SHAPES`** - that is a per-frame cost budget.
   *Also skip the 220 x 220 m ground collider, which encloses the whole arena.*
2. Add the shared TSL term to the 24 material factories behind one uniform.
3. Add the settings control (`applyMode: 'live'`, `runtimeConsumer`, runtime
   evidence row, all four presets, renderer-feature-inventory row).
4. Bake from `resolveNuketown2Sky()`'s absolute photometry rather than
   `bakeLightingFromSun`'s quantised reconstruction - Nuke Town is the one arena
   with a real lux table.
5. Headless capture pair (interior + shadowed exterior) once it is wired. **Not
   done in this lane, and no capture diff is claimed**, because with nothing
   wired the two captures would be identical by construction and reporting them
   would be theatre.

---

## 7. Gates

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | **clean** |
| `sh-l2-irradiance.test.ts` | **26 passed** |
| `sh-l2-irradiance-node.test.ts` | **15 passed** |
| Full run: `src/rendering/lighting/`, `graphics-profile-contract`, `cold-session-precompile-reach`, `pipeline-metrics`, `nuketown2-fidelity`, `screen-space-topology-contract`, `pass65-settings-inventory`, `graphics-settings-registry`, `legacy-main-size-ratchet` | **173 passed, 1 failed** - see 7.1 |

### 7.1 Pre-existing failure on the base branch, not caused by this lane

`src/legacy-main-size-ratchet.test.ts` is **already red at the base commit**:
`src/legacy-main.ts` is **37,101 lines against a `LINE_CEILING` of 37,100**.
Verified directly: `git show 7f9b14b6:src/legacy-main.ts | wc -l` returns 37101,
i.e. before any file in this lane existed. The last ceiling bump was `567b4a31`
(HF-433 -> 37,100); commit `460f09f2` landed afterwards without raising it.

**This lane does not touch `src/legacy-main.ts` and did not raise the ceiling.**
Raising a ratchet to mask another lane's breach is exactly the "never weaken a
verifier to get green" prohibition, so it stays red and stays reported. The
owning lane should bump the ceiling with a `CEILING_HISTORY` entry, or shrink
the file by one line.
