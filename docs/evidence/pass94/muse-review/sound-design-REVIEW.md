# Muse review — pass94 sound-design lane (HF-491)

Scope: `origin/contrib/dave-gaming-pc/claude/audio-regression..caeed824`
(4 commits: `4d1e1311` revoice, `ed062801` offline gate, `a9f22bd8` REPORT,
`caeed824` browser probe), full diff over `src`
(`src/audio.ts` +488/-45, new `src/audio-offline-render.ts`,
`src/audio-offline-render.test.ts`, `src/audio-offline-render-browser.test.ts`),
plus `docs/evidence/pass94/sound-design/REPORT.md`.
No listening possible; judged recipes + numbers only. No `src/` touched,
no builds/browsers/tests run.

## 1. Recipes (transient + body + tail?)

- Weapons (`src/audio.ts:2065-2230`): click (6–9 ms crackle highpass,
  `clickHz` per class) + square crack + saturated saw body + pink tail.
  Plausible. No class is click-only: smallest body is
  explosive-crossbow/flamethrower (`bodyGain` 0.58–0.66) but tail still
  0.5–0.8, so they read as soft/whooshy, not beeps. Machine-gun
  `crackGain` 0.78–0.93 + tighter body is the right tradeoff for repeat rate.
  Detune is deterministic round-robin (`src/audio.ts:2101-2102`, ±42 cents
  pitch / ±7% gain), not `Math.random` — good.
- Movement (`src/audio.ts:2781-2872` + `jump` at `:2876`): heel texture +
  low body + late scuff per surface, velocity-scaled (`speedScale =
  0.42+0.58*speed`). Plausible; crouch stealth preserved (0.022/0.018 base).
  `jump()` pink rush + sine lift is fine, no beep.
- Impacts/world (`src/audio.ts:2408-2475`, `:2491-2535`): strike (grain
  texture) + inharmonic body + late debris, `distanceLowpassHz` clamped onto
  strike (`:2426`). Glass/metal split (grains+ringing vs tight strike+plate)
  is the right call. `shedPerforation` (`:2491`: Q10 puncture + grit + chip
  scatter) and `vehicleHit` (`:2521`: sine 92→38 Hz flex under metal contact)
  are plausible, not buzzes.
- Drone/rotor: old square `sweep(178,72)` beep correctly identified and
  replaced (`:3410-3425`: saw 420→185 + triangle 1260 + pink bandpass).
  Rotor Doppler (`:3662-3670`, clamp 0.82–1.18) cannot click on network
  steps — good. Rotor audibility risk, not quality risk: saw 34–38 Hz through
  230 Hz lowpass at gain 0.012–0.018 is felt rumble; fine.
- UI/music (`:3745-3778`, `:1592`): hit/kill stay hard-onset; `matchStinger`
  triads (win 392/494/659, loss 330/247/196) with punch envelopes + delayed
  noise tail are stingers, not sine beeps. Music restage (`:66`, `:1592`:
  `min(0.72, gain*2.25)`) + arena lowpass + ducker is coherent.
- No recipe reads as buzz / click-only / sine-beep. Closest watch, not a
  finding: loss/draw stingers are pure triangle triads — acceptable at
  0.15–0.24 s with punch 0.36–0.46.

## 2. Mix table + limiter

Measured (REPORT, 8 kHz/20 s scripted render): weapons 0.471/0.0315 >
UI 0.2306/0.0099 > impacts 0.2009/0.0068 ≈ movement 0.1923/0.0080; music bed
0.0838/0.0200. Targets (`src/audio-offline-render.ts:30-34`): weapons
0.12–0.78/0.025–0.24, movement 0.04–0.46/0.006–0.12, impacts
0.05–0.62/0.006–0.13, UI 0.035–0.42/0.004–0.09, music 0.01–0.28/0.008–0.08.

- FINDING-1 `src/audio-offline-render.ts:30-34` + REPORT table — bands
  permit ordering inversions, so the gate cannot enforce the stated
  `weapons > impacts > footsteps > UI` hierarchy. Evidence: UI peak (0.2306)
  > impacts (0.2009) > movement (0.1923) already in the VERIFIED table, and
  music RMS (0.0200) > movement/impacts/UI RMS. A sine-beep at the right
  amplitude would also pass. Why: min/max per category, no cross-category
  assertion. Smallest fix: add ordering assertions
  (`peak(weapons)>peak(impacts)>peak(movement)>peak(UI)`, music RMS <
  movement RMS during combat-ducked render) or tighten `peakMax` for UI to
  ~0.20.
- FINDING-2 live music path is not what the probe measures. Live:
  bus 0.027 × note gain 2.25×, ducked to 24% during combat
  (`src/audio.ts:66,1592,4096-4105`); probe: browser bus 0.22 for music vs
  0.5 others (`src/audio-offline-render-browser.test.ts:~75`), Node probe
  fixed amplitudes. Combat music net ≈ `gain*0.0146` (quieter than the old
  `gain*0.027` sustained bed — intended) and out-of-combat ≈ `gain*0.061`
  (2.25× hotter — intended), but no test renders this. Why: two parallel
  models. Smallest fix: render one probe through the real bus coefficients
  + ducker envelope, or assert the arithmetic in a unit test.
- Limiter (`src/audio.ts:577-583`, wired `:921-925`): -1 dB, 20:1, knee 0,
  attack 1 ms, release 100 ms. Will NOT pump audibly. It is strictly safer
  than the old -12 dB/knee 8/ratio 6/2 ms/180 ms: only near-full-scale peaks
  engage it, recovery is faster. 1 ms attack may let a sub-ms transient
  overshoot by a sample — inaudible under the tanh probe guard
  (`src/audio-offline-render.ts:~130`, `clipped = peak > 0.999`).
