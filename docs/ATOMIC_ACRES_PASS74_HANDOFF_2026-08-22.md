# Atomic Acres Pass 74 handoff — 2026-08-22 (evening)

## Copy-paste prompt for the next agent/harness

Continue Atomic Acres Pass 74 from the exact local state recorded in
`C:\Users\david\projects\atomic-acres-highseas\docs\ATOMIC_ACRES_PASS74_HANDOFF_2026-08-22.md`.
Read that file completely before acting. Preserve every worktree and branch. NEVER
push to GitHub, merge to main, deploy, or publish past Pass 73 — local commits only.
Never weaken a test, gate, threshold or timeout to get green; a correctly-failing
test stays red and its row stays OPEN. Verify every delegated agent's claim yourself
(`npx tsc --noEmit` + `npx vitest run`) before committing; agents in this pass have
claimed unverified success, edited the wrong worktree, shipped tests that were never
run, and truncated a file to zero bytes. `src/legacy-main.ts` is orchestrator-owned:
one editor at a time, always.

## Exact repository state

Source repository: `C:\Users\david\projects\atomic-acres-browser-arena` (worktrees below share it).

| Worktree | Branch | HEAD | Role |
| --- | --- | --- | --- |
| `C:\Users\david\projects\atomic-acres-highseas` | `integration/pass74-plus-high-seas-20260822` | `47f6bc6a` | **The HITL/integration line. Work here.** Pass 74 + Codex's High Seas + music + graphics. |
| `C:\Users\david\projects\atomic-acres-pass74` | `contrib/dave-gaming-pc/claude/pass74-20260821` | `97654025` | Pass 74 branch. AHEAD of the integration line by the HF-335 missile fix (`9763024b`) — **merge it into the integration line as an early step** (last merge of this pair was clean except `water-system.ts`; if that conflicts, Pass 75's two-arg registry-driven `configure()` is the keeper and the HF-358 OCEAN_BANDS shader transcription must survive — see commit `cd9b0896`). |
| `C:\Users\david\projects\atomic-acres-pass74-skins` | `contrib/dave-gaming-pc/claude/pass74-skins-lane` | `b1f0bac5` | HF-360 skins: 3 archetypes × 3 LODs GLBs exist (62 joints/24 clips, verified from binaries). NOT integrated — no loader/protocol/lobby UI consumes them. |
| Recovery branch | `backup/claude-pass74-pre-highseas-20260822` | `c7944d82` | Pre-merge safety point. Do not delete. |

Codex's own Pass 75 trees under `C:\Users\david\Documents\Codex\...` — **never write there**.
An earlier worker did; everything it produced had to be re-verified line by line.

## HITL preview

- `http://127.0.0.1:41876` — integration build (vite dev, serving the highseas worktree). If down: `cd atomic-acres-highseas && npx vite --host 127.0.0.1 --port 41876 --strictPort`.
- `http://127.0.0.1:41874` — older Pass 74 preview (a separate long-running server; pre-High-Seas).
- `node_modules` in the highseas worktree is a **junction** to `atomic-acres-pass74\node_modules`. If it breaks: `cmd /c mklink /J <highseas>\node_modules <pass74>\node_modules`.
- Playwright: call `node node_modules/playwright/cli.js` — bare `npx playwright` sometimes resolves a stale global copy that reads no config ("No tests found" / "Project chromium not found").

## Verified state at HEAD `47f6bc6a`

- `npx tsc --noEmit`: **0 errors**.
- Full suite: **407 files / 3,219 tests passing**; 2 red, both `Test timed out in 5000ms` on whole-corpus scans (`sound-event-inventory`, `player-profile-main-integration`) that pass **113/113 in isolation** — machine contention from swarms, timeouts deliberately NOT raised. On a quiet machine expect fully green.
- Six-arena boot smoke (`tests/e2e/pass74-arena-boot-smoke.spec.ts`): **5/6 green** (atomic-acres, skyline-terminal, rustworks-1v1, gun-range, high-seas). **farcrysis RED** — see open work.
- Run it: `QA_PREVIEW_PORT=41876 node node_modules/playwright/cli.js test pass74-arena-boot-smoke --project=chromium --workers=1 --retries=0`.

## Ledger and truth documents

- Owner ledger: `docs/PASS74_OWNER_FEEDBACK_LEDGER_2026-08-21.md` (HF-315..HF-364) — **the source of truth**. 40/50 DONE, 4 standing, 3 partial (HF-325, HF-331 — HF-335 was completed today on the pass74 branch), 3 open (HF-334, HF-347 residual, HF-355 residual). The copy in the **pass74** worktree is the most current (HF-335 update landed there).
- Owner-facing checklist: `docs/PASS74_HITL_CHECKLIST.md` — regenerated today from the ledger after the old one was found contradicting it in both directions. Regenerate from the ledger if they ever disagree.
- Silent-gap register from the full vault/AKP/docs sweep, graphics/animation upgrade rankings: `C:\Users\david\AppData\Local\Temp\claude\C--Users-david-Desktop-stuff\51a3bc77-45cc-4dd5-a1a1-cb32efb10af8\tasks\wnqmvms67.output` (JSON; copy it somewhere durable if the scratchpad is at risk).
- Technique decisions (AI asset workflows, what to adopt/reject and why): `docs/AI_ASSET_TECHNIQUE_ASSESSMENT_2026-08-22.md`.

## Delegated fleet — may still be RUNNING as you read this

Dispatcher: `python C:/Users/david/projects/hermes-universal-orchestration/scripts/swarm_dispatch.py <spec.json> --max-parallel N` (specs in the scratchpad dir above, `swarm-wave*.json`). Check first:
`python C:/Users/david/projects/hermes-universal-orchestration/scripts/fleet_status.py` (exit 2 = idle with open work). At handoff time: **7 agents alive**. In-flight lanes whose results will land in the worktrees:

- `farcrysis-nan-webgl2-v2` (highseas) — the farcrysis NaN root-cause fix.
- Possible stragglers from earlier waves. A lane's log appears in
  `hermes-universal-orchestration/control-plane/swarm-logs/<run>/<lane>.log` when it ends.
- A stray `tests/e2e/tmp-nan-instrument.spec.ts` in the highseas tree is lane instrumentation — it must NOT be committed; delete it if the lane leaves it behind.

**Route health** (`control-plane/route-health.json`): all four Hermes/opencode routes DEAD until ~09-03 (monthly quota). Working: `ox-openrouter` (best), `gemini` (short tasks only, drops streams), `or-nemotron-ultra`/`-super` (one small defect per lane, ≥3600s), `luna` (sparingly — owner's Codex shares the budget). One defect per lane; 35-minute five-defect briefs have a measured ~2/6 completion rate.

**Guard caveats** (`control-plane/ORCHESTRATION-LEARNINGS.md` W1–W17): the WORKTREE ESCAPE flag false-positives across concurrent waves and on orchestrator-owned trees (`orchestrator-worktrees.json` is the exclusion list — keep it current). When it fires, check the accused files in the accused tree before believing it — but W16 was a REAL escape into the owner's Codex tree, so never skip the check.

## Open work, priority order

1. **farcrysis NaN ×3 (smoke red).** Browser-only, WebGL2-only. RULED OUT: authored art arithmetic (`src/farcrysis-geometry-integrity.test.ts` proves finite), PMREM-fromScene (now fromEquirectangular). PRIME SUSPECT: farcrysis water registration means `waterBodyForArena('farcrysis')` returns a body; if `water-system.ts` (WebGL2 route) doesn't gate on `presentationOwner: 'arena-builder'`, it now builds water geometry with farcrysis parameters for the first time. A lane is on it; verify its claim with the smoke grep run.
2. **Merge pass74 → integration** (HF-335 missile fix, ledger update). See conflict guidance above.
3. **HF-347 residual:** Gun Range dummy poses replicate (host-time clock landed); dummy DAMAGE is still peer-local. The full host-authoritative pattern is documented in `docs/PASS74_HF347_GUNRANGE_DIAGNOSIS.md` (reuse the test-bay door's snapshot+projection pattern; ~15-line branch in `resolveAuthoritativeShot` mirroring bots).
4. **HF-331 Firefox:** WebGL2-vs-WebGPU costs ~3× in Chrome (49 Hz vs 150+, real RTX 5080 numbers). The remaining ~5× needs a HEADED run on a QUIET machine: `scripts/qa/measure-hf331-firefox-gap.mjs` then `scripts/qa/probe-hf331-firefox-stages.mjs`. NEVER headless (SwiftShader invents the gap); never under swarm load (Playwright-Firefox hangs at launch).
5. **HF-325:** checkpoint crosses the wire (48 tests); promotion DISABLED (`HOST_MIGRATION_PROMOTION_ENABLED=false`). Missing: `network.ts` role flip + host stand-down (split-brain risk — the reason the switch is off), follower re-point. Exact patches: scratchpad `wave2-handoffs/hf325-wire-path.md`. Also a real bug found there: `authorizeSelfPromotion` compares guest `Date.now()` to a host-stamped expiry, unrebased.
6. **HF-334 (care-package flamethrower): NEEDS AN OWNER DECISION, not code.** Seven anchor-verified patches were adversarially REFUTED: the grant consumes the world pickup (vanishes mid-match for whoever walks toward it) and "exactly 10%" is unsatisfiable while flamethrower authority is arena-bound. Ask Dave: separate weapon instance, or a different reward?
7. **Skins integration (HF-360):** GLBs staged; needs loader + protocol field + lobby UI. Provenance manifests already written; keep the clean-room boundary (H3 output is local-only, not for distribution).
8. **Graphics next stages** (from the sweep register): SSR on wet surfaces (registry-gated), bloom quality tiers, volumetrics scale — all must respect: tone map LAST, bloom threshold >1.0 reserved for true emitters, nothing gameplay-visible may vary by render profile.
9. **Key-3-while-dead feedback** (HF-316 residual): needs a narrow pre-check BEFORE the `gameplayInputEnabled()` blanket return in the keydown handler — do NOT weaken that guard (it's HF-324 scoping for every gameplay key).
10. **AKP passport sync blocked >24h** (dirty canonical worktree at `C:\Users\david\Desktop\stuff\d akp`) — owner-side commit needed; the sync is pull-only by design.
11. `npm run pipeline:preflight` broken at `qa:lockfile` (Missing `@emnapi/runtime@1.11.3`), introduced by `aa114737` — fix belongs to the pass owner.

## Hard-won constraints (violating any of these has already cost real time)

- **Music**: two original chiptune tracks (`src/chiptune-music.ts`), 2-voice budget proven per track, rotation excludes the previous track. NOBODY HAS HEARD THEM — first playtest feedback should tune the Options music slider defaults, not the code.
- **Water**: `level`/`swimmable`/`amplitudeScale` are host-authoritative and profile-invariant. The WebGL2 shader transcribes the same `OCEAN_BANDS` the CPU buoyancy samples — keep them literally identical.
- **Audio**: `game-music` bus is capped at 2 voices; the sound-event inventory test pins every `audio.*` call site — new call sites need inventory rows, never a loosened scan.
- **Coplanar audit**: direction-aware (upper surface must hold the more negative bias; positive offsets never exempt). All six arenas at zero pairs. `skyline-floor-joint-z` at −3/−3 is load-bearing.
- **Editing `src/legacy-main.ts` or `water-system.ts` shader blocks**: verify at BUNDLER level (`npx vitest run <a test importing it>`), not just tsc — tsc has accepted corrupted template literals twice.
- **Python file edits on this repo**: write with `newline=''` (binary-faithful) — text-mode writes CRLF'd `legacy-main.ts` once and broke 14 source-text tests at a stroke.
- **`git add -A` is banned while lanes are live in the tree** — stage explicit paths (a commit once swept in two lanes' unreviewed work).

Handoff prepared by Claude (Pass 74 orchestrator). The run ledger for everything
delegated is `hermes-universal-orchestration/control-plane/runs/2026-08-2*.jsonl`.
