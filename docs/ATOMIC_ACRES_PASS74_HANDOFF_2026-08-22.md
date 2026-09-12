# Atomic Acres Pass 74 handoff — 2026-08-22 (night, post-evening-sweep)

## Copy-paste prompt for the next agent/harness

Continue Atomic Acres Pass 74 from the exact local state recorded in
`C:\Users\david\projects\atomic-acres-highseas\docs\ATOMIC_ACRES_PASS74_HANDOFF_2026-08-22.md`.
Read that file completely before acting. Preserve every worktree and branch. NEVER
push to GitHub, merge to main, deploy, or publish past Pass 73 — local commits only.
Never weaken a test, gate, threshold or timeout to get green; a correctly-failing
test stays red and its row stays OPEN. Verify every delegated agent's claim yourself
(`npx tsc --noEmit` + `npx vitest run`) before committing. `src/legacy-main.ts` is
orchestrator-owned: one editor at a time, always.

## Exact repository state

Source repository: `C:\Users\david\projects\atomic-acres-browser-arena` (worktrees below share it).

| Worktree | Branch | HEAD | Role |
| --- | --- | --- | --- |
| `C:\Users\david\projects\atomic-acres-highseas` | `integration/pass74-plus-high-seas-20260822` | `f83cefc8` | **The HITL/integration line. Work here.** Everything below is merged in. |
| `C:\Users\david\projects\atomic-acres-pass74` | `contrib/dave-gaming-pc/claude/pass74-20260821` | `97654025` | Fully merged into the integration line (118d55b7). Keep for provenance. |
| `C:\Users\david\projects\atomic-acres-pass74-skins` | `contrib/dave-gaming-pc/claude/pass74-skins-lane` | `b1f0bac5` | Fully merged into the integration line (a1934ac4). Keep for provenance. |
| Recovery branch | `backup/claude-pass74-pre-highseas-20260822` | `c7944d82` | Pre-merge safety point. Do not delete. |

Codex's own Pass 75 trees under `C:\Users\david\Documents\Codex\...` — **never write there**.

## HITL preview

- `http://127.0.0.1:41876` — integration build (vite dev, highseas worktree). If down:
  `cd atomic-acres-highseas && npx vite --host 127.0.0.1 --port 41876 --strictPort`.
- `node_modules` in the highseas worktree is a **junction** to `atomic-acres-pass74\node_modules`.
  If it breaks: `cmd /c mklink /J <highseas>\node_modules <pass74>\node_modules`.
- Playwright: call `node node_modules/playwright/cli.js` — bare `npx playwright` sometimes
  resolves a stale global copy.

## Verified state at HEAD `f83cefc8` (2026-08-22 ~21:05)

- `npx tsc --noEmit`: **0 errors**.
- Full suite: **414 files / 3,311 tests passing** (quiet machine, fully green — the two
  contention-flaky corpus scans pass too).
- Six-arena boot smoke: **6/6 GREEN** — first time this pass (farcrysis NaN fixed).
- `npm run pipeline:preflight -- --machine dave-gaming-pc --harness claude` passes end to end on
  the pass74 contrib worktree (the `@emnapi/runtime` lockfile break no longer reproduces).

## Landed this evening (all locally committed on the integration line)

1. `118d55b7` merge pass74→integration: HF-335 missile fix + HF-337 isEnemy inventory rows,
   digest recomputed (0d7ba248).
2. `d7ad6c85` **farcrysis NaN root-caused and fixed**: palm crown index off-by-three
   (`bl = 4 + k*11` → `1 + k*11`) drove the last blade's spine indices past an 89-vertex
   buffer; `toNonIndexed()` in the WebGL2 static batcher read NaN — browser-only,
   WebGL2-only, invisible to position scans. Index-bounds integrity test added (proven
   red on the old code).
3. `5952893f` **HF-347 Gun Range dummy damage is host-authoritative** end to end (resolver
   branch at exact host-time pose, guest fire-path gate, outcome reconciliation with exact
   host respawn stamp, lobby-snapshot dummy state replication each heartbeat, host-time
   updateTargets). 18 new tests. RustRig/Terminal lanes still open.
4. `ea932116` + `e0f707cb` **HF-325 host-migration succession ARMED**: mandate + mirror on the
   wire (legacy-main 2.1–2.5 per the wave2 patch doc), `network.promoteToHost` (permanent
   abort on unavailable-id — pinned), stand-down on observed higher term AND on claimed-id
   discovery, gap-4 mandate clock rebase (both skew directions tested),
   `HOST_MIGRATION_PROMOTION_ENABLED = true` with the pin test updated. Live two-browser
   handover matrix is the close-out bar.
5. `9b2ea0aa` **HF-316 residual**: killstreak slot keys now speak through the activation gate
   while input is locked (narrow pre-check; HF-324 blanket guard untouched).