- Reverb (`src/audio.ts:586-593`, built `:4062-4092`, sends `:4120-4127`):
  37/89 ms delays, feedback 0.31/0.254, return 0.12, sends
  0.075–0.16. Short diffuse tail, no convolution, feature-detected. Levels
  are conservative; wash risk is low.

## 3. Hot-path allocation

- `noise()` (`src/audio.ts:4640-4710`): shared cached `noiseTextures` /
  `noiseBuffer`, `createBufferSource` per shot is fine, no `AudioBuffer`
  alloc per event. Saturation curves cached per quantised drive
  (`:4595-4615`, comment explicitly justifies). Good.
- Doppler (`:3655-3674`): numeric `lastX/lastY/lastZ/lastUpdateSeconds` —
  claim verified, no position-object alloc. Good.
- FINDING-3 `src/audio.ts:3680` — `Math.random() < 0.025` blade-slap inside
  `syncChopperRotors` (per-frame sync) creates up to 4 nodes
  (source+filter+gain+panner) probabilistically per rotor per frame
  (~6 voices/s at 60 fps × 4 rotors). Bounded by `registerVoice` caps and
  reuses `noiseBuffer` (no buffer alloc), so not a leak — but it is the only
  unseeded randomness in the frame path and the only node creation in sync.
  Why: `Math.random` in hot path; offline determinism does not cover it.
  Smallest fix: drive the 2.5% gate from `presentationRandom` or a
  frame-counter hash.
- Minor (not a finding alone): `shedDoorMotion` (`:2483-2488`) now fires
  `impact('metal')` + `shedPerforation` (3 voices) + `sweep` — 5+ voices per
  shed hit, all through capped `registerVoice`; acceptable, just noisy under
  spam. `createImpactSpatialDestination` (`:3538-3570`) reuses
  `railgunSpatialNodes/Timers` for impact panners with a 480 ms `setTimeout`
  cleanup — works, naming is a trap for the next editor.

## 4. Voice caps

Unchanged and enforced. `src/spatial-audio.ts:5-17`: global 48, spatial 12,
continuous 8, perBus sfx 24 / movement 16 / ui 6 / announcements 4 /
ambience 8 / music 2 (2 = exactly the lead+bass pair, comment at
`src/audio.ts:739`). Every new path gates: impact spatial (`:3492`,
`:3541`), railgun (`:3322`, `:4138`), chopper create (`:1163`,
`:1627-1639`), footstep chains (`:4371`), central `registerVoice`
(`:4218-4243`, drops + `voicesDropped++`, telemetry `:4045-4049`). No diff
hunk raises a cap. Chopper loops still `break` at 4 (`:3713`).

## 5. Offline-test determinism + silence catch

- Deterministic: Node probe seeds every voice (`seeded()` at
  `src/audio-offline-render.ts:49-57`, fixed seeds per voice), `toEqual`
  repeatability assertion (`src/audio-offline-render.test.ts:19-21`), and
  variant differentiation (`renderOfflineWeaponShot(0/1)` differ). Live
  `presentationRandom` (`src/audio.ts:5,1709`) is rightly excluded from the
  probe. Browser probe rebuilds the same seeded PRNG inline. VERIFIED.
- Catches silence: Node gate asserts `peak >= peakMin` and `rms >= rmsMin`
  per category (`src/audio-offline-render.test.ts:24-29`) — an all-zero
  buffer (peak 0/rms 0) fails every row, plus `finite`/`clipped`/`sampleCount`
  checks. VERIFIED.
- Gap (folds into FINDING-1/2): the gate proves determinism/silence/clipping,
  not recipe fidelity — the Node probe mirrors the live recipe in a parallel
  `addVoice` model, and the browser probe asserts only `finite && !clipped
  && peak>0 && rms>0` with its own bus gains, no bands at all. A live-graph
  regression (wrong bus, dropped layer, silent `shot()` early-return) passes
  both probes.

## Findings index

| ID | file:line | why | smallest fix |
|----|-----------|-----|--------------|
| F1 | `src/audio-offline-render.ts:30-34` | bands overlap; UI peak > impacts > movement still VERIFIED; music RMS hottest after weapons | cross-category ordering assertions or UI `peakMax` ~0.20 |
| F2 | `src/audio-offline-render-browser.test.ts:75` vs `src/audio.ts:66,1592,4096` | probes use own gains, never the 0.027×2.25×0.24 live music path | one probe through real bus/ducker coefficients |
| F3 | `src/audio.ts:3680` | unseeded `Math.random` + 4-node creation in per-frame rotor sync | seeded gate (presentationRandom / frame hash) |

## Verdict: SHIP-WITH-FIXES

1. Recipes are genuinely revoiced (click+crack+body+tail everywhere that
   matters, square-beep drone fixed, Doppler clamped, detune deterministic)
   with caps, limiter, and determinism intact — the HF-491 complaint is
   addressed, not suppressed.
2. The three findings are real but non-blocking: mix-ordering/mirrored-probe
   gaps need stronger assertions, and the rotor slap gate needs a seeded
   coin — none clips, leaks voices, or breaks determinism today.
3. Safe to ship after or alongside F1–F3 as follow-ups; do not raise combat
   buses if the music bed feels hot — remove/duck the bed per REPORT's own
   note, and keep the `-1 dB/20:1` limiter as is.
