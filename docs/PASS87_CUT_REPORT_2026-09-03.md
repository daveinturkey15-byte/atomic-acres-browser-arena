# PASS 87 cut report (published 04:35 BST 2026-09-03, live-verified 04:37)

Orchestrator: Claude Code (Fable 5.1); every worker Opus 5.1. Cut ran by hand
from 04:06 (scheduled jobs never fire in this session; a Monitor timer replaced
them).

## Published
- Integration head 63e69108 on `contrib/dave-gaming-pc/omp/pass84-overnight`.
- gh-pages channels are exactly {pass87 (live), pass86 (safe backup)}; pass85
  retired. Root chooser generation 97618442dcec. Identity chunk names PASS 87
  only; `channels/pass87/map3.html` answers 200.
- Rollback: `python scripts/orchestration/publish_pass87.py --rollback`.

## Merged since PASS 86 (00:50)
| Lane | What | Verdict |
|---|---|---|
| R (via pass87-integration-r) | **FARCRYSIS · PREVIEW**: spawn table on the terrain authority, ground registered for raycasts, crate/tower/dish/cave authority, the ground shot box no longer swallows a standing player, eye clearance measured (441; 373 instrument slack), art lifted off black, cold admission 1.28-1.30x the Nuke Town control, publish guard now an admission-evidence guard (receipt keyed to the built bundle) | ACCEPT_WITH_FIXES, repaired; integration clean |
| AQ (via pass87-integration-raid) | **RAID REBUILD · PREVIEW**: wall SHAPE not quantity was the defect; 34 masses averaging 22.6 m2 (was 59 at 11), mean open sightline 13.62 m (was 9.97), long-axis median 25.65 m, 21.9% roofed (was 36.7%), all four upper rooms reachable, 12/12 spawns with zero spawn-to-spawn sightlines, real menu preview; eleven selectable arenas; migration collision (0008) fixed as 0009 | skeptic REJECT on one blocker, repaired; integration clean, full suite 5371/0 |
| AR | residuals: menu overflow was a decorative pseudo-element (0 px at every viewport with 9-11 cards), minimap 30 Hz, bots get a stance (AI-driven, replicated), one-way line ceiling, 2x core needs line of sight (was claimable through the bus roof on both Nuke Towns), nacelle collider un-transposed, gamepad spec executed by CI, staging cannot empty the dist root, eye-clearance stage 3 scrape fixed (it had thrown since HF-410), shared preview-generator digest pinned once, review cameras track the real near plane, stale webgl2 copy removed | ACCEPT_WITH_FIXES, repaired |
| AE | mobile: PAUSE tap no longer opens the project map under it; touch loop verified on three emulated devices; phone checklist; integrator applied its collapsed-Advanced-Graphics CSS fix | ACCEPT_WITH_FIXES, repaired |
| AD | release CI: the workflow verifies and cannot publish; `publish_pass<N>.py` is the only publisher; docs aligned | ACCEPT_WITH_FIXES, repaired |
| AH | ComfyUI native 3D pipeline skill evidence (skill lives in the vault) | ACCEPT_WITH_FIXES |

## Held for the next pass (with reasons)
- **H2 load-time second pass** (ACCEPT_WITH_FIXES, audit clean): the first-load
  regression is gone (gun-range x1.01, high-seas x1.02 vs the PASS 86 baseline)
  while the HF-417 switch-fence fix is kept; the paired whole-switch +488 ms
  median is NOT yet repaired and its boot smoke was not run. Candidate for a
  PASS 88 cut this morning.
- **AB dynamic lighting** (ACCEPT_WITH_FIXES; repair/audit still running at the
  cut): time of day on every arena as uniform writes over the frozen light set,
  a host-authoritative TIME OF DAY lobby row, the design doc.
- **AL lighting quality tiers** (skeptic REJECT; repair running).
- **AI graphics ladder** (done + repaired: Balanced profile, RTX explainer, 5x3
  ladder measured) — not merged tonight because its branch predates the arena
  additions; merge in the morning with the roster follow-ups.
- **HF-419..422 Map 3 trials**: GTA-art trial and animation trial accepted with
  fixes, subway-lighting trial repaired after a reject, water trial accepted with
  fixes; merge audit pending. Skills are already in the vault store.
- **Lane T** (stall instruments; permissive threshold) and **Lane H first pass**
  superseded by H2.

## Gates on the cut
- tsc 0; full `npx vitest run` 565 files / 5405 tests, 0 failed (after re-pinning
  the release-topology test to AR's copy-then-remove staging); release tests
  69/69; plan contract 9/9; `qa:release-identity` OK; **Farcrysis admission
  receipt** collected against this bundle (3 paired runs, uncontended, worst pair
  ratio 1.297, 0 in-match pipelines) and accepted by the guard; **headless Chrome
  boot smoke 13/13 - all eleven arenas** including raid2 and farcrysis; publish
  guards all green; live checks green.
- NOT run: the pipeline tripwire on this exact bundle (H2 measured 0 on three
  arenas on its branch; Lanes U/V/R measured their own 60 s runs at 0), the
  cross-browser smoothness gate (machine shared with six lanes all night), the
  pass69-3 near-plane catalog (setup fixed, full run unverified under load).
