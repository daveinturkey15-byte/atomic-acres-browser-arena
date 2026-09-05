# Pass 95 cold-path-2 evidence

## Scope and status

- [VERIFIED] Worktree: `C:\Users\david\projects\aa-claude-coldpath2`.
- [VERIFIED] Branch: `contrib/dave-gaming-pc/claude/cold-path-2`.
- [VERIFIED] Candidate base: `452d7aba27ae2cf8ed793cc58d2fb03a6906fa4c`.
- [VERIFIED] Final pushed head at report time: `f7ce7dff`.
- [VERIFIED] No threshold, patience, fence, tripwire, or budget was changed.
- [OPEN] The exact cold-admission smoke did not reach green, so this is not a ship recommendation.

The exact browser command used was the candidate smoke with `PASS73_NATIVE_WEBGPU=1` and
`PASS65_COLD_ADMISSION_PORT=4189`. Port `4300` was not used or modified.

## Reproduction and root cause

- [VERIFIED] The `nuketown2-accuracy-3` lane was re-applied in its own commit:
  `dd0cb7af17c7f0f84178fe47b492872ebef5eb83`.
- [VERIFIED] The `nuketown2-interiors-accuracy` lane was re-applied in its own commit:
  `8a70a3b6`.
- [VERIFIED] A direct `buildNuketown2(new THREE.Scene())` audit after both lane merges found
  `meshes=1129 bad=[]`; the lane arena meshes had non-empty position attributes.
- [VERIFIED] The shared candidate-side invalid geometry was the invisible waterless-arena
  placeholder named `Pass 64 TSL perimeter water`, constructed by `makeWater()` in
  `src/rendering/pass64-tsl-scene.ts` with a bare `THREE.BufferGeometry()`.
- [VERIFIED] Three.js r185 `AttributeNode` requires the geometry vertex attribute named
  `position`; the placeholder had none and was still traversed by exact ScenePass compilation.
- [VERIFIED] The correction is candidate-side: the inert placeholder now uses
  `new THREE.PlaneGeometry(1, 1)`, and the TSL scene test asserts a populated position
  attribute. No lane geometry was patched to hide the failure.
- [MEASURED] The post-fix smoke receipts contained no `THREE.AttributeNode` error and
  reported `uncapturedErrors=0`, `actualBackend=webgpu`, and TSL diagnostic count `0`.
- [OPEN] A full browser error stack for the original `AttributeNode` warning was not captured
  in a receipt: the accuracy-3 run captured no page error, and the interiors run reached the
  unchanged 12-second queue fence before the fatal surfaced. The geometry/factory attribution
  above is source-verified and the placeholder regression test is green.

## Transition profile: candidate baseline

Candidate-7 baseline receipt (`452d7aba`) measured a 26,283.1 ms transition.

| Phase | ms |
|---|---:|
| shared-gameplay-assets | 3,317.7 |
| previous-webgpu-fence | 0.2 |
| arena-construction | 465.9 |
| interactive-world-construction | 4.7 |
| physics-construction | 110.6 |
| authority-commit | 1.3 |
| visual-definition | 9,484.1 |
| quality-presentation | 1.4 |
| material-tuning | 70.0 |
| art-texture-settle | 0.3 |
| weapon-catalog-prewarm | 2,984.2 |
| presentation-batching | 74.0 |
| match-authority-reset | 5.2 |
| prewarm-batched-effects | 0.2 |
| coverage-submit-fence | 9,763.0 |
| retire-previous-arenas | 0.1 |
| commit-bookkeeping | 0.2 |
| finalize | 0.0 |
| **transition total** | **26,283.1** |

- [MEASURED] The baseline offenders were `visual-definition` (9,484.1 ms),
  `coverage-submit-fence` (9,763.0 ms), `shared-gameplay-assets` (3,317.7 ms), and
  `weapon-catalog-prewarm` (2,984.2 ms).
- [MEASURED] The baseline menu profile was 4,072.5 ms: shared-assets 277.4,
  first-person-catalog 2,377.8, bot-weapon-vocabulary 1,632.1, and world-drop-corpus
  3,896.6 ms. These CPU preparations were already scheduled through the menu coordinator,
  but the smoke could escalate them into the deployment transition before completion.

## Transition profile: lane-2 reproduction

The interiors reproduction (`8a70a3b6`) independently showed the same cold-path shape before
the final source fixes:

