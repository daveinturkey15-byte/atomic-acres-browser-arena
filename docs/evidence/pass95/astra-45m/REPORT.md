# PASS95 candidate 9 - Astra bounded HITL run

**[OPEN] Built and served; browser acceptance is blocked. This candidate is not certified for HITL acceptance or publication.**

[VERIFIED] Runtime source: `21efd6c1c529d221e0ce6478be799ccb5dac83c5`, branch `contrib/dave-gaming-pc/codex/pass95-hitl-45m`, checkout `C:/Users/david/projects/aa-astra-pass95-hitl`. Documentation-only receipt commits may follow this frozen runtime source. Preview: http://127.0.0.1:4285/?release=latest&renderer=webgpu&render=quality . The inherited in-game release label is PASS94; this URL serves the new local candidate, not public production.

## Changes included

- [VERIFIED] Reviewed Nuke Town visual source: white/dark truck and red driveway coupe, curved flagstones, smoother mountain silhouettes, deeper windows with interior light strips, crowned vehicle roofs with rails and cargo ribs. Source commits `2ecd417a`, `04fc3afc`, `4d6bf4eb`, `5e5862d7`, `26df4508`; existing collision, shot and material-budget contracts retained. Coupe accent graph and colour coverage strengthened during integration.
- [VERIFIED] Canonical multiplayer swap/reload relay and host-authored inventory projection from `91eea4ea`, plus the integration review's stale-revision correction from `5dd78f50`. A forged ordinary equipped weapon is clamped to the admitted pair; reload results fan to claimant and observers; an older reload projection cannot overwrite a newer stored inventory revision. Host/life and special-holder guards retained.
- [VERIFIED] Two unchanged combat helpers extracted to `remote-combat-helpers.ts`; integrated `legacy-main.ts` is 37,395 lines against the unchanged 37,396 ceiling. The initial combined tree failed at 37,402 and was corrected without moving the ceiling.
- [VERIFIED] Released High Seas device-limit fix retained byte-for-byte; its focused device-limit/feature tests pass.

## Fresh verification

| Evidence | Result and limits |
|---|---|
| TypeScript | [VERIFIED] `npx tsc --noEmit`, exit 0 on the final runtime changes. |
| Affected unit tests | [VERIFIED] 183 distinct targeted tests across 16 files passed across the recorded runs. The 172-test integration run initially had 171 passes and one new fixture assertion failure: absent property versus explicit `undefined`. Corrected to strict equality with the pre-call snapshot; relay and size-ratchet rerun passed 13/13. High Seas tests passed 11/11. No test threshold was relaxed. |
| Soak assertion contract | [VERIFIED] 3/3 Node tests. These verify gate logic, not live multiplayer. |
| Coplanar instrument | [VERIFIED] Zero different-material findings, zero same-material-visible findings, zero house-interior and street findings in the instrument's covered geometry. 103 non-box/rotated/instanced meshes are explicitly outside this instrument's coverage. |
| Build | [VERIFIED] Production build exit 0; 606 dist files. Existing large-chunk warning remains. |
| Served bytes | [VERIFIED] `legacy-main-Dk6Ug1ee.js` served over HTTP matches disk; SHA256 `6e12985edfb811eb9fd29437d0e4d506182e292a8f226058780339160302caee`. Dist-tree receipt hash `8eeab3ff834d78d97b0c050df6cb0b3800089a69d501643214389aa7162781cc`. |
| Stock boot / deterministic captures | [OPEN] No browser launched. Entry RAM remained below the handoff's 4 GiB requirement through the bounded queue ending 15:35 BST. HTTP 200 and build success are not browser proof. |
| Host + two guests / full 180s soak | [OPEN] Not run because browser admission was blocked. No local or WAN multiplayer certification is claimed. |
| Performance and owner taste | [OPEN] No fresh FPS, frame-tail, draw-call or visual judgement is claimed. |
| Contribution preflight | [OPEN] Lockfile gate passed. Live executable requires lowercase `--harness codex` (the generic adapter's `Codex` spelling fails). Corrected invocation still rejects inherited missing origin/main ancestry; it was not bypassed. |

Full local command outputs are `artifacts-astra-*.log` in this checkout. User-facing receipt and report: `C:/Users/david/Documents/Codex/2026-09-05/read-only-and-plan-launch-nothing/outputs/`.

## Shared skills and model usage

[VERIFIED] The canonical 164-skill store is unchanged. Claude Code, OMP, Codex, dsh, Continue, Antigravity and Hermes now resolve 164/164 identical skill bodies. Codex retains a real root with per-skill junctions and private `.system`. Recovery is the vault's `_Scripts/link_skills.ps1`; no private copies or baseline resets. Canonical aggregate hash: `1078523a6dabca5c7a23413cb9f9ed2f454d6dbd587e914b3853de066a6eed76`.

[VERIFIED] Repair note and index updated in `C:/Users/david/Documents/desky-bootstrap-clone/Agent-Memory/codex/`. [OPEN] The old release skill still describes four checks/workflow publication; current repo requires five checks and the canonical publish script. Its governed content correction remains pending; the dirty AKP root was preserved.

[VERIFIED] Three bounded OMP workers requested `meta-contributor/muse-spark-1.3` high and completed with `ASTRA-LANE-DONE`; run IDs end `342e61c7-fd82-4e8d-b08b-1ca1115d153b`, `54194334-8f21-4e38-a450-5a860ab90a28`, `160c571b-8260-42d6-9f5a-2ef33c3f3ab2`. Foundry records include independent acceptance and one rework. One bounded native Luna worker repaired skill discovery. No Claude/Gemini worker was needed. [OPEN] Provider attestation/token counts were not emitted; exact cost and actual served model are unmeasured.

## Remaining gates and safe continuation

1. Free at least 4 GiB RAM; take `%TEMP%/aa-heavy.lock`. Existing owner processes and previews remain reserved. Run the original stock boot gate against unstaged dist on 4285 (`QA_EXTERNAL_PREVIEW=1`, `QA_PREVIEW_PORT=4285`, `PASS73_NATIVE_WEBGPU=1`).
2. Run the unchanged `scripts/qa/mp-soak-gate.mjs` on Nuke Town, preserving 180s play and 299s hard stop. Ports 4233/4234/4235 are its existing fenced set. Inspect each guest's swap, reload, fire, pickup, respawn, rejoin and scoreboard evidence. Record incomplete runs as failed/incomplete.
3. Capture and inspect quality/performance deterministic Nuke Town views, then requested-arena High Seas boot regression. Temporary capture adapter in the task's `work/` only removes non-stock launch flags and exposes profile selection; all hardware and camera-revision assertions remain intact.
4. Reconcile release history before eventual public promotion. `origin/main` is `506d6142`, merge-base `5075a52d`, with 955 main-only commits and 491 candidate-only commits at the frozen source. This is inherited release-line divergence requiring a separate, reviewed integration; never use an ancestry-only merge or force-push to conceal it.

[OPEN] Prior release debt remains: cold admission 21.7s against 10s; release-time soak truncated. Crimson personal-grant presentation authorization also remains a known separate limitation. Public PASS94 generation `7c9adb8db2b1` was rechecked unchanged at 15:35. No public publish or main/gh-pages push occurred.

Done marker: **ASTRA-P95-C9-SOURCE-DONE-BROWSER-OPEN**. Source scope is finished; acceptance is not.
