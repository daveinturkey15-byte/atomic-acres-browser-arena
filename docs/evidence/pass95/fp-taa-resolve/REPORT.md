# Pass 95 forward-port: TAA resolve

Date: 2026-09-05  
Branch: `contrib/dave-gaming-pc/claude/fp-taa-resolve`  
Base: candidate 7 `452d7aba27ae2cf8ed793cc58d2fb03a6906fa4c`  
TAA source: `1f847b4b01c7789b23392419e430569a4e7dbbc5`

## Integration result

- **VERIFIED:** `git merge --no-edit origin/contrib/dave-gaming-pc/claude/taa-resolve` returned `Already up to date.` The TAA ref is an ancestor of candidate 7; candidate 7 contains the explicit revert `f597c6b6`.
- **VERIFIED:** `git revert --no-commit f597c6b6` restored the reviewed TAA tree without conflicts, then was committed as `ab60409d` (`port(taa): reapply reviewed temporal resolve lane`).
- **VERIFIED:** The candidate's newer `legacy-main.ts` transition authority was retained. Its `coldOptionalRoots`, detached-root coverage, exact ScenePass tripwire, and 12-second fence were restored after the older TAA snapshot had replaced them. Clustered-light registration and cold precompile reach therefore remain candidate-owned.
- **CLAIMED:** The TAA lane report describes the reviewed resolve as SHIP-WITH-FIXES, with a measured `-5.2 ms` QUALITY movement p50 and zero in-combat pipelines. The implementation remains the in-repo r185 TSL graph; no vendored resolve was introduced.

## Repairs at cause

- **VERIFIED:** Renderer fingerprints and inventory were regenerated mechanically. The command was:

  ```text
  npx tsx scripts/qa/generate-pass65-renderer-feature-inventory.ts
  ```

  It produced inventory SHA-256 `ba4b8be8977ea616ad77904c515837ae536a9c9e9d736929f9888e4bb437779c`. Read-back verification used:

  ```text
  npx tsx scripts/qa/generate-pass65-renderer-feature-inventory.ts --check
  ```

- **VERIFIED:** Current profile fingerprints were computed from the source authority with:

  ```text
  npx tsx --eval "import { graphicsControlSetHashes } from './src/ui/graphics-profile-descriptions.ts'; console.log(JSON.stringify(graphicsControlSetHashes(), null, 2));"
  ```

  The current pins are `performance=72ad4b3c`, `balanced=ee7d10b6`, `high=308b6810`, and `max=467af549`. The generated inventory and the profile contract/document pins were synchronized; generated files were not hand-edited.

- **VERIFIED:** The candidate's prewarm list and exact-precompile tripwire were retained, including the detached optional presentation roots and the candidate's cold-session arena-root scope. This removed the stale older transition snapshot rather than weakening the fence or deleting a precompile assertion.

- **VERIFIED:** Renderer capability expectations changed only where TAA genuinely changes the runtime: High/MAX TAA enables the principal resolve, so `antialiasSamples` is `0` even when the requested profile says MSAA 4x. The ray-capability test now keeps that TAA-owned zero while gating only ray tracing. The device-feature tests retain their feature assertions; their WebGPU mock now preserves real `three/webgpu` exports, including TAA's `QuadMesh`.

- **VERIFIED:** The verified TSL migration inventory and screen-space topology contracts now include the TAA resolve owner. No fence, threshold, budget, or assertion was weakened.

## Gates

- **VERIFIED:** `npx tsc --noEmit` — passed with no diagnostics.
- **VERIFIED:** Focused gate:

  ```text
  npx vitest run src/graphics-profile-contract.test.ts src/pipeline-metrics*.test.ts src/cold-session-precompile-reach*.test.ts src/legacy-main-size-ratchet.test.ts src/rendering/taa-resolve.test.ts src/rendering/pass64-tsl-scene.test.ts src/rendering/screen-space-post.test.ts
  ```

  Result: 5 files, 52 tests passed.

- **VERIFIED:** Repair regression gate across the eight initially failing files: 8 files, 118 tests passed.
- **VERIFIED:** Full command:

  ```text
  npx vitest run
  ```

  First run: 621 files passed, 1 skipped; 6,250 tests passed, 2 skipped; one existing 20-second timeout in `src/audio-music-rotation-runtime.test.ts`.

- **VERIFIED:** Permitted timeout-only rerun:

  ```text
  npx vitest run src/audio-music-rotation-runtime.test.ts
  ```

  Result: 1 file, 9 tests passed. No timeout or test setting was changed.

- **VERIFIED:** `npm run build` passed under `C:\Users\david\AppData\Local\Temp\aa-heavy.lock`; the lock was removed in `finally`, and no lock remained.
- **OPEN:** Browser/performance measurement was not run. The first-45-minute no-browser rule applied during this lane, so no port 4190 capture was authorized; frame time and in-combat pipeline count remain OPEN for this forward-port run.
- **OPEN:** Repository preflight remains blocked by existing branch-contract mismatches: lowercase `codex` rejects this user-required `claude` namespace, `claude` rejects the candidate branch because it does not contain the old `origin/main`, and the task explicitly fixes the candidate-7 base. Lockfile preflight passed independently.

## Commits

- **VERIFIED:** `ab60409d port(taa): reapply reviewed temporal resolve lane`
- **VERIFIED:** `3ca8a280 port(taa): regenerate profile authority artifacts`
- **VERIFIED:** `aae13e83 port(taa): align candidate prewarm and capability contracts`