| Phase | ms |
|---|---:|
| shared-gameplay-assets | 7,327.2 |
| previous-webgpu-fence | 0.4 |
| arena-construction | 726.8 |
| interactive-world-construction | 5.7 |
| physics-construction | 328.1 |
| authority-commit | 1.7 |
| visual-definition | 16,192.7 |
| rollback | 1.3 |
| finalize | 2,807.7 |
| **transition total** | **27,391.6** |

- [MEASURED] The lane-2 offenders were `visual-definition` at 16,192.7 ms and the
  `shared-gameplay-assets` wait at 7,327.2 ms; the run then hit the existing queue fence.
- [MEASURED] Its menu profile was 8,948.5 ms: shared-assets 6,778.0,
  first-person-catalog 5,909.7, bot-weapon-vocabulary 4,479.9, and world-drop-corpus
  8,650.9 ms as reported by the instrumented overlapping preparation profile.

## Transition profile: placeholder fix plus hoisted static batching

After the placeholder correction and hoisting static batching before the first cold WebGPU
warm frame, the receipt measured 23,651.4 ms and failed only on the unchanged queue fence:

| Phase | ms |
|---|---:|
| shared-gameplay-assets | 2,946.0 |
| previous-webgpu-fence | 0.2 |
| arena-construction | 724.4 |
| interactive-world-construction | 6.3 |
| physics-construction | 278.9 |
| authority-commit | 1.7 |
| presentation-batching | 67.2 |
| visual-definition | 15,619.8 |
| rollback | 0.3 |
| finalize | 4,006.6 |
| **transition total** | **23,651.4** |

- [MEASURED] The early batching change reduced renderer-reported fenced draws from the
  lane-2 failure's 713 to 190, but did not make the 12,000 ms queue completion fence green.
- [MEASURED] This run reported `visual-definition=15,619.8 ms`; the observed queue fence
  failure was `WebGPU queue completion exceeded 12000 ms`, with no uncaptured WebGPU error.
- [OPEN] The remaining cold-admission work is the `visual-definition` /
  `coverage-submit-fence` path and its GPU submission cost. It remains above the preserved
  10,000 ms cold-transition budget; no timeout or threshold was widened.

## Implemented commits

- [VERIFIED] `dd0cb7af` — reapply `nuketown2-accuracy-3` for reproduction.
- [VERIFIED] `8a70a3b6` — reapply `nuketown2-interiors-accuracy` for reproduction.
- [VERIFIED] `0977fb0b` — give inactive water placeholders a vertex contract.
- [VERIFIED] `5ef8f2b1` — batch static arena meshes before the warm frame.
- [VERIFIED] `6762076e` — repair the accuracy-lane fidelity test merge artifact.
- [VERIFIED] Later exploratory prewarm/material/menu changes were reverted or narrowed; the
  final tree retains the measured `farcrysis`-only cold precompile boundary and authored Nuke
  static materials.

## Gates

- [VERIFIED] `npx tsc --noEmit` — passed.
- [VERIFIED] `npx tsx scripts/qa/find-coplanar-pairs.ts` — passed; HOUSE-INTERIOR 0,
  STREET 0, SAME-MATERIAL-VISIBLE 0, different-material/no-offset 0,
  FENCED 274, CONTACT 4, SAME-MATERIAL benign 10, boxes 986, pairs<=0.03m 288.
- [VERIFIED] Required focused Vitest set — 8 files passed, 94 tests passed.
- [VERIFIED] Required contract Vitest set — 3 files passed, 22 tests passed.
- [VERIFIED] `src/legacy-main-size-ratchet.test.ts` — 5 tests passed; generated legacy-main
  line count 37,395, under the 37,396 ceiling.
- [VERIFIED] `npm run build` — passed; 568 modules transformed.
- [OPEN] `PASS73_NATIVE_WEBGPU=1 npm run qa:stock-boot` was not run after the cold smoke
  failures because the two-hour hard stop was reached and only one headless browser chain on
  port 4189 was permitted. No claim of stock-boot coverage is made.
- [OPEN] `npm run pipeline:preflight -- --machine dave-gaming-pc --harness Codex` is blocked
  by the repository contract: uppercase `Codex` is rejected as a non-slug, while lowercase
  `codex` then rejects the user-mandated `contrib/dave-gaming-pc/claude/cold-path-2` branch.

## Final disposition

- [VERIFIED] Branch was pushed after each implementation commit using the requested GitHub
  credential-helper form and the final worktree is clean and aligned with origin.
- [OPEN] Cold-admission smoke remains red on the preserved GPU fence and visual-definition
  workload; the lane is not ready for integration as a green Pass 95 fix.
