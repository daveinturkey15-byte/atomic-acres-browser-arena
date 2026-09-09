# Pass 93 Nuke Town Rebuild tip-top ship-candidate report

Date: 2026-09-04 (Europe/London)

## Verdict

`SHIP`

`VERIFIED` Candidate source is `70800e0c` on `contrib/dave-gaming-pc/claude/nuketown2-tiptop`. The Pass 93 integration tip `2a404558` was merged without conflicts; `1aad84ab` is its ancestor and the Chrome 153 hotfix files remain present. All requested source, focused-test, build, installed-Chrome boot, Nuke Town smoke, coplanar, and capture gates pass. No P0 or P1 from the pre-review remains open for this candidate.

`OPEN` The repository preflight wrapper does not accept this user-mandated `claude` branch from the Codex harness slug. This is recorded as a tooling/branch-contract mismatch, not a source or runtime gate failure. Production publication and the normal integrator acceptance-manifest binding remain outside this feature-worktree handoff.

`OPEN` Pre-review F-07 remains a P2 bookkeeping follow-up: the presentation-only coach window-band dimensions are not numerically pinned. It does not affect colliders, shot surfaces, runtime lifecycle, or the requested P0/P1 fixes.

## P0/P1 disposition

| Finding | State | Disposition and evidence |
| --- | --- | --- |
| Identical cyan-blue house siding (P0) | `VERIFIED CLOSED` | North siding is pinned to `0x46809f`; south siding is pinned to `0xf4be36`; the fidelity test requires exact distinct bases and RGB distance `> 0.45`. The inspected overhead, north-yard, south-yard, street, and upper-window captures visibly preserve the blue/yellow Nuketown identity while retaining procedural siding grain. |
| Stray purple/magenta marker cubes (P0/P1) | `VERIFIED CLOSED` | The Nuke scene traversal rejects debug/marker node names and exact `0xff00ff`/`0x9d6bff` materials. Source search found no Nuke marker/debug implementation. The inspected seven external and three interior Nuke captures contain no marker cubes. The real global 2x-core pickup ring at `src/legacy-main.ts:4802` was not removed. |
| Grass clipping through cover blocks (P1) | `VERIFIED CLOSED` | Increased `NUKETOWN_LAWN_KEEPOUT_MARGIN_M` from `0.34` to `0.36` to cover float32 instance-matrix boundary quantization. The fidelity test checks every Nuke lawn instance root against collider-derived keep-outs; it passes. Yard captures show cover blocks free of grass penetration. |
| Un-trimmed wall junctions (P1) | `VERIFIED CLOSED` | Existing authored drywall lining, header/crown, window, and trim geometry is retained. The current coplanar instrument reports `HOUSE-INTERIOR ...: 0`; north/south yard and interior captures show continuous trimmed junctions. |
| Upper wall gaps (P1) | `VERIFIED CLOSED` | Existing upper envelope/drywall/header closure is retained and covered by the same house-interior and visual evidence. No sky or mountain leak appears in either upper-window or interior capture. |
| Ground-floor glass lifecycle F-01 (P1) | `VERIFIED CLOSED` | Added side-specific `breakableWindowId` registration for all four ground-floor panes, returned `breakableWindows` from the arena, and marked the panes as non-solid dynamic glass surfaces. The fidelity test verifies four dynamic windows and no duplicate static collider. |
| Ground-floor glass blinds bot LOS F-02 (P1) | `VERIFIED CLOSED` | The four intact panes now enter the existing dynamic glass collider path used by authoritative movement/LOS, while breached panes can open through the existing lifecycle. The fidelity test verifies the pane blocks while intact and that the static collider list does not duplicate it. |
| Fail-open house-interior coplanar check F-03 (P1) | `VERIFIED CLOSED` | The existing repair requires both general `FINDINGS === 0` and `houseInteriorFindings === 0`; the current exact command passes. No threshold or assertion was weakened. |
| Cold-session material authority F-04 (P1) | `VERIFIED CLOSED BY MEASUREMENT` | A fresh installed-Chrome WebGPU A/B measurement was run against Nuke Town. Leaving Nuke Town out of the cold-session precompile roster is the measured choice: baseline total to active was `37370 ms`, visual-definition `6498.8 ms`, `334` pipelines and `117` long tasks; adding Nuke raised these to `41624 ms`, `9594.1 ms`, `353`, and `159`. The no-roster candidate admitted cleanly with no errors, so no unsupported roster entry was added. Receipts are `f04-cold-measurement.json` and `f04-cold-measurement-with-precompile.json`. |
| Final visual acceptance F-05 (P1) | `VERIFIED CLOSED` | The real built preview was captured on native WebGPU at 1280x720, all 10 catalogued Nuke viewpoints passed, and every PNG was inspected. |

## Implemented paths

`VERIFIED` The bounded source changes are:

- `src/additional-maps.ts`: forwards optional breakable-window records from the shared box builder and annotates dynamic pane meshes.
- `src/nuketown2-arena.ts`: registers four ground-floor breakable glass panes, derives north/south IDs for paired geometry, and returns the builder's dynamic-window records.
- `src/nuketown-lawn-field.ts`: adds the measured 20 mm lawn keep-out margin for float32 instance boundaries.
- `src/nuketown2-fidelity.test.ts`: pins the blue/yellow house identity, rejects shipped marker cubes, verifies collider-derived grass keep-outs, and verifies dynamic glass behavior.

