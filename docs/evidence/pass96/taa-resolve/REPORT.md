# HF-472 TAA resolve report

Status: **PASS 2 ACCEPTED for QUALITY/MAX opt-in.** The Pass 1 rejection is
retained below as historical evidence; every consequential line is labelled
`VERIFIED`, `CLAIMED`, or `OPEN`.

The sections before `Pass 2` preserve the first-pass baseline and its honest
failure. `Pass 2` is the authoritative disposition for this candidate.

## Scope and method

- **VERIFIED:** Candidate worktree was `C:\Users\david\projects\aa-claude-taa`,
  branch `contrib/dave-gaming-pc/claude/taa-resolve`; no other worktree was
  edited.
- **VERIFIED:** The implementation uses an in-repo r185 TSL graph. It does not
  vendor Three's `TRAANode`.
- **VERIFIED:** Build-time browser used installed Chrome at
  `C:\Program Files\Google\Chrome\Application\chrome.exe`, headless, muted,
  2560x1440, port 4220, and the page reported WebGPU with an NVIDIA Blackwell
  adapter.
- **VERIFIED:** The QA driver's `hf399-fps-phase-probe-cdp.mjs` supplied the
  scripted `move` walk. Each run used the same `nuketown2` route and the only
  graphics override was `taaResolve` false or true.
- **VERIFIED:** The station capture used
  `capture-arena-viewpoints.mjs`, `nuketown2-street-centre` and
  `nuketown2-north-yard`, three samples each, at 2560x1440. The TAA-on capture
  manifest is `candidate/capture-manifest.json`.

## Mechanical implementation evidence

| Claim | Result |
|---|---|
| One TAA pipeline added | **VERIFIED:** `TSL_MIGRATION_INVENTORY` was 7 before the new `pass96.taa-temporal-resolve.tsl.v1` entry and 8 after; the inventory contains that ID exactly once. |
| Resolve resources | **VERIFIED:** `TaaResolveNode` owns two distinct RGBA16F targets and one `TAA ours.resolve NodeMaterial`; resolver tests pass. |
| Resolve math | **VERIFIED:** NDC-to-UV reprojection, RGB/YCoCg round-trip, YCoCg clamp, invalid-history identity, and sharpen-free strength blend are unit-tested. |
| QUALITY velocity MRT | **VERIFIED:** `screenSpaceMrtRequirement()` admits velocity when TAA is enabled, including QUALITY; BALANCED remains off. |
| MSAA mutual exclusion | **VERIFIED:** a 4x request resolves to zero principal samples when TAA is on and remains 4 when TAA is off. |
| GTAO/SSGI temporal filtering | **VERIFIED:** both source flags are tied to the resolved TAA topology; they are not enabled by request alone. |
| Admission reach | **VERIFIED mechanically:** the exact ScenePass precompile calls `renderer.compileAsync(precompileRoot, camera, scene)` and the graph is in the linear output path. **FAILED runtime tripwire:** the on-run still created 6 render pipelines during `deployed-idle`, below. |
| In-combat creation fence | **FAILED:** TAA-on `deployed-idle` recorded `renderPipelines +6`; the required value is 0. |

## Control-set re-measurement

**VERIFIED:** The registry control is `taaResolve`, `pipeline-rebuild`, off by
default on PERFORMANCE/BALANCED and on for QUALITY/MAX. The pins were recomputed
from the full preset objects.

| Profile | Before | After |
|---|---:|---:|
| PERFORMANCE | `445a9754` | `e38ede29` |
| BALANCED | `0753ee34` | `9d461537` |
| QUALITY (`high`) | `430da2ad` | `2f8b5453` |
| MAX | `03ee2e10` | `b71a9c4e` |

**VERIFIED:** The control-set hash and registry tests passed after these values
were written. This was a measurement, not a blind re-pin.

## Memory and target arithmetic

- **CLAIMED from the decision:** At 1440p, the frame is 3.69 Mpx; a two-target
  RGBA16F history/resolve pair is roughly 59.0 MB resident; one resolve write
  and one copy are roughly 29.5 MB each per frame; the QUALITY velocity RG16F
  attachment is roughly 14.7 MB per frame. Replacing the principal 4x
  RGBA16F-plus-depth path removes the decision's roughly 177 MB/frame
  multisample traffic.
- **VERIFIED mechanically:** The resolver test confirmed both targets are
  RGBA16F and the QUALITY runtime requests velocity.
