# Pass 96 capture-harness warm-up

## Symptom

- **CLAIMED:** The supplied Pass 96 evidence described a cold-preview capture returning 0/17 with `setArenaReviewCamera returned false - authored camera missing`, while a previously driven session returned 17/17. The referenced `docs/evidence/pass96/materials-albedo-variation/REPORT.md` was not present in this branch, so its historical result is not independently verified here.
- **VERIFIED:** The capture harness requested review cameras immediately after the active-match gate and had no bounded poll of the authored review-camera registry.
- **VERIFIED:** The old `--serve-dist` path spawned `npx` through `shell:true`, stored the wrapper PID, and did not assert that the preview port was closed before the next side.
- **VERIFIED:** The old manifest recorded `bundleAtStart` as a resource name but did not record the served bundle bytes' SHA-256.

## Cause

- **VERIFIED:** `setArenaReviewCamera` resolves authored cameras through `LOADED_ARENA_VISUAL_DEFINITIONS`; entries are populated by `loadArenaVisualModule` when the arena module resolves.
- **VERIFIED:** A cold deploy can reach the active-match state before that registry is observable to the capture loop, so a station request can race the registry population.
- **VERIFIED:** Killing the `npx` wrapper is not a reliable ownership proof for the listening Vite child; a stale listener can make the next side serve the wrong bundle.

## Correction

- **VERIFIED:** Added the read-only `sampleArenaReviewCameraRegistry` QA hook, exposing loaded arena IDs and the actual loaded authored camera IDs.
- **VERIFIED:** Added a bounded registry poll (`--registry-wait-ms`, default 30,000 ms) after every deploy and before the first station. The wait logs elapsed milliseconds, poll count, and registry state; timeout errors include the last state.
- **VERIFIED:** Added optional `--warm-up`, which performs one throwaway deploy, waits for the registry, returns to the menu, and then performs the measured deploy. It is not required for the measured cold path.
- **VERIFIED:** Replaced the shell-wrapped server with a tracked direct Vite child on port 4221. Teardown resolves the port's LISTENING PID with `Get-NetTCPConnection` on Windows or `lsof` elsewhere, terminates that PID, and asserts the port is closed.
- **VERIFIED:** Capture manifests retain `bundleAtStart` and now always emit `bundleSha256`; the diff validator retains the filename fence and also rejects missing/malformed or identical bundle hashes.

## Verify

- **VERIFIED:** Worktree: `C:\Users\david\projects\aa-claude-capharness`; branch: `contrib/dave-gaming-pc/claude/capture-harness-warmup`; implementation head: `899411a2ad85dff14e091cd57d2885daac601ab5`.
- **VERIFIED:** `npx tsc --noEmit` passed.
- **VERIFIED:** `npx vitest run scripts/qa/*.test.* src/legacy-main-size-ratchet.test.ts` passed: 1 file, 5 tests.
- **VERIFIED:** `node --test scripts/qa/capture-arena-viewpoints-support.test.mjs` passed: 3/3 fixture tests.
- **VERIFIED:** `npx vite build --outDir dist-capharness` passed for the committed head.
- **VERIFIED:** Required cold headless installed-Chrome run, no `--warm-up`, native WebGPU/NVIDIA, port 4221, `nuketown2` 17-station subset: `PASS 17/17`.
- **VERIFIED:** Cold-run log recorded `review-camera registry ready after 55 ms (1 polls)` and the full loaded registry state before station capture.
- **VERIFIED:** Capture manifest `artifacts/viewpoint-regression/candidate-cold-17/capture-manifest.json` records `verdict=PASS`, `sha=899411a2ad85dff14e091cd57d2885daac601ab5`, `backend=webgpu`, `bundleAtStart=/legacy-main-C3mMIHQ-.js`, and `bundleSha256=b4ac4bd954dea35ccc72286f0406bda92bde13da02daacb921401abf60bbf32b`.
- **VERIFIED:** An unrestricted no-warm-up cold run also passed `nuketown2` at 26/26, confirming the current branch catalog is larger than the requested 17-station evidence subset.
- **VERIFIED:** Port 4221 had no remaining listening connection after the run.
- **VERIFIED:** No diff was run against another branch or capture side.
- **OPEN:** `npm run pipeline:preflight -- --machine dave-gaming-pc --harness Codex` timed out after 120 seconds with exit 124; it was not converted into a pass claim.
- **OPEN:** The existing `node --test scripts/qa/arena-viewpoint-regression.test.mjs` result was 16/17 because its pre-existing fixture directories `artifacts/viewpoint-regression/base-c736d48c` and `head-55833a07` are absent on this branch. The failing fixture assertion was preserved.

### Warm-up conclusion

- **VERIFIED:** The required cold run passed 17/17 without `--warm-up`; therefore the bounded registry wait alone fixes the observed cold-registration race on this candidate. `--warm-up` remains optional diagnostic coverage.