6. `a1934ac4` + `a45b0f4e` **HF-360 skins INTEGRATED**: skins lane merged; lazy per-skin GLB
   loader (LOD0/1 shipped per archetype under public/), `lobby-skin` protocol +
   member/join skinId (catalog-validated), host-authoritative adoption, snapshot
   replication + guest prefetch, OPERATOR SKIN lobby selector, remote third-person
   presentation from the replicated skin. 36 new tests. Owner HITL owed.
7. `677e566e` skin-catalog **rigContract** (62 joints / 24 clips pinned; divergent rig fails at
   module load); HF-331 quiet-machine evidence recorded; HITL checklist regenerated;
   silent-gap register persisted to `docs/PASS74_SILENT_GAP_REGISTER_2026-08-22.json`.
8. `f83cefc8` **banner arbiter** (HF-339 race): #banner has one owner
   (fatal > match-flow > announcement, queue + ownership-checked expiry); all six writers
   routed; source pin enforces single-writer.

## Open work, priority order

1. **HF-334 (care-package flamethrower): OWNER DECISION, not code.** The wiring was
   adversarially refuted (grant cannibalises the world pickup; "exactly 10%" unsatisfiable
   while flamethrower authority is arena-bound). Ask Dave: separate weapon instance, or a
   different reward?
2. **Live two-browser HITL matrix** — the close-out bar for HF-325 (host dc → successor
   promotes → follower reconnects → returning host stands down), HF-347 (host/guest dummy
   shootout), HF-360 (skin visual + hit-proxy feel). All mechanical layers are green.
3. **HF-331 Firefox**: chromium/webgl2 control now 73.9 Hz at HEAD (was 49.3). Bundled
   Playwright-Firefox hangs at launch EVEN IDLE — dead instrument, stop trying it. The
   installed-browser parity harness (`scripts/qa/measure-browser-frame-parity.mjs`) runs but
   both probes FAILED_LAUNCH (Chrome: `__ATOMIC_ACRES_DEBUG__` never appeared on the
   production preview — check whether the debug hook exists in production builds behind
   `multiplayerQa=1`; Firefox: geckodriver-path null). Repair the harness, or have Dave play
   one minute in installed Firefox with the FPS readout.
4. **RustRig / Terminal multiplayer faults** (HF-347 remainder): "cant move" reports — need
   their own diagnosis lanes.
5. **Graphics next stages** from `docs/PASS74_SILENT_GAP_REGISTER_2026-08-22.json`
   (graphicsUpgrades): volumetric tier, AO denoise, PCFSoft shadows, CAS sharpen on WebGPU,
   bloom quality tier, clearcoat materials. The two top finds (ocean PBR stage 1, per-arena
   WebGPU IBL) already landed. Constraints hold: tone map LAST, bloom threshold >1.0 for
   true emitters only, nothing gameplay-visible varies by render profile.
6. **HF-355 streamline**: the banner arbiter and the HF-316 input pre-check closed two of the
   register's refactor targets. Remaining: spatial-audio voice lifecycle manager, parked
   extraction at `../pass74-parked/` (repair-or-delete needs the owner: it is the ONLY copy),
   worktree sprawl prune (integrator-owned, fleet-quiet only).
7. **Farcrysis terrain vs collision** (visual hills, flat physics) and the farcrysis map card
   (no authored flyover) — both recorded, neither fixed.
8. **AKP passport sync still blocked** (dirty canonical worktree at
   `C:\Users\david\Desktop\stuff\d akp`) — owner-side commit needed.

## Hard-won constraints (unchanged, still binding)

- Music: 2-voice budget per track; nobody has heard the chiptunes — tune sliders, not code.
- Water: `level`/`swimmable`/`amplitudeScale` host-authoritative and profile-invariant;
  WebGL2 shader transcribes the same OCEAN_BANDS CPU buoyancy samples.
- Audio: `game-music` bus capped at 2 voices; sound-event inventory pins every `audio.*`
  call site — new call sites need inventory rows + digest recompute, never a loosened scan.
- Coplanar audit direction-aware; all six arenas at zero pairs.
- `src/legacy-main.ts` / `water-system.ts` shader blocks: verify at BUNDLER level, not just tsc.
- Python file edits on this repo: `newline=''` (binary-faithful).
- `git add -A` banned while lanes are live — stage explicit paths. (No lanes are live as of
  this handoff: the fleet's "2 alive" rows are stale 08-16/08-21 ledger entries.)
- The centre banner has ONE owner now: route new banner writes through
  `presentBanner`/`presentBannerHtml` in legacy-main (a source pin fails otherwise).
- Skin GLBs must share the canonical rig (62/24) — the catalog throws at module load if not.

Handoff prepared by Claude (Pass 74 orchestrator), evening sweep 2026-08-22.
Run ledger for delegated history: `hermes-universal-orchestration/control-plane/runs/2026-08-2*.jsonl`.