- **OPEN:** No GPU memory counter was treated as a TAA-specific measurement;
  the above cost row is the decision's stated 1440p arithmetic.

## Perf falsifier

Probe files:

- **VERIFIED:** TAA off: `perf-off/taa-off-nuketown2.json`.
- **VERIFIED:** TAA on: `perf-on/taa-on-nuketown2.json`.
- **VERIFIED:** Both used the same 3-second windows after a 3-second warmup,
  the same 1440p viewport, and the same scripted QA route.

| Phase | TAA off p50/p95 ms | TAA on p50/p95 ms | Delta p50/p95 ms | Pipeline creation |
|---|---:|---:|---:|---:|
| deployed-idle | 25.1 / 30.7 | 24.9 / 39.2 | -0.2 / +8.5 | 0 / **+6** |
| move (scripted walk) | 24.9 / 31.1 | 26.1 / 31.1 | **+1.2** / 0.0 | 0 / 0 |

- **FAILED:** The requested falsifier is `more than +1.0 ms at 1440p on
  QUALITY`. The moving phase p50 delta is +1.2 ms, so implementation work
  stopped here.
- **FAILED:** The in-combat pipeline fence is 0; TAA-on deployed-idle recorded
  6 newly created render pipelines.
- **OPEN:** No attempt was made to tune or hide this failure after it appeared.

## Station captures and temporal stability

**VERIFIED:** The TAA-on pair directory contains these six captures:

- `candidate/nuketown2/nuketown2-street-centre.png`
- `candidate/nuketown2/nuketown2-street-centre.s1.png`
- `candidate/nuketown2/nuketown2-street-centre.s2.png`
- `candidate/nuketown2/nuketown2-north-yard.png`
- `candidate/nuketown2/nuketown2-north-yard.s1.png`
- `candidate/nuketown2/nuketown2-north-yard.s2.png`

**OPEN:** A valid before/after station pair was not completed after the
falsifier fired. Therefore no shimmer reduction is claimed. The decision's
metric is quoted exactly as the measurement rule: mean absolute luma delta
between consecutive frames after a 3x3 high-pass, reported per station, with
three consecutive frames before and after. The required temporal-stability
comparison at both stations remains OPEN.

## Gates

- **VERIFIED:** `npx tsc --noEmit`.
- **VERIFIED:** Focused post/scene/registry/resolver suite: 78 tests passed; the
  resolver/scene follow-up suite: 16 tests passed.
- **VERIFIED:** `npm run build`.
- **VERIFIED:** The requested final command was run and passed (the PowerShell
  wildcard invocation collected 2 files / 19 tests). The equivalent explicit
  file expansion, including every matching post/TAA/precompile/pipeline/size
  test, passed 7 files / 62 tests. Command shape:
  `npx vitest run src/rendering/*post* src/rendering/*taa* src/graphics-profile-contract.test.ts src/cold-session-precompile-reach*.test.ts src/pipeline-metrics*.test.ts src/legacy-main-size-ratchet.test.ts`.

## Pass 1 decision (superseded)

**FAILED / STOPPED:** The code is mechanically wired and documented, but this
candidate must not be treated as accepted QUALITY/MAX TAA until the +1.0 ms
falsifier and the in-combat pipeline fence both pass. No release or deployment
was performed.

## Pass 2

### Admission reach

- **VERIFIED:** The TAA-on admission vocabulary is explicit and complete:
  `pass96.taa-temporal-resolve.tsl.v1` for the unattached resolve
  NodeMaterial, `taa-history.copyTextureToTexture` for the one-time history
  seed copy, and `scene-pass.velocity-mrt` for the velocity attachment.
  The history copy is a backend copy command, not a render pipeline; it is
  still retained in the reach contract because it is part of the TAA-on
  resource path.
- **VERIFIED:** The resolve precompile compiles both RGBA16F history ping-pong
  directions with `compileAsync(QUAD, QUAD.camera, targetScene)`. The live
  path writes directly to the next history target, so the former per-frame
  resolve-to-history colour copy is gone; only the first-frame seed and the
  depth-history copy remain.
- **VERIFIED:** The velocity-MRT candidates are derived from the submitted
  scene roots and the same material/geometry identity fields used by the
  pipeline census. The final receipt contains the complete sorted list of 85
  material variants at
  `pass2/perf-on-v6-final/taa2-quality-on-v6-final-nuketown2.json`, rather
  than a hand-maintained arena roster. Hidden and non-selected LOD renderables
  are admitted through temporary visibility/frustum overrides that are
  restored after each compile.
