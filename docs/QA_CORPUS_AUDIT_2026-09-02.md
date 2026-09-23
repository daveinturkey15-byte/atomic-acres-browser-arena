# QA corpus audit — 2026-09-02

PASS 85, Lane N (QA corpus streamline). Worktree `aa-claude-corpus`, branch
`contrib/dave-gaming-pc/claude/qa-corpus-streamline`, base `75a4e508` (the
commit PASS 84 shipped from).

Every number below was **measured** by scripts run in this worktree, not
carried over from the 2026-08-31 audit. Where this audit contradicts that one,
this one is the later measurement and says so.

> **Repaired 2026-09-02, after a skeptic pass.** Four numbers in the first
> version of this document were wrong, and three of them were wrong in the
> direction that flatters the tooling. They are corrected in place, each with
> the correction NAMED rather than quietly swapped: the graphics-registry
> counts (38/10/28 -> 40/1/39, and the 08-31 figure of 40 was right all along),
> the hardcoded-roster count (one syntax was measured and 24 files writing the
> other were invisible), the claim that wiring `pass84-gamepad` made CI run it
> (no CI job executes it), and the gun-range shader-compile evidence (the run
> it cited had failed for a different reason entirely). An audit that gets its
> own numbers wrong in the flattering direction is the failure it exists to
> catch, so the corrections are the most useful thing in this file.

## Method

"Referenced by" is **reachability from an entry point**, not "some file
mentions the name". The seeds are the 200 `package.json` scripts and both
files under `.github/workflows`; from there the closure follows `npm run`
chains and any file a reached file names. Markdown is deliberately excluded
from the closure: a spec discussed in a doc is still a spec nothing runs.

This matters, because the two definitions disagree. By "any code file mentions
it", 16 specs are orphans. By "anything can actually cause it to execute", 25
are — the extra 9 are named only by scripts that are themselves unreachable.
A dead script naming a dead spec is not coverage.

`playwright test` is never invoked without file arguments anywhere in the
repository, so a spec that is not named somewhere cannot run at all. That was
checked, not assumed.

## Headline counts (VERIFIED)

| | total | orphaned | share |
|---|---:|---:|---:|
| `tests/e2e/*.spec.ts` | 76 | 25 | 33% |
| `scripts/qa/**` (`.mjs`/`.cjs`/`.js`/`.ts`) | 330 of 350 | 173 | 52% |

**330 of 350.** `scripts/qa` holds 350 files; the closure scans the four
JavaScript/TypeScript extensions and therefore never looked at 20 of them —
8 `.mts`, 5 `.py`, 3 `.ps1`, 1 `.sh`, 1 `.html`, 1 `.md`, 1 `.json`. Some of
those are real verifiers (the Python luminance/measurement tools an npm script
invokes). Every "330" in this document means "330 of 350, JS/TS only"; the 20
are unaudited, not absent.

Both totals include the two files this lane added. The 2026-08-31 audit said
"45 of 75 specs referenced by nothing"; **that number does not reproduce**.
The corpus is 76 specs and 25 of them are unreachable. The likely cause of the
gap is the looser definition plus the wiring that landed between 08-31 and
today; either way, 33% is the current figure and 45 is not.

The figure was **26 before this lane wired `pass84-gamepad`** and 25 after;
commit `b461dd90` says 26 and `462b5687` says 25, both true at the point they
were written, and neither said which. That is what the difference is.

Other pinned findings, re-checked today:

- **`toHaveScreenshot`: exactly one in the whole corpus** — VERIFIED.
  `tests/e2e/pass25a-baseline.spec.ts:102`, `pass25a-performance-menu.png`.
  It is the only pixel assertion in 76 specs.
- **Neither workflow mentions WebGPU** — VERIFIED. `grep -in webgpu
  .github/workflows/*` returns nothing. Every green in this repository's CI
  history ran WebGL2/SwiftShader while the owner plays WebGPU.
- **`package.json` scripts pointing at missing files: 0 of 200** — VERIFIED.
  (The 08-31 audit's two hits were a regex artefact: `worker/tsconfig.json`
  matched as `worker/tsconfig.js`.)
- **Exact-duplicate specs: 0** — VERIFIED, two independent ways. No two specs
  share a test-title set, and no two share a comment/whitespace-stripped body
  hash. Class (d) of this lane's brief therefore lands **zero deletions**, and
  that is a measurement rather than a decision not to look.

## `tests/e2e` — every spec

| file | lines | last commit | state | referenced by |
|---|---:|---|---|---|
| `atomic-acres.spec.ts` | 3258 | 2026-08-28 df8087fc | wired | `via scripts/qa/run-bounded-e2e.mjs` |
| `pass25a-baseline.spec.ts` | 293 | 2026-08-04 a916e26c | wired | `via scripts/qa/run-bounded-e2e.mjs` |
| `pass25a-capability.spec.ts` | 33 | 2026-08-01 6e414859 | wired | `via scripts/qa/run-bounded-e2e.mjs` |
| `pass34-combat-menu-tower-range.spec.ts` | 344 | 2026-08-04 b6370d7f | wired | `via scripts/qa/run-bounded-e2e.mjs` |
| `pass35-explosion-tri-pass.spec.ts` | 191 | 2026-08-04 b6370d7f | wired | `npm:qa:pass35:explosions` |
| `pass36-range-atmosphere-windows-drops-leaderboard.spec.ts` | 320 | 2026-08-04 b6370d7f | wired | `npm:qa:pass36:gameplay` |
| `pass37-quality-bounds.spec.ts` | 124 | 2026-08-04 b6370d7f | wired | `npm:qa:pass37:quality-bounds` |
| `pass54-wall-penetration.spec.ts` | 63 | 2026-07-22 cdc28d02 | ORPHAN | nothing |
| `pass59-visuals.spec.ts` | 111 | 2026-07-23 c3a1438c | ORPHAN | docs only (1) |
| `pass62-graphics-refinement.spec.ts` | 90 | 2026-07-28 4b07e808 | ORPHAN | mentioned by 1 unreachable file(s) |
| `pass63-atomic-visuals.spec.ts` | 89 | 2026-07-25 dfad16aa | wired | `npm:qa:pass63` |
| `pass63-project-map.spec.ts` | 80 | 2026-09-02 1d24a569 | wired | `npm:qa:pass63` |
| `pass63-skyline-terminal-openings.spec.ts` | 135 | 2026-07-25 dfad16aa | wired | `npm:qa:pass63` |
| `pass63-text-chat.spec.ts` | 293 | 2026-08-02 4b43704e | wired | `npm:qa:pass63`, `npm:qa:pass63:text-chat` |
| `pass64-hud-menu.spec.ts` | 693 | 2026-08-28 df8087fc | wired | `.github/workflows/verify.yml` |
| `pass64-match-diagnostics.spec.ts` | 66 | 2026-07-26 0ea68b0d | wired | `via scripts/qa/run-pass64-diagnostics-browser.mjs` |
| `pass64-railgun.spec.ts` | 253 | 2026-08-11 45fbaf5b | wired | `npm:qa:pass64:railgun`, `npm:qa:pass70:weapon-contact-scope:browser` |
| `pass64-renderer-foundation.spec.ts` | 125 | 2026-08-05 ff4b5706 | wired | `npm:qa:pass64:renderer` |
| `pass65-debug-capture-viewmodel.spec.ts` | 31 | 2026-07-28 87226d72 | ORPHAN | docs only (1) |
| `pass65-destructible-shed.spec.ts` | 113 | 2026-07-27 97ce8a00 | ORPHAN | nothing |
| `pass65-flash-authority.spec.ts` | 159 | 2026-07-27 60743d49 | ORPHAN | mentioned by 1 unreachable file(s) |
| `pass65-frame-pacing-focus.spec.ts` | 43 | 2026-07-29 4638a7b3 | ORPHAN | mentioned by 1 unreachable file(s) |
| `pass65-gun-range-lighting.spec.ts` | 160 | 2026-08-11 0c38789d | ORPHAN | nothing |
| `pass65-menu-lifecycle.spec.ts` | 986 | 2026-08-12 2b1d2097 | wired | `npm:qa:pass65:menu-lifecycle`, `.github/workflows/verify.yml` |
| `pass65-operator-visual-gate.spec.ts` | 146 | 2026-07-27 d2bee702 | ORPHAN | nothing |
| `pass65-presentation-audio-blockers.spec.ts` | 133 | 2026-08-01 6e414859 | ORPHAN | nothing |
| `pass65-preview-choreography.spec.ts` | 188 | 2026-08-11 04886489 | ORPHAN | mentioned by 3 unreachable file(s) |
| `pass65-railgun-multihit.spec.ts` | 519 | 2026-07-29 690c12ff | wired | `npm:qa:pass64:railgun` |
| `pass65-rustrig-container-lighting.spec.ts` | 94 | 2026-07-27 fe7d703f | wired | `npm:qa:pass65:rustrig-lighting` |
| `pass65-support-vehicle-assets.spec.ts` | 545 | 2026-08-11 de3940d3 | wired | `via scripts/qa/run-pass69-3-support-aircraft-live.mjs` |
| `pass65-support-visual-gate.spec.ts` | 583 | 2026-08-08 df330132 | ORPHAN | mentioned by 1 unreachable file(s) |
| `pass66-adrenaline-match-lifecycle.spec.ts` | 308 | 2026-08-02 d5d0967c | wired | `via scripts/qa/pass66-multiplayer-stability-contract.mjs` |
| `pass66-ads-sight-catalog.spec.ts` | 469 | 2026-08-10 c4eede56 | wired | `via scripts/qa/run-pass66-ads-sight-catalog.mjs` |
| `pass66-audio-long-run.spec.ts` | 141 | 2026-08-02 4b43704e | wired | `via scripts/qa/run-pass66-audio-long-run.mjs` |
| `pass66-browser-admission-cycles.spec.ts` | 569 | 2026-09-02 e4c812ea | wired | `via scripts/qa/arena-roster-contract.test.mjs` |
| `pass66-carpet-shed-webgpu.spec.ts` | 506 | 2026-08-02 4b43704e | ORPHAN | mentioned by 1 unreachable file(s) |
| `pass66-field-kit-killstreak-menu.spec.ts` | 373 | 2026-08-11 703b5653 | wired | `via scripts/qa/run-bounded-e2e.mjs` |
| `pass66-gun-range-killstreak-demo-capture.spec.ts` | 993 | 2026-08-31 02d9058f | wired | `via scripts/qa/run-pass66-killstreak-demo-capture.mjs` |
| `pass66-gun-range-test-bay.spec.ts` | 477 | 2026-08-11 de3940d3 | ORPHAN | mentioned by 3 unreachable file(s) |
| `pass66-host-crash-rejoin.spec.ts` | 514 | 2026-08-12 0c47a1c7 | wired | `via scripts/qa/pass66-owned-browser-verifier-contract.test.mjs` |
| `pass66-owner-feedback-multiplayer-ui.spec.ts` | 360 | 2026-08-11 ec13f23a | wired | `via scripts/qa/pass66-multiplayer-stability-contract.mjs` |
| `pass66-pass63-multiplayer-comparator.spec.ts` | 337 | 2026-08-02 4b43704e | wired | `via scripts/qa/run-pass66-pass63-multiplayer-comparator.mjs` |
| `pass66-prone-contact-matrix.spec.ts` | 650 | 2026-08-10 8426d58a | wired | `via scripts/qa/run-pass66-prone-contact-matrix.mjs` |
| `pass66-qoder-multiplayer-authority.spec.ts` | 1001 | 2026-08-12 81a825cb | wired | `via scripts/qa/pass66-multiplayer-stability-contract.test.mjs` |
| `pass66-real-input-ads-hitl.spec.ts` | 437 | 2026-08-12 411c87dd | ORPHAN | nothing |
| `pass66-scoped-ads-regressions.spec.ts` | 113 | 2026-08-02 4b43704e | ORPHAN | mentioned by 2 unreachable file(s) |
| `pass66-sky-backdrop-regressions.spec.ts` | 288 | 2026-08-02 4b43704e | ORPHAN | nothing |
| `pass66-support-operate-prompt.spec.ts` | 275 | 2026-08-02 4b43704e | wired | `via scripts/qa/run-pass66-support-operate-prompt-evidence.mjs` |
| `pass66-timed-map-weapons-multiplayer-rejoin.spec.ts` | 509 | 2026-08-11 9f31590a | wired | `via scripts/qa/pass66-multiplayer-stability-contract.mjs` |
| `pass66-timed-map-weapons.spec.ts` | 313 | 2026-08-08 df330132 | ORPHAN | mentioned by 3 unreachable file(s) |
| `pass66-viewmodel-framing.spec.ts` | 244 | 2026-08-12 d24d258b | ORPHAN | docs only (2) |
| `pass69-3-ads-physical-clearance.spec.ts` | 306 | 2026-08-11 5508e491 | wired | `via scripts/qa/run-bounded-e2e.mjs` |
| `pass69-3-authored-near-plane-catalog.spec.ts` | 1305 | 2026-08-22 af1d6f8b | wired | `via scripts/qa/run-pass69-3-authored-near-plane-catalog.mjs` |
| `pass69-3-glass-m14-frame-hitch.spec.ts` | 360 | 2026-08-10 dce4c0f0 | wired | `via scripts/qa/run-bounded-e2e.mjs` |
| `pass69-3-rigged-bot-live.spec.ts` | 3757 | 2026-08-10 4a22cc92 | wired | `via scripts/qa/run-pass69-3-rigged-bot-live.mjs` |
| `pass69-3-special-weapon-frame-hitch.spec.ts` | 748 | 2026-08-10 c8504a53 | wired | `via scripts/qa/run-bounded-e2e.mjs` |
| `pass69-mobile-touch-layout.spec.ts` | 500 | 2026-08-22 cbca7f68 | wired | `via scripts/qa/run-bounded-e2e.mjs` |
| `pass70-chopper-gunner.spec.ts` | 845 | 2026-08-11 de3940d3 | ORPHAN | mentioned by 3 unreachable file(s) |
| `pass70-cross-browser-firefox-multiplayer.spec.ts` | 1025 | 2026-08-30 b96e145d | wired | `via scripts/qa/pass70-cross-browser-native-user-agent-contract.test.mjs` |
| `pass70-field-kit-mobile.spec.ts` | 80 | 2026-08-11 a8935990 | ORPHAN | mentioned by 1 unreachable file(s) |
| `pass70-flare-direct-human.spec.ts` | 150 | 2026-08-11 de3940d3 | ORPHAN | nothing |
| `pass70-gun-range-clock-authority.spec.ts` | 1012 | 2026-08-31 02d9058f | ORPHAN | nothing |
| `pass70-gun-range-door-visual.spec.ts` | 63 | 2026-08-11 de3940d3 | ORPHAN | nothing |
| `pass70-weapon-contact-scope.spec.ts` | 200 | 2026-08-11 d4b4fa00 | wired | `npm:qa:pass70:weapon-contact-scope:browser` |
| `pass72-lobby-squad-reset.spec.ts` | 182 | 2026-08-20 73b61ba8 | wired | `via scripts/qa/run-bounded-e2e.mjs` |
| `pass73-collision-route-authority.spec.ts` | 243 | 2026-08-21 d7214eb3 | wired | `via scripts/qa/run-pass73-collision-route-authority.mjs` |
| `pass73-gameplay-regressions.spec.ts` | 520 | 2026-08-21 a0c8dedf | wired | `.github/workflows/verify.yml` |
| `pass73-native-ads-reveal.spec.ts` | 476 | 2026-08-21 ec501e69 | wired | `via scripts/qa/pass73-native-ads-reveal-contract.test.mjs` |
| `pass73-native-grenade.spec.ts` | 283 | 2026-08-21 9f5120d0 | wired | `via scripts/qa/pass73-native-grenade-contract.test.mjs` |
| `pass73-network-reveal-authority.spec.ts` | 1054 | 2026-08-21 a0c8dedf | wired | `.github/workflows/verify.yml` |
| `pass74-arena-boot-smoke.spec.ts` | 184 | 2026-09-02 ae6b9eef | wired | `npm:qa:pass74:arena-boot-smoke` |
| `pass74-chopper-hud.spec.ts` | 126 | 2026-08-28 df8087fc | wired | `via scripts/qa/run-bounded-e2e.mjs` |
| `pass84-gamepad.spec.ts` | 523 | 2026-09-02 a49d92d4 | wired | `npm:qa:pass84:gamepad` |
| `release-channel-chooser.spec.ts` | 124 | 2026-09-02 1d24a569 | wired | `npm:qa:pass66:release-shell-evidence` |
| `rustworks-refinement.spec.ts` | 106 | 2026-08-02 4b43704e | wired | `npm:qa:pass63` |
| `rustworks-tower-overhaul.spec.ts` | 123 | 2026-07-23 c18ceea8 | ORPHAN | docs only (1) |

