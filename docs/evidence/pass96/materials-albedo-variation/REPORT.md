# PASS 96 - materials lane 2: albedo, roughness and normal VARIATION

Lane: Claude Opus 5 (high). Branch
`contrib/dave-gaming-pc/claude/materials-albedo-variation`, worktree
`C:/Users/david/projects/aa-claude-albedo`, cut from
`origin/contrib/dave-gaming-pc/claude/perf-hitl5` at `978da7e6`.

Owner: HF-503 (overnight) - "nice graphics, the techniques he shared, a really
nice experience". Ledger: HF-486 (quality-bar analysis, 2026-09-04) - *"we
already run 9 of 11 look techniques; the real gap is ~0 % albedo variation on
our surfaces, which makes GTAO/SSR/bloom invisible - the materials lane is the
multiplier."*

Method observed in `StarKnightt/morning-diner` (Claude Fable, 2026), shared by
the owner via <https://x.com/prasenx/status/2095537643182563778>;
re-implemented from first principles. No source, shader string or identifier
copied.

---

## 1. The finding this lane answers, and why the previous gate did not catch it

The base branch is not short of procedural materials. `spec.ts` already pins a
10 % peak-to-peak albedo wear step per family and `assertSpec` fails the build
if a spec is edited below it. That gate passed on the map the owner reported as
flat, and it passed for a reason worth writing down:

**it asserts the size of the authored numbers, and never asks where those
numbers live once the distance falloffs are applied.**

| authored scale | feature size | fades out by |
|---|---|---|
| grain | 0.5-1.5 mm | 3 m |
| scuff | 20-80 mm | 18 m |
| traffic | 0.5-3 m | never |

A player fights across Nuke Town at 10-30 m. At 20 m two of the three terms are
at **exactly zero** and the surviving one is a single field at a 6 % swing. One
field is a gradient, not a texture - and one gradient across a 12 m wall is
precisely the "looks like basic geometry" reading. The falloffs are correct (a
1 mm grain left live below one pixel aliases into a crawling shimmer that reads
worse than nothing); the gap is that **nothing was authored to survive the
range the map is actually played at**.

Two scales were added, both chosen to survive it, and both driven from the
shared CPU-generated tile the wear engine already samples:

- **macro, 1-4 m** - hue-stable luminance: paint batches, damp, sun, the slow
  tonal drift no real surface is without.
- **micro, 5-20 cm** - the mid-scale mottle that keeps a wall from going flat
  between the macro field's features. A 0.12 m feature subtends 9.7 px at 20 m
  and 3.2 px at 60 m, so inside this arena it never fades.

Plus three things that cost nothing once those two exist: a
**luminance-preserving warm/cool tint** on a decorrelated field, **roughness
correlated with the wear masks in both directions**, and a **bounded shading
normal** from a second generated tile.

## 2. Measured per-family table

Every number is a measurement of the generated tile taken through the same
`centred()` normalisation the node graph uses - not a restatement of the
authored constant. Reproduce with:

```
npx vitest run src/nuketown2-materials/albedo-variation.test.ts \
  -t "prints the measured" --disable-console-intercept
```

