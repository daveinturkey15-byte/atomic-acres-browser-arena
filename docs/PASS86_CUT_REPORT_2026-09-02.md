# PASS 86 cut report (published 00:50 BST 2026-09-03, late)

Orchestrator: Claude Code (Fable 5.1). The 22:20 cut job never fired (session
crons do not fire in this session; the 19:13 one did not either), so the cut
ran by hand from 00:27 once the Map 3 finisher's report exposed it.

## Published
- Integration head e1361b0f on `contrib/dave-gaming-pc/omp/pass84-overnight`.
- gh-pages channels are exactly {pass86 (live), pass85 (safe backup)}; pass84
  retired. Root chooser generation cb0967af4030. Rollback:
  `python scripts/orchestration/publish_pass86.py --rollback`.

## Merged (onto c67c11c6, which already carried PASS 85 + Lane W + gate repairs)
| Lane | What | Verdict |
|---|---|---|
| J | eye-clearance triage: instrument repairs, ceilings measured (two lowered), stage-3 unverified ratchet, eye-model divergence pinned | ACCEPT_WITH_FIXES, repaired |
| N | QA corpus streamline, derived arena rosters, legacy-main size ratchet | ACCEPT_WITH_FIXES, repaired |
| I | IBL first-arena path verified (already fixed on the line), additive | merge-ready |
| U | **Nuke Town Rebuild (nuketown2), PREVIEW card, selectable + multiplayer**: reference-derived layout, back-yard spawns, bus on the origin with the 2x core on its roof, open trucks / closed cars, sheds, rare gun landed, real menu preview, eye clearance measured (18, 2 open) | finisher: merge-ready, full suite 5187/0 |
| V | **Map 3 EXPLORE**: card back as an arena KIND, eight corridors in the arena (physics playground now in-arena), honest HUD (no clock/scoreline, ESC to menu), the warmup deadlock that froze the player fixed (P0), /map3.html staged INSIDE the channel with proof, eye clearance measured (24 -> 0 remaining) | finisher-3: merge-ready, full suite 5253/0 |

Conflict resolutions (integration commits da01ee4b, 7a9b05b4, and the fix
commit before e1361b0f): nine selectable arenas everywhere (map3 explore +
nuketown2); the derived `ALL_ARENA_IDS` kept over U's literal; the eye-clearance
ledger merged programmatically (V's map3 truth: ceiling 24; U's nuketown2: 18;
`unverifiedCeiling.nuketown2 = 0`); nuketown2 given its required `kind: 'team'`,
parity-audit factory entry and walkable-gate ledger row (0 fall-through, 29
walkable visuals); the eye-model divergence regex now accepts HF-412's
`stanceTransitionSample.eyeOffsetMeters` term with the 0.14 m standoff still
pinned; legacy-main line ceiling 35,720 -> 36,408 with a CEILING_HISTORY entry.

## Held (with reasons)
- **Lane H (HF-417 / load cut)**: the off-fence precompile fixed the fence-
  exceed class (switch matrix 56/56) but made first loads +45-52% slower on
  gun-range and high-seas and whole switches slower (median +488 ms). Lane H2
  addendum written; PASS 87 or later.
- **Lane T (periodic stall)**: not merged - its stall threshold moved in the
  permissive direction per the skeptic; instruments wanted, held for the H2/AR
  pass to re-land without the threshold change.
- **Lane S**: docs only, on the line.
- Lane J's nacelle collider patch and Lane N's change-impact patch: NOT landed
  in this cut (time); in the residuals lane.

## Gates on the cut
- `npx tsc --noEmit` 0 (root); full `npx vitest run` 5297 passed / 2 skipped
  with the two roll pins fixed (freshness-guard exclusion list; changelog latest
  pin) - re-run of those files green; plan contract 9/9; `qa:release-identity`
  OK; headless Chrome arena boot smoke **12/12 on the built PASS 86 - all ten
  arenas including nuketown2 and map3** (8.6 min under load); walkable-surface
  gate 10/10; eye-clearance + cross-browser contracts 34/34; publish guards all
  green (freshness tripped once on Playwright's `.last-run.json` under
  artifacts/, deleted).
- NOT run on this cut: the pipeline tripwire (Lane H's data shows 0 in-combat
  creations on the integration line; U/V measured their arenas' 60 s runs with
  zero errors), the cross-browser smoothness gate (machine at 99% CPU with the
  Raid/Farcrysis/skills lanes), the pass69-3 near-plane catalog (blocked on the
  loaded box), the full pass65 arms visual gate (2 honest reds recorded).

## Owner-visible in the morning
- NUKE TOWN REBUILD · PREVIEW card (host it with friends; promotion out of
  PREVIEW is the owner's call; the shipped Nuke Town is untouched).
- MAP 3 · EXPLORE card: walk the eight corridors; showcase page under the
  channel at `channels/pass86/map3.html`, linked from the menu.
- First-person rig inside the body (Lane W), near plane 0.02 m on measured
  evidence; drop shots and the Firing Range netting from PASS 85.

## Process
- Crons do not fire in this session; the PASS 87 cut and the 02:45 self-check
  are Monitor timers now. `roll_pass.py` lost its changelog latest-pin step
  (step 10) in an edit; the PASS 86 pin was fixed by hand and the step must be
  re-added before the PASS 87 roll.
