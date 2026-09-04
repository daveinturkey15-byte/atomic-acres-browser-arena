# HF-472 TAA resolve report

Status: **STOPPED / REJECTED by the requested falsifier.** Every consequential
line below is labelled `VERIFIED`, `CLAIMED`, or `OPEN`.

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

## Decision

**FAILED / STOPPED:** The code is mechanically wired and documented, but this
candidate must not be treated as accepted QUALITY/MAX TAA until the +1.0 ms
falsifier and the in-combat pipeline fence both pass. No release or deployment
was performed.
