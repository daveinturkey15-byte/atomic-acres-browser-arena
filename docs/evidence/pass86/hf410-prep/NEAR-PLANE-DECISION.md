# HF-410 F1 — the on-foot near plane 0.08 → 0.02 m: the evidence, and the call

**Recommendation: (a) ACCEPT 0.02 AS-IS.** Measured, not argued: at the shipped
resolution and on the shipped renderer, the change produces **no z-fighting and
no shimmer** on distant or coplanar geometry in High Seas, Map 3 or Skyline
Terminal, and its total pixel delta is **2.5x smaller than the same build's own
run-to-run noise**.

## The question

Lane W moves `FIRST_PERSON_CAMERA_NEAR_METERS` (`src/viewmodel-body-fit.ts`)
from 0.08 to 0.02 m and states the cost in the source: depth resolution scales
as 1/near, so distant precision goes 4x coarser — about 1 cm at 60 m and 3 cm at
100 m, against 0.3 cm and 0.8 cm. That arithmetic is correct. It is also only an
upper bound on a *budget*; it says nothing about whether any real surface in any
real arena actually falls foul of it. The merge audit (F1) asked for the visual
check and could not run it. This is that check.

## Method

Two builds off the same merged commit, differing in **exactly one number**.

The authored review cameras hardcode their own `near: 0.08` in
`src/rendering/arenas/shared.ts:49` and therefore do **not** inherit
`FIRST_PERSON_CAMERA_NEAR_METERS` at all — capturing them unmodified would have
compared two identical images and reported a false "no difference". For the A/B
only, `camera()`'s `near` was bridged to `FIRST_PERSON_CAMERA_NEAR_METERS` so the
frames actually exercise the plane under test; `far` (190) and every other
authored field were left alone. Both source edits were reverted before any
commit — the shipped tree is unchanged, and **review cameras remain on 0.08 in
what ships**, so the risk surface of this decision is the gameplay and
chopper-gunner cameras only.

| Build | `FIRST_PERSON_CAMERA_NEAR_METERS` | Bundle |
|---|---|---|
| `near002` (merged, as Lane W wrote it) | 0.02 | `legacy-main-ceHUDJAx.js` |
| `near008` (constant reverted locally) | 0.08 | `legacy-main-CzsAg3eZ.js` |
| `near002b` (**noise floor** — same build as `near002`, second run) | 0.02 | `legacy-main-ceHUDJAx.js` |

Captured with `scripts/qa/capture-arena-viewpoints.mjs` — installed Chrome,
**headless**, `PASS73_NATIVE_WEBGPU=1`, native WebGPU on real hardware
(`vendor=nvidia`, `architecture=blackwell`, verdict `PASS` on all three runs),
**2560x1440**, arenas `high-seas,map3,skyline-terminal`, all 14 authored review
cameras, HUD and viewmodel hidden, bots frozen, frozen visual time / seed /
exposure. Preview served from a private port 4190 (`QA_PREVIEW_PORT=4190`).
Diffed with `scripts/qa/hf410-near-plane-ab-diff.mjs` (committed).

**The noise floor is the point.** With `--samples 1` a raw A/B number means
nothing, because animated water, flickering lights and dynamic content differ
between capture *sessions* on an identical bundle. So the same build was captured
twice and diffed against itself.

## Result

"Far half" = upper half of the frame, where distant geometry projects for every
camera used. Totals over all 14 cameras:

| Comparison | far-half px Δ>8 | far-half px Δ>32 |
|---|---|---|
| **Signal** — near 0.02 vs 0.08 | **10,924** | 3,605 |
| **Noise** — near 0.02 vs itself, second run | **27,410** | 11,015 |

**The near-plane signal is 2.5x smaller than the noise of the identical build.**
Per-camera, the two frames with the largest A/B counts are the same two frames
with the largest self-vs-self counts (`terminal-port-wing-authority` 4,250 vs
4,354; `high-seas-bow-lane` 1,167 vs 21,530) — that is dynamic content, not the
near plane.

### Is what remains z-fighting?

No, and this is decisive rather than impressionistic. Z-fighting is *defined* by
adjacent pixels disagreeing about which surface wins, so its signed delta flips
sign pixel-to-pixel at a rate near 50%. Measured signed-luminance delta over
pixels that carry a real difference:

