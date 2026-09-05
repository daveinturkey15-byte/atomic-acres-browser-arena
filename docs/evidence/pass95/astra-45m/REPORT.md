# PASS95 candidate 9 - Astra bounded HITL run

**[OPEN] Soak release blocker RED (5/8). Stock boot 4/4 and deterministic captures 10/10 x2 pass on the final tree; this candidate is not certified for HITL acceptance or publication.**

[VERIFIED] Runtime source: `acaf7284c0a65edaed8e5b782b2acad9ec96584c`, branch `contrib/dave-gaming-pc/codex/pass95-hitl-45m`, checkout `C:/Users/david/projects/aa-astra-pass95-hitl`. Documentation-only receipt commits may follow this frozen runtime source. Preview: http://127.0.0.1:4285/?release=latest&renderer=webgpu&render=quality . The inherited in-game release label is PASS94; this URL serves the new local candidate, not public production.

## Changes included

- [VERIFIED] Reviewed Nuke Town visual source: white/dark truck and red driveway coupe, curved flagstones, smoother mountain silhouettes, deeper windows with interior light strips, crowned vehicle roofs with rails and cargo ribs. Source commits `2ecd417a`, `04fc3afc`, `4d6bf4eb`, `5e5862d7`, `26df4508`; existing collision, shot and material-budget contracts retained. Coupe accent graph and colour coverage strengthened during integration.
- [VERIFIED] Canonical multiplayer swap/reload relay and host-authored inventory projection from `91eea4ea`, plus the integration review's stale-revision correction from `5dd78f50`. A forged ordinary equipped weapon is clamped to the admitted pair; reload results fan to claimant and observers; an older reload projection cannot overwrite a newer stored inventory revision. Host/life and special-holder guards retained.
- [VERIFIED] Host respawn-loadout admission fix `a520e961` (cherry-picked from the mp-live leaf `82e175f2`, independently reviewed): `onNetworkMessage` no longer spreads `authoredRespawnLoadout` over continuous state. New `admitAuthoritativeRespawnLoadout` resets to the authored loadout only on a real respawn (host-retained canonical class) or authorized redeploy (authorized incoming selection); continuous state preserves the admitted weapon so a legitimate secondary swap and an in-flight secondary reload survive. Forged continuous claims stay visible so the downstream allow-list fence still rejects them (covered by test). Leaf report `4070aecc` preserved.
- [VERIFIED] Soak sampler schedule fix `8ba915c8` (inherited root edit, reviewed): the sampler slept to `(second+1)*interval`, landing the first sample at t=1 and excluding t=180 for 179 samples max. Sleeping to `second*interval` samples t=0..179 inside the unchanged 180 s window. Window, thresholds and assertions unchanged; final soak records 180/180 samples.
- [VERIFIED] Vehicle-forge paint fix `acaf7284` (cherry-picked from the visual-live leaf `4b1fa697`, independently reviewed): forge paint kept its colour only in the TSL uniform while `material.color` stayed default white, so every colour-reading path (art-kit `batchDisplayColor`/`materialBatchKey`, fidelity gates, WebGL2 compat) saw white and all liveries shared one batch key. One-line `material.color.copy(base)` mirrors the authored linear swatch exactly like every other Nuke Town family; the node graph, uniform topology and pipeline budget are unchanged. Regression gate over all six Pass-95 liveries added. Leaf report `docs/evidence/pass95/astra-visual-live/REPORT.md` preserved. Black house roofs are a separate non-forge roof/lighting path, diagnosed by the leaf and left OPEN.
- [VERIFIED] Two unchanged combat helpers extracted to `remote-combat-helpers.ts`; integrated `legacy-main.ts` is 37,386 lines against the unchanged 37,396 ceiling (ratchet green, no ceiling move).
- [VERIFIED] Released High Seas device-limit fix retained byte-for-byte; its focused device-limit/feature tests pass.

## Fresh verification

