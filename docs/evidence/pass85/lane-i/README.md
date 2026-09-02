# Lane I — first-load / second-load arena lighting parity (PASS 85)

The owner's defect was "map 1 lights differently from map 2". The cause was
structural and was fixed on 2026-08-31
(`docs/IBL_FIRST_ARENA_BUG_2026-08-31.md`): the only PMREM generation site sat
inside `applyDefinition`, and the first arena of a page load is the one that
*constructs* the systems object and therefore never reached it, so
`scene.environment` was null for the whole of the first map of every session.

**This lane measured the two load paths against each other on the shipped
build, which nothing had done.** Verdict, stated at the resolution the method
actually reached: **7 of 9 arenas are verified identical across the two load
paths in pixels and in receipt. farcrysis is receipt-identical with its pixel
parity OPEN. gun-range is unmeasured on the switch path.** The per-arena
detail is below and in `load-parity-table.md`.

The separate question of whether the arenas are still at the look the owner
approved — which path parity cannot answer — is in `approved-look.md`.

## What is here

| file | what it is |
|---|---|
| `load-parity-table.md` | the per-arena, per-review-camera table (the full 9-arena sweep, `pass85b`) |
| `load-parity.json` | the machine-readable report the table was generated from (`gitSha 6be910ac`) |
| `load-parity-long-floors-pass85d.json` | the 15 s long-baseline floors for farcrysis and atomic-acres — the run the farcrysis argument below actually leans on |
| `approved-look.md` | the brief's Job 2: are the arenas still where the owner approved them, and what the environment is worth per arena |
| `environment-contribution-pass85e-{a,b,c}.json` | the machine-readable reports behind `approved-look.md` (all 9 arenas, 18 review cameras) |
| `*-first.png` / `*-second.png` | the compared load-path frames for two arenas, halved |
| `*-shipped.png` / `*-environment-suppressed.png` | shipped against the pre-2026-08-31 presented state, halved |
| `*-BOTS-LIVE-DURING-SETTLE.png` | the counter-example, kept deliberately — see below |

**Which build the numbers came from.** The tracked sweep ran at
`6be910ac` and the contribution run at `bf92195d`, not at PASS 84's head
`75a4e508` itself. Those commits add this lane's probes, one new test file and
documentation and change **no build input**, so the served `dist/` is
runtime-identical to `75a4e508`; the shas are stated here rather than rounded
to "PASS 84 head" because the artifacts record them.

**Neither probe is a gate.** `scripts/qa/probe-ibl-load-parity.mjs` and
`scripts/qa/probe-ibl-environment-contribution.mjs` exit non-zero only on
invalidation (receipt mismatch, failed arena selection, combat contamination,
suppression or restore not taking). Neither carries a pixel threshold, so a
large luminance divergence exits 0 by design — the largest divergences this
lane measured were not lighting at all, and a threshold would have encoded that
noise as a contract. The npm scripts are named `measure:ibl:*` for that reason
and must not be wired into a green/red check. **The gate is
`src/rendering/arena-environment-load-parity.test.ts`.**

Regenerate with:

```
node scripts/qa/probe-ibl-load-parity.mjs --serve-dist dist --label pass85b
node scripts/qa/summarize-ibl-load-parity.mjs \
  --report artifacts/qa/ibl/load-parity-pass85b.json \
  --shots artifacts/qa/ibl/pass85b --out docs/evidence/pass85/lane-i \
  --frames rustworks-1v1,atomic-acres
```

## Result

**Receipt parity — eight of nine arenas (VERIFIED).** The live
`ArenaEnvironmentObservation` is identical field for field across the two
paths — presence, texture name, live intensity, expected intensity, source
backdrop, PMREM tier, generated cube size. The ninth, gun-range, never got a
valid comparison at all: its map switch failed (below).

**Pixel parity — seven of nine arenas (VERIFIED).** atomic-acres,
skyline-terminal, rustworks-1v1, high-seas, test1, test2 and map3 agree to
within 0.1% mean rec.709 luminance at every authored review camera, inside
that camera's own measured temporal floor, with at most 0.9% of pixels moved.
Those are the rows in `load-parity-table.md` and they are the owner's defect,
closed.

**farcrysis — pixel parity OPEN (not verified).** Its receipt is identical,
but 16–22% of its pixels move between the two paths and in every run that
measured floors (`pass85c`, `pass85d`) it reports `withinCameraNoise: false`
**and** `withinLongFloor: false` on both cameras. The pixel method never
resolved this arena. The case that it is animation phase rather than lighting
is strong but circumstantial — see below — so it is recorded as OPEN, not as
"no divergence".

**gun-range — UNMEASURED on the switch path.** Not "lit wrong": never compared.
See "Two ways to be wrong" below. Its *first-load* path measures fine and is
covered in `approved-look.md`.

**No arena needed a grade or `metalness` re-tune.** Nothing in `src/` changed
in this lane. The evidence that this is a finding rather than an omission is in
`approved-look.md`: PASS 81's own shipped head already contained the
2026-08-31 environment fix, and no arena's authored grade or environment
constant changed between that head and PASS 84's base.

## Two ways to be wrong, both of which this lane hit