## `scripts/qa` — the 173 unreachable scripts

Reachability here is a weaker signal than for specs: much of `scripts/qa` is
operator tooling the owner or an agent runs by hand with explicit arguments,
and "no npm script names it" does not make such a tool dead. What it does mean
is that **nothing will ever run it for you**, so its assumptions rot silently —
which is exactly what happened to the arena rosters below. Treat this list as
a maintenance liability, not a delete list.

| file | lines | last commit | state | referenced by |
|---|---:|---|---|---|
| `.probe-scene.mjs` | 28 | 2026-08-30 b96e145d | ORPHAN | mentioned by 1 unreachable file(s) |
| `arena-viewpoint-regression.test.mjs` | 460 | 2026-08-31 fb9fc79c | ORPHAN | mentioned by 3 unreachable file(s) |
| `audit-collider-visual-parity.ts` | 74 | 2026-08-26 cddb0d20 | ORPHAN | mentioned by 6 unreachable file(s) |
| `build-invisible-wall-map.mjs` | 201 | 2026-08-26 9b007a51 | ORPHAN | docs only (1) |
| `capture-arena-viewpoints.mjs` | 373 | 2026-08-30 ff1cce94 | ORPHAN | mentioned by 4 unreachable file(s) |
| `capture-below-deck-webgpu-cdp.mjs` | 110 | 2026-08-31 02d9058f | ORPHAN | nothing |
| `capture-below-deck.mjs` | 104 | 2026-08-30 ff1cce94 | ORPHAN | mentioned by 6 unreachable file(s) |
| `capture-corridor-views.mjs` | 191 | 2026-09-02 525c98d3 | ORPHAN | mentioned by 1 unreachable file(s) |
| `capture-crimson-flamethrower-style.mjs` | 130 | 2026-08-30 ff1cce94 | ORPHAN | nothing |
| `capture-failing-wgsl.mjs` | 132 | 2026-08-31 02d9058f | ORPHAN | nothing |
| `capture-farcrysis-shore.mjs` | 101 | 2026-08-30 ff1cce94 | ORPHAN | nothing |
| `capture-farcrysis-tree-textures.mjs` | 145 | 2026-08-30 ff1cce94 | ORPHAN | nothing |
| `capture-hf380-in-match.mjs` | 73 | 2026-08-31 02d9058f | ORPHAN | nothing |
| `capture-hf380-operator-panel.mjs` | 82 | 2026-08-31 02d9058f | ORPHAN | nothing |
| `capture-hf383-declutter.mjs` | 59 | 2026-08-31 02d9058f | ORPHAN | mentioned by 1 unreachable file(s) |
| `capture-hf383-seam-repair.mjs` | 75 | 2026-08-30 ff1cce94 | ORPHAN | nothing |
| `capture-hf383-verify.mjs` | 73 | 2026-08-30 ff1cce94 | ORPHAN | nothing |
| `capture-hf388-arms.mjs` | 679 | 2026-08-30 ff1cce94 | ORPHAN | mentioned by 1 unreachable file(s) |
| `capture-hf392-windows-round2.mjs` | 122 | 2026-08-30 ff1cce94 | ORPHAN | nothing |
| `capture-hf392-windows.mjs` | 114 | 2026-08-30 ff1cce94 | ORPHAN | mentioned by 1 unreachable file(s) |
| `capture-hf393-shoreline.mjs` | 68 | 2026-08-31 02d9058f | ORPHAN | nothing |
| `capture-hf394-water.mjs` | 75 | 2026-08-30 ff1cce94 | ORPHAN | mentioned by 1 unreachable file(s) |
| `capture-hijacked-refinement.mjs` | 111 | 2026-08-30 ff1cce94 | ORPHAN | nothing |
| `capture-hijacked-viewpoints.mjs` | 125 | 2026-08-30 ff1cce94 | ORPHAN | nothing |
| `capture-map3-views.mjs` | 179 | 2026-09-02 c92e3f42 | ORPHAN | nothing |
| `capture-nuketown-environment-fix.mjs` | 276 | 2026-08-31 02d9058f | ORPHAN | nothing |
| `capture-nuketown-grassmtn.mjs` | 82 | 2026-08-31 02d9058f | ORPHAN | nothing |
| `capture-pass60-visual-acceptance.mjs` | 97 | 2026-08-30 ff1cce94 | ORPHAN | docs only (1) |
| `capture-pass79-weather-readability.mjs` | 473 | 2026-08-30 ff1cce94 | ORPHAN | nothing |
| `capture-release-identity-surfaces.mjs` | 129 | 2026-09-02 34eee4dd | ORPHAN | nothing |
| `capture-viewmodel-clip-frames.mjs` | 57 | 2026-08-31 b138b9c0 | ORPHAN | nothing |
| `capture-weapon-rail-frames-cdp.mjs` | 83 | 2026-09-02 1d4931c5 | ORPHAN | nothing |
| `collider-visual-parity-core.ts` | 760 | 2026-09-02 45f45cc2 | ORPHAN | mentioned by 3 unreachable file(s) |
| `compare-farcrysis-admitted-frames.mjs` | 73 | 2026-09-02 ce70eece | ORPHAN | docs only (1) |
| `compare-lane-l-art-direction.mjs` | 204 | 2026-08-23 fe68d1dc | ORPHAN | mentioned by 1 unreachable file(s) |
| `defect-probe-cdp.mjs` | 144 | 2026-08-30 ff1cce94 | ORPHAN | nothing |
| `diag-farcrysis-vege-materials.mjs` | 78 | 2026-08-30 ff1cce94 | ORPHAN | nothing |
| `diagnose-guest-lobby-arena-sync.mjs` | 145 | 2026-08-31 02d9058f | ORPHAN | nothing |
| `diagnose-host-fire.mjs` | 161 | 2026-09-02 2eb8c9af | ORPHAN | nothing |
| `diagnose-lobby-ready-deadlock.mjs` | 175 | 2026-08-31 02d9058f | ORPHAN | mentioned by 1 unreachable file(s) |
| `diagnose-viewmodel-clip-cdp.mjs` | 177 | 2026-09-02 998592f0 | ORPHAN | docs only (1) |
| `diff-arena-viewpoints.mjs` | 314 | 2026-08-28 804b571b | ORPHAN | mentioned by 4 unreachable file(s) |
| `diff-gameplay-contract.mjs` | 29 | 2026-08-31 db205b90 | ORPHAN | nothing |
| `dump-glb-nodes.mjs` | 170 | 2026-09-02 1d4931c5 | ORPHAN | mentioned by 1 unreachable file(s) |
| `gen-ui-inventory.mjs` | 39 | 2026-08-03 4076119e | ORPHAN | nothing |
| `generate-pass65-renderer-feature-inventory.ts` | 126 | 2026-07-26 b7577fbe | ORPHAN | mentioned by 3 unreachable file(s) |
| `hf383-capture.mjs` | 94 | 2026-08-31 02d9058f | ORPHAN | nothing |
| `hf387-clip-headless.scratch.mjs` | 257 | 2026-08-30 ff1cce94 | ORPHAN | mentioned by 1 unreachable file(s) |
| `hf387-collect-debug.scratch.mjs` | 46 | 2026-08-30 ff1cce94 | ORPHAN | mentioned by 1 unreachable file(s) |
| `hf387-eye-probe.scratch.mjs` | 245 | 2026-08-30 ff1cce94 | ORPHAN | mentioned by 1 unreachable file(s) |
| `hf387-metric-debug.scratch.mjs` | 154 | 2026-08-30 ff1cce94 | ORPHAN | mentioned by 1 unreachable file(s) |
| `hf387-retreat-telemetry-probe.mjs` | 139 | 2026-08-30 ff1cce94 | ORPHAN | nothing |
| `hf391-analyse-trace.mjs` | 62 | 2026-08-24 7c0a6219 | ORPHAN | mentioned by 1 unreachable file(s) |
| `hf391-hud-sway-trace.mjs` | 177 | 2026-09-02 2eb8c9af | ORPHAN | mentioned by 2 unreachable file(s) |
| `hf392-capture-headless.mjs` | 93 | 2026-08-30 ff1cce94 | ORPHAN | nothing |
| `hf392-capture.mjs` | 97 | 2026-08-31 02d9058f | ORPHAN | mentioned by 1 unreachable file(s) |
| `hf396-grass-capture-cdp.mjs` | 129 | 2026-08-30 ff1cce94 | ORPHAN | nothing |
| `hf399-cpuprofile-inclusive.mjs` | 86 | 2026-09-02 c6b4f4d3 | ORPHAN | mentioned by 1 unreachable file(s) |
| `hf399-fps-phase-probe-cdp.mjs` | 370 | 2026-09-02 eb52e8c4 | ORPHAN | mentioned by 1 unreachable file(s) |
| `hf399-frame-anatomy-cdp.mjs` | 381 | 2026-09-02 eb52e8c4 | ORPHAN | mentioned by 1 unreachable file(s) |
| `hf399-quiet-window.mjs` | 58 | 2026-09-02 eb52e8c4 | ORPHAN | nothing |
| `inspect-arms-glb.mjs` | 30 | 2026-08-11 3729c79a | ORPHAN | docs only (1) |
| `lib/cross-engine-stall-agent.js` | 487 | 2026-08-31 1799da05 | ORPHAN | mentioned by 1 unreachable file(s) |
| `lib/launch-match.mjs` | 62 | 2026-08-30 ff1cce94 | ORPHAN | mentioned by 11 unreachable file(s) |
| `measure-arena-commit-cdp.mjs` | 127 | 2026-08-31 02d9058f | ORPHAN | nothing |
| `measure-below-deck-luminance.mjs` | 212 | 2026-08-31 02d9058f | ORPHAN | mentioned by 1 unreachable file(s) |
| `measure-below-deck-silhouette.mjs` | 189 | 2026-08-31 02d9058f | ORPHAN | mentioned by 3 unreachable file(s) |
| `measure-browser-frame-parity.mjs` | 1053 | 2026-08-31 02d9058f | ORPHAN | mentioned by 2 unreachable file(s) |
| `measure-browser-frame-parity.test.mjs` | 281 | 2026-08-22 821eb8e0 | ORPHAN | mentioned by 2 unreachable file(s) |
| `measure-cross-engine-stalls.mjs` | 646 | 2026-08-31 1799da05 | ORPHAN | mentioned by 4 unreachable file(s) |
| `measure-fps-in-match-webgpu.mjs` | 98 | 2026-08-31 02d9058f | ORPHAN | nothing |
| `measure-fps-in-match.mjs` | 90 | 2026-08-31 02d9058f | ORPHAN | mentioned by 1 unreachable file(s) |
| `measure-hf331-firefox-gap.mjs` | 173 | 2026-08-31 02d9058f | ORPHAN | docs only (2) |
| `measure-max-preset-admission-cdp.mjs` | 349 | 2026-08-31 02d9058f | ORPHAN | nothing |
| `measure-menu-interactive-cdp.mjs` | 88 | 2026-08-31 02d9058f | ORPHAN | nothing |
| `measure-preset-admission.mjs` | 137 | 2026-08-31 02d9058f | ORPHAN | mentioned by 2 unreachable file(s) |
| `measure-spawn-layouts.ts` | 48 | 2026-09-02 7617a51f | ORPHAN | mentioned by 1 unreachable file(s) |
| `measure-viewmodel-penetration-cdp.mjs` | 367 | 2026-09-02 48b36437 | ORPHAN | mentioned by 2 unreachable file(s) |
| `mp-core-repro-matrix.mjs` | 538 | 2026-09-02 2eb8c9af | ORPHAN | docs only (1) |
| `p0-arena-boot-probe.mjs` | 59 | 2026-08-31 02d9058f | ORPHAN | nothing |
| `pass40-browser-qa.mjs` | 117 | 2026-08-30 ff1cce94 | ORPHAN | nothing |
| `pass66-killstreak-demo-source-closure.ts` | 76 | 2026-08-02 4b43704e | ORPHAN | mentioned by 4 unreachable file(s) |
| `pass66-killstreak-demo-video-probe.ts` | 220 | 2026-08-02 4b43704e | ORPHAN | mentioned by 5 unreachable file(s) |
| `pass73-live-graphics-contract.test.mjs` | 458 | 2026-08-21 26263ace | ORPHAN | mentioned by 2 unreachable file(s) |
| `pass79-graphics-capture.mjs` | 135 | 2026-09-02 e4c812ea | ORPHAN | nothing |
| `playtest-arena-cdp-r2.mjs` | 679 | 2026-09-02 e4c812ea | ORPHAN | mentioned by 1 unreachable file(s) |
| `playtest-arena-cdp.mjs` | 492 | 2026-09-02 e4c812ea | ORPHAN | mentioned by 1 unreachable file(s) |
| `playtest-defect-probes-r2.mjs` | 124 | 2026-08-30 ff1cce94 | ORPHAN | nothing |
| `playtest-defect-probes.mjs` | 286 | 2026-08-30 ff1cce94 | ORPHAN | nothing |
| `playtest-farcrysis-deadzone.mjs` | 76 | 2026-08-30 ff1cce94 | ORPHAN | nothing |
| `playtest-focused-probes.mjs` | 244 | 2026-09-02 e4c812ea | ORPHAN | nothing |
| `playtest-pickup-centre-probe.mjs` | 83 | 2026-08-30 ff1cce94 | ORPHAN | nothing |
| `playtest-probe-webgpu.mjs` | 60 | 2026-08-30 ff1cce94 | ORPHAN | nothing |
| `playtest-sweep-cdp.mjs` | 350 | 2026-09-02 e4c812ea | ORPHAN | mentioned by 1 unreachable file(s) |
| `probe-ads-crosshair.cjs` | 176 | 2026-08-30 b96e145d | ORPHAN | mentioned by 1 unreachable file(s) |
| `probe-arena-scene.mjs` | 127 | 2026-08-30 ff1cce94 | ORPHAN | nothing |
| `probe-care-targeting.cjs` | 128 | 2026-08-30 b96e145d | ORPHAN | nothing |
| `probe-cold-visitor.mjs` | 83 | 2026-08-31 02d9058f | ORPHAN | nothing |
| `probe-crimson-fire-state.mjs` | 57 | 2026-08-30 ff1cce94 | ORPHAN | nothing |
| `probe-farcrysis-boot-cdp.mjs` | 550 | 2026-09-02 de283d74 | ORPHAN | mentioned by 1 unreachable file(s) |
| `probe-hf331-firefox-stages.mjs` | 110 | 2026-08-31 02d9058f | ORPHAN | nothing |
| `probe-hf383-backend.mjs` | 32 | 2026-08-30 ff1cce94 | ORPHAN | nothing |
| `probe-hf388-arm-lighting.mjs` | 458 | 2026-08-30 ff1cce94 | ORPHAN | mentioned by 3 unreachable file(s) |
| `probe-hijacked-scene.mjs` | 123 | 2026-08-30 ff1cce94 | ORPHAN | nothing |
| `probe-hijacked-selection.mjs` | 24 | 2026-08-30 ff1cce94 | ORPHAN | nothing |
| `probe-hijacked-teleport.mjs` | 45 | 2026-08-30 ff1cce94 | ORPHAN | nothing |
| `probe-invisible-wall-boxes.mjs` | 109 | 2026-08-30 ff1cce94 | ORPHAN | nothing |
| `probe-light-graph-churn-cdp.mjs` | 267 | 2026-08-31 b6dbb7c2 | ORPHAN | mentioned by 1 unreachable file(s) |
| `probe-midmap-walk-cdp.mjs` | 83 | 2026-08-30 ff1cce94 | ORPHAN | nothing |
| `probe-mp-arena-transition.mjs` | 72 | 2026-08-31 02d9058f | ORPHAN | nothing |
| `probe-orbit-camera.cjs` | 85 | 2026-08-30 b96e145d | ORPHAN | nothing |
| `probe-pass77-operator-animation.mjs` | 272 | 2026-08-30 ff1cce94 | ORPHAN | docs only (1) |
| `probe-pass79-weather-scene.mjs` | 93 | 2026-08-30 ff1cce94 | ORPHAN | nothing |
| `probe-pipeline-compile-stalls-cdp.mjs` | 453 | 2026-09-02 285f44fb | ORPHAN | docs only (10) |
| `probe-plain-chrome-journey.mjs` | 139 | 2026-08-31 02d9058f | ORPHAN | nothing |
| `probe-renderer-route.mjs` | 78 | 2026-08-30 ff1cce94 | ORPHAN | nothing |
| `probe-spawn-enclosure-cdp.mjs` | 116 | 2026-08-30 ff1cce94 | ORPHAN | nothing |
| `probe-staged.cjs` | 20 | 2026-08-04 6963ef95 | ORPHAN | nothing |
| `profile-chopper-hitch-cdp.mjs` | 246 | 2026-08-30 ff1cce94 | ORPHAN | nothing |
| `profile-chopper-observer-attribution-cdp.mjs` | 217 | 2026-08-30 ff1cce94 | ORPHAN | nothing |
| `profile-chopper-pilot-thermal-cdp.mjs` | 182 | 2026-09-02 28267d02 | ORPHAN | docs only (3) |
| `profile-chopper-render-cost-cdp.mjs` | 242 | 2026-08-30 ff1cce94 | ORPHAN | mentioned by 1 unreachable file(s) |
| `profile-combat-stall-attribution-cdp.mjs` | 394 | 2026-08-31 db93c8cb | ORPHAN | mentioned by 2 unreachable file(s) |
| `qa-hitl-verification-runner.mjs` | 325 | 2026-08-30 ff1cce94 | ORPHAN | nothing |
| `report-below-deck-luminance.mjs` | 110 | 2026-08-23 fe68d1dc | ORPHAN | mentioned by 1 unreachable file(s) |
| `run-arena-viewpoint-regression.mjs` | 104 | 2026-08-26 d4585388 | ORPHAN | mentioned by 2 unreachable file(s) |
| `run-local-cross-engine-stalls.mjs` | 96 | 2026-08-31 db93c8cb | ORPHAN | nothing |
| `run-pass64-rejoin-recovery.mjs` | 66 | 2026-07-25 d90f4ce9 | ORPHAN | nothing |
| `run-webgpu-fence-probe.mjs` | 64 | 2026-08-31 02d9058f | ORPHAN | nothing |
| `selftest-invisible-wall-explainer.mjs` | 186 | 2026-08-30 ff1cce94 | ORPHAN | nothing |
| `solve-spawn-layouts.ts` | 214 | 2026-09-02 442abc18 | ORPHAN | mentioned by 2 unreachable file(s) |
| `sweep-invisible-walls-cdp.mjs` | 516 | 2026-08-30 ff1cce94 | ORPHAN | mentioned by 4 unreachable file(s) |
| `test-map3-hud.mjs` | 71 | 2026-09-02 308c6cdb | ORPHAN | nothing |
| `verify-admission-handshake-cdp.mjs` | 298 | 2026-08-31 02d9058f | ORPHAN | mentioned by 1 unreachable file(s) |
| `verify-chopper-observer-frame-cost-cdp.mjs` | 293 | 2026-08-30 ff1cce94 | ORPHAN | nothing |
| `verify-collider-parity-cdp.mjs` | 103 | 2026-08-30 ff1cce94 | ORPHAN | mentioned by 1 unreachable file(s) |
| `verify-collider-parity-live-cdp.mjs` | 254 | 2026-08-30 ff1cce94 | ORPHAN | mentioned by 1 unreachable file(s) |
| `verify-crimson-flame-cdp.mjs` | 148 | 2026-08-30 ff1cce94 | ORPHAN | nothing |
| `verify-elev-boot-headless.mjs` | 117 | 2026-08-30 ff1cce94 | ORPHAN | nothing |
| `verify-farcrysis-boot-headless.mjs` | 140 | 2026-08-30 ff1cce94 | ORPHAN | nothing |
| `verify-farcrysis-ground-contract.mjs` | 167 | 2026-08-30 ff1cce94 | ORPHAN | mentioned by 2 unreachable file(s) |
| `verify-farcrysis-tree-pbr-cdp.mjs` | 181 | 2026-08-30 ff1cce94 | ORPHAN | nothing |
| `verify-farcrysis-tree-textures-cdp.mjs` | 139 | 2026-08-30 ff1cce94 | ORPHAN | nothing |
| `verify-hf-matrix-definitive.mjs` | 679 | 2026-09-02 2eb8c9af | ORPHAN | nothing |
| `verify-hf347-arena-movement-matrix.mjs` | 341 | 2026-08-30 ff1cce94 | ORPHAN | mentioned by 12 unreachable file(s) |
| `verify-hf385-overdrive-cdp.mjs` | 113 | 2026-08-30 ff1cce94 | ORPHAN | nothing |
| `verify-hf386-zero-hit-cdp.mjs` | 161 | 2026-09-02 2eb8c9af | ORPHAN | mentioned by 2 unreachable file(s) |
| `verify-hf387-prone-clip-cdp.mjs` | 258 | 2026-09-02 2eb8c9af | ORPHAN | mentioned by 2 unreachable file(s) |
| `verify-hf387-prone-seating.mjs` | 227 | 2026-08-30 ff1cce94 | ORPHAN | mentioned by 1 unreachable file(s) |
| `verify-hf388-stance-store-publish-cdp.mjs` | 205 | 2026-08-30 ff1cce94 | ORPHAN | nothing |
| `verify-hf390-ballistics-cdp.mjs` | 181 | 2026-08-30 ff1cce94 | ORPHAN | nothing |
| `verify-host-migration.mjs` | 763 | 2026-08-30 ff1cce94 | ORPHAN | mentioned by 1 unreachable file(s) |
| `verify-host-succession-cdp.mjs` | 350 | 2026-08-31 02d9058f | ORPHAN | mentioned by 2 unreachable file(s) |
| `verify-invisible-blockers.mjs` | 285 | 2026-08-30 ff1cce94 | ORPHAN | mentioned by 3 unreachable file(s) |
| `verify-lane-i-menu-art-cdp.mjs` | 107 | 2026-08-31 02d9058f | ORPHAN | nothing |
| `verify-lane-j-fault-sweep.mjs` | 534 | 2026-08-30 ff1cce94 | ORPHAN | mentioned by 3 unreachable file(s) |
| `verify-map-card-provenance.mjs` | 54 | 2026-08-31 c1e5984a | ORPHAN | nothing |
| `verify-mp-movement-parity-cdp.mjs` | 279 | 2026-09-02 2eb8c9af | ORPHAN | mentioned by 1 unreachable file(s) |
| `verify-pass26-fps.mjs` | 47 | 2026-08-30 ff1cce94 | ORPHAN | docs only (1) |
| `verify-pass60-gun-range.mjs` | 153 | 2026-08-30 ff1cce94 | ORPHAN | nothing |
| `verify-pass60-network-recovery.mjs` | 122 | 2026-08-30 ff1cce94 | ORPHAN | mentioned by 1 unreachable file(s) |
| `verify-pass65-menu-preview-webgpu.mjs` | 300 | 2026-08-30 ff1cce94 | ORPHAN | mentioned by 1 unreachable file(s) |
| `verify-pass65-smoke-visual-sanity.mjs` | 333 | 2026-08-30 ff1cce94 | ORPHAN | nothing |
| `verify-pass79-host-guest-fault-matrix.mjs` | 573 | 2026-09-02 2eb8c9af | ORPHAN | mentioned by 1 unreachable file(s) |
| `verify-playtest-fixes.mjs` | 121 | 2026-08-30 5779f410 | ORPHAN | nothing |
| `verify-remotes-matrix-cdp.mjs` | 289 | 2026-09-02 e4c812ea | ORPHAN | nothing |
| `verify-shadow-map-live-preset-cdp.mjs` | 207 | 2026-08-30 ff1cce94 | ORPHAN | nothing |
| `verify-spawn-deploys.mjs` | 447 | 2026-09-02 a3f55846 | ORPHAN | mentioned by 1 unreachable file(s) |
| `verify-swim-state.mjs` | 139 | 2026-08-30 ff1cce94 | ORPHAN | docs only (2) |
| `verify-walkthrough-live-cdp.mjs` | 236 | 2026-08-30 ff1cce94 | ORPHAN | nothing |
| `viewmodel-penetration-ratchet.mjs` | 111 | 2026-09-02 48b36437 | ORPHAN | mentioned by 2 unreachable file(s) |
| `viewmodel-silhouette-contract.test.mjs` | 171 | 2026-08-21 14a9344c | ORPHAN | mentioned by 1 unreachable file(s) |
| `viewpoint-catalog.mjs` | 107 | 2026-08-31 fb9fc79c | ORPHAN | mentioned by 5 unreachable file(s) |