- **VERIFIED:** The final TAA-on receipt reported 523 total render pipelines by
  the measured phases, with 0 newly created in `deployed-idle` and 0 in
  `move`; both phase label lists were empty. Together with the admission
  receipt and census-derived precompile, this closes the in-combat pipeline
  tripwire at the required value of 0.

### QUALITY cost and falsifier

- **VERIFIED:** At 2560x1440 on the native WebGPU path, the final QUALITY
  TAA-on run measured `18.8 / 32.1 ms` p50/p95 in `deployed-idle` and
  `16.2 / 31.3 ms` p50/p95 while moving. The matched TAA-off control measured
  `21.0 / 28.4 ms` and `21.4 / 29.0 ms` respectively.
- **VERIFIED:** The required moving-frame p50 delta is `16.2 - 21.4 = -5.2
  ms`, below the unchanged `+1.0 ms` falsifier. The in-combat creation count
  is 0 on both TAA-on rungs. Evidence is in `pass2/perf-on-v6-final/` and
  `pass2/perf-off-v1/`.
- **VERIFIED:** The cost reduction used the safe candidates that fit this
  implementation: the resolve remains full-resolution with the decision's
  3x3 YCoCg clamp and reprojection/depth rejection, while ping-ponging the two
  RGBA16F targets removes the full-resolution per-frame colour copy. QUALITY
  remains enabled; it was not demoted to MAX-only and the falsifier was not
  repinned.
- **OPEN:** The browser receipt is an end-to-end frame-time measurement, not a
  GPU timestamp for the isolated resolve draw. No unsupported pass-local GPU
  time is claimed; the requested acceptance is the measured moving-frame
  falsifier.

### Temporal stability

- **VERIFIED:** The decision metric was run at both stations with WebGPU, three
  consecutive frames per station, and a 3x3 high-pass defined as luma minus
  the inclusive 3x3 neighbourhood mean, normalized to 0..1. The station
  capture waited for the review-camera commit and a 500 ms history settle.
- **VERIFIED:** At `nuketown2-street-centre`, the mean absolute high-pass luma
  delta changed from `0.00108516` (TAA off; pair deltas `0.00081435`,
  `0.00135597`) to `0.00066182` (TAA on; `0.00061443`, `0.00070920`).
- **VERIFIED:** At `nuketown2-north-yard`, it changed from `0.00238282` (TAA
  off; `0.00232449`, `0.00244116`) to `0.00220968` (TAA on; `0.00224613`,
  `0.00217323`). The complete frame and receipt manifest is
  `pass2/temporal-stability-v3/taa2-temporal-stability.json`.

### Rotated control-set pins

**VERIFIED:** Re-measuring `graphicsControlSetHashes()` from the final live
registry produced the following values. The TAA Pass 2 source changes do not
alter the profile control objects, so the measured values correctly remain the
rotated pins already enforced by `src/graphics-profile-contract.test.ts` and
`docs/GRAPHICS_PROFILES_2026-09-03.md`.

| Profile | Measured control-set hash |
|---|---:|
| PERFORMANCE | `e38ede29` |
| BALANCED | `9d461537` |
| QUALITY (`high`) | `2f8b5453` |
| MAX | `b71a9c4e` |

### Pass 2 gates

- **VERIFIED:** `npx tsc --noEmit`.
- **VERIFIED:** The requested post/TAA/profile/precompile/pipeline/size
  Vitest command and its explicit PowerShell file expansion passed, including
  the lane tests.
- **VERIFIED:** `npm run build` completed on the final source.
- **VERIFIED:** The native WebGPU QUALITY perf rung passed at both poses with
  the in-combat creation fence at 0. TAA-off was measured as the matched cost
  control, not used to change a threshold.
- **OPEN:** The repository preflight's harness slug/branch naming guard still
  rejects the user-required `.../claude/taa-resolve` branch, and the full AKP
  audit reports unrelated harness rows. Neither changes this lane's source,
  tests, or browser evidence; no release or deployment was performed.

## Pass 2 decision

**VERIFIED / ACCEPTED:** TAA is accepted for the QUALITY and MAX profile
topologies. Every TAA-on pipeline observed in the final census is admitted
before combat, the idle and moving creation tripwires are both 0, the QUALITY
moving delta is -5.2 ms against the unchanged +1.0 ms falsifier, and both
decision stations show lower temporal shimmer. No release or deployment was
performed.