| Evidence | Result and limits |
|---|---|
| TypeScript | [VERIFIED] `npx tsc --noEmit`, exit 0 on the final tree. |
| Affected unit tests | [VERIFIED] 183 distinct targeted tests across 16 files passed in the prior runs (thresholds untouched). New: 4 respawn-admission tests, 2 paint batch-contract tests, size ratchet; final combined rerun `vehicle-forge` + `respawn-loadout-admission` + `legacy-main-size-ratchet` 29/29 pass. Soak assertion contract 3/3 Node tests. |
| Build | [VERIFIED] Production build exit 0 from the clean tracked candidate; 606 dist files. Existing large-chunk warning remains. |
| Served bytes | [VERIFIED] `legacy-main-biIzJkJF.js` served over HTTP matches disk; SHA256 `071483c956c13540bfa7f8e013e220fa6efebee190a2c7bfd05143bf0b2aba50`. Dist-tree receipt hash `4b089e164f2456785cf2151d6e997ca9373754d9dae9ed81b29e25c5b3d005ad`. |
| Stock boot | [VERIFIED] 4/4 on the final tree from external unstaged preview 4285 with stock Chrome flags (no unsafe-WebGPU/ignore-GPU/ANGLE): Nuke Town 57.6 s and Raid Rebuild 41.4 s to live frames, zero pipeline errors, zero console errors. HighSeas was not added: no change in this candidate touches it, and Nuke/Raid coverage is unchanged. |
| Deterministic captures | [VERIFIED] Quality 10/10 and performance 10/10 on native NVIDIA Blackwell WebGPU (`artifacts/astra-c9/quality-final`, `artifacts/astra-c9/performance-final`). Pixel inspection: navy saloons, red coupe, cream coach with maroon accent all render authored liveries (previously all white). House roofs remain black (separate non-forge path, OPEN). Windows/path/roofs otherwise read correctly; no clipping claim is made beyond the four inspected frames. |
| Host + two guests / full 180s soak | [OPEN] RED 5/8 on the final tree, label `astra-c9-paintfix`, 180/180 samples in 180205 ms, bundle `artifacts/astra-c9/paintfix/astra-c9-paintfix-bundle.json`. PASS: duration, respawn-reset, stair-fire, console-clean (0 errors), scoreboard agreement. FAIL (unchanged across two runs, identical 345 count): replication (345 `stale-snapshot-never-applied` divergences; leaf investigation found guest-to-guest cross-replicas absent from second 4 while the host sees both fresh, no narrow source cause, no gate relaxed), rejoin-damage (leave/rejoin/seen all true, damage triggered, guestB credited 0, latency null), reload-after-death (both guests false). No rerun-to-green, no weakened assertion. |
| Performance and owner taste | [OPEN] No FPS, frame-tail, draw-call or owner-taste judgement is claimed. Root can inspect the four final frames named in the lane summary. |
| Contribution preflight | [OPEN] Not re-run in this lane (no publish path taken). Inherited divergence `origin/main` vs candidate remains; main ancestry was not reconstructed per the brief. No public publish or main/gh-pages push occurred. |

Full local command outputs are `artifacts-astra-*.log` in this checkout. User-facing receipt and report: `C:/Users/david/Documents/Codex/2026-09-05/read-only-and-plan-launch-nothing/outputs/`. Lane file copies: `taskoutputs/`.

## Shared skills and model usage

[VERIFIED] Skills `browser-multiplayer-netcode`, `realtime-browser-qa`, `bounded-product-acceptance` loaded from the canonical store before any browser work; repo controls outranked the stale release skill throughout. No private skill copies. No subagents were launched in this lane.

[VERIFIED] Both bounded workers completed with lane-done markers: mp-live fix `82e175f2` + report `65a45263` (continuous-swap cause confirmed and fixed; presence-loss/rejoin/reload-after-death left OPEN with investigation notes), visual-live fix `4b1fa697` (white-paint cause confirmed and fixed; black house roofs diagnosed as a separate path). Both cherry-picked with reports preserved; no worker checkout was edited.

## Remaining gates and safe continuation

1. Soak RED is the release blocker: replication presence (guest-to-guest), rejoin damage credit (guestB:0), reload-after-death. Concrete next step is a third investigation pass on the guest-to-guest replication path (stale-snapshot-never-applied from second 4), not threshold changes.
2. Black house roofs: separate roof/lighting path outside the forge lane; needs its own fix + capture pass.
3. Reconcile release history before eventual public promotion. `origin/main` is `506d6142`, merge-base `5075a52d`, with 955 main-only commits and 491 candidate-only commits at the frozen source. This is inherited release-line divergence requiring a separate, reviewed integration; never use an ancestry-only merge or force-push to conceal it.

[OPEN] Prior release debt remains: cold admission 21.7s against 10s; release-time soak truncated. Crimson personal-grant presentation authorization also remains a known separate limitation. Public PASS94 generation `7c9adb8db2b1` was rechecked unchanged at 15:35. No public publish or main/gh-pages push occurred.

Done marker: **ASTRA-LANE-DONE**. Integration work complete; soak release blocker RED and black-roof path OPEN.