## `scripts/qa` — the 157 reachable scripts

| file | lines | last commit | state | referenced by |
|---|---:|---|---|---|
| `analyze-pass64-match-diagnostics.ts` | 84 | 2026-07-25 b55bf970 | wired | `npm:qa:pass64:diagnostics:analyze` |
| `arena-roster-contract.test.mjs` | 225 | 2026-09-02 e4c812ea | wired | `npm:qa:arena-roster:contract` |
| `arena-roster.mjs` | 138 | 2026-09-02 e4c812ea | wired | `via scripts/qa/arena-roster-contract.test.mjs` |
| `audit-ballistic-parity.ts` | 87 | 2026-08-28 9b9e82c9 | wired | `npm:qa:ballistic-parity` |
| `ballistic-parity-ledger.ts` | 140 | 2026-09-02 45f45cc2 | wired | `via scripts/qa/audit-ballistic-parity.ts` |
| `browser-visibility-contract.test.mjs` | 260 | 2026-08-31 02d9058f | wired | `via scripts/qa/verify-cross-browser-matrix.mjs` |
| `capture-lane-l-art-direction.mjs` | 374 | 2026-08-31 02d9058f | wired | `via scripts/qa/installed-browser-lanes.mjs` |
| `capture-pass25a-environment.mjs` | 69 | 2026-08-31 02d9058f | wired | `npm:qa:environment` |
| `capture-pass29-environment.mjs` | 79 | 2026-08-30 ff1cce94 | wired | `npm:qa:pass29:capture` |
| `capture-release.mjs` | 35 | 2026-08-30 ff1cce94 | wired | `npm:qa:release` |
| `capture-visual-review.mjs` | 173 | 2026-09-02 e4c812ea | wired | `via scripts/qa/arena-roster-contract.test.mjs` |
| `collect-pass64-match-diagnostics.ts` | 88 | 2026-07-25 419294a2 | wired | `npm:qa:pass64:diagnostics:collector` |
| `cross-browser-gate-contract.mjs` | 52 | 2026-08-23 fe68d1dc | wired | `via scripts/qa/cross-browser-gate-contract.test.mjs` |
| `cross-browser-gate-contract.test.mjs` | 110 | 2026-09-02 fa3b92fd | wired | `npm:qa:cross-browser:contract` |
| `eye-clearance-roster.mjs` | 93 | 2026-09-02 45f45cc2 | wired | `via scripts/qa/eye-clearance-sweep-contract.test.mjs` |
| `eye-clearance-sweep-contract.test.mjs` | 328 | 2026-09-02 45f45cc2 | wired | `npm:qa:eye-clearance:contract` |
| `finalize-pass65-firearm-corpus-gate.mjs` | 137 | 2026-07-27 da57aaeb | wired | `npm:qa:pass65:weapon-assets`, `npm:qa:pass65:firearm-corpus-receipt` |
| `finalize-pass66-killstreak-demo-media.ts` | 601 | 2026-08-02 4b43704e | wired | `npm:finalize:pass66:killstreak-demo-videos`, `npm:qa:pass66:killstreak-demo-videos` |
| `find-unreachable-modules.mjs` | 173 | 2026-08-28 804b571b | wired | `npm:qa:unreachable` |
| `generate-pass25a-baselines.ts` | 128 | 2026-08-20 6c8abe03 | wired | `npm:baseline:generate`, `npm:verify:gameplay-contract` |
| `governance-gates.mjs` | 262 | 2026-08-28 804b571b | wired | `npm:qa:governance` |
| `hud-legibility-audit.mjs` | 44 | 2026-08-23 3b79d9a2 | wired | `via scripts/qa/capture-visual-review.mjs` |
| `hunter-drone-glb.mjs` | 201 | 2026-07-27 da57aaeb | wired | `via scripts/qa/verify-pass65-drone-production.mjs` |
| `installed-browser-lanes.mjs` | 356 | 2026-08-31 02d9058f | wired | `via scripts/qa/verify-cross-browser-matrix.mjs` |
| `lib/browser-launch-flags.mjs` | 89 | 2026-08-31 02d9058f | wired | `via scripts/qa/verify-multiplayer.mjs` |
| `lib/browser-visibility-scan.mjs` | 292 | 2026-08-31 02d9058f | wired | `via scripts/qa/browser-visibility-contract.test.mjs` |
| `measure-arena-fps.mjs` | 117 | 2026-09-02 e4c812ea | wired | `via scripts/qa/arena-roster-contract.test.mjs` |
| `measure-presented-frames.mjs` | 636 | 2026-08-31 b6dbb7c2 | wired | `via scripts/qa/browser-visibility-contract.test.mjs` |
| `measure-refresh-ceiling.mjs` | 474 | 2026-08-31 02d9058f | wired | `npm:qa:cross-browser:ceiling` |
| `mp-lab/probe-lobby-sync-watchdog.mjs` | 149 | 2026-09-02 805deff0 | wired | `npm:qa:mp-lab:lobby-watchdog` |
| `mp-lab/probe-perimeter-replication.mjs` | 175 | 2026-09-02 3b1c6878 | wired | `npm:qa:mp-lab:perimeter` |
| `mp-lab/run-host-guest.mjs` | 1143 | 2026-09-02 9f34f3bb | wired | `npm:qa:mp-lab` |
| `pass25a-soak-contract.mjs` | 169 | 2026-08-11 74bf3bf8 | wired | `via scripts/qa/pass25a-soak-contract.test.mjs` |
| `pass25a-soak-contract.test.mjs` | 118 | 2026-08-11 74bf3bf8 | wired | `npm:qa:soak:contract` |
| `pass65-browser-console-contract.mjs` | 11 | 2026-07-29 9185a11b | wired | `via scripts/qa/verify-pass65-cold-webgpu-admission.mjs` |
| `pass65-crossbow-arms-glb.mjs` | 432 | 2026-08-21 42d0f48b | wired | `via scripts/qa/verify-pass65-first-person-arms-weighting.mjs` |
| `pass65-endurance-verifier-contract.mjs` | 46 | 2026-07-29 0a33ca07 | wired | `via scripts/qa/verify-pass65-webgpu-endurance.mjs` |
| `pass65-field-knife-glb.mjs` | 113 | 2026-07-27 da57aaeb | wired | `via scripts/qa/verify-pass65-weapon-production.mjs` |
| `pass65-hardware-webgl2-receipt-contract.mjs` | 544 | 2026-07-29 21eb6b8d | wired | `via scripts/qa/verify-pass65-hardware-webgl2-admission.ts` |
| `pass65-operator-glb.mjs` | 276 | 2026-07-27 d2bee702 | wired | `via scripts/qa/verify-pass65-operator-production.mjs` |
| `pass65-support-vehicle-glb.mjs` | 394 | 2026-08-11 de3940d3 | wired | `via scripts/qa/verify-pass65-support-vehicle-production.mjs` |
| `pass65-weapon-family-glb.mjs` | 299 | 2026-07-27 da57aaeb | wired | `via scripts/qa/finalize-pass65-firearm-corpus-gate.mjs` |
| `pass66-hidden-tab-contract.mjs` | 286 | 2026-08-02 4b43704e | wired | `via scripts/qa/pass66-hidden-tab-contract.test.mjs` |
| `pass66-hidden-tab-contract.test.mjs` | 532 | 2026-08-02 4b43704e | wired | `npm:qa:pass66:hidden-tab:contract` |
| `pass66-multiplayer-stability-contract.mjs` | 334 | 2026-08-12 f423aedc | wired | `via scripts/qa/pass66-owned-browser-verifier-contract.test.mjs` |
| `pass66-multiplayer-stability-contract.test.mjs` | 522 | 2026-08-12 81a825cb | wired | `npm:qa:multiplayer:stability`, `npm:qa:pass66:multiplayer-stability` |
| `pass66-owned-browser-verifier-contract.mjs` | 486 | 2026-08-21 de476b56 | wired | `via scripts/qa/pass66-owned-browser-verifier-contract.test.mjs` |
| `pass66-owned-browser-verifier-contract.test.mjs` | 520 | 2026-08-21 de476b56 | wired | `npm:qa:pass66:owned-browser-verifier-contract` |
| `pass70-cross-browser-audio-evidence-contract.mjs` | 126 | 2026-08-11 d20da38a | wired | `via tests/e2e/pass70-cross-browser-firefox-multiplayer.spec.ts` |
| `pass70-cross-browser-native-user-agent-contract.mjs` | 56 | 2026-08-12 fcc3df53 | wired | `via scripts/qa/pass70-cross-browser-native-user-agent-contract.test.mjs` |
| `pass70-cross-browser-native-user-agent-contract.test.mjs` | 80 | 2026-08-12 fcc3df53 | wired | `npm:qa:pass70:cross-browser:contract` |
| `pass70-firefox-geckodriver-contract.mjs` | 492 | 2026-08-21 aa114737 | wired | `via scripts/qa/pass70-firefox-geckodriver-contract.test.mjs` |
| `pass70-firefox-geckodriver-contract.test.mjs` | 439 | 2026-08-21 aa114737 | wired | `npm:qa:pass70:firefox-geckodriver:contract` |
| `pass73-ci-wiring-contract.mjs` | 96 | 2026-08-21 2a8242d8 | wired | `npm:qa:pass73:ci-wiring-contract`, `.github/workflows/verify.yml->npm:qa:pass73:ci-wiring-contract` |
| `pass73-ci-wiring-contract.test.mjs` | 67 | 2026-08-21 2a8242d8 | wired | `npm:qa:pass73:ci-wiring-contract`, `.github/workflows/verify.yml->npm:qa:pass73:ci-wiring-contract` |
| `pass73-live-graphics-contract.mjs` | 438 | 2026-08-21 26263ace | wired | `via scripts/qa/verify-pass73-live-graphics.mjs` |
| `pass73-native-ads-reveal-contract.mjs` | 375 | 2026-08-21 379aae71 | wired | `via scripts/qa/pass73-native-ads-reveal-contract.test.mjs` |
| `pass73-native-ads-reveal-contract.test.mjs` | 343 | 2026-08-21 379aae71 | wired | `npm:qa:pass73:native-ads-reveal:contract` |
| `pass73-native-grenade-contract.mjs` | 217 | 2026-08-21 24db8d35 | wired | `via scripts/qa/pass73-native-grenade-contract.test.mjs` |
| `pass73-native-grenade-contract.test.mjs` | 195 | 2026-08-21 24db8d35 | wired | `npm:qa:pass73:native-grenade:contract` |
| `pass74-chopper-hud-wiring-contract.mjs` | 45 | 2026-08-26 aecd8b6f | wired | `npm:qa:pass74:chopper-hud-wiring-contract`, `.github/workflows/verify.yml->npm:qa:pass74:chopper-hud-wiring-contract` |
| `pass74-chopper-hud-wiring-contract.test.mjs` | 26 | 2026-08-26 aecd8b6f | wired | `npm:qa:pass74:chopper-hud-wiring-contract`, `.github/workflows/verify.yml->npm:qa:pass74:chopper-hud-wiring-contract` |
| `playwright-web-server.mjs` | 42 | 2026-07-28 f331a842 | wired | `via scripts/qa/installed-browser-lanes.mjs` |
| `probe-arena-surface-roughness.mjs` | 113 | 2026-09-02 e4c812ea | wired | `via scripts/qa/arena-roster-contract.test.mjs` |
| `rigged-rgb-raster-proof.mjs` | 226 | 2026-08-10 124d478d | wired | `via scripts/qa/run-pass69-3-rigged-bot-live.mjs` |
| `run-bounded-e2e.mjs` | 89 | 2026-09-02 b461dd90 | wired | `npm:test:e2e`, `npm:test:e2e:bounded` |
| `run-cross-browser-gate.mjs` | 169 | 2026-09-02 e4c812ea | wired | `npm:qa:cross-browser` |
| `run-hf331-installed-browser-fps.mjs` | 180 | 2026-08-31 02d9058f | wired | `via scripts/qa/lib/browser-visibility-scan.mjs` |
| `run-network-chaos-matrix.ts` | 103 | 2026-07-19 07dfc7bc | wired | `npm:qa:network-chaos` |
| `run-network-chaos-soak.ts` | 94 | 2026-08-11 2f1c501e | wired | `npm:qa:network-chaos:soak` |
| `run-pass25a-mutation.mjs` | 19 | 2026-07-30 336b9ac6 | wired | `npm:test:mutation` |
| `run-pass25a-nightly-property.mjs` | 19 | 2026-07-30 336b9ac6 | wired | `npm:test:property:nightly` |
| `run-pass25a-soak.mjs` | 211 | 2026-08-31 02d9058f | wired | `npm:qa:soak` |
| `run-pass25a-verification.mjs` | 89 | 2026-07-16 204f9b19 | wired | `npm:verify:pass25a` |
| `run-pass29-environment-verification.mjs` | 55 | 2026-07-18 72c313c4 | wired | `npm:qa:pass29:verify` |
| `run-pass64-diagnostics-browser.mjs` | 23 | 2026-07-25 fca6a3b5 | wired | `npm:qa:pass64:diagnostics` |
| `run-pass64-rematch.mjs` | 69 | 2026-07-25 ecabe7e7 | wired | `npm:qa:pass64:rematch` |
| `run-pass66-ads-sight-catalog.mjs` | 64 | 2026-08-02 4b43704e | wired | `npm:qa:pass66:ads-catalog:edge-webgl2`, `npm:qa:pass66:ads-catalog:edge-webgpu` |
| `run-pass66-audio-long-run.mjs` | 147 | 2026-08-02 4b43704e | wired | `npm:qa:pass66:audio-long-run` |
| `run-pass66-browser-admission.mjs` | 67 | 2026-08-02 4b43704e | wired | `npm:qa:pass66:browser-admission:edge-webgl2`, `npm:qa:pass66:browser-admission:edge-webgpu` |
| `run-pass66-hidden-tab-matrix.mjs` | 107 | 2026-08-02 4b43704e | wired | `npm:qa:pass66:hidden-tab` |
| `run-pass66-killstreak-demo-capture.mjs` | 108 | 2026-08-03 2b93d52d | wired | `npm:author:pass66:killstreak-demo-videos` |
| `run-pass66-owned-browser-verifier.mjs` | 425 | 2026-08-21 de476b56 | wired | `npm:qa:private-lobby`, `npm:qa:pass61:netcode` |
| `run-pass66-pass63-multiplayer-comparator.mjs` | 31 | 2026-08-02 4b43704e | wired | `npm:qa:pass66:pass63-multiplayer-comparator` |
| `run-pass66-profile-frame-pacing-matrix.mjs` | 173 | 2026-08-02 4b43704e | wired | `npm:qa:pass66:profile-frame-pacing` |
| `run-pass66-prone-contact-matrix.mjs` | 75 | 2026-08-02 4b43704e | wired | `npm:qa:pass66:prone-contact-matrix` |
| `run-pass66-support-operate-prompt-evidence.mjs` | 52 | 2026-08-02 4b43704e | wired | `via scripts/qa/run-pass66-owned-browser-verifier.mjs` |
| `run-pass69-3-ads-physical-clearance.mjs` | 214 | 2026-08-11 5508e491 | wired | `npm:qa:pass69-3:ads-physical:edge-webgl2`, `npm:qa:pass69-3:ads-physical:edge-webgpu` |
| `run-pass69-3-authored-near-plane-catalog.mjs` | 643 | 2026-08-10 6ebb907d | wired | `npm:qa:pass69-3:near-plane:edge-webgl2`, `npm:qa:pass69-3:near-plane:edge-webgpu` |
| `run-pass69-3-frame-hitch-matrix.mjs` | 435 | 2026-08-10 c8504a53 | wired | `npm:qa:pass69-3:frame-hitch:edge-webgl2`, `npm:qa:pass69-3:frame-hitch:edge-webgpu` |
| `run-pass69-3-rigged-bot-live.mjs` | 6454 | 2026-08-11 341d41d4 | wired | `npm:qa:pass69-3:rigged-bot-contract`, `npm:qa:pass69-3:rigged-bot-live:edge-webgl2` |
| `run-pass69-3-support-aircraft-live.mjs` | 260 | 2026-08-10 c9ac756a | wired | `npm:qa:pass69-3:support-aircraft:edge-webgl2`, `npm:qa:pass69-3:support-aircraft:edge-webgpu` |
| `run-pass70-cross-browser.mjs` | 105 | 2026-08-12 fcc3df53 | wired | `npm:qa:pass70:cross-browser`, `npm:qa:pass70:firefox` |
| `run-pass70-firefox-geckodriver.mjs` | 1494 | 2026-08-21 aa114737 | wired | `npm:qa:pass70:firefox-geckodriver` |
| `run-pass73-collision-route-authority.mjs` | 132 | 2026-08-21 d7214eb3 | wired | `npm:qa:pass73:collision-route-authority:webgl2`, `npm:qa:pass73:collision-route-authority:webgpu` |
| `run-pass73-live-graphics-browser.mjs` | 553 | 2026-08-31 02d9058f | wired | `via scripts/qa/verify-pass73-live-graphics.mjs` |
| `run-pass73-native-ads-reveal.mjs` | 101 | 2026-08-21 cfe2bb17 | wired | `npm:qa:pass73:native-ads-reveal` |
| `run-pass73-native-grenade.mjs` | 98 | 2026-08-21 4ce5bcbb | wired | `npm:qa:pass73:native-grenade` |
| `run-playwright-with-topology.mjs` | 95 | 2026-07-30 564e8b2e | wired | `npm:qa:playwright-topology` |
| `run-with-dev-server.mjs` | 86 | 2026-08-23 fe68d1dc | wired | `npm:qa:cross-browser`, `npm:qa:cross-browser:matrix` |
| `run-with-preview-server.mjs` | 96 | 2026-08-02 4b43704e | wired | `npm:qa:focus-recovery`, `npm:qa:pass52:changelog` |
| `stable-dev-proxy.mjs` | 103 | 2026-08-23 3b79d9a2 | wired | `via scripts/qa/verify-cross-browser-matrix.mjs` |
| `sweep-eye-clearance-live.mjs` | 174 | 2026-08-31 02d9058f | wired | `npm:qa:eye-clearance` |
| `sweep-eye-clearance-spots.ts` | 303 | 2026-09-02 45f45cc2 | wired | `npm:qa:eye-clearance` |
| `validate-pass65-weapon-glbs.mjs` | 69 | 2026-08-02 4b43704e | wired | `npm:qa:pass65:weapon-assets`, `npm:qa:pass65:weapon-gltf` |
| `verify-arena-boot-cdp.mjs` | 155 | 2026-09-02 e4c812ea | wired | `via scripts/qa/arena-roster-contract.test.mjs` |
| `verify-asset-provenance.mjs` | 65 | 2026-07-22 ac845cd4 | wired | `npm:verify:provenance`, `.github/workflows/verify.yml->npm:verify:provenance` |
| `verify-built-release-identity.mjs` | 151 | 2026-09-02 9da6a1bf | wired | `npm:qa:release-identity` |
| `verify-cross-browser-matrix.mjs` | 593 | 2026-09-02 e4c812ea | wired | `npm:qa:cross-browser:matrix` |
| `verify-eye-clearance-runtime.mjs` | 127 | 2026-08-31 02d9058f | wired | `npm:qa:eye-clearance:runtime` |
| `verify-focus-recovery.mjs` | 335 | 2026-08-31 02d9058f | wired | `npm:qa:focus-recovery` |
| `verify-installed-firefox.mjs` | 792 | 2026-08-31 02d9058f | wired | `via scripts/qa/run-pass70-firefox-geckodriver.mjs` |
| `verify-mobile-touch-playability.mjs` | 340 | 2026-08-31 02d9058f | wired | `npm:qa:cross-browser:mobile` |
| `verify-multiplayer-lifecycle.mjs` | 360 | 2026-08-31 02d9058f | wired | `npm:qa:multiplayer:lifecycle` |
| `verify-multiplayer.mjs` | 364 | 2026-08-31 02d9058f | wired | `npm:qa:multiplayer` |
| `verify-npm10-lockfile.mjs` | 59 | 2026-07-30 508780f0 | wired | `npm:qa:lockfile` |
| `verify-pass29-environment.mjs` | 141 | 2026-08-30 ff1cce94 | wired | `via scripts/qa/run-pass29-environment-verification.mjs` |
| `verify-pass30-supports.mjs` | 245 | 2026-08-31 02d9058f | wired | `npm:qa:pass30:multiplayer` |
| `verify-pass31-overdrive.mjs` | 139 | 2026-08-31 02d9058f | wired | `npm:qa:pass31:overdrive` |
| `verify-pass33-maps.mjs` | 35 | 2026-08-30 ff1cce94 | wired | `npm:qa:pass33:maps` |
| `verify-pass33-ray-matrix.cjs` | 77 | 2026-08-30 b96e145d | wired | `npm:qa:pass33:rays` |
| `verify-pass52-changelog.mjs` | 56 | 2026-08-30 ff1cce94 | wired | `npm:qa:pass52:changelog` |
| `verify-pass53-changelog.mjs` | 56 | 2026-08-30 ff1cce94 | wired | `npm:qa:pass53:changelog` |
| `verify-pass61-authoritative-netcode.mjs` | 223 | 2026-08-30 ff1cce94 | wired | `via scripts/qa/run-pass66-owned-browser-verifier.mjs` |
| `verify-pass64-webgpu.mjs` | 927 | 2026-08-30 ff1cce94 | wired | `npm:qa:pass64:webgpu` |
| `verify-pass65-cold-webgpu-admission.mjs` | 518 | 2026-08-30 ff1cce94 | wired | `npm:qa:pass65:cold-webgpu-admission` |
| `verify-pass65-drone-production.mjs` | 144 | 2026-07-26 324ccbc1 | wired | `npm:qa:pass65:drone-asset` |
| `verify-pass65-first-person-arms-visual.mjs` | 426 | 2026-08-30 ff1cce94 | wired | `npm:qa:pass65:first-person-arms-visual` |
| `verify-pass65-first-person-arms-weighting.mjs` | 126 | 2026-08-11 3729c79a | wired | `npm:qa:pass65:weapon-assets` |
| `verify-pass65-frame-pacing.ts` | 831 | 2026-08-31 02d9058f | wired | `npm:qa:pass65:frame-pacing` |
| `verify-pass65-hardware-webgl2-admission.ts` | 1195 | 2026-08-31 02d9058f | wired | `npm:qa:pass65:hardware-webgl2-admission` |
| `verify-pass65-killstreak-catalog.mjs` | 50 | 2026-07-26 06c2ce63 | wired | `npm:verify:killstreak-catalog`, `.github/workflows/verify.yml->npm:verify:killstreak-catalog` |
| `verify-pass65-menu-preview-production.mjs` | 893 | 2026-08-11 04886489 | wired | `npm:qa:pass65:menu-rotor`, `npm:qa:pass65:menu-previews` |
| `verify-pass65-operator-production.mjs` | 218 | 2026-07-27 d2bee702 | wired | `npm:qa:pass65:operator-assets` |
| `verify-pass65-semtex-production.mjs` | 153 | 2026-07-27 5f0dbd4e | wired | `npm:qa:pass65:ordnance-assets` |
| `verify-pass65-support-vehicle-production.mjs` | 367 | 2026-08-11 de3940d3 | wired | `npm:qa:pass65:support-vehicles` |
| `verify-pass65-weapon-production.mjs` | 344 | 2026-08-21 42d0f48b | wired | `npm:qa:pass65:weapon-assets` |
| `verify-pass65-weapon-switch-webgpu.mjs` | 424 | 2026-08-30 ff1cce94 | wired | `npm:qa:pass65:weapon-switch-webgpu` |
| `verify-pass65-webgpu-endurance.mjs` | 1964 | 2026-08-30 ff1cce94 | wired | `npm:qa:pass65:webgpu-endurance` |
| `verify-pass66-atomic-sky-webgpu.mjs` | 243 | 2026-08-30 ff1cce94 | wired | `npm:qa:pass66:sky-webgpu` |
| `verify-pass66-hidden-tab-admission.mjs` | 862 | 2026-08-31 02d9058f | wired | `via scripts/qa/pass66-hidden-tab-contract.test.mjs` |
| `verify-pass66-multiplayer-stability.mjs` | 270 | 2026-08-12 f423aedc | wired | `via scripts/qa/run-pass66-owned-browser-verifier.mjs` |
| `verify-pass66-viewmodel-framing.mjs` | 1481 | 2026-08-30 ff1cce94 | wired | `npm:qa:pass66:viewmodel-framing` |
| `verify-pass73-live-graphics.mjs` | 288 | 2026-08-21 8cde08e8 | wired | `npm:qa:pass73:live-graphics` |
| `verify-pass77-arena-menu-preview-production.mjs` | 583 | 2026-08-31 f083aaa5 | wired | `npm:qa:pass77:menu-previews` |
| `verify-player-path-cdp.mjs` | 160 | 2026-09-02 e4c812ea | wired | `via scripts/qa/arena-roster-contract.test.mjs` |
| `verify-private-lobby.mjs` | 307 | 2026-08-31 02d9058f | wired | `via scripts/qa/run-pass66-owned-browser-verifier.mjs` |
| `verify-public-asset-provenance.mjs` | 112 | 2026-07-22 47c09fb9 | wired | `npm:qa:asset-provenance` |
| `verify-raytraced-preset-cdp.mjs` | 256 | 2026-09-02 e4c812ea | wired | `via scripts/qa/arena-roster-contract.test.mjs` |
| `verify-release-topology-browser.mjs` | 420 | 2026-09-02 1d24a569 | wired | `npm:qa:release-topology`, `.github/workflows/release-production.yml` |
| `verify-release-topology.mjs` | 314 | 2026-08-28 47264ac1 | wired | `npm:verify:release-topology`, `.github/workflows/release-production.yml->npm:verify:release-topology` |
| `verify-release-tree.mjs` | 32 | 2026-07-15 221c0edc | wired | `npm:verify:release-tree`, `.github/workflows/release-production.yml->npm:verify:release-tree` |
| `verify-rustworks-lobby-sync.mjs` | 119 | 2026-08-30 ff1cce94 | wired | `npm:qa:rustworks-lobby-sync` |
| `verify-text-source-integrity.mjs` | 80 | 2026-07-30 ee1bdb0c | wired | `npm:qa:text-integrity` |
| `verify-tsl-node-build-integrity.mjs` | 305 | 2026-08-31 02d9058f | wired | `via scripts/qa/arena-roster-contract.test.mjs` |
| `verify-webgpu-arena-boot.mjs` | 249 | 2026-09-02 e4c812ea | wired | `via scripts/qa/arena-roster-contract.test.mjs` |
| `viewmodel-silhouette-contract.mjs` | 311 | 2026-08-21 14a9344c | wired | `via scripts/qa/verify-pass66-viewmodel-framing.mjs` |

