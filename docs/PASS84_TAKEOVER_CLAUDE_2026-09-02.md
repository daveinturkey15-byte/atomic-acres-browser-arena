# PASS 84 — Claude Code (Fable 5.1) takeover record, 2026-09-02 07:35 BST

Claude Code took over orchestration from OMP at Dave's direction (OMP's 5-hour
GLM window went 2% -> 80% while "only coordinating"). OMP spun down at 07:19 and
left `HANDOFF-TO-CLAUDE-PASS84.md`. This record exists because OMP sessions are
not persistent: it is the complete owner spec from that OMP session (21 owner
messages, 2026-09-01 20:00 -> 2026-09-02 07:14 BST), plus what was verified
about the machine and the fleet at takeover. Rows carry claim-state:
VERIFIED (measured by Claude Code), CLAIMED (OMP said so, not re-checked),
OPEN.

## 1. Owner spec, complete (source: OMP session, times BST)

Overnight brief (2026-09-01 20:19 -> 23:36):
- O1. Fix the live game's freezing across Chrome and Firefox (PASS 81), then
  "any other things which had been specced next in the handoff", overnight.
  -> Freezes: PASS 82/83 shipped 2026-09-01 (light-set root cause). VERIFIED
  live channels exist: gh-pages has channels/pass81, pass82, pass83,
  pass72-retained, recent-stable, the-big-one.
- O2. 23:36: "work on every single thing you mentioned ... awaken in 6-7 hours
  to a new pass 84 live with all of this nicely implemented and bug free."
  The "everything mentioned" list OMP read back at 23:28 was:
    1. Chopper pilot lag (measure the PILOT, not the observer) — HF-401.
    2. Gamepad + aim assist (touch AND pad; touch strongest) — asked 08-31,
       "within a day or two". NOT STARTED as of takeover.
    3. Faster map loads, deep cut: compile less (fewer permutations, shared
       pipelines, stream what frame one does not need). NOT STARTED.
    4. Farcrysis load fix (279 s cold load then the tab dies) — load path
       only, keep hidden until fast. NOT STARTED (worktree only).
    5. QA headless sweep — DONE by AGY, commit 2eb8c9af (9 scripts).
    6. Full gates + one verified PASS 84 publish.
  OMP itself flagged as not night-safe: bus doors/interior (Blender
  re-export), Raid art pass, dynamic lighting, real-device mobile pass, the
  55+6 eye-clearance RED spots (triage, do not re-baseline).
  Reality: the OMP session idled from 23:42 to 06:44; only PASS 82/83 landed
  overnight. Everything else started at 06:44.

Morning additions (06:44 -> 07:14):
- HF-395 gun still clips walls AND floor "like crazy".
- HF-396 rail still detached from barrel and scope on the flagged guns.
- HF-397 wall pullback too strong: halve it. CLAIMED done (28267d02).
- HF-398 EBR +40% damage, +25% fire rate. CLAIMED done (28267d02).
- HF-399 150 fps -> 40 fps on Quality, atomic-acres. "streamline, refine,
  refactor etc across all maps and browsers and the whole game".
- HF-400 release policy: when the next pass pushes, pin the current live
  version (PASS 83) as the single safe backup and remove ALL older versions.
  NOTE: the ledger says this is "Implemented in
  scripts/orchestration/publish_pass84.py" — that file DOES NOT EXIST at
  takeover (VERIFIED). Treat HF-400 as OPEN.
- HF-401 chopper pilot lag: instrument + activation-edge flush CLAIMED
  landed; "visual-cost half stays unproven" per OMP's own ledger row.
- HF-402 reasonable spawns for players and bots on every map (Raid spawns the
  owner outside).
- HF-403 host/guest lobby must be great: no freezing, no frozen-in-spot, no
  join failures, every map joinable the same way; REAL automated 2-client
  tests, all maps. AGY lane running (scripts/qa/mp-lab/).
- Delegation: use Gemini (agy, gemini-3.7-flash-high) where possible and
  Claude (Fable 5.1 / Opus) on Max; orchestrator preserves its own compute
  and quality-checks the work. Fleet control plane may be used.
