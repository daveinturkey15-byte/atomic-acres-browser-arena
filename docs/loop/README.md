# The reference-grounded loop runner

**Lane I3, 2026-09-04.** Implements the controller half of
`docs/research/2026-09-04/R2-reference-grounded-loop-design.md` (that file lives
in the research worktree). Everything here is **process-only**: no runtime, no
release-shell, no arena source, no gate and no threshold outside
`scripts/loop/` and `docs/references/` is touched.

Claim-states are marked **VERIFIED** (I ran it in this session and quote what it
said), **CLAIMED** (a source says it, unconfirmed here) or **OPEN**.

---

## The problem this exists for

**VERIFIED, from the overnight tiptop lane's own artefacts:** three fresh-context
critics scored headless captures on a 100-point rubric across six cycles, moving
a subject from 77/100 to 97/100 — and not one line of any critic file names a
reference. The critics scored a rubric held in their own heads. A rubric-only
critic converges on *the absence of things it can name*, and once it can no
longer name a missing thing, it awards 97.

**VERIFIED:** the controller's entire persistent state was two text files —
`artifacts/ba-critic.txt` containing `C`, and `artifacts/ba-cycle.txt`
containing `FINAL`. From that state a resumed run cannot say what cycle 5
scored, whether the score moved, how much budget is left, or which correction
was applied. The lane brief's own plateau rule could not have been evaluated
from it.

So this runner adds exactly two things and rebuilds the controller around them:

1. **An anchor.** No score without a reference pair. A capture with no matched
   reference gets a `rubric-only` verdict that cannot reach the exit gate.
2. **A receipt.** A round is only a score if the critic can prove it saw pixels.

**The point of the lane is the anchor, not the number.** A prettier score is not
the deliverable; a score that *can go down because a reference says so* is. The
first real Gemini cycle scored **37/100 with all four rows below gate** on a
pair the rubric-only route would have had nothing to say about.

---

## Layout

```
scripts/loop/
  perceptual.mjs        pure maths: SSIM, Sobel, Otsu, IoU, EMD, regions. No deps at all.
  image.mjs             the only module that imports sharp: decode, stamp, composite
  probe.mjs             the probe token: derivation, 5x7 glyph font, verification
  precheck.mjs          tier 0 CLI + API, contract reference-precheck-v1
  reference-set.mjs     the manifest format and its validator, contract reference-set-v1
  critic-schema.mjs     the critic response schema, contract reference-critic-v1
  critic-prompt.mjs     builds the critic message, stamps the probe
  journal.mjs           JSONL journal + the mechanical stop rules
  run-loop.mjs          the runner, contract reference-loop-v1
  adapters/             one interface, four routes: fixture, qwen-local, omp-gemini, codex
  fixtures/dry-run/     recorded critics, including two that MUST be refused
  *.test.mjs            node --test, 75 tests, no network and no GPU

docs/references/<subject>/manifest.json   committed: provenance + measurements
artifacts/loop/<subject>/journal.jsonl    append-only journal (artifacts/ is gitignored)
artifacts/loop/<subject>/state.json       resumable head
artifacts/loop/<subject>/cycle-N/         precheck JSON, composite, per-critic verdicts
```

## Running it

```bash
# What would happen, without doing anything
node scripts/loop/run-loop.mjs --subject chopper-gunner-cockpit-1080 --print-plan

# Full plumbing, no quota, no GPU: recorded critics including two bad ones
node scripts/loop/run-loop.mjs --subject chopper-gunner-cockpit-1080 --dry-run \
  --fixture-dir scripts/loop/fixtures/dry-run --critics A,B,C

# One real cycle
node scripts/loop/run-loop.mjs --subject chopper-gunner-cockpit-1080 \
  --critic-adapter omp-gemini --critics A

# Tier 0 on its own
node scripts/loop/precheck.mjs --reference <img> --capture <img> \
  --out precheck.json --composite composite.png

node --test scripts/loop/*.test.mjs
```

---

