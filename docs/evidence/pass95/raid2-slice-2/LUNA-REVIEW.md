# Luna review — RAID2 slice 2

## Review 1

- **Revision:** `5687c4932344f51440371fe0c098fb31cead3291`
- **Branch:** `contrib/dave-gaming-pc/claude/raid2-slice-2`
- **Base:** `origin/contrib/dave-gaming-pc/claude/raid2-rebuild`
- **Worktree:** clean at review start; only this worktree was inspected.
- **Verdict:** **DO-NOT-SHIP**

Reasons:

1. **OPEN / blocking:** the exact `npx tsc --noEmit` gate timed out after 180 s
   without output, and the exact six-file `npx vitest run` gate also timed out
   after 180 s. A local-binary retry of TypeScript and a focused slice-test
   retry likewise timed out; no green independent gate is established.
2. **OPEN / blocking:** `npx tsx scripts/qa/find-coplanar-pairs.ts` exited 1
   without output in this session. The report's quoted RAID2 coplanar result is
   therefore an acceptance claim, not Luna verification; that script's source
   is also scoped to `nuketown2`, so a RAID2-specific instrument is still needed
   for the lane claim.
3. **OPEN / blocking:** both the report and new module cite
   `docs/research/2026-09-04/RAID-rebuild-plan.md`, but that path is absent from
   the reviewed checkout. The lane's cell/ledger scope cannot be independently
   checked from the frozen tree. Visual judgesets and MP arena-sync re-measure
   are also explicitly unexecuted.

### Independent checks and standing-rule review

- **VERIFIED:** `powercfg /getactivescheme` reports High performance
  (`8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c`).
- **VERIFIED:** Codex adoption check passes. The full AKP audit emits no failure
  naming Codex on `dave-gaming-pc`; it does emit unrelated failures for other
  harnesses. Pull-only AKP sync timed out and was not treated as successful.
- **VERIFIED:** the frozen diff is limited to the arena hook, new dressing
  module, new contract test, and lane report. No existing test file or existing
  ceiling was lowered or raised in the diff; `git diff --check` is clean.
- **VERIFIED:** the new module uses reused forged material objects, no new
  renderer/pipeline code, and no frame-loop or per-frame allocation path.
  Direct `THREE.Mesh` geometry allocation occurs during arena construction only.
- **VERIFIED:** no roster or vendored HF-472 implementation was introduced in
  the four-file diff. No HF-472 symbol was present in the inspected source/docs
  search, so HF-472 ownership itself remains **OPEN** rather than claimed.
- **OPEN:** no browser, GPU, build, install, deploy, preview, or full Vitest
  suite was run, per the review constraints.

### Small correction made

The report said “all five name families,” while `src/raid2-slice2.test.ts`
defines four tested name-prefix families. The report now says “all four tested
name-prefix families.” Larger blockers are recorded as TODOs in `REPORT.md`.

### Product-tree status

The review edits are documentation-only and are intentionally committed on the
branch for handoff. Product source was not changed by Luna.

## Review 2

Revision reviewed: `a702f748f61d04878f0d598eda1edb4e1500f8bd`
Base: `origin/contrib/dave-gaming-pc/claude/raid2-rebuild` (`76188e57`)
Status: clean; current head includes the Muse fix/evidence commits.

Verdict: **DO-NOT-SHIP**

1. The prior gate blocker is fixed by independent evidence: `npx --no-install
   tsc --noEmit --pretty false` exited 0; the six named Vitest files passed 6
   files / 194 tests; and the required general coplanar script reported 0
   different-material findings with exit 0.
2. The RAID2-specific coplanar fence is present but not green: it exits 1 with
   19 different-material/no-offset pairs. The report attributes them to
   pre-existing base-arena meeting tops and confirms zero slice-2 dressing
   rows, but a failing arena fence remains an acceptance blocker; its source
   must not be weakened or hidden behind the general Nuketown-only instrument.
3. The visual judgesets and MP arena-sync re-measure remain OPEN, and no
   browser/GPU evidence can be produced under this review boundary. The report
   retains the larger base-pair, visual, and MP TODOs; no speculative product
   fix was made.

Standing-rule checks: no test/threshold was weakened, no new pipeline or
roster was added, reused forged materials remain uniform/shared, legacy-main is
untouched, and no per-frame allocation or vendored HF-472 implementation was
found. No product code was changed by Luna in Review 2.
