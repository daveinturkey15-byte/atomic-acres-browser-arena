# HF-413 (Lane Z) — after-repair evidence, 2026-09-02

Instrument: `npm run qa:pass65:first-person-arms-visual` — headless installed
Chrome, native WebGPU (`softwareAdapter: false`), gun range, seed 650085,
1600x900 with a 2560x1440 sweep. Clean tracked worktree. ComfyUI queue empty
and 9.6 GB VRAM free before launch; power plan High performance.
Full receipt: `receipt.json.gz` (411 KB raw, gzipped per the >400 KB rule).
Frames are halved from their capture resolution.

`before/` and `after/` in the parent directory are the earlier run pair.
This directory is the run at the repaired head.

## Verdict

`fail`, 11 violations, **all of one class**: `arm framing is nonfinite,
clipped by the near plane, or offscreen`. Zero hand-policy violations, zero
sleeve-entry violations, zero handedness violations.

That remaining class is HF-410 / Lane W, not this lane: the viewmodel root
presents at camera-space z = -0.407 m against an authored -1.08 m, so at the
deepest reload and melee poses the hand crosses the 0.05 m near plane.
`handgun/pistol/reload-0.56` shows it plainly — the support hand is a large
out-of-focus teal mass filling the lower right, measured `nearestDepth`
0.027 m. **Do not report this gate as green.**

## Coverage compared with the previous run

|  | previous `after/` | this run |
|---|---|---|
| rows | 18 | 47 |
| hip stills | 7 families | 7 families |
| ADS stills | m4a1 only | all 7 families |
| reload frames | 1 (m4a1) | 18 — six-frame strips for pistol, m4a1 **and minigun** |
| melee frames | 3 | 6 |
| violations | 13 | 11 |
| violations on the 18 shared rows | 13 | 3 |

## Per weapon, in plain words (looked at, not inferred)

- **pistol (handgun)** — hip and ADS both read correctly. Two sleeves rise from
  the bottom edge and converge on the grip; right arm on the right, left on the
  left; both continue off the bottom edge. Reload strip: the support hand comes
  up to the magwell from the support side and returns. At 0.40–0.72 that hand
  passes through the near plane and smears (Lane W). Nothing mirrored.
- **mp5 (compact)** — hip and ADS correct, two-hand grip, no crossing.
- **m4a1 (long-gun)** — hip, ADS and the six-frame reload all correct in
  handedness. The magazine arrives from below-left into a centreline magwell.
  Frames 0.56 and 0.72 cross the near plane.
- **minigun (heavy)** — **first minigun reload ever rendered in this lane.**
  The support hand travels 0.632 m from its resting hip pose (the largest of
  the three subjects) and reaches the side-mounted ammo drum on the firing
  side, which is where the M134's ammunition actually is. All six frames clear
  the near plane. This is the frame evidence that the reverted `+0.25` reload
  socket is correct and the mirrored `-0.25` one was not.
- **explosive-crossbow** — hip and ADS correct.
- **railgun** — hip and ADS correct. The support sleeve at hip is the tightest
  row in the set: NDC y -0.9896 against the -0.98 floor. It clears, but with
  0.010 of margin; the reachable sphere around that grip does not allow lower.
  Recorded rather than tuned.
- **flare-gun (flare-handgun)** — hip and ADS correct.
- **knife (melee)** — six-frame strip. At 0.24 the forearm, glove and knuckles
  are individually readable; at 0.56 the blade itself is readable as a distinct
  light edge running up and left out of a gloved hand. This is a change from
  the previous run, where the review found "a smooth featureless teal tube with
  no hand, no fingers and no blade". Frames 0.40–0.72 still cross the near
  plane (Lane W).

## Not captured, and why

- **Left/right strafe.** The debug API exposes only
  `setMovement(forward, sprint)`; there is no lateral input hook, so a strafe
  capture needs a new export in `src/legacy-main.ts`, which is outside this
  lane's ownership. The exact patch shape is in the lane report.
- **The twelve non-representative weapons.** The gate captures one
  representative per grip family. Those twelve are covered by the static
  corpus audit (`npm run qa:pass85:arms-handedness`: 136 files, 4989 nodes,
  485 sockets, 0 violations) and by their family representative, not by their
  own frames. Stated as a limit, not as coverage.

## Correction to the earlier evidence

The base receipt records **15** `hand policy is missing` rows, not 18
(15 + 5 sleeve + 13 framing = 33). The earlier lane report and commit message
`1b51d9d6` both quote 18. 15 is the correct figure.