## Hardcoded arena rosters (the recurring one)

The registry holds 9 arenas (`src/arena-identity.ts`), 8 of them selectable
(`farcrysis` is `selectable: false`). Test1 and Test2 shipped 2026-08-30;
Map 3 shipped 2026-09-02.

**13 files under `scripts/qa` and `tests/e2e` wrote a comma-joined string
roster by hand** (the table below has 15 rows; two of them already derived and
are listed because their private copy of the scrape was folded in, not because
they hardcoded anything). All 13 predate Test1/Test2/Map 3, so those three
arenas were swept by none of them, and nothing said so.

**And that was one syntax out of two.** The first version of this audit — and
the anti-regression contract it shipped — looked only for ids comma-joined
inside a single quoted string, and said so nowhere. A skeptic pass measured the
other form. Re-measured here (`artifacts/lane-n/arrlist2.mjs`, requiring three
DISTINCT ids so a switch sequence is not miscounted as a roster):

| roster syntax | files | reachable from an entry point |
|---|---:|---:|
| comma-joined string (`'a,b,c'`) — what the first guard saw | 13 | 13 |
| array literal (`['a', 'b', 'c']`) — what it did not | 24 | 16 |

Among the 16 reachable array-literal rosters were
`scripts/qa/verify-pass77-arena-menu-preview-production.mjs` — the menu-preview
verifier recurrence #1 below is about — and
`tests/e2e/pass65-menu-lifecycle.spec.ts`, which runs straight out of
`.github/workflows/verify.yml` over four ids while its own test is titled
"twenty **all-arena** solo starts". The recurrence this lane declared closed was
still wide open in the most-cited file. What was done about it is in
"The second syntax" below.

