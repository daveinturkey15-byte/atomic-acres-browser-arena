# Task: real 2-client host+guest lobby tests on every map, then fix what breaks

You are Claude (orchestrator-delegated), working in
C:\Users\david\projects\aa-omp-pass84 on branch
contrib/dave-gaming-pc/omp/pass84-overnight. Another agent edits
scripts/qa/ - confine yourself to tests/e2e/, scripts/qa/mp-lab/ (a NEW
directory you create), and minimal clearly-commented src/ fixes described
below. Do not edit scripts/qa/*.mjs existing files.

## Owner outcome (HF-403)
The host/guest multiplayer lobby experience must be great: no freezing, no
frozen-in-spot movement, no join failures; every multiplayer-enabled map
playable and joinable the same way. The owner wants REAL automated two-client
tests, not mocks.

## Build the harness first
Create scripts/qa/mp-lab/run-host-guest.mjs:
- Two headless REAL-Chrome pages (Playwright, channel:'chrome' - bundled
  Chromium has no WebGPU here) against a local static server of dist/ plus a
  local PeerJS server (pattern: spawn node_modules/peer/dist/bin/peerjs.js
  --host 127.0.0.1 --port <p> --path /peerjs --no-allow_discovery; see
  scripts/qa/profile-chopper-render-cost-cdp.mjs).
- Page A hosts (callsign HOST, click #host, configure lobby, start), page B
  joins with the room code (click #join) - through the REAL UI, not debug
  teleport shortcuts, because the owner cares about the join flow itself.
- For EVERY multiplayer-enabled arena (read the arena registry for
  multiplayer: true; expect atomic-acres, test2/Raid, rustworks-1v1,
  gun-range, high-seas at minimum): host picks the map, both deploy, both
  move (debug look/fire drivers exist - see scripts/qa/lib/cross-engine-stall-agent.js
  for the input style), for ~30 seconds each.
- Per map, record: join success + duration, deploy success, presented-frame
  intervals on BOTH pages, any gap > 250ms (stall), any > 5s movement deadlock
  (guest position unchanged while input applied - sample the debug snapshot
  player position), console/page errors.

## Then fix what the harness proves broken
Likely suspects (verify, do not assume): guest frozen-in-spot after deploy on
some maps, join button state, per-map deploy gating. Make the SMALLEST
host-authoritative fix in src/ (mark each edit `// MP-LAB:`), never weaken a
test or timeout to get green, never break solo play.

## Boundaries
- Headless only; no visible windows; never kill Dave's processes.
- Do not modify scripts/qa/*.mjs existing files; do not touch weapon/thermal
  code (another agent owns those regions in src/).
- Do not git commit; leave the diff + harness for orchestrator review.
- Full suite is run by the orchestrator; you run only your harness + focused
  tests for files you touch.

## Report back (final message)
Per-map table: join ok/duration, deploy ok, worst stall ms, deadlocks, errors.
Then the fixes you made with file:line, and what remains broken (honest).