| Camera | mean signed | mean abs | **sign-flip rate** |
|---|---|---|---|
| `map3-into-sun-hub` | +2.551 | 2.621 | **0.0%** |
| `map3-hub-vista` | +0.119 | 0.205 | **0.0%** |
| `terminal-starboard-wing-authority` | +0.018 | 0.098 | **0.1%** |
| `high-seas-upper-deck-occlusion` | −0.006 | 0.091 | **3.5%** |

Every frame is a **smooth, single-signed tonal shift**, not stipple. On
`map3-into-sun-hub`, mean signed (+2.551) ≈ mean abs (2.621): a near-uniform ~1%
luminance offset in one direction across the sunlit ground. That is screen-space
depth *linearization*, not depth *precision* — three's `perspectiveDepthToViewZ`
takes `near` as an input, so godrays/fog/AO reconstruct view-Z fractionally
differently. It is a shading nudge, and it is the only above-noise effect found.

Frames inspected by eye at full resolution (`inspected/`): the amplified (x12)
delta maps show black everywhere except a single-pixel silhouette edge; the
`into-sun-GROUND-near002/008` pair is geometrically identical — same edges, same
silhouettes, no interpenetration, no shimmer.

## Reversed depth (option b) — available, and it would not help

**`reversedDepth` / `reversedDepthBuffer` / `logarithmicDepthBuffer`: ZERO
occurrences anywhere in `src/`.** The renderer is **not** configured with a
reversed depth buffer. (The gameplay route is three r185's WebGPU renderer;
`src/rendering/render-runtime.ts:633` requests `webgpu` with `requireWebGPU:
true`, and the captures above confirm `backend=webgpu` on hardware.)

`reversedDepthBuffer` *is* a one-line renderer constructor option in r185. It
would still be the wrong lever here:

- The depth attachment is **fixed-point**: three defaults `depthTexture.type =
  UnsignedIntType` (24-bit unorm, `depth24plus`). Reversed-z on a *fixed-point*
  buffer is a linear remap of a uniformly-quantised range — the precision
  distribution is mathematically identical. Reversed-z is a large win only when
  paired with a **floating-point** depth buffer, and three only upgrades to
  `FloatType` for `PassNode` targets, not the main depth attachment.
- So it would change depth-test semantics across the whole renderer, and the
  shadow and depth-reconstruction paths that branch on it, to buy nothing
  measurable — against a problem the measurement says does not exist.

## The call

**(a) Accept 0.02 as-is.** The stated cost is real arithmetic but has no
observable consequence at the shipped resolution in the three arenas most at
risk. Option (b) is a renderer-wide semantics change for no measured gain on a
fixed-point depth buffer. Option (c) would give back the fit's whole
justification — 42 of 60 poses have an on-screen near-plane cut at 0.08 against
0 of 60 at 0.02 (`docs/evidence/pass85/hf410/body-fit-after-repair.json`) — to
buy depth precision nothing was using.

Two things stay on the record rather than being waved off:

1. **Not swept:** Farcrysis, Raid, Gun Range, Nuke Town, Test1/Test2. The three
   arenas named in F1 as the concentrated risk were swept; the rest were not.
2. **The one real effect** is the ~1% luminance shift on into-sun screen-space
   depth reconstruction. Below the noise floor on 13 of 14 cameras, visible in
   no side-by-side, and worth knowing about if the volumetrics are ever retuned.

## Reproduce

```
# from the merged tree, with review-camera near bridged to the constant:
npx vite build --outDir dist-near002                  # constant at 0.02
npx vite preview --outDir dist-near002 --host 127.0.0.1 --port 4190 --strictPort
PASS73_NATIVE_WEBGPU=1 node scripts/qa/capture-arena-viewpoints.mjs \
  --url http://127.0.0.1:4190 --label near002 --arenas high-seas,map3,skyline-terminal \
  --viewport 2560x1440 --samples 1 --out <dir>/near002
# repeat with the constant at 0.08 -> near008, and once more at 0.02 -> near002b
node scripts/qa/hf410-near-plane-ab-diff.mjs --a near002 --b near008 --out near-plane-ab-numeric.json
node scripts/qa/hf410-near-plane-ab-diff.mjs --a near002 --b near002b --out noise-floor-numeric.json
```

Full 42-frame capture sets are untracked (repo weight) under
`artifacts/hf410-prep/frames/{near002,near008,near002b}/`; the three
`capture-manifest-*.json` here pin the bundle, git SHA, backend and adapter of
each run.
