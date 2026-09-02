# Lane G — HF-403: real two-client host+guest tests on every map, then fix what breaks

Orchestrator: Claude Code (Fable 5.1), takeover record
`docs/PASS84_TAKEOVER_CLAUDE_2026-09-02.md`. Ledger row HF-403.

Worktree: `C:\Users\david\projects\aa-claude-mplab`
Branch: `contrib/dave-gaming-pc/claude/hf403-mp-lab` (base ac0bc5f2)

A Gemini agent started this lane earlier today and died with its parent
process. Its draft harness was copied to
`scripts/qa/mp-lab/run-host-guest.mjs` in your worktree (untracked, ~24 KB,
unverified). Read it, keep what is sound, rewrite what is not. Do not
assume it runs.

## Owner statement (verbatim, 2026-09-02 07:08 BST)
"i want the multiplayer and guest lobby experience to be great too,
including no more freezing, frozen in spot, previous issues. so ensure you
use claude to do a bunch of real tests with at least 2 people in a lobby
host guest experience, all maps should be playable and joinable in the same
way"

## Mechanical falsifier (ledger)
An automated two-client host+guest run over a local PeerJS server joins,
deploys and moves on every multiplayer-enabled map with zero presentation
stalls over 250 ms and no movement deadlock, and the join flow is identical
per map.

## Facts
- PeerJS multiplayer; a local server pattern exists:
  spawn `node_modules/peer/dist/bin/peerjs.js --host 127.0.0.1 --port <p> --path /peerjs --no-allow_discovery`
  (see `scripts/qa/profile-chopper-render-cost-cdp.mjs`). Use port 9345 and
  static-serve `dist` on 41946 for this lane.
- Headless REAL Chrome only (`chromium.launch({ headless: true, channel: 'chrome', args: [...SILENT_ARGS, ...] })`
  with the flags from `scripts/qa/lib/browser-launch-flags.mjs`); bundled
  Chromium has no WebGPU on this machine.
- Menu automation facts paid for last night: `page.goto` FIRST, wait for
  `.map-card`, host button is `#host`, lobby start is `#lobby-start`, bots
  select is `#lobby-bots`, join is `#join` with the room code; the host
  auto-readies on start. Build identity handshake (PASS 83) refuses a guest
  on a different build — both pages must load the same dist.
- Input driver style for movement: `scripts/qa/lib/cross-engine-stall-agent.js`.
  Debug snapshot exposes the player position (`__ATOMIC_ACRES_DEBUG__.snapshot()`).
- Presented-frame series and stall detection: `scripts/qa/measure-cross-engine-stalls.mjs`
  is the reference for counting presented frames rather than rAF ticks.
- Multiplayer-enabled arenas come from the registry (`multiplayer: true`);
  derive the list, never hardcode it (expect at least atomic-acres, test2
  (Raid), rustworks-1v1, gun-range, high-seas; farcrysis is not selectable).
- The lobby now waits for all players and counts 5-4-3-2-1 from a
  host-authoritative clock (PASS 82/83). "Frozen in spot" historically came
  from admission/replication ordering and movement authority on the guest.
- Freeze root cause fixed in PASS 82: hiding the viewmodel root changed the
  light set and invalidated every pipeline. In-combat pipeline creations
  must stay 0; `scripts/qa/probe-pipeline-compile-stalls-cdp.mjs --dist dist --seconds 75`
  is the tripwire.
- Probes must run alone: another agent's vitest run faked 97 stalls once.
  Two headless Chromes are needed here; that is the lane's whole budget —
  check `nvidia-smi` shows at least 3 GB free VRAM before launching (the
  owner's ComfyUI holds ~11 GB; never starve it).

## Job
1. `npm run build` once. Build the harness `scripts/qa/mp-lab/run-host-guest.mjs`:
   two pages, page A hosts (callsign HOST, real UI), page B joins with the
   room code (real UI, not a debug teleport), host picks the map, both
   deploy, both move for ~30 s using the debug input drivers. Per map
   record: join success and duration, deploy success on both, presented
   frame intervals on BOTH pages with any gap over 250 ms, movement
   deadlock (guest position unchanged for 5 s while input applied),
   console and page errors, and a screenshot from each page after deploy.
   Output `artifacts/qa/mp-lab/<arena>.json` plus a summary table.
2. Run it across every multiplayer-enabled arena. Then run it a second
   time with 4 bots in the lobby.
3. Fix what the harness proves broken with the SMALLEST host-authoritative
   change, each edit marked `// MP-LAB:`. Likely suspects to verify, not
   assume: guest frozen-in-spot after deploy on some maps, join button
   state, per-map deploy gating, admission ordering. Never weaken a test or
   a timeout to get green; never break solo play.
4. Wire the harness as a repeatable script (`package.json` script
   `qa:mp-lab`) and add a `node --test` contract that pins the harness
   derives its arena list from the registry.
5. `npx tsc --noEmit`; focused vitest for files you touched (never the full
   suite). Commit to your branch with explicit paths, one commit per item.

## Boundaries (hard)
- You own: `scripts/qa/mp-lab/**`, `tests/e2e/mp-lab*`, the `qa:mp-lab`
  script entry, and minimal `// MP-LAB:` fixes in lobby/netcode/replication
  code (`src/legacy-main.ts` lobby and admission regions only; the file is
  LF, preserve it).
- Do NOT edit: weapon/viewmodel/thermal code, arenas, spawn layouts (Lane D
  owns them; if a join lands the guest badly because of a spawn, report it
  to the orchestrator instead of fixing it here), `baselines/`, existing
  `scripts/qa/*.mjs` files.

## Machine rules
Headless only, `--mute-audio`, never a visible window. Two browsers max,
one build at a time. Never kill a process you did not start.

## Report (final message = raw data for the orchestrator)
Per-map table (join ok/duration, deploy ok both, worst stall ms per page,
deadlocks, errors) for the 2-player and 2-player+4-bot runs; fixes with
file:line and the harness evidence that proves each; what remains broken;
commits. Claim-state every line: VERIFIED / CLAIMED / OPEN.