- Farcrysis: someone works on fixing/integrating it in parallel.
- Map 3: continue the Desktop handoff (AGY lane running in aa-map3).
- Consolidation: "all of these branches/worktrees consolidated and merged over
  the next few hours" — farcrysis and map3 may sit on older passes; merge
  cleanly, do not regress shipped features. Streamline/refactor/improve.
- Log every request before acting (done: docs/PASS84_OWNER_FEEDBACK_2026-09-02.md).

## 2. Machine state at takeover (VERIFIED 07:25 BST)

- Commit charge 119.7 / 124.9 GB (96%). Leakers, same pattern as the 08-31
  gotcha: svchost PID 7796 (CDPUserSvc_7b6e9) 38.6 GB commit; explorer.exe
  12.4 GB. ComfyUI (Dave's, PID 45120) 18 GB — legitimate, leave alone.
  Uptime 6 d 14 h. Physical RAM 4.7 GB free of 31.6. GPU 11.3/16.3 GB used.
- Consequence already observed: `npm run qa:pass65:owner-feedback` dies with
  `DOMException [DataCloneError]: Data cannot be cloned, out of memory`.
  Any gate result taken in this state is void. Relief needs an elevated kill
  of PID 7796 (auto-restarts) and an explorer restart — owner action.
- Power plan: High performance (8c5e7fda...) VERIFIED.
- Running agents: OMP (PID 39760, spun down, keep open — its children are the
  two AGY lanes: PID 33068 map3, PID 7996 mp-lab, both started 07:10 with
  `--print-timeout 840s`). Hermes gateways x2, Reachy daemon, DevRec.

## 3. Line and branch facts (VERIFIED)

- Integration line: `aa-omp-pass84`, branch
  `contrib/dave-gaming-pc/omp/pass84-overnight` @ ac0bc5f2, pushed to origin.
  Ancestors: pass83 head e046c130 (live), gauntlet b138b9c0 (PASS 81).
- `atomic-acres-gauntlet` is frozen at b138b9c0 — do not touch.
- map3 branch `contrib/dave-gaming-pc/claude/map3-demo-showcase` @ e9756d6d:
  merge-base with pass84 = 02d9058f; 10 commits, adds 13 NEW files only
  (map3.html, src/map3/*, scripts/map3-validate-geometry.mts, docs handoff),
  changes no existing game file -> merge is additive. AGY is committing to it.
- farcrysis branch `contrib/dave-gaming-pc/claude/farcrysis-load-fix` @
  e046c130 (no work yet). Older farcrysis branches (jigglyclaw pass69,
  hermes pass69-hidden-farcrysis, hotfix/pass80-hide-farcrysis) are history.
- Do NOT revive `atomic-acres-highseas`.

## 4. Lane plan (Claude Code, one worktree per lane, all based on ac0bc5f2)

| Lane | Worktree | Branch | Owns |
|---|---|---|---|
| A HF-399 FPS | aa-claude-hf399 | claude/hf399-fps-regression | arenas, perf region of legacy-main, graphics settings |
| B HF-395/396 | aa-claude-hf395 | claude/hf395-396-viewmodel | viewmodel-surface-clip, weapon-presentation, viewmodel modules, penetration instrument |
| C Farcrysis load | aa-farcrysis-load | claude/farcrysis-load-fix | src/rendering/arenas/farcrysis*, farcrysis region of legacy-main |
| D HF-402 spawns | aa-claude-hf402 | claude/hf402-spawn-layouts | spawn layouts/solver, spawn gates |
| E Gamepad+aim assist | aa-claude-gamepad | claude/gamepad-aim-assist | input/gamepad modules, mobile-touch-controls, HUD glyphs, settings UI |
| F HF-403 mp-lab | aa-omp-pass84 (AGY) | (uncommitted diff) | scripts/qa/mp-lab, tests/e2e, `// MP-LAB:` src fixes |
| G Map 3 | aa-map3 (AGY) | claude/map3-demo-showcase | src/map3 only |

Integration, gates, publish (HF-400 ritual in HANDOFF-TO-CLAUDE-PASS84.md)
stay with Claude Code. Every lane commits to its own branch; nothing merges
without tsc + focused tests on the merged tree; the full suite runs once on
the integrated tree after commit relief.
