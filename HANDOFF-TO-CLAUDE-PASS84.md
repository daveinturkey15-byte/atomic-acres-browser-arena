# HANDOFF — OMP → Claude Code (Fable) takeover, PASS 84 run

You are taking over from OMP as acting orchestrator (owner directive: OMP usage
at 80%). Everything the owner specced this session is logged with falsifiers in
`docs/PASS84_OWNER_FEEDBACK_2026-09-02.md` (committed). Read that, then this.
Work in `C:\Users\david\projects\aa-omp-pass84`, branch
`contrib/dave-gaming-pc/omp/pass84-overnight` (4 commits ahead of live head
`e046c130`; push it first thing with `git push -u origin HEAD`).

## Owner asks — all of them, priority order

1. **HF-399 FPS regression** (loudest pain): 150 → ~40 fps, Quality profile,
   atomic-acres. Suspect (UNVERIFIED): pass81 viewmodel surface-clip planes
   (`VIEWMODEL_SURFACE_CLIP_PLANE_COUNT = 4`,
   src/systems/viewmodel-surface-clip.ts) multiplying material permutations.
   MEASURE FIRST: headless real Chrome (`channel:'chrome'`; bundled Chromium
   has NO WebGPU here), rAF sampler + renderer stats, atomic-acres vs another
   arena as control, then the smallest `// HF-399:`-marked fix.
2. **HF-395**: viewmodel still clips walls AND floor. Re-run
   `scripts/qa/measure-viewmodel-penetration-cdp.mjs`, fix planes/bounds — NOT
   by enlarging retreat (pullback was just halved per owner).
3. **HF-396**: rail detached from barrel/scope on scoped rifles (m14-ebr
   family). Audit nodes via `scripts/dump-glb-nodes.js`, fix socket alignment,
   add a deterministic alignment contract test.
4. **HF-402**: Raid spawns the player outside; every map needs reasonable
   player+bot spawns — re-run `scripts/qa/solve-spawn-layouts.ts` with
   POI-proximity constraints.
5. **HF-403**: great host+guest lobby experience — real 2-client tests on every
   multiplayer map (an AGY agent is already running this lane; brief:
   `local-claude-task-mp-lab.md`).
6. **HF-401** (in progress): chopper pilot thermal churn — the fix is already
   applied on this branch (activation-edge flush + `ghostBuildCount`/
   `ghostReleaseCount` counters + debug hook
   `__ATOMIC_ACRES_DEBUG__.sampleChopperPilotLoad()` + instrument
   `scripts/qa/profile-chopper-pilot-thermal-cdp.mjs`; before-evidence in
   `artifacts/qa/chopper-pilot/pilot-before.json`). Verify with a ride once
   enemies can be staged in reveal range.

## Already DONE on this branch (verify, don't redo)

- **HF-398**: EBR damage 37.2→52.1 (minimum 24→33.6), rpm 37→46; baseline
  `baselines/pass65-candidate/gameplay-contract.json` regenerated; change id
  `pass84-ebr-40-percent-damage-25-percent-fire-rate` appended to
  `metadata.specifiedDeltas`.
- **HF-397**: applied wall retreat halved — `VIEWMODEL_WALL_PULLBACK_SCALE =
  0.5` in src/weapon-presentation.ts (telemetry keeps the raw probe value).
- **HF-401**: thermal activation-edge flush (`thermalRevealWasActive`,
  `sync(targets, true, !thermalRevealWasActive)` in `updateThermalGhosts`).
- **QA sweep (AGY, verified)**: 9 headed scripts → headless policy, commit
  `2eb8c9af`. Declared visible lanes untouched by design.
- **Ledger**: `docs/PASS84_OWNER_FEEDBACK_2026-09-02.md` (HF-395..403 +
  release policy). All work committed except: nothing — branch is clean after
  your first push.
- tsc clean and thermal/contract tests green at last commit
  (`28267d02`).

## Fleet state

