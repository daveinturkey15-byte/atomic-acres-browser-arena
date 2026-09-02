# Overnight plan, 2026-09-02 -> 03 (Claude Code coordinating, Opus lanes)

Owner (17:20 BST): build 1 at 20:00, build 2 later tonight, the big ones
overnight, PASS 87 published and ready by 06:00; keep everything tested,
debugged, refined, streamlined.

## Schedule (BST)
| Time | Event | Mechanism |
|---|---|---|
| 19:13 | Build 1 cut -> PASS 85 live ~20:00 | one-shot cron: merge every lane whose skeptic accepted (repair done), cherry-pick Lane V's showcase-page commit, tsc + full suite, publish_pass85.py (PASS 84 = sole backup), headless live smoke |
| 22:20 | Build 2 cut -> PASS 86 live ~23:15 | one-shot cron: same ritual for whatever cleared since (viewmodel + solver, lighting, hitch, eye clearance, corpus, ...) |
| hourly :17 | Self-check | recurring cron: relaunch any workflow the usage window killed (resume from journals, worktrees keep state), launch wave-3 lanes as slots free, machine health, ComfyUI VRAM note, headed-browser guard alive |
| 05:10 | Final integration -> PASS 87 live by 06:00 | one-shot cron: merge audit, merges, streamline review (Lane AF) if not done, tsc + full suite alone, publish, live smoke, morning report |

## Lanes
Running (wave 2c2 `wf_39dc6d27-ecf`, 2d `wf_6f7d0bd9-f8c`, 2e `wf_b7c8fb11-75b`,
2f `wf_382ff043-5f9`): U Nuke Town rebuild, T periodic stall, V Map 3
showcase port (explore mode), J eye clearance, S branch audit, N corpus, W
viewmodel rework + solver, X Firing Range grating + walkable sweep, Y drop
shots, Z arms/animations, I IBL lighting.

Wave 3 (launch as slots free, briefs in docs/pass84-lanes/), in this order:
H load-time deep cut with the Gun Range switch failure as job 0 (HF-417,
first), AB dynamic time-of-day/weather lighting (Lane I found the IBL bug
already fixed; AB can start), AI graphics profiles: audit + Balanced profile + RTX explainer (after Lane
U lands), AL lighting quality tiers (baked probes, SSR, AO; after AI and
AB design docs), AQ Raid layout rethink (HF-408, code-authored raid2
preview, launched 22:05), H2 load-time deep cut second pass (after the PASS 86 cut;
Lane H held: first loads regressed +45-52% on gun-range/high-seas), AR PASS 87 residuals (HUD overflow, minimap 30 Hz,
bot stance, line-ceiling ratchet, overdrive roof claim; launch after the 22:20
cut), HF-419..422 owner-links trials (running, wf_d3563d0e-854), AD release-CI fix + shared publish module, AE emulated
mobile pass + phone checklist, AG hill-climb loop (staged, three supervised
iterations), AH ComfyUI native 3D pipeline skill intake + animation options
(governed skill work, no game source), AJ brief-driven scene-production
skill + one Map 3 corridor by the method (3-6 h, after U and AI), AK Nuke
Town art pass by the method with Gemini critics (after U and AJ), AC branch
cleanup execution (after Lane S's plan and PASS 86, tags first), AF
streamline review (last, before the 05:10 gate).

Shelved by the owner: Farcrysis preview (R), bus doors (K), Raid art (L;
Raid gets a layout rethink, HF-408). Waiting on the owner: chopper culling
gate decision (Lane M), Raid layout rethink scheduling.

## Standing rules for every cut
Merge only accepted branches; dry-merge first; explicit paths; tsc + FULL
vitest on the merged tree; re-pin only owner-directed test changes with the
reason; freshness guard (rebuild + recopy after anything writes a .json);
headless-only verification; nothing while ComfyUI's queue is running; PASS N
live + PASS N-1 sole backup, older trees retired; ledger rows updated to
VERIFIED with evidence; report to the owner what shipped and what waits.