This is the third recurrence of one failure mode in this repository:

1. Two arenas shipped another map's menu preview — the preview verifier's
   list was written by hand.
2. `tests/e2e/pass74-arena-boot-smoke.spec.ts`, the gate authored *because* a
   boot incident reached the owner, carried a six-id literal and would not
   have opened Test1 or Test2 (repaired 2026-08-31).
3. Both cross-browser entry points hardcoded the same six ids, so Test1/Test2
   were opened in **no** browser by that gate (repaired 2026-08-30).

| file | old default | arenas it could never reach | now |
|---|---|---|---|
| `scripts/qa/verify-webgpu-arena-boot.mjs` | 6 ids | test1, test2, map3 | `defaultBootRoster()` |
| `scripts/qa/measure-arena-fps.mjs` | 6 ids | test1, test2, map3 | `defaultBootRoster()` |
| `scripts/qa/verify-arena-boot-cdp.mjs` | 6 ids | test1, test2, map3 | `defaultBootRoster()` |
| `scripts/qa/capture-visual-review.mjs` | 6 ids | test1, test2, map3 | `defaultBootRoster()` |
| `scripts/qa/probe-arena-surface-roughness.mjs` | 6 ids | test1, test2, map3 | `defaultBootRoster()` |
| `scripts/qa/verify-raytraced-preset-cdp.mjs` | 6 ids | test1, test2, map3 | `defaultBootRoster()` |
| `scripts/qa/verify-player-path-cdp.mjs` | 5 ids | test1, test2, map3 | `defaultSelectableRoster()` |
| `scripts/qa/pass79-graphics-capture.mjs` | 6 ids | test1, test2, map3 | `defaultBootRoster()` |
| `scripts/qa/playtest-arena-cdp.mjs` | 6 ids | test1, test2, map3 | `defaultBootRoster()` |
| `scripts/qa/playtest-arena-cdp-r2.mjs` | 6 ids | test1, test2, map3 | `defaultBootRoster()` |
| `scripts/qa/playtest-focused-probes.mjs` | 6 ids | test1, test2, map3 | `defaultBootRoster()` |
| `scripts/qa/playtest-sweep-cdp.mjs` | 6 ids | test1, test2, map3 | `defaultBootRoster()` |
| `scripts/qa/verify-remotes-matrix-cdp.mjs` | 6 ids | test1, test2, map3 | `defaultBootRoster()` |
| `scripts/qa/run-cross-browser-gate.mjs` | derived (own copy) | — | shared derivation |
| `scripts/qa/verify-cross-browser-matrix.mjs` | derived (own copy) | — | shared derivation |

