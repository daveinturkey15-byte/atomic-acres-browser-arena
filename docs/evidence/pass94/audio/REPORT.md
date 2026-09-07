# HF-491 audio regression triage

## Scope and baseline

- VERIFIED: Owner complaint is HF-491, HITL 4, `2026-09-04`, owner-served build `7733d37b`, arena `nuketown2`.
- VERIFIED: Pass 93 published baseline is `origin/contrib/dave-gaming-pc/claude/pass93-chrome153-hotfix` at `bebb9124`; its channel URL is `https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/channels/pass93/`.
- VERIFIED: `git diff origin/contrib/dave-gaming-pc/claude/pass93-chrome153-hotfix..7733d37b -- src/audio.ts src/spatial-audio.ts src/audio-immersion.ts src/audio-buses.ts src/sound-event-inventory.ts public/audio public/sfx` is empty. The full source diff has no audio, sound, listener, mixer, positional-audio, or footstep changes.
- VERIFIED: The last audio-related commits reachable from the published baseline are `ec1bc446` (HF-430/HF-431, 2026-09-03), `d9f669d3` (HF-430, 2026-09-03), and `ff1cce94` (audio bus v6, 2026-08-30), all before the HF-491 owner playtest.
- VERIFIED: No `public/audio` or `public/sfx` directory exists in either source tree, and no audio asset path is present in the published tree. Runtime audio is procedural; the five generated `AudioBuffer` objects are not fetched sample assets.

## Probe method

- VERIFIED: `scripts/qa/hf491-audio-regression-probe.mjs` used the repository's installed Playwright package, installed Chrome, `headless: true`, one browser at a time, and the stock flags from `tests/e2e/pass93-stock-flags-boot.spec.ts`: `--mute-audio`, background-throttling/backgrounding disables, off-screen window position and 2640x1520 window.
- VERIFIED: Each probe navigated the real menu, selected `nuketown2`, clicked `#solo`, waited for `matchPhase=active`, called `__ATOMIC_ACRES_DEBUG__.fireOnce()` once, and issued five discrete `__ATOMIC_ACRES_DEBUG__.setMovement(true,false)` QA pulses of 300 ms with 100 ms gaps.
- VERIFIED: Raw artifacts are [`owner-7733d37b.json`](raw/owner-7733d37b.json) and [`pass93-live.json`](raw/pass93-live.json).

## Probe table: runtime and failure evidence

| Measurement | Owner `7733d37b` at `http://127.0.0.1:4300/` | Pass 93 live channel |
|---|---:|---:|
| Match boot | VERIFIED: active, WebGPU | VERIFIED: active, WebGPU |
| AudioContext state | VERIFIED: `running` | VERIFIED: `running` |
| Listener pose | VERIFIED: `modern-audio-param` | VERIFIED: `modern-audio-param` |
| Generated buffers | VERIFIED: 5 | VERIFIED: 5 |
| `decodeAudioData` calls/errors | VERIFIED: 0 / 0 | VERIFIED: 0 / 0 |
| Failed audio fetches | VERIFIED: 0 | VERIFIED: 0 |
| 4xx audio responses | VERIFIED: 0 | VERIFIED: 0 |
| Audio/sound/decode console errors | VERIFIED: 0 | VERIFIED: 0 |
| Other console errors | VERIFIED: 1 WebGPU queue timeout, not audio | VERIFIED: 0 |
| SFX effective gain | VERIFIED: `0.78` | VERIFIED: `0.78` |
| Movement effective gain | VERIFIED: `0.34` | VERIFIED: `0.34` |
| Game-music effective gain | VERIFIED: `0.0135` | VERIFIED: `0.0135` |
| Peak active voices during controlled actions | VERIFIED: 6 | VERIFIED: 6 |
| Peak active spatial chains during controlled actions | VERIFIED: 3 of cap 12 | VERIFIED: 3 of cap 12 |
| Global voice cap | VERIFIED: 48 | VERIFIED: 48 |
| Starts in shot + five-step window | VERIFIED: 11 total (`7` after shot, `4` after movement) | VERIFIED: 15 total (`7` after shot, `8` after movement) |
| Nominal starts/sec over 2.15 s controlled wait window | VERIFIED: 5.12/s | VERIFIED: 6.98/s |
| Peak output analyser amplitude | VERIFIED: `0.00250765` before, `0.00172619` after shot, `0.00170830` after steps | VERIFIED: `0.00874010` before, `0.00182053` after shot, `0.00215569` after steps |