| surface | macro (m) | micro (m) | RMS luminance | 95 % p2p | worst p2p | mean err | tint peak | normal | peak darkening |
|---|---|---|---|---|---|---|---|---|---|
| siding A (north, blue `0x46809f`) | 2.8 | 0.14 | **2.66 %** | 10.43 % | 15 % | 0.000 % | 3.0 % | 4.0 deg | 30.0 % |
| siding B (south, yellow `0xf4be36`) | 2.8 | 0.14 | **2.66 %** | 10.43 % | 15 % | 0.000 % | 3.0 % | 4.0 deg | 30.0 % |
| roof deck (shingle) | 3.2 | 0.18 | **3.00 %** | 11.78 % | 17 % | 0.000 % | 2.2 % | - | 32.0 % |
| asphalt (carriageway) | 3.6 | 0.16 | **3.21 %** | 12.57 % | 18 % | 0.000 % | 1.4 % | 5.0 deg | 31.5 % |
| lane marking (decal) | 1.6 | 0.10 | **2.66 %** | 10.43 % | 15 % | 0.000 % | 1.2 % | - | 36.5 % |
| kerb | 2.4 | 0.12 | **2.87 %** | 11.24 % | 16 % | 0.000 % | 1.8 % | 4.5 deg | 30.5 % |
| concrete path / apron | 2.4 | 0.12 | **2.87 %** | 11.24 % | 16 % | 0.000 % | 1.8 % | 4.5 deg | 30.5 % |
| blockwork | 2.4 | 0.12 | **2.87 %** | 11.24 % | 16 % | 0.000 % | 1.8 % | 4.5 deg | 30.5 % |
| fence timber | 2.2 | 0.10 | **2.66 %** | 10.43 % | 15 % | 0.000 % | 2.6 % | - | 34.5 % |
| painted trim / wainscot | 2.2 | 0.10 | **2.66 %** | 10.43 % | 15 % | 0.000 % | 2.6 % | - | 29.3 % |
| garage door metal | 1.8 | 0.09 | **2.32 %** | 9.10 % | 13 % | 0.000 % | 2.4 % | - | 29.5 % |
| coach trim band (vehicle paint) | 1.8 | 0.09 | **2.32 %** | 9.10 % | 13 % | 0.000 % | 2.4 % | - | 29.5 % |
| lawn turf | 3.4 | 0.20 | **2.66 %** | 10.43 % | 15 % | 0.000 % | 3.0 % | - | 37.5 % |
| lawn dirt / scrub plain (55 m backdrop) | 3.4 | 0.20 | **2.66 %** | 10.43 % | 15 % | 0.000 % | 3.0 % | - | 27.0 % |
| hedge / planter | 3.4 | 0.20 | **2.66 %** | 10.43 % | 15 % | 0.000 % | 3.0 % | - | 32.0 % |
| coach glazing (band floor, deliberate) | 2.0 | 0.08 | 1.23 % | 4.83 % | 7 % | 0.000 % | 1.0 % | - | 25.0 % |
| vehicle body paint (own module) | 1.6 | - | 2.2 % albedo + **5.5 % roughness** | - | - | - | - | - | - |

Tile statistics behind those numbers:

```
lut channel means  0.49893 0.49819 0.49849 0.47203
lut channel sigmas 0.21443 0.15993 0.14048 0.18595
gradient rms       0.4829
```

**The ridged channel's mean is 0.472, not 0.5.** A signed field written as
`sample * 2 - 1` on that channel is biased by 5.6 %, and the tint rides on it.
Every variation term therefore subtracts the *measured* mean - which is why the
mean-error column is 0.000 % on all sixteen rows rather than "close enough".

## 3. What was built

### 3.1 Two scales, folded into the existing clamp (`wear.ts`)

`buildVariation()` samples the shared 512x512 tile twice: once at the macro
frequency (taking `.b`, the three-octave fBm, for luminance and `.a`, the
ridged field, for hue - **two single swizzles off one fetch**, never a chain,
per the Chrome 153 Tint gotcha) and once at the micro frequency (`.r`).

Both new terms are added **inside `buildWear`'s existing albedo clamp**, not
clamped again in each family. This is the one structural decision in the lane:
a per-family second clamp would have let the composed surface darken past a
ceiling every part of it individually respected. The combat-readability bound
is a property of the composed surface or it is nothing. `albedoWearStep()` now
sums the macro and micro terms too, so the 45 % ceiling covers them - a
strengthening of the existing gate, never a widening.

### 3.2 Roughness correlated with the wear mask, in both directions