## Tier 0 — the mechanical pre-check

Runs before any model, costs no quota, takes under a second. Its JSON goes to
the critic **alongside** the images, so "looks fine" cannot outvote a measured
0.30 edge IoU.

| Metric | Direction | What it survives |
|---|---|---|
| `ssim` (8x8 windows on luma) | higher better | structure; not exposure |
| `edgeIoU` (Sobel + per-side Otsu) | higher better | a lighting or colour difference — this is the metric that still means something against a photograph |
| `valueEMD` (32 luma bins) | **lower** better | catches "our version is one flat value" without judging hue |
| `silhouetteIoU` (alpha, props only) | higher better | the cheapest "is it the right shape at all" falsifier |

All four are computed globally and per region (3x3 by default, or the reference
set's named regions), because a single global score cannot produce a bounded
correction — you need to know *where*.

**The honest limit, and it is written into the file header too.** None of these
is a fidelity score. A reference photograph and a render never share a camera,
so an absolute SSIM against a photo is meaningless on its own. They are good for
three things: direction of travel across cycles of the same pair, region
localisation, and a plateau signal that does not depend on a model's
self-report. **Anyone who quotes "78% fidelity" out of this file has misread
it.**

**VERIFIED:** a capture against itself returns `ssim 1.0, edgeIoU 1.0,
valueEMD 0`. The committed pair returns `ssim 0.8105, edgeIoU 0.5343,
valueEMD 0.1082`, worst region `r2c2` at edge IoU `0.3031` — the bottom-right,
which is exactly where that pair's cockpit-framing and HUD change lives.

---

## The probe-token receipt

Before each critic call the runner stamps a deterministic four-character token
into a corner patch of a **copy** of the capture. The critic's first instruction
is to report it. Wrong or missing ⇒ the round is **INVALID**, journalled as
invalid, and **carries no total at all** — not even a recorded one, because a
number left beside an `invalidReason` is a number somebody quotes six weeks
later without reading the reason.

Two design faults were found by using it, and both are worth knowing:

1. **VERIFIED — a hash pattern is not a code.** The first version rendered each
   character as a hash-derived block pattern. Deterministic, composited
   correctly, and completely useless: a model has no way to decode an arbitrary
   bit pattern into a character, so every round would have been INVALID. A
   receipt that always says "did not look" proves nothing. It is now a 5x7
   bitmap font, black on white with a keyline, sized as a fraction of the frame
   so it survives the model's own downscale.
2. **VERIFIED — the alphabet had to shrink.** With `ACDEFGHJKMNPQRTUVWXY3467`
   the local route read a stamped `QPYU` back as `QFYU`: P and F differ by two
   pixels of bowl at 5x7. The alphabet is now the 15 shapes `ACDEHJKMNRTUWXY`,
   chosen to stay distinct after a downscale. **The fix is always the alphabet,
   never `verifyProbe`** — loosening the check turns the receipt back into the
   thing it replaced.

---

## The critic contract

Four rows, 25 points each, gate at 85% (21.25). Every row is scored as
**agreement with a named reference**, not as a quality opinion, and every row
must cite the regions it is talking about:

- `geometry-match` — is the structure present, and is it the reference's structure?
- `proportion` — do the ratios agree? Reconcile with the per-region edge IoU.
- `material-read` — same *material class* at this distance? Not "is it pretty".
- `lighting-match` — do the value relationships agree? Absolute colour
  temperature is excluded wherever the reference set says so, so a critic cannot
  quietly drag the art direction toward a photograph's grade.

Refusals, all enforced in code:

- **No regions ⇒ rejected.** A finding with no region cannot be bounded.
- **A failing row with no single bounded correction ⇒ rejected.**
- **A missing row ⇒ rejected**, rather than silently scored out of three.
- **Empty `notMatchable` ⇒ recorded as over-claiming.** No render and no
  reference agree on everything.
- **Tier 0 blocks tier 1.** A critic scoring `geometry-match` ≥ 22/25 on a region
  whose measured edge IoU is < 0.4 is `tier0-contradiction` and INVALID, even
  with a correct probe. A critic that disagrees with a measurement without
  saying why is not evidence.

---

## The reference-set format

One `manifest.json` per subject under `docs/references/`, contract
`reference-set-v1`. The image cache is **not** committed (`artifacts/` is
gitignored); the committed artefact is provenance and numbers.

| Tier | What qualifies | How it may be used |
|---|---|---|
| **T1** first-party artefact | the publisher's own image/drawing/data | **measurement only** |
| **T2** own capture | our photograph, or our own approved build | measurable, targetable |
| **T3** permissive third party | CC0/CC-BY/PD, licence read and dated | measurable, targetable |
| **T4** reported | prose, a search summary, an indirect fetch | corroboration only |

> **Measure a first-party game artefact for geometry and proportion. Never hand
> a commercial game's art to a critic as "make it look like this."** For look,
> the bar is a T2/T3 photograph of the real-world thing, or our own approved
> build. That is what lets the loop be reference-grounded *and* original.

Enforced by the validator: a source with no resolving fetch receipt is not a
source (status, bytes, **served** content-type, sha256, timestamp — the served
type is recorded, never inferred from the extension); `licence: UNKNOWN` is
rejected outright rather than warned about; `evidenceFor` and `notUsableFor` are
mandatory; a load-bearing measurement needs a second independent source and a
published agreement percentage, because one source is a hypothesis;
`criticTargets` is an allow-list and refuses to target a T1 or T4 source.

The committed subject `chopper-gunner-cockpit-1080` is deliberately **T2 on both
sides** — two of our own committed build frames at the same camera. It carries
no licence question and it makes a critic's findings checkable by a human. It
is also honest about what it cannot do: it is a **regression anchor, not an
aspiration anchor**, and it cannot raise the visual bar. Raising the bar needs a
photograph, which is an owner decision.

---

## The journal and the stop rules

One JSON object per line, so a run killed mid-write is still readable up to the
last complete line. Every stop rule is a pure function of that history:

| State | Rule |
|---|---|
| `exit` | every row at gate on ≥ 2 valid critics for 2 consecutive cycles, no blocking regression, tier 0 not worsening |
| `invalid-streak` | 2 consecutive cycles with < 2 valid critics ⇒ **the harness is broken, not the build**. Diagnosed *before* plateau, because a run with no scores has nothing to plateau |
| `budget` | cycle ceiling or wall-clock ceiling, whichever first |
| `oscillation` | the same largest-gap region at N and N+2 with a different one at N+1 ⇒ two corrections are fighting; ask a human |
| `plateau` | mean total gains < 1.0 over 2 cycles ⇒ escalate **once** to a structural pass (`refine-spec`, change the spec not the code), then stop |

`state.json` holds only the head, so a resume replays from the journal.

## What the runner refuses, in code

There is deliberately **no flag** to lower a gate, edit or drop a judgeset
camera, re-roll a critic until it agrees, use the rationed Codex route for a
routine cycle, or show a critic a source the reference set did not allow-list. A
test asserts that the runner reads no argument matching
`threshold|gate|retry|reroll|camera|judgeset|force`. A cycle also ends at a
**decision**, never at a rebuild: the build step is owned elsewhere, so the
runner can never both propose and apply a change to the thing it is grading.

---

## Adapters, and what each route is actually worth

One interface: `id`, `kind`, `describe()`, `available()`, `critique()`. The
runner never learns which model it is talking to, and an adapter never decides
whether a critic passed — an adapter that could grade itself would be the same
failure this loop exists to close. Every adapter scans its own output for
failure markers, because **exit 0 is not success**.

| Route | Status |
|---|---|
| `fixture` | **VERIFIED.** Dry run: full plumbing, no quota, no GPU. Includes fixtures that must be refused. |
| `omp-gemini` | **VERIFIED as a critic route, after four fixes.** Final cycle: expected probe `WNHA`, answered `WNHA`, valid, **37/100**, all four rows below gate, largest gap `geometry-match` at `r1c1`, 24.7 s. |
| `qwen-local` | **VERIFIED as reachable and multimodal; NOT admitted as a critic.** It read a probe correctly in isolation (`WWQQ`) but inside a full four-row critic task it answered `H4A` against `WNHA` — including a character not in the alphabet. Correctly refused. Free and quota-less, so it stays as the pre-critic triage route (is the frame black, did the arena load). |
| `codex` | Registered `kind: 'text'` and **rationed**: contract conflicts and final pre-review only. It gets no images, and asking for one returns an error rather than prose that reads like a visual judgement. |

### Four fixes the OMP route needed, each one a trap for the next lane

1. **stdin must be ended.** With an open stdin pipe the CLI sits in "Reading
   prompt from piped stdin (waiting for EOF)" forever, and the liveness probe
   times out looking exactly like a dead route.
2. **The prompt goes on stdin, not in argv.** On Windows the binary is a `.cmd`
   shim, so spawn needs `shell:true`, and `shell:true` concatenates argv without
   escaping — a multi-line critic instruction full of quotes and braces is
   shredded by `cmd.exe` before the model sees it.
3. **The cwd must be an empty directory, and the filenames must be neutral.**
   **VERIFIED:** pointed at the worktree, this route ignored the instruction,
   ignored the probe, produced no JSON, and returned a critique of the
   *repository* — naming the commit that produced the reference, citing the
   reference manifest, and quoting a function and line number out of a source
   file it was never given. A critic handed the builder's rationale grades the
   rationale. Attachments are now copied in as `reference.png` / `capture-1.png`
   / `measurement.json`.
4. **The system prompt must be replaced.** OMP's default is a coding-assistant
   prompt, under which the route answered a schema-constrained request with a
   markdown engineering report — headings, an ASCII diagram, LaTeX pixel
   coordinates — and no JSON at all.

**And the reason all four were survivable:** every one of those rounds was
journalled INVALID and scored nothing. The harness refused four different broken
critics for four different reasons before any of them could contribute a number.

### The standing hazard, freshly confirmed

**VERIFIED 2026-09-04.** During the misconfigured runs the Gemini route produced
confident citations to files and line ranges it had not been given
(`src/killstreak-presentation.ts:1891-1909`, `…/before-angular-profile.json:447`,
ledger row ids). This is the same failure already recorded in this repository
when a Gemini-authored reference document cited four URLs that did not resolve.
The rule stands and this lane re-earned it: **this route may describe pixels it
was handed. It must never gather references.** Reference gathering is an
Opus-or-owner task with a fetch receipt per source.

---

## Open items

1. **OPEN — the local route as a critic.** `qwen38-27b-iq3xxs` at IQ3_XXS reads
   a probe in isolation but not inside a full critic task. Whether a larger
   quantisation, a smaller prompt or a bigger stamp fixes it is untested. Until
   then it is a triage route, not a critic.
2. **OPEN — three critics, blind ordering.** Only critic A has been run for
   real. The B/C lenses and blind pair ordering are implemented and unexercised.
3. **OPEN — a real capture step.** This lane ran against committed image pairs
   on purpose: Nuke Town belongs to other lanes today. Wiring
   `capture-arena-viewpoints.mjs` and the `diff-arena-viewpoints.mjs` regression
   guard into the cycle is the next step, and needs the VRAM floor, the ComfyUI
   queue check and the one-browser rule that the preflight already stubs.
4. **OPEN — an aspiration anchor.** The committed subject is T2 on both sides
   and cannot raise the bar. A T2 photograph the owner takes, or a T3
   permissively-licensed one, is an owner decision (R2 §10.2).
5. **OPEN — overlap with `photoreal-procedural-scene-forge`.** A skill by that
   name appeared mid-session describing a "two-critic measured gauntlet". It was
   not on disk anywhere I could find and was not read. Somebody should reconcile
   it against this runner before both exist.
