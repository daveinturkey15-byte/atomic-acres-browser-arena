> Historical Build19 checkpoint, preserved at migration. Current workspace and takeover rules: [START_HERE](../../START_HERE.md) and [CURRENT](../../CURRENT.json). Old PIDs, lease times and paths below are historical observations; recheck before acting.

# Atomic Acres — final Build 19 handoff

**Owner stop instruction:** finish and hand off by about 17:00 on 13 September 2026, then stop. Do not restart overnight work, agents, quota failover or recurring continuation unless Dave asks the next orchestrator to do so.

**VERIFIED — playable local checkpoint:** [Open Build 19](http://127.0.0.1:41996/updates/slice19/). The main menu contains both Nuke Town New World and Skills Lab. [Direct Lab shortcut](http://127.0.0.1:41996/updates/slice19/map3.html?lab=techniques) is optional, not a separate build.

**VERIFIED — source:** `C:/Users/david/projects/aa-world-studio`, branch `contrib/dave-gaming-pc/codex/world-studio-20260912`, clean commit `82677da2c8e910f4bcdebcc804c434e874439c9e`. Build stamp: **19 · 13 September 15:41 UK**. No production publish or main/gh-pages push occurred. [77-file HTTP/byte verification](../../../../.handoff-evidence/work/continued-world-20260913/handoff/final-preview-verification.json) ties the served HTML, JavaScript, CSS, source catalog and house GLBs to local output. [Build 17 fallback](http://127.0.0.1:41996/updates/slice17/) and [Build 18](http://127.0.0.1:41996/updates/slice18/) remain preserved.

## What changed in this checkpoint

| Worker/model | Lane | What reached Build 19 | Evidence/limits |
|---|---|---|---|
| Claude `claude-opus-5`, xhigh | Houses | Revised Blender house shells: wave4 material/sidedness and wave5 buried-surface correction | Build17 `8072b3fe8`, Build18 `b861b406b`; still visible seams and RED conflict audit |
| Claude `claude-opus-5`, xhigh | Lighting | Earlier interior fixture mounts retained from Build17 | No claim of new global illumination or high-quality reflections |
| OMP `meta-contributor/muse-spark-1.3-contributor`, xhigh | Skills Lab | Mapped/unmapped URL filters, working demo links, recorded-date ordering, Lighting & Environment tab | Native run `delegated-omp-06e73c49-7d04-4b7d-9387-dbfce1de3d34`, 529.54 seconds; exact route recorded |
| Codex Luna helpers, earlier in this run | Integration, routes, runtime QA | House integration, popup stacking repair, native dispatch verification, bounded runtime probe | These helpers were used despite the later preference to avoid Luna. All finished; no new Luna jobs dispatched during final wind-down |
| Root orchestrator | Final consolidation | Selected Muse commit, exact house hash pins, final stamp, checks, local build and handoff | Final work was consolidation/verification; no new asset-generation lane |
| Claude `claude-opus-5`, xhigh | Interiors | **NOT INCLUDED:** several source/fit/export-preparation iterations | Native Blender command denied. New source never became new GLB bytes |
| Muse and Alibaba Qwen | Earlier reviews/source research | Reports and recipes; not automatically new visible map assets | See native activity register; distinguish reports from runtime consumers |

VERIFIED — the final Muse commit `85edff1fe364a469a6e6772e83d7bf00e689abf4` was cherry-picked as `f181e03f7`. **Do not merge the whole technique-host branch:** its older ancestry carries broad deletions relative to Build17. Its final nine-file contribution was isolated successfully. Git's Luna coauthor trailer is not proof of Muse authorship; use the native route receipt.

VERIFIED — final commits after Build18: `4e5d738001c7673e90b2307d7e9f62fdfe415914` preserves runtime QA; `f181e03f7` imports the Lab change; `82677da2c` pins the intentional new GLB digests and final notes. Runtime gameplay code was not rewritten in this final consolidation.

## Inspection and verification

- VERIFIED: six focused Vitest files, **90 tests passed**; full TypeScript noEmit passed. Runtime probe's two Node tests and syntax check passed. Full Vitest suite was not run.
- VERIFIED: asset provenance **222 digests / 10 revisions**; public provenance **612/612 assets**; Lab host checks and routed preflight passed. Exact final preflight receipt: `C:/Users/david/projects/aa-world-studio/artifacts/pipeline/20260913T144114450Z-contribute.json`.
- VERIFIED: Build19 boots in native Chrome WebGPU. Both quality profiles load both Blender houses; 40 dynamic panes remain authoritative, grenade break works, and retirement waits for the GPU fence. [House receipt](../../../../.handoff-evidence/work/continued-world-20260913/handoff/captures/houses/receipt.json).
- VERIFIED: menu hover and keyboard-focus tooltip are visible, uncovered and within the viewport; menu opens the Lab; 14 unmapped rows are shown; mapped demo click works; actual Blender house loads; environment dropdowns change the rendered result; 760px page has no horizontal overflow. [UI receipt](../../../../.handoff-evidence/work/continued-world-20260913/handoff/captures/ui/receipt.json).
- OPEN: owner visual acceptance, full multiplayer/WAN regression and long-duration final-build performance acceptance. The prior temporal probe is **Build17 evidence**, not a Build19 performance certificate.

## The important unfinished work

1. **Visual quality is well below the supplied concepts.** House surface conflicts are reduced but obvious seams remain. [Actual quality screenshot](../../../../.handoff-evidence/work/continued-world-20260913/handoff/captures/houses/quality-house.png). The existing source conflict audit remains RED: `docs/technique-lab/houses/surface-conflict-audit.json`. Do not weaken it or label this AAA.
2. **Map/menu reentry stalls are reproducible.** The bounded Build17 test saw up to 1.78s Performance and 2.64s Quality frame gaps, delayed GPU completion and long tasks. Short steady gameplay/event phases were much healthier. Specific compilation/asset cause is OPEN. [Detailed report](../../../../.handoff-evidence/work/continued-world-20260913/recovery/runtime-stability/REPORT.md). New probe: `scripts/qa/runtime-stability-gate.mjs` and its test. Source SHA and served SHA are recorded separately in supplemental results; do not collapse them.
3. **Interior source is ahead of GLBs.** Candidate lane: `C:/Users/david/projects/worktrees/aa-interiors-night-20260912`, base HEAD `6b41cef51204491b2a1b779ebb9f33c9c7726928`, with preserved dirty source. Fit/footprint overruns remain. Call10 had five native `permission_denied` events in Claude `dontAsk`; no Blender process started and bytes did not change. [Exact denied action and proposal](../../../../.handoff-evidence/work/continued-world-20260913/recovery/BLENDER_ALLOWLIST_PATCH_PROPOSAL.md). That document is a proposal, not permission. Resolve the native boundary explicitly; do not retry through another launcher/interpreter as a workaround.
4. **The environment tab is a basic demonstration.** Morning/noon/dusk and clear/overcast work. It has static grass, no environment map or advanced reflections, no rain/snow/wind/storm, and visible grass/road intersection defects. [Actual screenshot](../../../../.handoff-evidence/work/continued-world-20260913/handoff/captures/ui/lighting-noon.png). Its conservative UI still says visual acceptance OPEN.
5. **URL/date details still need finishing.** Filtered unmapped view displays 14 rows, but the count prefix incorrectly retains “50 of 50”. Current catalog names no direct Blender target, so that navigation path is fixture-tested only. Dates are mostly identical or unknown; ISO times normalize to a day, so same-day update ordering is incomplete. Never invent missing dates.
6. **Menu music is not implemented.** The requested original low-key ~30-second military/industrial loop was queued, then cancelled during wind-down.
7. **Not every skill/source is accepted.** Some sources are adapted, aliases, comparisons or blocked. Shared-skill promotion has scan/regression debt. Loading a demo is not proof of matching the original technique or achieving its quality.

## Request coverage and original inputs

Start with [all actionable owner requests and states](../../../../.handoff-evidence/work/continued-world-20260913/handoff/OWNER_REQUESTS.md). It is a categorized register, not a verbatim chat export. Repeated ETA/status requests are grouped; prior historical feedback remains linked and OPEN.

- Full existing source/skill dashboard: `C:/Users/david/Documents/Codex/2026-09-11/p-le/work/fresh-world-20260912/SKILLS_DASHBOARD.html`.
- Detailed skill inventory and read evidence: `C:/Users/david/Documents/Codex/2026-09-11/p-le/work/fresh-world-20260912/SKILL_AND_AGENT_INVENTORY.json` and `.md`.
- Current 50-source methods, URLs, mappings, blockers and limitations: `C:/Users/david/projects/aa-world-studio/public/assets/skills-lab/source-catalog.json` (also served within Build19).
- **All 18 map concept images are already preserved outside Temp** at `C:/Users/david/Documents/Codex/2026-09-11/p-le/work/fresh-world-20260912/references/`. Names include layout-topdown, layout-angle, both houses' floor cutaways/backyards/side lanes, street views, bedroom, living room and vehicle views.
- GLM restaurant original prompt: `C:/Users/david/Documents/Codex/2026-09-11/p-le/work/fresh-world-20260912/research/night-shift-original-brief.txt`. [Source trace](../../../../.handoff-evidence/work/fresh-world-20260912/research/GLM_KITCHEN_SOURCE_TRACE.md). Original owner post: https://x.com/louszbd/status/2097366630108111161; prompt source: https://night-shift-glm-5-3-flash.vercel.app/data/events/clock-in.json. These were retrieved in the earlier audit, not re-fetched now. Separate follow-up remains unresolved. **Do not confuse Night Shift with StarKnightt/morning-diner.** Existing furniture implements an adjusted morning-diner material/construction method, not an exact GLM replay.
- Weather source: https://github.com/SkyeShark/Eanpa-Sky; requested background: https://x.com/zackontopx/status/2098235528076578953?s=46.
- [Source update audit](../../../../.handoff-evidence/work/fresh-world-20260912/SOURCE_UPDATE_AUDIT.md): prior daily metadata scan evidence does not equal exhaustive body reading or automatic skill updates.
- Canonical feedback: `docs/OWNER_FEEDBACK_CONTINUATION.json`, `docs/OWNER_FEEDBACK_2026-09-11.md`, `docs/OWNER_FEEDBACK_2026-09-12.md`, `docs/PASS65_OWNER_FEEDBACK_COMPLETENESS_GRAPH.json`. Historical HF315–565 coverage is not silently closed by this handoff.
- Prior checkpoints: [completion handoff](../../../../.handoff-evidence/work/completion-20260912/HANDOFF.md), [05:35 overnight handoff](../../../../.handoff-evidence/work/overnight-20260912/ROOT_HANDOFF.md), [morning activity](../../../../.handoff-evidence/work/continued-world-20260913/AGENT_ACTIVITY_20260913_1500.md).

## Models, usage and why visible progress was limited

[Agents and usage](../../../../.handoff-evidence/work/continued-world-20260913/handoff/AGENTS_AND_USAGE.md) records what actually ran. Much of the elapsed work produced reports, source revisions, export preparation and lifecycle repairs. Several interior jobs never generated new GLBs, so they could not visibly change the level. Broad skill discovery was sometimes further ahead than consumer wiring and visual acceptance. More workers alone did not solve this.

OPEN — other-provider remaining account quota is mostly unknown. Local caps are not subscription limits. Z.ai has a fresh redacted capacity receipt, but inference in the repaired context was not tested. Gemini native AGY remains blocked in the tested context. Do not auto-reroute through OMP or consume OpenAI reserves simply because another route fails.

## Preservation and next-session routing

VERIFIED — [lane checkpoints](../../../../.handoff-evidence/work/continued-world-20260913/handoff/lane-checkpoints.json) records **30 recent lanes**, including **8 dirty lanes**. [Local recovery archive](../../../../.handoff-evidence/work/continued-world-20260913/handoff/preserved-lane-changes.zip) preserves their tracked patches and named changed/untracked source/artifact files with SHA256 records. It is not a full repository backup and not proof that all those changes should be merged. No worktree was reset, removed or pruned. Do not blindly replay patches onto the current game.

The machine routing authority is `C:/Users/david/AppData/Local/atomic-acres-browser-arena/project-routing.json`; its inspectedPreview now points to Build19. Root lane expires **16:30 UK**. A later orchestrator must obtain a legitimate lane renewal/ownership transfer before new work; do not disable expiry or choose a similarly named worktree.

```powershell
node C:/Users/david/projects/atomic-acres-integration/scripts/release/project-routing.mjs resolve --project atomic-acres-browser-arena --lane world-studio-20260912 --machine dave-gaming-pc --harness codex
# Then, only from the returned worktree and legitimate owner context:
npm run pipeline:preflight -- --machine dave-gaming-pc --harness codex --project atomic-acres-browser-arena --lane world-studio-20260912
```

Read that worktree's AGENTS.md and contribution/multi-agent docs before mutation. Shared skills live under `C:/Users/david/Documents/desky-bootstrap-clone/Skills`; Codex/Claude/OMP discovery roots are adapters, not independent copies. AKP controls are `C:/Users/david/AppData/Local/hermes/.akephalos`. Native adoption is per harness; nobody may attest for another model/harness. Current parity report has catalogue/regression/adoption AMBER debt, even though filesystem routes exist.

## Local serving and final stop

VERIFIED — original preview PID42608 is Python312 `pythonw.exe -m http.server 41996 --bind 127.0.0.1 --directory C:/Users/david/projects/aa-world-studio/dist-world-studio-slice4`. AETHERIS PID39148 is the existing pythonw widget; preserve it. Re-check PID identity before any process action because Windows can reuse IDs. The duplicate owned Vite preview on41998 is unnecessary; its final disposition is in STOP_STATE.json.

Build19 was produced once with `VITE_BUILD_NUMBER=19` and `npx --no-install vite build --base=/updates/slice19/ --outDir=dist-world-studio-slice4/updates/slice19`. Do not overwrite this frozen folder. A future build needs a new number/output and exact-SHA receipt.

Continuation automation `atomic-acres-overnight-delivery-repair` is **PAUSED**. No new native generation or worker launches are authorized by this handoff. [Final stop receipt](../../../../.handoff-evidence/work/continued-world-20260913/handoff/STOP_STATE.json) is the last operational check. Leave the preview and AETHERIS up for Dave; stop the orchestrator after reporting.

Automatic approval review rejected a large shell-based handoff-packaging command with “blocked by policy”, without a more specific reason. That command did not execute. These plain documents link existing verified artifacts instead; no denied Blender or packaging action was retried through an alternate execution route.