`+ soilMask * soilRoughness` (dirt collects in the recesses and dirt is rough)
and `- smoothstep(scuff) * polishRoughness` (traffic polishes what it touches),
on top of the macro and micro roughness swings. Uncorrelated roughness noise
reads as a second texture fighting the first - the exact CG tell the
three-scale rule exists to remove. Roughness that *agrees* with the albedo mask
reads as one surface with a history.

### 3.3 A second generated tile for the normal (`noise-lut.ts`)

256x256 RGBA8 over 32 lattice cells, generated on the CPU exactly the way the
value tile is: **nothing loaded, decoded, or fetched**, so the "loads no
texture" gate still holds. `R`/`G` are the wrapped central-difference gradient
of a two-octave height field, `B` is the height. Wrapped differencing is what
makes the gradient tile with the height; a non-wrapped one would put a seam
grid on every wall. Measured saturation: **under 1 % of texels**.

Applied to siding (4 deg), concrete (4.5 deg) and asphalt (5 deg) only.
Silhouettes stay flat **by construction** - nothing moves a vertex - and the
tilt is clamped to 8 deg before it reaches the frame. What it moves is the
specular lobe and the ambient-occlusion response, which is the HF-486 gap
restated: GTAO and SSR modulate a surface, and a surface whose normal is
constant has nothing for them to modulate.

**Space.** `NodeMaterial.setupNormal()` consumes `normalNode` as **view** space
with no transform - the trap `farcrysis-water-surface.ts` documents at length,
where a world-space flat term reinterpreted as view tumbled as the player
pitched. The frame here is built in **local** space off `normalLocal` (the one
basis both available inside the normal sub-build and view-independent) with a
branchless orthogonal basis that cannot degenerate on an axis-aligned face, and
converted once by `transformNormalToView`. A handedness error in a local frame
can only ever be a static, spatially-correlated tilt; it cannot tumble.

### 3.4 Edge wear on the chamfers the geometry already has

| family | chamfer used | why that one |
|---|---|---|
| siding | top lip of each lap board (`topCatch`) | paint fails at an arris first; a ladder, a hose and thirty summers |
| concrete | `joint * (1 - joint) * 4` | peaks on the joint **shoulder**, zero in the groove and out in the field - which is where a chamfer is; on a kerb it is the nose every wheel has clipped |
| timber | board arris (`boardEdge` > 0.84) | the edge every hand, shoulder and mower has rubbed |
| painted metal | stamped-section crest | the line a garage door is grabbed by and reversed into |

Each lightens the albedo and *reduces* roughness there, because a worn arris is
both paler and smoother than the field beside it.

### 3.5 Vehicle paint (`nuketown2-vehicle-materials.ts`)

The shared vehicle paint graph carried a 4 cm flake field and a **constant**
roughness node, so a coach flank read as one value across five metres of paint.
The reference critic recorded exactly that ("identical flat chalk white",
"untextured vehicle hulls"). Added a 1.6 m panel-scale field driving **both** a
2.2 % luminance drift and a 5.5 % roughness swing **from the same sample** -
paint a shade lighter is paint the polisher reached, and paint the polisher
reached is smoother. Roughness carries the larger swing deliberately: a
clearcoat varies in how it reflects long before it varies in what it is.

## 4. Pipeline count - MEASURED before and after

The requirement was "unchanged or lower, never raised". Measured by running the
`nuketown2-pipeline-budget.test.ts` graph-signature function against the base
tree and the candidate tree in the same worktree, minutes apart:

| tree | registry node materials | registry distinct graphs | arena node materials | arena distinct graphs |
|---|---|---|---|---|
| base `978da7e6` | 18 | **8** | 64 | **40** |
| candidate | 18 | **8** | 64 | **40** |

**Unchanged.** Every knob added is a `uniform()` node on the family's existing
shared graph, and uniform values are hashed as `<uniform>` by the signature
function, so per-material authoring cannot split a pipeline.

The ceiling could **not** be lowered: the arena sits at exactly 40, which is the
value `NUKETOWN2_MAX_DISTINCT_MATERIAL_GRAPHS` already pins. Lowering it would
fail on the base branch too, so it is not this lane's to move.

