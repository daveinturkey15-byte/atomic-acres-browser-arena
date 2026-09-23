# The blind A/B critic

**Lane: blind A/B critic + TAA/CSM evaluation, 2026-09-04 (HF-486 / HF-503).**
Contract `blind-ab-v1`, file `scripts/loop/blind-ab.mjs`. Process-only: no
runtime, no release-shell, no gate or threshold outside `scripts/loop/` is
touched.

Claim-states: **VERIFIED** = I ran it in this session and quote what it said;
**CLAIMED** = a source says it, unconfirmed here; **OPEN** = not settled,
falsifier stated.

---

## Why this exists

Every critic this repository has run so far knew which frame was ours. The
Gemini reference critics under `docs/evidence/pass94/gemini-reference-critic/`
were handed a directory literally named `candidate5` and asked to score it;
the Muse admission trial was handed `reference.png` and `capture-1.png`. A
critic that knows the home team grades the home team - it explains the frame
it was told is the build, and it is polite to it.

mshumer's Claude-of-Duty (ingestion brief row 56, MIT, read over `gh api`
only) runs its critic **blind**: two frames, no labels, "which is better and
why". That is the one method atom in the HF-481 batch our store lacked, and
HF-472 says re-implement, never copy. This file is the re-implementation
against our own loop runner - it reuses the probe receipt, the stamp, the OMP
adapters and the JSON extraction from `scripts/loop/`, and adds exactly the
blinding.

## What one round does

For every station present in BOTH capture directories:

1. **Side assignment.** `sideAssignment({seed, station})` hashes
   `blind-ab-v1|seed|station` and the first byte's parity puts candidate A on
   the left or the right. It is derived, never passed: there is no argument
   that chooses a side, so a builder cannot put the candidate on the side a
   model happens to favour. The same seed reproduces the same run.
2. **Stripping.** Both frames are re-encoded by sharp into a fresh PNG under a
   neutral name (`left.png`, `right.png`) in a fresh directory that becomes
   the critic route's isolated cwd. sharp writes no EXIF, XMP, ICC, IPTC or
   text chunk unless asked; the harness reads the OUTPUT's metadata back and
   records `leakedFields` per side, and the unit test plants an EXIF
   description reading `candidate5 pass94 build` and asserts it is gone from
   the bytes. References are copied as `reference-1..n.<ext>`.
3. **Two probe receipts.** A four-character token from the loop's 15-glyph
   alphabet is stamped into the bottom-right corner of EACH frame (different
   token per side, bound to that side's source sha256). The critic's first
   instruction is to report both. A misread on either side makes the round
   INVALID and it carries **no vote** - a preference formed over one frame is
   not a comparison.
4. **The question.** "Which of LEFT and RIGHT is closer to the reference set,
   and why?" scored as agreement on structure, proportion, material read and
   value relationships; resolution, sharpness, the corner box and image order
   are excluded by instruction; `tie` is an admitted answer. Every claim must
   name a 3x3 region. The instruction carries no label, path, seed or history
   (asserted by test).
5. **Unblinding** happens only after the JSON is parsed and validated:
   `unblind(winnerSide, assignment)` maps `left|right|tie` to `A|B|tie`.
6. **Aggregation.** Wins, ties, invalids, win-rate over decisive votes,
   win-rate with ties as half, a Wilson 95% interval, and a claim-state the
   aggregator derives itself: `VERIFIED`, `VERIFIED-UNDERPOWERED` (fewer than
   5 decisive votes), `INVALID` (no valid round) or `OPEN` (no rounds). The
   table also says in words whether the interval excludes 50%.

Receipt: `<out>/results.json` (every side assignment, both probe tokens
expected and answered, source and shown sha256 per side, reference sha256s,
route, model, elapsed), `<out>/WIN-RATE.md`, and per station
`instruction.txt`, `critic-raw.txt`, `verdict.json` and the `blind/` directory
exactly as the critic saw it.

## Running it

```bash
# Unit tests: fixture critic, synthetic frames, no network, no GPU
node --test scripts/loop/blind-ab.test.mjs

# Dry run on real captures with recorded critics (one of which must be refused)
node scripts/loop/blind-ab.mjs --a-dir <capturesA> --a-label candidate4b \
  --b-dir <capturesB> --b-label candidate5 --references <img,img> \
  --critic fixture --fixture-dir scripts/loop/fixtures/blind-ab --out artifacts/blind-ab/dry-run

# The real thing: Muse Spark through OMP, one call at a time
node scripts/loop/blind-ab.mjs --a-dir ... --b-dir ... --references <img,img,img,img> \
  --critic omp-muse --seed <run-id> --out docs/evidence/pass96/blind-ab-critic/<run>

# Capture both sides first (installed Chrome headless, ONE browser at a time,
# reuses scripts/qa/capture-arena-viewpoints.mjs and its authored review cameras)
node scripts/loop/blind-ab.mjs --capture-a-url http://127.0.0.1:4214 --capture-b-url http://127.0.0.1:4214 \
  --arena nuketown2 --stations nuketown2-garage,nuketown2-street-centre --a-label before --b-label after \
  --references <img> --critic omp-muse --out artifacts/blind-ab/<run>
```

`--critic` admits `omp-muse`, `omp-gemini` and `fixture` only. `qwen-local` is
refused in code: the loop README records it reading a probe in isolation but
not inside a critic task, and a critic that cannot prove it looked cannot
vote.

## The reference-tier note, stated rather than hidden

The loop's reference-set contract says a T1 first-party game artefact is
**measurement only** and must never be handed to a critic as "make it look
like this". The BO2-2025 images under `docs/references/nuketown-2025/img/` in
the research worktree are T1. This harness hands them to the critic anyway -
with the question "which of these two is CLOSER to them", which is a
measurement of agreement between two of our own frames, not an instruction
to move the art toward the artefact. The critic cannot propose a change; it
can only rank. That is the line: **T1 may anchor a ranking, never a target.**
If the owner decides that line is too fine, `--references` accepts any
T2/T3 image and nothing else changes. Recorded as a policy call, not
smuggled.

## What it refuses, in code

- A critic that misreads either probe: no vote (`probe-mismatch-left|right|both`).
- A winner outside `left|right|tie`, a confidence outside 0..1, a `why`
  shorter than a sentence, a decisive answer with an empty "closer" list:
  `schema-invalid`, no vote.
- A route that fails or times out: `route-failed`, no vote, transport detail kept.
- A run with no reference image ("an A/B with no reference is a taste poll").
- A critic that is not admitted.
- A station missing from either side: `capture-missing`, counted, no vote.

There is no flag to re-roll a station, choose a side, or drop an invalid
round from the table.

## What it does not do yet (OPEN)

1. **One critic per station.** Muse costs about a minute per call; a
   three-lens panel (A/B/C as in the loop) is a `--critics` loop away and
   was not spent in this lane's box.
2. **Position swap.** A stronger design shows every pair twice with sides
   swapped and counts only consistent answers. Costs 2x quota; the seed
   already makes the single pass reproducible.
3. **Tier-0 pre-check.** The loop's SSIM/edge-IoU pre-check could go in the
   prompt as it does for the scored loop; for a same-camera A/B the numbers
   would say only how DIFFERENT the two frames are, which is still useful as
   a "these are identical, expect a tie" guard.
4. **Capture step untested against two live builds** in this session: both
   sides were judged from the on-disk PASS 94 captures (see the evidence
   REPORT for why).