| Lane | Agent | Where | State |
|---|---|---|---|
| Map 3 continuation | AGY (gemini-3.7-flash-high) | `C:\Users\david\projects\aa-map3` | RUNNING (brief `local-claude-task-map3.md`) |
| MP host+guest lab | AGY | this worktree, `scripts/qa/mp-lab/` | RUNNING (brief `local-claude-task-mp-lab.md`) |
| HF-399 FPS | was Claude Opus — 401 auth blocked it | brief `local-claude-task-hf399-fps.md` | YOU relaunch: `claude -p "Read local-claude-task-hf399-fps.md and execute it exactly. Measure before fixing. Finish with the requested report." --model opus --dangerously-skip-permissions` |
| HF-395/396 viewmodel | was Claude Fable — 401 | brief `local-claude-task-hf395-396-viewmodel.md` | YOU relaunch same pattern with `--model fable` |
| Farcrysis load | NOT STARTED | worktree exists: `C:\Users\david\projects\aa-farcrysis-load` (base e046c130, node_modules installed) | recreate the brief there (defect: 279s cold load then tab dies; 12s fence `flushWebGpuFrames(12_000)`; fix = compile/build less; keep `selectable:false`), delegate or absorb |

## Release policy for PASS 84 (owner directive)

Publish with **exactly two channels: PASS 84 live + PASS 83 pinned safe
backup**; remove every older tree from gh-pages (pass81, pass72-retained,
the-big-one, anything else). Ritual:
1. Integrate all fleet output on the pass84 branch; `npx tsc --noEmit`; full
   `npx vitest run` (floor 4,955+ passed, 0 failed); `npm run build`.
2. Copy `scripts/orchestration/publish_pass83.py` → `publish_pass84.py`:
   CHANNEL `channels/pass84`, DIST `dist-pass84`,
   `KEEP_AT_LEAST = {"pass83"}`, RETIRE all other trees, relax the predecessor
   guard to ONE pinned backup (owner instruction — cite HF-400), re-pin the
   in-build fallback to PASS 83.
3. Stamp `src/release-identity.ts` → PASS 84 / `channels/pass84`; update
   `release-channels.json`; re-pin `src/release-topology.test.ts` +
   `src/project-map.test.ts` literals; point the topology test's
   `publish_pass83.py` read at `publish_pass84.py`.
4. Verify the freshness guard still refuses (touch src/legacy-main.ts → publish
   must exit STALE BUILD), rebuild, `cp -r dist dist-pass84`, publish.
5. Live smoke: `node scripts/qa/measure-cross-engine-stalls.mjs --url
   https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/channels/pass84/
   --lanes chrome,edge,firefox --seconds 120` → ~0% frozen; channel 200; badge
   PASS 84 (identity is in the `release-identity-*.js` chunk, not index.html).
6. Push the branch; update the ledger rows to VERIFIED with evidence; leave the
   morning report in `docs/PASS84_MORNING_REPORT.md`.

## Instrument gotchas (paid for tonight — do not re-learn)

- Probes must run ALONE: a concurrent vitest run faked 97 stalls (14.6%
  frozen) on a clean build.
- rAF cadence ≠ compositor evidence. Use the stall meter's presented-frame
  series or canvas-change hashes.
- In-combat pipeline creations must stay **0** — tripwire:
  `node scripts/qa/probe-pipeline-compile-stalls-cdp.mjs --dist dist --seconds 75`
  (regression baseline: 251 creations, 99.2% in stalls, before the fix).
- `arenaVisualBudgetAudit()` returns drawCalls 0 in headless — unusable.
- Menu automation: `page.goto` FIRST (blank-page trap), wait `.map-card`, then
  `#host`; lobby start is `#lobby-start`; bots select is `#lobby-bots` (pick
  max option); host auto-readies on start.
- The freeze root cause for the record: hiding the viewmodel root removed two
  structural lights → LightsNode cache-key change → every material program
  invalidated at once. The fix (keep root at
  `FULLSCREEN_PRESENTATION_SUPPRESSED_SCALE`, zero intensities) must never be
  reverted; the probe tripwire guards it.

## Standing rules

One lane per worktree; never touch `atomic-acres-gauntlet` or another agent's
worktree; never weaken a gate; headless browsers only; `--mute-audio`; no
pointer lock; `nvidia-smi` before GPU-heavy jobs; never kill Dave's processes
(ComfyUI/ollama/llama.cpp); no vsync; Chrome → Firefox → Edge; original art
only; Pages publishing authorized, anything else outward-facing asks first.
