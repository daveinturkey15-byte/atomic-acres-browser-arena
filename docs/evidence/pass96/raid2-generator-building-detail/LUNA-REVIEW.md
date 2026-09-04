# LUNA review — raid2-generator-building-detail

Revision reviewed: `4d24d7c68bbd28ba3b56ce9235d2dffaebff627c`
Base: `origin/contrib/dave-gaming-pc/claude/raid2-slice-2` (`5687c493`)
Worktree: `C:\Users\david\projects\aa-muse-genbuild`
Status at review: clean; one commit beyond base.

## Review 1

Verdict: **DO-NOT-SHIP**

Reasons:

1. The brief requires presentation detail instanced per class. This branch
   creates hundreds of ordinary `Mesh` source boxes and relies on the existing
   merge batcher; it explicitly documents that `InstancedMesh` is not used.
2. The advertised `geometryDetail` off switch is not connected to the arena:
   `buildRaid2()` invokes `generateRaid2FacadeDetail(builder, m)` with the
   default `full` level, so selecting reduced geometry does not suppress the
   stage at runtime.
3. Independent verification is incomplete: the focused facade suite passed
   1 file / 8 tests and `find-coplanar-pairs.ts` reported 0 different-material
   findings, but `npx --no-install tsc --noEmit` timed out and the combined
   named gate did not complete. The report's TODOs retain these blockers.

Standing-rule checks: no changed existing test or ceiling was lowered; no new
pipeline was added; the legacy-main file is untouched; generation is outside
the frame loop; no vendored HF-472 implementation was found. The focused test
and coplanar result are positive evidence only for those narrower contracts,
not a ship approval.

Required follow-up is recorded in `REPORT.md` under `Review TODOs`. No product
code was changed by Luna; this review document is the only added evidence.

## Review 2

Revision reviewed: `0ac7a07f`, based on `d5c9d887` (`raid2-slice-2`). The worktree was clean before review and contains commits beyond its base.

Verdict: **SHIP-WITH-FIXES**

Reasons:

1. VERIFIED — independent gates passed: `npx tsc --noEmit` exit 0; 10 relevant test files and 129 tests passed, including the facade, slice, fidelity, collider, graphics, pipeline, legacy ratchet, prewarm, and walkable gates; coplanar scan reported zero different-material findings.
2. VERIFIED — the earlier blocking findings are fixed: five instanced trim classes, reduced-mode suppression threaded through `buildRaid2`, no new pipeline, no new settings stage, no per-frame update/allocation path, and the existing legacy-main ceiling remains green. The diff adds no weakened assertion or lowered threshold.
3. OPEN — native-WebGPU visual captures, cold-session timing, and a quiet-machine runtime cost receipt remain absent. The report now records these as TODOs; source estimates and GPU-free tests are not substitutes.

No additional product-code fix was certain and necessary in this pass.