Every new default is a **strict superset** of what the script covered before,
so no sweep lost coverage; `--arenas` still overrides.

The two cross-browser scripts already derived their roster — but each carried
its own copy of the scrape, a third copy lives in
`scripts/qa/eye-clearance-sweep-contract.test.mjs`, and — found by the skeptic
pass, missed here — a **fourth** copy sat in
`scripts/qa/verify-pass77-arena-menu-preview-production.mjs:332`,
`selectableArenaRoster(source)`, with its own regex and its own shape
assumptions, in the file at the centre of recurrence #1. Four copies of a
fragile regex is the original failure one level up, and it had already drifted:
both cross-browser copies still enforced a floor of 7 that Map 3 had outgrown.

The derivation now lives once, in `scripts/qa/arena-roster.mjs`, with the floor
beside it. The pass77 copy was **folded in** (it calls the new
`arenaRegistryEntries()`), measured before and after by running the verifier
itself: **1 issue both times, the same pre-existing one** — its recorded
digest for `scripts/assets/generate-pass65-runtime-menu-previews.ts` was moved
by `c25f5e32` (Map 3's menu capture) and never re-recorded, so
`npm run qa:pass77:menu-previews` is RED at `75a4e508` for a reason that has
nothing to do with this lane. The shelf invariants still derive and still run.
(The eye-clearance copy is Lane J's file this pass and was left alone; folding
it in stays PROPOSED below.)

### The second syntax — what the repair did

The detector in `scripts/qa/arena-roster-contract.test.mjs` now reads **both**
syntaxes, and a new test exercises it against an array literal, a comma-joined
string, a multi-line array and a repeating switch sequence, so a detector that
stops matching fails instead of reporting zero offenders. Five more files lost
their literal entirely:

| file | old literal | arenas it could never reach | now |
|---|---|---|---|
| `scripts/qa/verify-hf-matrix-definitive.mjs` | 6 ids, commented "every production arena x TDM and FFA" | test1, test2, map3 | `defaultBootRoster()` |
| `scripts/qa/verify-hf390-ballistics-cdp.mjs` | 6 ids | test1, test2, map3 | `defaultBootRoster()` |
| `scripts/qa/verify-collider-parity-live-cdp.mjs` | 6 ids | test1, test2, map3 | `defaultBootRoster()` |
| `scripts/qa/verify-pass33-maps.mjs` | 4 ids (Pass 33) | high-seas, test1, test2, map3 | `defaultSelectableRoster()` |
| `scripts/qa/collider-visual-parity-core.ts` | 9 ids (complete, but hand-edited twice to stay so) | — | `ARENA_IDS` itself |

`verify-pass33-maps.mjs` takes the SELECTABLE roster rather than the boot
roster on purpose: `farcrysis` is `selectable: false` precisely because its cold
load runs to minutes, and it would blow that script's 60 s per-map budget.

Every remaining array literal is named in `BOUNDED_SUBSET_ALLOWANCES` with a
**kind** the contract enforces, because they are not the same risk:

- **PINNED SET** — the ids are the subject of an equality assertion or a receipt
  digest (`verify-pass65-support-vehicle-production.mjs` asserts the preview
  provenance covers *exactly* three helicopter maps plus Gun Range;
  `pass65-hardware-webgl2-receipt-contract.mjs` has the ids inside a hashed
  receipt shape; `verify-pass64-webgpu.mjs` is a per-arena behaviour matrix
  where only atomic-acres may show grass). Widening asserts something false.
- **AUTHORED ORDER** — a switch/browse sequence where ids repeat and order is
  the contract (`verify-pass65-webgpu-endurance.mjs`'s ten-step sequence,
  `verify-pass66-atomic-sky-webgpu.mjs`'s deliberate return visit,
  `pass66-owner-feedback-multiplayer-ui.spec.ts`'s lobby round trip).
- **TIMING BOUNDED** — a coverage roster capped by measured cost. These are the
  ones that rot, and each entry names what must be re-measured to widen it.
- **REQUIRED SET** — a contract naming arenas that MUST appear in a derived
  roster (the cross-browser and eye-clearance contracts). The opposite of a
  frozen roster: it is what makes a collapsed derivation fail.
- **BEHAVIOUR MAP** — ids classified by a per-arena property, over a roster that
  is itself derived (`verify-remotes-matrix-cdp.mjs`'s TDM/FFA `modeFor`).

**The worst entry, recorded as OPEN DEBT rather than closed:**
`tests/e2e/pass65-menu-lifecycle.spec.ts`. It runs from `verify.yml`, its test
is titled "twenty all-arena solo starts", and it covers four of nine arenas —
high-seas, test1, test2 and map3 have never been solo-started by CI. It was NOT
derived here: twenty starts over eight arenas doubles the cold arena compiles
inside a 300 s test timeout on a CI runner this lane cannot measure, and
gun-range alone exceeds 45 s cold on this machine (see the findings below).
Widening it needs a measured CI budget first, and the literal at line 764 plus
the local four-id `type ArenaId` at line 8 have to move together.

Same-bug-class hardening while here: `tests/e2e/pass66-audio-long-run.spec.ts`
filtered `PASS66_AUDIO_ARENA` against its own four ids and silently yielded an
EMPTY selection for anything else — every test skipped, run reports success,
no audio measured. Identical shape to the `pass66-browser-admission-cycles` bug
below. It now names an unknown id against `ARENA_IDS`, names a real-but-out-of-
budget id, and refuses an empty selection.

### Two rosters stay bounded, by name and with a reason

A frozen roster is not forbidden by the new contract — it is made **visible**.
`BOUNDED_SUBSET_ALLOWANCES` in `scripts/qa/arena-roster-contract.test.mjs`
names each one, and an allowance whose file no longer hardcodes anything is
itself a failure, so the exception list cannot quietly grow stale:

- `scripts/qa/verify-tsl-node-build-integrity.mjs` — a deliberate three-arena
  *behaviour* matrix, not a coverage sweep. gun-range and atomic-acres have
  sun shadows (the built graph must report the shaft stage ON with non-zero
  gain); high-seas does not (the refusal must be NAMED). Widening it would
  assert the wrong half of that contract on arenas nobody has classified.
- `tests/e2e/pass66-browser-admission-cycles.spec.ts` — default only. Its
  admission-latency ceilings (20 s Edge WebGL2, 35 s Edge WebGPU, 60 s WebKit)
  and cold/warm × forward/reverse budget were measured against those four
  arenas; widening the default is a timing change that needs them re-measured.

**A real bug was found there and fixed.** That spec's id filter repeated the
same four ids, so `QA_PASS66_ADMISSION_ARENAS=test1` produced an **empty**
roster and the gate reported success having admitted nothing. It now validates
against `ARENA_IDS`, names an unknown id instead of dropping it, and refuses
to run on an empty roster. The default is unchanged.

## Graphics controls "verified" by a source-shape grep

**CORRECTED 2026-09-02.** The first version of this section said 38 rows, 10
with a live observation and 28 source-shape only, and called the 2026-08-31
figure of 40 refuted. All three claims were wrong, and wrong in the direction
that flatters verification. Re-measured by parsing every `runtimeEvidence(`
call site by argument ARITY — the 4th positional argument *is*
`liveObservation` — with the script preserved at
`docs/evidence/pass85/lane-n/runtime-evidence-arity.mjs`:

```
rows=40 live=1 sourceShapeOnly=39
LIVE: environmentIntensity@L592
liveObservation textual mentions on lines: 141, 159, 531, 533, 544, 936
```

Those six textual mentions are the doc comment, the type field, the function
parameter, the function body and the validator — **no row sets it by name**, so
counting the string would have found zero. `src/graphics-settings-registry.ts`
holds **40** rows. **Exactly one** — `environmentIntensity`, the row that lied
about `scene.environment` and was repaired on 2026-08-31 — carries a
`liveObservation`. **39** are path + symbol + telemetry-path only:

`renderScale`, `adaptiveResolution`, `targetFps`, `frameRateLimit`,
`antiAliasing`, `geometryDetail`, `shadows`, `shadowResolution`,
`shadowUpdateMode`, `shadowFilter`, `indirectLighting`, `ambientOcclusion`,
`screenSpaceReflections`, `screenSpaceGi`, `rayTracing`,
`volumetricLightShafts`, `depthOfField`, `depthOfFieldStrength`, `motionBlur`,
`spatialUpscaling`, `reflectionQuality`, `volumetricQuality`, `smokeQuality`,
`particleQuality`, `anisotropy`, `decalQuality`, `bloomQuality`, `exposure`,
`toneMapping`, `filmicProfile`, `sharpness`, `filmGrain`, `vignette`,
`weatherIntensity`, `rainDensity`, `windStrength`, `lightning`, `wetSurfaces`,
`ambientLife`.

The eleven this document previously omitted from that list — and therefore
implicitly certified as observation-backed when nothing observes them — are
`antiAliasing`, `shadowResolution`, `ambientOcclusion`,
`screenSpaceReflections`, `screenSpaceGi`, `volumetricLightShafts`,
`depthOfField`, `motionBlur`, `reflectionQuality`, `bloomQuality` and
`weatherIntensity`. Several of those are the most visible controls in the
game.

**The 2026-08-31 figure of 40 is CONFIRMED, not refuted.**

Worth recording precisely, because the model has already been half-corrected
and the correction deserves to stick: the registry's own doc comment now says
so out loud — the path/symbol check "catches a real class of drift ... It is
NOT proof that the consumer executes, and this table no longer describes
itself as though it were. Only a row carrying `liveObservation` claims that."
That is the honest framing. What remains is that **39** player-visible controls
have no observed frame behind them, which is how `scene.environment` being
null on first load passed nine unit tests. The correction above is worth
sitting with: this document's first version made the *same class* of mistake it
exists to expose — it presented a count derived from reading source shapes as
though it were an observation, and the number came out flattering.

Per this lane's brief, **no change was made to the runtimeEvidence model**;
it is PROPOSED below.

## What this lane applied

| class | count | commits |
|---|---:|---|
| (a) orphaned specs wired after passing (reachable, NOT run by CI — see below) | 1 | `b461dd90` |
| (b) rosters derived from the registry | 13 + 5 files, 1 shared module, 1 contract, 20 named allowances | `e4c812ea`, `b30bd1aa` |
| (c) legacy-main line-count ratchet (fails in both directions) | 1 | `ccc8085c` |
| (d) exact duplicates deleted | 0 (none exist — measured) | — |

The two per-file inventory tables above were generated at `462b5687` and are a
snapshot of that tree; the repair commit `b30bd1aa` changed nine more files, so
a line count in those tables may be a few lines short of the current head.

`package.json` gained **two** script entries — `qa:arena-roster:contract` and
`qa:pass84:gamepad` — and nothing was reordered or removed. (The first version
of this sentence said "three" and then listed two.)

### (c) The legacy-main ratchet fails in BOTH directions

`src/legacy-main-size-ratchet.test.ts` pins the file at its measured 35,720
newlines with no headroom. Two things fail it, and the first version of this
document and the lane report disclosed only one:

- **Growth.** Any lane landing net-new lines in `src/legacy-main.ts` reds
  `npm test` until it raises `LINE_CEILING` and adds a `CEILING_HISTORY` entry.
  That is the intended friction.
- **Shrink past the slack.** `RATCHET_SLACK` is 250, so a lane that *removes*
  more than 250 lines also reds `npm test` until it LOWERS the ceiling and adds
  the same entry. That is also deliberate — a ceiling left far above the file
  decays into permanent slack and waves a later regrowth straight through — but
  it is the likelier collision this pass: PASS 85 has explicit streamline lanes
  and Lane W is assigned `solveRiggedArms` in this very file. The procedure is
  the same three steps documented at the top of the test file, and lowering
  never needs review.

### (a) Orphaned specs: measured before wiring

Every candidate was run headless, one browser at a time, on a quiet GPU
(ComfyUI queue empty, 3.9–6.4 GB VRAM free). Only the one that passed was
wired.

| spec | result | verdict |
|---|---|---|
| `pass84-gamepad.spec.ts` | 6/6 green, 5.0 min (installed Chrome headless, real WebGPU adapter); re-checked green on bundled Chromium/SwiftShader for one in-match and one lobby test | **WIRED** — default group + `npm run qa:pass84:gamepad` |
| `pass70-field-kit-mobile.spec.ts` | passes in 3.8 s WITH a real adapter; fails without one | left orphaned — see the finding below |
| `pass66-viewmodel-framing.spec.ts` | fails: gun-range stalls at 95% "COMPILING ARENA SHADERS", 45 s internal wait exceeded | left orphaned |
| `pass65-debug-capture-viewmodel.spec.ts` | same: gun-range 45 s wait exceeded at 95% shader compile | left orphaned |
| `pass54-wall-penetration.spec.ts` | 30 s internal wait exceeded | left orphaned |
| `pass66-scoped-ads-regressions.spec.ts` | 30 s internal wait exceeded | left orphaned |
| `pass65-operator-visual-gate.spec.ts` | genuine assertion failure (`expect(received).toBe(expected)`) on the canonical opaque PBR operator in Quality/Performance LODs | left orphaned — real red, needs an owner |
| `pass65-frame-pacing-focus.spec.ts` | `#player-name` does not exist any more; the menu DOM moved on after 2026-07-29 | left orphaned — rotted |

No spec's timeout, threshold or assertion was raised to make any of these
pass. A spec that fails stays orphaned and stays on this list.

**8 of the 26 orphans were run; 18 were not, and no selection rule was written
down at the time.** That is a defect in this audit, so here is the rule that
was actually applied, stated after the fact: the brief named
`pass66-viewmodel-framing`; the rest were specs under roughly 250 lines whose
subject matter a PASS 85 lane currently owns (viewmodel framing, gamepad,
mobile field kit, wall penetration, scoped ADS, operator visuals, frame
pacing); and the budget was a shared machine where each run costs a cold build
plus 30–300 s of browser time. Size and current ownership, not risk.

The 18 **not run this pass**, so the next lane does not re-derive which ones
are untested rather than failing:

`pass59-visuals` (111), `pass62-graphics-refinement` (90),
`pass65-destructible-shed` (113), `pass65-flash-authority` (159),
`pass65-gun-range-lighting` (160), `pass65-presentation-audio-blockers` (133),
`pass65-preview-choreography` (188), `pass65-support-visual-gate` (583),
`pass66-carpet-shed-webgpu` (506), `pass66-gun-range-test-bay` (477),
`pass66-real-input-ads-hitl` (437), `pass66-sky-backdrop-regressions` (288),
`pass66-timed-map-weapons` (313), `pass70-chopper-gunner` (845),
`pass70-flare-direct-human` (150), `pass70-gun-range-clock-authority` (1012),
`pass70-gun-range-door-visual` (63), `rustworks-tower-overhaul` (123).

Two of those are the largest specs in the corpus —
`pass70-gun-range-clock-authority` at 1,012 lines (last touched 2026-08-31) and
`pass70-chopper-gunner` at 845 — and neither has an entry point.

### (a) is NOT closed for CI: `pass84-gamepad` still runs in no workflow

Wiring the spec into `run-bounded-e2e.mjs` as `default: true` and adding
`npm run qa:pass84:gamepad` made it **reachable**. It did not make CI execute
it, and the first version of this document implied it had. Both browser jobs in
`.github/workflows/verify.yml` pass `QA_E2E_GROUPS` from `classify-change`, and
`scripts/qa/run-bounded-e2e.mjs:51-54` honours that variable *exclusively* when
it is set (`requestedGroups.size ? filter(named) : filter(default !== false)`).
The group lists are hardcoded strings in `scripts/release/change-impact.mjs:92-93`
and contain neither `pass84-gamepad` nor `pass74-arena-boot-smoke`. So
`default: true` only affects a bare `npm run test:e2e` typed by hand — the same
operator-runs-it-manually status this lane calls the problem.

`scripts/release/**` is outside this lane's ownership, so the patch is in the
lane report for the integrator rather than applied here. It is two appends plus
a wiring contract modelled on the `pass73`/`pass74` precedent this repository
already uses for exactly this (`scripts/qa/pass73-ci-wiring-contract.mjs`
imports `outputsFor` from `../release/change-impact.mjs` and asserts the group
is in both `windows_groups` and `linux_groups`). **The same gap already exists
for `pass74-arena-boot-smoke`** — the gate authored because a boot incident
reached the owner. Fix both or the next lane repeats this.

## Findings that belong to other lanes

1. **gun-range's cold arena compile exceeds 45 s on this machine — VERIFIED,
   with the evidence now tracked.** The first version of this item cited page
   snapshots that no longer existed (Playwright's `outputDir` is
   `artifacts/pass25a/playwright-results`, which later runs overwrite), and the
   one surviving snapshot was from a different spec failing for a different
   reason. So it was re-run, and the re-run *corrected the diagnosis*:

   - On **bundled Chromium/SwiftShader**, `pass66-viewmodel-framing` never
     reaches the arena at all. It fails at bootstrap with "GAMEPLAY RENDERER
     BLOCKED — WebGPU was required, but no GPU adapter was available at all".
     That is finding 2, not a shader compile.
     Evidence: `docs/evidence/pass85/lane-n/pass66-viewmodel-framing-bundled-chromium-swiftshader.error-context.md`.
   - With a **real WebGPU adapter** (installed Chrome, `PASS73_NATIVE_WEBGPU=1`,
     HEADLESS), the same spec boots, enters gun-range, and dies waiting for
     `matchPhase === 'active'` with the page showing `progressbar "Map loading
     progress": 95%` and `COMPILING ARENA SHADERS · 100% = IN GAME`. That is
     the finding, and this is now the evidence for it:
     `docs/evidence/pass85/lane-n/pass66-viewmodel-framing-native-webgpu-gunrange-95pct.error-context.md`.

   Same shape as HF-417 (gun-range in-match switch blows the 12 s fence) and
   HF-411 (load-time deep cut). Until that lands, the gun-range specs cannot be
   wired without raising a timeout, which nobody should do. **Route to Lane H.**
2. **`?renderer=webgl2` is retired everywhere, and the failure screen still
   tells users to use it — VERIFIED by source.** The first version of this item
   guessed at a mobile/compat-path bug from one spec. The mechanism is in
   `src/rendering/render-runtime.ts:623`:

   ```ts
   export function resolveRenderRuntimeRequest(search: string, webGpuAvailable = true): RenderRuntimeRequest {
     // Owner 2026-08-30: "retire all webgl2 stuff, full webgpu, no fallback."
     void search;
     void webGpuAvailable;
     return { requestedBackend: 'webgpu', requireWebGPU: true };
   }
   ```

   The URL is discarded. `?renderer=webgl2` is honoured on **no** path, mobile
   or desktop — by owner directive, and `src/rendering/render-runtime.test.ts`
   pins that intent. Nothing is broken here. What IS wrong is the blocked
   screen: `src/main.ts:15` still renders "Use `?renderer=webgl2` only for the
   explicit rollback-compatible renderer", which is dead advice on a screen a
   real player only sees when they are already stuck.

   This also corrects a comparison the first version drew. `pass84-gamepad`
   booting "on SwiftShader" while `pass70-field-kit-mobile` did not was never
   about mobile: `pass84-gamepad.spec.ts:18` pins `test.use({ channel:
   'chrome' })`, so it always runs on installed Chrome with a real adapter.
   Both failures are one cause — no WebGPU adapter — and both are the honest
   requirement screen doing its job. **Route the stale message text to the
   renderer/UI owner; there is no renderer bug to fix.**
3. **`pass65-operator-visual-gate.spec.ts` is a genuine red**, not rot: it
   boots, runs, and fails an assertion about the canonical opaque PBR operator
   in Quality and authored Performance LODs. It has been unreachable since
   2026-07-27, so nothing has been checking that contract for five weeks.

## PROPOSED, not applied

Everything here is out of this lane's ownership or outside its safe classes.

1. **Fold `scripts/qa/eye-clearance-sweep-contract.test.mjs`'s
   `selectableArenaIdsFromSource()` into `scripts/qa/arena-roster.mjs`.** It is
   the last remaining copy of the same scrape (the pass77 copy was folded in by
   the repair). Lane J owns that file this pass, so it was left alone; the
   import is a two-line change once Lane J lands.
2. **Give the 39 source-shape-only graphics controls a live observation, or
   stop calling them verified.** The registry already documents the
   distinction honestly; the work is to add `liveObservation` rows driven by
   an actual frame. This is the mechanism that let `scene.environment` be null
   on first load through nine unit tests, and it is the same class as HF-414's
   "what does each profile actually deliver" question. **Route to Lane AI**,
   which is auditing exactly that surface.
3. **Put WebGPU into CI, or say in the workflow that it is not there.**
   Neither workflow mentions WebGPU; every green in this repository's history
   is a WebGL2/SwiftShader green while the owner plays WebGPU. A hosted runner
   cannot give a real adapter, so the honest fix is either a self-hosted lane
   on this machine or an explicit, named statement in `verify.yml` that the
   browser checks are compatibility-only. Silence reads as coverage.
4. **A second pixel assertion.** One `toHaveScreenshot` in 76 specs, and it
   photographs the menu with the text overwritten. The visual gates that do
   exist are ROI/telemetry assertions in QA scripts, not spec-level pixels.
   Not this lane's call, but worth an owner decision.
5. **Derive `tests/e2e/pass65-menu-lifecycle.spec.ts`'s roster once somebody
   measures the CI budget.** It is the one TIMING BOUNDED allowance whose gate
   actually runs in CI and whose own test title claims a coverage it does not
   have. Needs a measured twenty-start run over eight arenas against the 300 s
   timeout on a hosted runner; probably needs the gun-range compile fix first.
6. **Audit the 20 non-JS files under `scripts/qa`.** The reachability closure
   never looked at 8 `.mts`, 5 `.py`, 3 `.ps1` and 1 `.sh`, some of which are
   real verifiers invoked by npm scripts.
7. **Delete nothing in `scripts/qa` yet.** 173 unreachable scripts is a real
   liability, but the sample checked here is operator tooling that still runs
   by hand. A deletion pass needs per-file provenance (last human run, not
   last commit), which this audit did not gather.

## How to reproduce this audit

The scan scripts live in this worktree under `artifacts/lane-n/` (git-ignored
by design). They are pure reads: `audit2.mjs` builds the reachability closure,
`rosters.mjs` finds comma-joined arena lists, `arrlist2.mjs` finds array-literal
ones, `dupes.mjs` looks for duplicate specs, `missing.mjs` checks `package.json`
targets. Nothing in them mutates the tree.

Two measurements are preserved as TRACKED files rather than left in
`artifacts/`, because they are the ones this audit got wrong first time:
`docs/evidence/pass85/lane-n/runtime-evidence-arity.mjs` (run it with
`node docs/evidence/pass85/lane-n/runtime-evidence-arity.mjs` from the repo
root) and the two `error-context.md` page snapshots beside it.