The Pass 93 run did report one failed `resourceType=media` request for `original/menu-previews/atomic-acres.webm` with `net::ERR_ABORTED`; VERIFIED: this is a video preview cancellation, not an audio fetch, and it is retained in the raw artifact's all-media request list rather than counted as an audio failure.

## Verification status

- VERIFIED: `node --check scripts/qa/hf491-audio-regression-probe.mjs` passed.
- VERIFIED: `git diff --check` passed.
- VERIFIED: `npx tsc --noEmit` passed with no diagnostics.
- VERIFIED: Targeted audio tests (`src/audio-output-probe.test.ts`, `src/audio-browser-compatibility.test.ts`, `src/spatial-audio.test.ts`) passed: 24 tests.
- OPEN: `npx vitest run src/legacy-main-size-ratchet.test.ts` failed its existing ratchet: `src/legacy-main.ts` is 37,372 lines versus the existing 37,371 ceiling. No ratchet or unrelated source file was changed.
- OPEN: The combined required targeted run completed 24/25 tests; the sole failure is the same existing `legacy-main.ts` ratchet.
- VERIFIED: The initial preflight lockfile check passed, then the contribution guard refused the dirty worktree as designed.
- OPEN: The clean-tree preflight was rerun after commit. The lockfile check passed, but the guard rejected both `--harness Codex` (uppercase is not a lowercase slug) and the accepted `--harness codex` because this repository guard requires branch prefix `contrib/dave-gaming-pc/codex/<short-outcome>`, while the user-mandated branch is `contrib/dave-gaming-pc/claude/audio-regression`. The requested branch was preserved.

## Probe table: requested events and buffer outcomes

| Controlled/requested event | Owner build | Pass 93 live | Buffer/decode finding |
|---|---|---|---|
| Match countdown at deployment | VERIFIED: 4 cues | VERIFIED: 4 cues | VERIFIED: no missing buffer or decode error |
| Arena ambience | VERIFIED: 2 continuous sources, 1 ambient one-shot at boot | VERIFIED: 2 continuous sources, 1 ambient one-shot at boot | VERIFIED: no missing buffer or decode error |
| One weapon shot via `fireOnce()` | VERIFIED: one QA request; 7 scheduled source starts; voices 7→8 at sample | VERIFIED: one QA request; 7 scheduled source starts; voices 7→9 at sample | VERIFIED: no missing buffer or decode error |
| Five forward movement pulses via `setMovement()` | VERIFIED: 5 QA pulses; observed end pose moved from `(-14,-34)` to `(-10.38,-29.51)`; 4 starts in the post-shot window | VERIFIED: 5 QA pulses; observed end pose moved from `(14,-31)` to `(10.90,-21.65)`; 8 starts in the post-shot window | VERIFIED: no missing buffer or decode error |

## Claim-state conclusion

- VERIFIED: There is no changed audio asset, failed audio request, decode failure, suspended context, listener-freeze signal, missing prewarm buffer, bus mute, voice-cap exhaustion, or observed runaway source growth separating the owner build from Pass 93.
- VERIFIED: The same bus coefficients are present in both builds. The measured `game-music` effective gain is `0.0135`; the owner-facing complaint that this is too quiet or that the synthesized timbre/mix is unpleasant is perceptual, not mechanically falsified by this probe.
- OPEN: Perceptual mix/timbre issue. Candidate next measurement is an unmuted owner-device listening pass with a fixed peak/RMS target and category-by-category gain comparison; this probe intentionally used the repository-mandated `--mute-audio` flag and cannot decide taste.
- OPEN: The small difference in scheduled-source counts (`11` versus `15`) is timing/ambient scheduling variation within the same bounded voice caps; this probe does not attribute it to a defect.
- VERIFIED: No runtime code fix is justified by the mechanical evidence. This change adds the reproducible probe and evidence only; it does not alter audio behavior or any threshold.
