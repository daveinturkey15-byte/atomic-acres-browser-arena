# Lane AS — Farcrysis from PREVIEW to a real arena (block 2, 2026-09-03)

Orchestrator: Claude Code (Fable 5.1). Ledger HF-423 follow-up. Base: the PASS 89
integration head. Worktree `C:\Users\david\projects\aa-claude-farcrysis2`, branch
`contrib/dave-gaming-pc/claude/farcrysis-real-arena`. Read Lane R's report and
verdict first (`C:\Users\david\projects\aa-claude-farcrysis\artifacts\`), the HF-423
ledger rows, and `docs/evidence/pass88/lane-r/farcrysis-admission.json`.

## Jobs, in order, each measured before and after
1. **Combat frame time** (the reason the card is PREVIEW): 1.34-1.89x atomic-acres.
   Lever: 224 distinct materials vs 110. Collapse Farcrysis's materials onto the
   shared vocabulary (identical-parameter props share one NodeMaterial; permutation
   drivers that differ for no visual reason are unified); instanced foliage where
   it is not. Target <= 1.3x atomic-acres in-combat median on Quality at 1440p
   headless, tripwire 0, admission ratio still <= 1.60 (re-collect the receipt).
2. **The core building**: authored interior floor and enclosing walls on its
   exposed sides (forging review: no missing interior roof/floor), one practical
   light that carries a `light` only if the frame budget above is met (else an
   emissive fixture per the interior-lighting skill), review camera inside.
3. **The 25 genuine runtime eye-clearance rows** (tower platform, core catwalk,
   vantage-02 bases, cave-arch crown, palm trunks): fix geometry or accept
   explicitly in the ledger's `accepted` block with reasons; never re-baseline.
4. **The owner's vegetation technique** (Lane R brief Job 4): 3-blade Bezier
   tufts with LOD and an SSS term, instanced; ridged-FBM backdrop - only within
   the frame budget from job 1, with before/after captures from the judgeset.
5. Stage-1 eye seat on heightfields is an INSTRUMENT defect (373 of 441 rows):
   fix `scripts/qa/sweep-eye-clearance-spots.ts` to seat the eye on the arena's
   terrain authority (all heightfield arenas benefit), re-measure, and lower the
   ceiling to the measured value.
6. Gates: tsc; focused vitest; parity audits; spawn-quality; boot smoke headless;
   60 s solo run zero errors; the receipt. Full vitest once at the end.
Machine rules as every lane. Report with claim-states; keep PREVIEW in the label
unless job 1's target is met - the flip is the orchestrator's call.
