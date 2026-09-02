# Lane I — first-load / second-load arena lighting parity (PASS 85)

The owner's defect was "map 1 lights differently from map 2". The cause was
structural and was fixed on 2026-08-31
(`docs/IBL_FIRST_ARENA_BUG_2026-08-31.md`): the only PMREM generation site sat
inside `applyDefinition`, and the first arena of a page load is the one that
*constructs* the systems object and therefore never reached it, so
`scene.environment` was null for the whole of the first map of every session.

**This lane measured the two load paths against each other on the shipped
build, which nothing had done.** Verdict: on PASS 84's head the two paths
produce the same light on every arena that can be measured.

## What is here

| file | what it is |
|---|---|
| `load-parity-table.md` | the per-arena, per-review-camera table (the full 9-arena sweep, `pass85b`) |
| `load-parity.json` | the machine-readable report the table was generated from |
| `*-first.png` / `*-second.png` | the compared frames for two arenas, halved |
| `*-BOTS-LIVE-DURING-SETTLE.png` | the counter-example, kept deliberately — see below |

Regenerate with:

```
node scripts/qa/probe-ibl-load-parity.mjs --serve-dist dist --label pass85b
node scripts/qa/summarize-ibl-load-parity.mjs \
  --report artifacts/qa/ibl/load-parity-pass85b.json \
  --shots artifacts/qa/ibl/pass85b --out docs/evidence/pass85/lane-i \
  --frames rustworks-1v1,atomic-acres
```

## Result

Eight of nine arenas: the live `ArenaEnvironmentObservation` is **identical
field for field** across the two paths — presence, texture name, live
intensity, expected intensity, source backdrop, PMREM tier, generated cube
size — and mean rec.709 luminance agrees to within 0.1% at every authored
review camera, inside each frame's own measured temporal floor. No arena
needed a grade or `metalness` re-tune: nothing moved.

The ninth, **gun-range, could not be measured** and did not fail to light —
see "Two ways to be wrong" below.

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

So farcrysis shows **no lighting divergence**, and separately its review
captures are **not phase-locked** — the review clock does not pin that
animation, so its frames cannot be resolved below roughly ±2% by this method.
That is a capture-determinism gap for whoever owns farcrysis, recorded here
rather than smoothed away. (`atomic-acres` makes the same point in reverse: one
of its 900 ms samples read 3.63%/7.4% while its 15 s sample read 0.02%/1%.
Single-sample floors are unreliable in both directions.)

## The gate that keeps it fixed

`src/rendering/arena-environment-load-parity.test.ts` drives the real systems
object through the caller's real order for both paths and requires the
resulting receipt to be identical, with a sensitivity case that drives the
first-load path the pre-2026-08-31 way and requires the two to differ, plus
call-site pins that fail if the shared bootstrap moves back inside the
first-arena-only branch or loses its awaited sky admission.