Both were caught by adding a check, not by loosening one. Each now invalidates
the arena loudly instead of being reported as a lighting number.

### 1. A frame that carries the damage overlay is not a lighting measurement

`rustworks-1v1` first measured **0.0554 → 0.0426, −23.09% mean luminance with
42.1% of pixels moved** — by far the largest divergence in the sweep, and
exactly the shape of the owner's complaint.

It was not lighting. The per-pixel delta is a clean monotonic radial ramp:
**+0.1 red at the frame centre, +117.7 at the corners**, with green and blue
slightly *down*. That is `#low-health-vignette`, a DOM overlay
(`radial-gradient(circle, transparent 45%, rgba(112,0,0,.88) 100%)`, `style.css`),
sitting on top of the canvas. The probe froze the bots *after* a 6 s idle
settle, so on a small 1v1 arena the solo bot shot the parked player first, and
freezing a bot does not undo damage already taken.

Fixed by freezing before the settle, and — because that alone is a race, not a
guarantee — by publishing a combat receipt (`player.hp`, `player.alive`,
`sensory.lowHealthOpacity`, `sensory.lowHealthActive`, and the directional
damage marker opacity) at the start *and* the end of every capture window, and
invalidating the arena if any of them is non-clean.

With bots frozen first, the same comparison reads **0.0425 → 0.0426, +0.1%,
0.1% of pixels moved**, against that camera's own 0.11% floor. The frames are
in this directory: `-BOTS-LIVE-DURING-SETTLE` is the red one.

### 2. A failed map switch is not a lighting divergence

`gun-range` reported the environment receipt differing on every field — a
different texture, 0.1 vs 0.24 intensity, a different source backdrop. It was
comparing gun-range against **atomic-acres**: the in-page map switch into
gun-range failed and left the previous arena committed, while the match stayed
active throughout.

```
[Gun Range map selection failed] Error: WebGPU queue completion exceeded
12000 ms for submission 614 (completed 613, mode serialized, in-flight 1,
pending 12016 ms, probes 614, prior latency 44 ms, fenced draws 770)
```

Reproduced twice, the second time on a quiet GPU (ComfyUI idle, 4.3 GB free),
so GPU contention is not the cause. **This is a real defect and it is not this
lane's** — it is an arena-streaming / renderer-fence failure, adjacent to the
periodic-stall work. Lane I's obligation was to stop reporting it as a lighting
result, which it now does: the probe reads which arena is actually committed
before it compares anything.

It is not a QA-only artefact either. On the shipped PASS 84 build the same
failure means **a live player cannot switch into Gun Range from another
arena**, and the match is left running on the previous one. That belongs in the
owner-feedback ledger as its own row, not at the bottom of a lighting report.
Reproduce on demand:

```
node scripts/qa/probe-ibl-load-parity.mjs --serve-dist dist --arenas gun-range --label repro
```

gun-range's own **first-load** path is healthy — it boots, lights and reports a
valid receipt — and is measured in `approved-look.md`. Only the switch path
fails.

## What a noise floor has to be

A single floor per arena, measured at whichever camera happened to be last, is
not enough, and neither is a short baseline.

- Pixels-moved had **no floor at all** and now has one.
- Floors are now per-camera: cameras differ enormously in how much of the frame
  is animated.
- Floors are measured on **two** baselines, 900 ms and 15 s, because an
  animation with a period of tens of seconds barely moves inside 900 ms and
  still lands the two load paths on different phases — they reach the camera at
  different elapsed times.

`farcrysis` is the case that forced this. Its two paths differ by 16–22% of
pixels while its 900 ms floor reads 0%. That looks damning until the long
floor is measured: **3.9% luminance / 6.8% pixels at 15 s on the same camera**,
movement confined to the surf and canopy bands rather than spread over the
frame, an identical environment receipt, and a luminance delta that does not
reproduce in sign or size across four runs (−0.40%, −2.17%, −0.67%, +0.54%).
A real load-path lighting difference reproduces; animation phase does not.

What that adds up to, stated at its real strength: farcrysis's divergence is
**probably not lighting** (CLAIMED — identical receipt, non-reproducing sign,
movement confined to the animated bands), and its load-path pixel parity is
**OPEN** (never resolved: it fails both its own floors on both cameras in
`pass85c` and `pass85d`). It is *not* correct to write that farcrysis "shows no
lighting divergence" — an earlier draft of this file, the write-up and the lane
report all did, and that is the claim this correction retracts.

Separately, its review captures are **not phase-locked** — the review clock
does not pin that animation, so its frames cannot be resolved below roughly ±2%
by this method at all. That is a capture-determinism gap for whoever owns
farcrysis, recorded here rather than smoothed away. (`atomic-acres` makes the
same point in reverse: one of its 900 ms samples read 3.63%/7.4% while its 15 s
sample read 0.02%/1%. Single-sample floors are unreliable in both directions.)

## The gate that keeps it fixed

`src/rendering/arena-environment-load-parity.test.ts` drives the real systems
object through the caller's real order for both paths and requires the
resulting receipt to be identical, with a sensitivity case that drives the
first-load path the pre-2026-08-31 way and requires the two to differ, plus
call-site pins that fail if the shared bootstrap moves back inside the
first-arena-only branch or loses its awaited sky admission.