**Cost, stated honestly.** Two extra texture fetches per fragment on every
family, and a third on the three that take a normal. They are fetches from
512x512 and 256x256 RGBA8 tiles that are cache-resident from the first
fragment - nothing like the per-fragment `sin`-hash lattice HF-491 removed -
but they are not free, and the perf lane's p50 should be re-measured before
publish. See OPEN 1.

## 5. Gates (quoted, all green)

```
npx tsc --noEmit                                                    # clean
npx vitest run src/nuketown2-materials \
               src/nuketown2-pipeline-budget.test.ts \
               src/pipeline-metrics.test.ts \
               src/nuketown2-fidelity.test.ts \
               src/graphics-profile-contract.test.ts \
               src/legacy-main-size-ratchet.test.ts \
               src/nuketown2-vehicle
   Test Files  8 passed (8)
        Tests  211 passed (211)
```

`src/nuketown2-materials/albedo-variation.test.ts` is new - 104 assertions -
and is included in the run above via the directory. It asserts:

- per-family RMS luminance in [1.5 %, 5.0 %] for every large flat surface;
- macro in 1-4 m at 2-6 %, micro in 5-20 cm at 1.5-5 %;
- **mean preservation within 1 % of the HF-477 pinned hex** - the one a "make it
  look better" pass silently breaks, because a one-sided wash is the easy way to
  look varied and it walks the surface off its pin while the fidelity gate reads
  `material.color` and passes anyway;
- composed peak darkening still inside the 45 % readability ceiling with both
  new scales folded in;
- roughness correlated in both directions;
- the tint luminance residual bounded below 0.2 %;
- the shading tilt bounded to 8 deg and present on exactly the three declared
  families;
- the gradient tile wraps and saturates on under 1 % of texels;
- every variation knob is a finite scalar in `material.userData`, never a baked
  constant - the uniform-only condition the graph ceilings depend on.

## 6. Capture pair

Harness: `scripts/qa/capture-arena-viewpoints.mjs` - installed Chrome headless
over CDP, real hardware WebGPU device, `PASS73_NATIVE_WEBGPU=1`, stock flags,
both sides served from their own `vite preview` on port 4212, one browser at a
time. Diffed with `scripts/qa/diff-arena-viewpoints.mjs` (`meanAbsDelta`,
grayscale, downscaled, persistence-min across samples).

**RESULT: the pair was NOT produced. Reported as a failure, not smoothed over.**

The browser half is healthy - installed Chrome headless obtained a real
hardware WebGPU device (`backend=webgpu`, `vendor=nvidia`,
`architecture=blackwell`), the arena served and loaded, and the run took 133 s.
Every one of the 17 authored Nuke Town review cameras then returned the same
error:

```
[viewpoint-capture] nuketown2  FAIL 0/17 shots 133346 ms
  nuketown2-overhead: setArenaReviewCamera returned false - authored camera missing
  ... same for all 17 camera ids ...
verdict FAIL, backend webgpu, adapterVendor nvidia
```

Both sides fail identically, and **the base tree fails it too** - so this is
not a regression introduced by this lane, it is the viewpoint harness not
resolving the authored review cameras out of a `vite preview` production
bundle on this branch. Diagnosing that is its own task; guessing at it, or
substituting a hand-driven screenshot and calling it the pair, would put an
unearned number in this row.

**What this means for the lane's claims.** Nothing in section 2 or section 4
depends on the capture: those are CPU measurements of the generated tile and of
the material graph, reproducible from the test file. What is NOT evidenced is
the frame itself - no "mean abs diff between before and after at two stations"
figure exists, and none is claimed. That is OPEN 6.


## 7. Claim-states

**VERIFIED (mechanical, reproducible in this worktree)**

- Per-family RMS luminance 2.32-3.21 % and mean error 0.000 % - measured off
  the generated tile by `albedo-variation.test.ts`.
