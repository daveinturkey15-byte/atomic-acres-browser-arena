# Lane O — HF-404: smooth in Chrome, Edge AND Firefox (no freezes, crashes, errors, low fps)

Orchestrator: Claude Code (Fable 5.1). Ledger row HF-404.

Worktree: `C:\Users\david\projects\aa-claude-xbrowser`
Branch: `contrib/dave-gaming-pc/claude/hf404-cross-browser-smooth` (base 7a083e48)

## OWNER INSTRUCTION 12:40 BST — READ THIS FIRST, IT OVERRIDES THE REPO POLICY
"you're testing on the other screen with firefox, it keeps stealing my mouse
etc? stop that and make it work another way."
An earlier attempt of this lane ran `measure-cross-engine-stalls.mjs`, whose
"declared visible" presentation parks windows off-screen and REASSERTS
FOREGROUND to keep them composited; Firefox has no off-screen mode, so it
appeared on the owner's second monitor and took his mouse. That is now
forbidden without exception:
- NEVER launch a headed browser. Not parked off-screen, not on monitor 2,
  not "just for 180 s". Headless only, every browser, every run.
- NEVER call anything that reasserts foreground, focuses a window, or
  takes pointer lock. Remove those code paths from the copies you run.
- The repo's browser-visibility contract (`scripts/qa/browser-visibility-contract.test.mjs`
  and the exceptions in `scripts/qa/installed-browser-lanes.mjs`) encoded the
  old policy. Change the policy: headless is the only acceptable
  presentation; measurement lanes count presented frames headless (canvas
  change hashes or the presented-frame series) and DECLARE that they are
  headless in their output. Update the contract test to assert the new
  rule, citing this instruction and HF-404 in the commit. That is a policy
  change by the owner, not a weakened gate.
- If a browser cannot give WebGPU headless on this machine, that lane is
  BLOCKED WITH EVIDENCE (the exact `navigator.gpu` / adapter result and the
  browser version), and you write a 2-minute manual check for the owner
  instead. You do not go headed.

## Owner statement (verbatim, 2026-09-02 08:47 BST)
"aswell as making sure no freezes or crashes or error message or low fps in
edge and firefox aswell as chrome, i just need it smooth across all those
browsers"
Recurring ask (2026-08-31 twice, 2026-09-01, 2026-09-02 twice). PASS 82/83
fixed the light-set freeze (0% frozen Chrome/Firefox, 0.13% Edge on 180 s).
The owner wants the whole experience smooth in all three, not just
freeze-free.

## Facts
- Headless real Chrome (`channel: 'chrome'`, `--headless`, `--mute-audio`,
  `--use-angle=d3d11 --enable-unsafe-webgpu --ignore-gpu-blocklist`) acquires
  a real WebGPU device here and paces rAF at ~60 Hz; add
  `--disable-frame-rate-limit --disable-gpu-vsync` when you need render cost
  instead of a vsync cap. Headless Edge: `channel: 'msedge'`, same flags.
  Headless Firefox: Playwright's bundled Firefox is dead here; use the
  INSTALLED Firefox (`executablePath` to Program Files), `-headless`, and
  test `navigator.gpu?.requestAdapter()` first; set the prefs
  `dom.webgpu.enabled=true` and `gfx.webgpu.ignore-blocklist=true` in the
  profile if needed. Owner's own Firefox running blocks the profile lock —
  check `Get-Process firefox` and report, do not fight it.
- Presented-frame evidence without a visible window: hash the canvas each
  rAF (`toDataURL` on a small readback, or `readPixels` of a corner) and
  count distinct hashes over time; a frame that did not change was not
  presented. The pipeline probe `scripts/qa/probe-pipeline-compile-stalls-cdp.mjs --dist dist --seconds 75`
  runs headless already (in-combat creations must stay 0).
- Probes must run ALONE: another lane's vitest run once faked 97 stalls.
  Check CPU before each window; if other lanes are building, wait and
  retry; record the load each window ran under.
- Owner hardware: RTX 5080, 2560x1440, Chrome. Edge is Chromium (same Dawn).
  Firefox uses wgpu with different limits, shader compile times and a known
  presentation-backpressure hitch class (180-240 ms every ~2 min).

## Job
1. `npm run build`, serve dist. For each of chrome / msedge / firefox
   (headless, one at a time): solo match on atomic-acres, then test2 (Raid)
   and high-seas, 180 s each, including one death-and-respawn cycle. Record
   fps mean/p5 from canvas-change cadence, stall count and worst gap,
   frozen %, console and page errors (zero is the bar), any crash or
   "device lost". Save `artifacts/qa/hf404/<browser>-<arena>.json`.
2. Diagnose every non-Chrome regression with browser-specific evidence and
   name the cause per finding (wgpu limits, shader compile, texture format,
   backpressure; Edge cold shader cache).
3. Fix minimally and generally (capability-detect, never UA-sniff), each
   edit `// HF-404:`. Never weaken the pipeline tripwire or the light-set
   contract. Re-run after each fix.
4. Add the repeatable gate `npm run qa:cross-browser:smooth`: headless
   three-browser run on a served dist that FAILS on any console/page error,
   any gap over 250 ms, frozen fraction over 0.5%, or fps p5 under a floor
   you justify from the Chrome numbers; roster from the registry; prints
   "presentation: headless" in its output. Update the visibility contract
   test to the new policy (see the owner instruction above).
5. `npx tsc --noEmit`; focused tests; commits with explicit paths.

## Boundaries
- You own: browser-capability code paths in renderer bootstrap and arena
  admission (`// HF-404:` marks, `src/legacy-main.ts` LF preserved), the
  meter and its presentation policy files, the new gate and its contract
  test, `scripts/qa/lib/browser-launch-flags.mjs` policy text.
- Do NOT touch: viewmodel/weapons (B), arena art/perf internals (A/L),
  thermal (M), lobby/netcode (G), spawns (D), publish scripts (F/Q). If a
  cause lives elsewhere, STOP and put the patch in the report.
- Machine rules: one browser at a time, close it after every window, never
  kill processes you did not start, no full vitest.

## Report
Per browser x arena table before/after (fps mean/p5, stalls, worst ms,
frozen %, errors), causes, fixes with file:line, gate name and thresholds,
the load each window ran under, the exact evidence if Firefox is blocked
headless, and the manual 2-minute owner check if so. Claim-state every line.