`VERIFIED` A temporary Nuke entry in `src/rendering/cold-session-precompile-reach.ts` was measured and rejected because it worsened the cold transition; the final candidate leaves the measured roster unchanged (`farcrysis` only). This was a measured performance decision, not a relaxed fence.

## Required gates

The following are the exact requested gate lines, with the recursive Windows discovery equivalent used for the Vitest invocation. The requested top-level discovery line also passed:

```text
$ grep -l "swizzle\|tint" src/*.test.ts
VERIFIED: 13 top-level swizzle/tint test paths returned
```

```text
$ npx tsc --noEmit
VERIFIED: Exit code 0
```

```text
$files = @(rg -l 'swizzle|tint' src -g '*.test.ts'); npx vitest run src/nuketown2-fidelity.test.ts src/collider-visual-parity-gate.test.ts src/arena-factory-registry.test.ts src/map-selection.test.ts src/graphics-profile-contract.test.ts src/legacy-main-size-ratchet.test.ts $files --reporter=dot
VERIFIED: Test Files 27 passed (27); Tests 451 passed (451); Exit code 0
```

The selected swizzle/tint paths were:

```text
src/art-gen-prompt-originality.test.ts
src/death-drop-presentation.test.ts
src/crimson-flamethrower.test.ts
src/farcrysis-grass-tint.test.ts
src/grass-system.test.ts
src/high-seas.test.ts
src/nuketown-lawn-field.test.ts
src/operator-skin-silhouette.test.ts
src/operator-skin-appearance.test.ts
src/operator-model.test.ts
src/particles/particle-field.test.ts
src/solo-renderer-autoretry.test.ts
src/rendering/art-direction.test.ts
src/rendering/filmic-grade-chain.test.ts
src/rendering/lighting-conditions.test.ts
src/rendering/pass64-tsl-scene.test.ts
src/rendering/raytracing/whitted-tracer.test.ts
src/ui/pass77-visual-language.test.ts
src/webgpu-tint-swizzle-shim.test.ts
src/webgpu-pipeline-repair.test.ts
```

```text
$ npx tsx scripts/qa/find-coplanar-pairs.ts
VERIFIED: HOUSE-INTERIOR pairs<=0.03m (offsets ignored): 0
VERIFIED: head 70800e0c
VERIFIED: FINDINGS (different materials, no offset): 0
VERIFIED: UNAUDITED meshes: 16, unchanged from the prior candidate
VERIFIED: Exit code 0
```

```text
$ npm run build
VERIFIED: 514 modules transformed; build completed; Exit code 0
CLAIMED: Vite emitted its existing large-chunk advisory; it is a warning, not a failed gate.
```

```text
$ npx vite preview --outDir dist --host 127.0.0.1 --port 4296 --strictPort
VERIFIED: background preview started as PID 20708 (node descendant 63172 served port 4296) and was stopped after browser evidence; port 4296 has 0 listening connections.
```

Before each browser operation, the required machine fence was checked:

```text
$ curl.exe -s http://127.0.0.1:8188/queue
VERIFIED: {"queue_running": [], "queue_pending": []}
$ nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits
VERIFIED: 14546 MiB free (greater than the required 3000 MiB)
```

```text
$ QA_EXTERNAL_PREVIEW=1 QA_PREVIEW_PORT=4296 BASE_URL=http://127.0.0.1:4296 npm run qa:stock-boot
VERIFIED: 4 passed (2.1m); Exit code 0
```

```text
$ PASS73_NATIVE_WEBGPU=1 QA_EXTERNAL_PREVIEW=1 QA_PREVIEW_PORT=4296 BASE_URL=http://127.0.0.1:4296 npx playwright test tests/e2e/pass74-arena-boot-smoke.spec.ts --project=chromium --workers=1 --retries=0 -g nuketown2
VERIFIED: 1 passed (41.0s); Exit code 0
```

```text
$ node scripts/qa/capture-arena-viewpoints.mjs --url http://127.0.0.1:4296 --label ship-candidate --sha 70800e0c --arenas nuketown2 --settle-ms 5000 --out docs/evidence/pass93/nuketown2-tiptop/ship-candidate --samples 1
VERIFIED: verdict PASS; backend webgpu; adapter vendor nvidia, architecture blackwell; nuketown2 OK 10/10 shots; Exit code 0
```

Capture manifest: `capture-manifest.json`, source SHA `70800e0c`, bundle `/legacy-main-BO2WYJGX.js`, native WebGPU, 1280x720, ten successful shots: overhead, north yard, south yard, street centre, north upper window, south upper window, into-sun street, north interior, south interior, and garage.

## Visual review

`VERIFIED` I inspected every PNG in the ship-candidate Nuke set. The blue north house and yellow/orange south house remain unmistakably different in overhead, yard, street, and upper-window views. Procedural siding grain is visible on both. The interior views show sealed upper envelopes, continuous wall/trim junctions, and no sky/mountain gaps. No stray magenta marker cube is present in any of the seven external or three interior captures. Purple-toned authored vehicle/door trim is not a marker cube; the actual 2x-core pickup ring remains in its gameplay location outside this Nuke review scene.

## Cleanup and handoff

`VERIFIED` Removed the run-generated `playwright-report/` directory and `artifacts/pass25a/playwright-results/.last-run.json`. `test-results/` was absent. The pre-existing `artifacts/qa/hf399/nuketown2-baseline-nuketown2.json` was preserved. No owner process was terminated; only the preview process tree started by this run was stopped.

`VERIFIED` No full Vitest suite was run. No gate threshold, timeout, assertion, or fence was weakened.