- Registry 8 graphs / arena 40 graphs, identical on the base tree and the
  candidate tree, measured with the budget test's own signature function.
- tsc clean; 211 tests green across the quoted gate list.
- Gradient tile saturation under 1 %; tile channel means and sigmas as printed.

**OBSERVED**

- The Gemini reference critic (`aa-claude-research`,
  `pass94/gemini-reference-critic/candidate5-REVIEW.md`) records, as
  material-read complaints this lane targets: siding "without PBR surface
  roughness variation ... or material sheen"; "asphalt specular reflection at
  grazing angles is completely absent ... Add a roughness/specular texture map
  to the road asphalt"; "the street asphalt is a monolithic dark grey surface";
  "flat ambient fill in crevices"; vehicles in "identical flat chalk white" and
  "untextured vehicle hulls".

**INFERRED (not yet measured on this branch)**

- That these changes move the critic's material-read scores. The critic has not
  been re-run against this branch; that belongs to the next critic pass.
- That GTAO/SSR/bloom become visible on these surfaces. The mechanism is argued
  (a constant normal returns nothing to a screen-space occlusion or reflection
  term) and the normal is now non-constant on the three largest surfaces, but no
  HDR probe was taken.

**ASSUMPTION**

- That the two-sigma normalisation is the right calibration for "2-6 %
  luminance". The brief's band is read as the authored **peak** swing; a field
  normalised to 2 sigma shows about half its peak as RMS, which is why the
  measured RMS lands at 2.3-3.2 % while the authored macro numbers are
  4.0-5.5 %. Both are reported so the reading can be corrected without
  re-deriving it.

## 8. Open items

1. **Frame cost not re-measured.** This lane adds two texture fetches per
   fragment (three on siding/concrete/asphalt) to a branch cut specifically to
   *reduce* per-fragment cost. They are cache-resident 8-bit tile fetches, not
   the transcendental hash HF-491 removed, but the honest position is that the
   perf lane's `scripts/qa/hf399-fps-phase-probe-cdp.mjs` p50/p95 should be
   re-run against this head before publish. **Not run here - the owner has
   ComfyUI on this GPU and the brief allowed one short headless capture pair,
   not a perf sweep.**
2. **`select` evaluates both sides.** The backdrop branch in `buildWear` selects
   between an analytic field and the lattice path, but a `select` is not a
   branch: the 220 m scrub slab already pays for every surface-path fetch. That
   predates this lane and is not fixed by it, but it means the "the backdrop is
   cheap" comment in `wear.ts` is no longer the whole truth, and the slab is
   where item 1 would bite hardest.
3. **Interior drywall and floors untouched.** `nuketown2-interior-materials.ts`
   is a flat module: each `createNuketown2*` builds its own graph with baked
   constants and no shared uniform set. Giving it the same treatment means
   giving it a uniform set first, which is a lane of its own - doing it inside
   this time box would have meant an unpinned change to five more graphs.
4. **Vehicle body paint is partial.** The panel-scale drift is in; the critic's
   actual P0 there is *livery* (two-tone cream-and-maroon coach, dark blue
   saloon), which is a colour-authority change, not a material-variation one.
5. **Micro falloff is arena-specific.** 55->110 m is chosen so the term never
   fades inside Nuke Town. A larger map reusing these families would want that
   pair re-derived from its own read distances rather than inherited.
6. **The capture pair is owed.** `scripts/qa/capture-arena-viewpoints.mjs`
   cannot resolve the authored Nuke Town review cameras out of a `vite preview`
   production bundle on this branch (it fails identically on the base tree, so
   it is a harness/route issue, not a lane regression). The visual claim is
   therefore UNEVIDENCED and this branch should not be treated as visually
   reviewed until a working pair exists. Both bundles are built and left in
   place - `dist-vr-base` (978da7e6) and `dist-vr-after` (332494cc) - so whoever
   picks this up can re-run the capture without rebuilding.
