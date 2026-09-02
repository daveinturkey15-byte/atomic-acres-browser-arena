# Lane O — HF-404: smooth in Chrome, Edge AND Firefox (no freezes, crashes, errors, low fps)

Orchestrator: Claude Code (Fable 5.1). Ledger row HF-404.

Worktree: `C:\Users\david\projects\aa-claude-xbrowser`
Branch: `contrib/dave-gaming-pc/claude/hf404-cross-browser-smooth` (base 7a083e48)

## Owner statement (verbatim, 2026-09-02 08:47 BST)
"aswell as making sure no freezes or crashes or error message or low fps in
edge and firefox aswell as chrome, i just need it smooth across all those
browsers"
This has been the owner's loudest recurring complaint (2026-08-31 twice,
2026-09-01, 2026-09-02). PASS 82/83 fixed the light-set freeze and measured
0% frozen in Chrome/Firefox and 0.13% in Edge on a 180 s window. The owner
still wants the whole experience smooth in all three, not just freeze-free.

## Facts
- Reference meter: `scripts/qa/measure-cross-engine-stalls.mjs --url <url> --lanes chrome,edge,firefox --seconds 180 --label <label>`
  (presented-frame series, stall detection, fps, console errors; declared
  VISIBLE lane by contract — it parks off-screen on purpose because it
  measures real presentation; read `scripts/qa/installed-browser-lanes.mjs`
  and the browser-visibility contract before running; never let a window
  appear on the owner's primary display).
- Playwright's bundled Chromium and bundled Firefox are both dead for this
  purpose on this machine; use installed Chrome, Edge and Firefox. The
  Firefox lane is blocked whenever the owner's own Firefox is running - check
  `Get-Process firefox` first and report if blocked rather than faking it.
- Probes must run ALONE: a concurrent vitest run faked 97 stalls once. Check
  CPU load before each 180 s window; if other lanes are building, wait and
  retry; record the load you measured under.
- Pipeline tripwire: `scripts/qa/probe-pipeline-compile-stalls-cdp.mjs --dist dist --seconds 75`
  (in-combat creations must be 0).
- Owner hardware: RTX 5080, 2560x1440, Chrome. Edge is Chromium (same
  Dawn/WebGPU); Firefox uses its own WebGPU (wgpu) with different limits,
  shader compile times and a known presentation-backpressure hitch class
  (180-240 ms every ~2 min after the PASS 82 fix).

## Job
1. `npm run build`, serve dist. Run the meter on all three browsers, solo
   match on atomic-acres, then on test2 (Raid) and high-seas, 180 s each,
   plus one death-and-respawn cycle per window (the freeze class lived
   there). Record per browser: fps mean/p5, stall count and worst stall,
   frozen %, console errors and page errors (zero is the bar), any crash
   or "device lost". Save `artifacts/qa/hf404/<browser>-<arena>.json`.
2. Diagnose every non-Chrome regression with browser-specific evidence:
   Firefox shader compile on first arena, wgpu limits (max bind groups,
   storage buffers), texture format support, presentation backpressure;
   Edge GPU-process differences and the shader disk cache being cold.
   Name the cause per finding.
3. Fix minimally and generally (no browser sniffing hacks unless a real
   capability difference exists; capability-detect, do not UA-sniff), each
   edit marked `// HF-404:`. Never weaken the pipeline tripwire or the light
   set contract. Re-run the three-browser meter after each fix.
4. Add a repeatable gate: `npm run qa:cross-browser:smooth` that runs the
   three-lane meter on a served dist and FAILS on any console/page error, any
   stall over 250 ms, frozen fraction over 0.5%, or fps p5 under a floor you
   justify from the measured Chrome numbers; roster from the registry.
5. `npx tsc --noEmit`; focused tests; commits with explicit paths.

## Boundaries
- You own: browser-capability code paths in the renderer bootstrap and
  arena admission (`// HF-404:` marks; `src/legacy-main.ts` LF preserved),
  the new gate script and its contract test.
- Do NOT touch: viewmodel/weapons (B), arena art/perf internals (A/L),
  thermal (M), lobby/netcode (G), spawns (D), the publish scripts (F). If a
  cause lives in another lane's file, STOP and put the patch in the report.
- Machine rules: the meter needs the machine quiet - coordinate by waiting;
  at most one browser window per lane; never kill processes; no full vitest.

## Report
Per browser x arena table before/after (fps mean/p5, stalls, worst ms,
frozen %, errors), causes named, fixes with file:line, gate name and its
thresholds with the justification, the load under which each window ran.
Claim-state every line.
