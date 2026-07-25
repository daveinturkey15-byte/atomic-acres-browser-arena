# Pass 65 P0 release foundation

Date: 2026-07-25
Owner: Pass 65 release integrator
Impact declaration: `process-only`
Implementation base (`B0`): `5075a52d80c6db69a97ed53acc2df5368728371a`

This record turns the Pass 65 planning package into repository-visible contribution state without changing gameplay, rendering, networking, assets, dependencies, release-channel behavior, or production output. It is the only worktree allowed to start from `B0`. Runtime and release-shell worktrees must start from `B1`, the exact `origin/main` SHA after this P0 contribution is reviewed, merged, and green.

## 1. Pass 64 handoff evidence

Pass 65 was not allowed to mutate the repository until Pass 64 was independently proven merged, published, and playable. The evidence gate is now satisfied:

| Evidence | Exact identity | Result |
|---|---|---|
| Final Pass 64 source | `5075a52d80c6db69a97ed53acc2df5368728371a` | Released source and P0 base agree. |
| Final exact-main verification | GitHub Actions run `30175101338` | Succeeded on the final source SHA. |
| Protected production | GitHub Actions run `30175191044` | Validation, build, topology, publish, Pages, live smoke, and receipt succeeded. |
| Pages deployment | Run `30175279180`; `gh-pages` SHA `8326c95659a9fb8c5979c13f9b88126c4ffb85f7` | Succeeded. |
| Production receipt | Artifact ID `8624038234`; artifact digest `sha256:dde14d5f4bd1555481d3887ea5e4dcb917aa229b3ce052987667871b31d155c8` | Schema v3 source/Pages/acceptance/topology/live-smoke fields agree. |
| Pass 64 published subtree pointer | Receipt topology channel `channels/experimental-netcode-pass`: `exactRootFileCount=130`, `treeSha256=ffd3e130d005e9321976795fe2d5cadfd9965ebb27dc0bbff0c1609816cff20b` | Captured identity pointer. F00 must turn it into schema-v1 `baselines/pass64/pass65-stable-rollback.json` with digest algorithm, path scope, exclusions, complete release identities, verifier, and no-rebuild restore policy before calling the rollback record complete. |
| Pass 63 stable runtime | 119 files; digest `61666de694ea6bd62391c1e0661ffcc2864142bb569407c93a2ebdfd28031ce7` | Stable remained byte-identified during the Pass 64 release. |
| Public browser | Chooser rendered Pass 64 Live / Pass 63 Stable; direct live entered bot gameplay; stable, normal, and room routes loaded in fresh isolated tabs with no unexpected logs | Public behavior agrees with release evidence. |

A rapid same-tab sequence through multiple aliases did expose a Three.js disposal-time `isReady` exception. Fresh isolated normal and room loads were clean, so it did not falsify the Pass 64 live claim. Pass 65 must retain it as a bounded navigation/disposal regression challenge rather than erase it from the record.

## 2. Exact P0 boundary

At `B0`, `scripts/release/change-impact.mjs` classifies `AGENTS.md` and `docs/**` as process-only. This contribution therefore changes only:

- `AGENTS.md`, solely to route future harnesses into the Pass 65 contracts;
- `docs/INDEX.md`;
- `docs/PASS65_P0_RELEASE_FOUNDATION_2026-07-25.md`;
- `docs/PASS65_BIG_ONE_MASTER_PLAN.md`;
- `docs/PASS65_REQUIREMENTS_MATRIX.md`;
- `docs/PASS65_DECISION_RECEIPTS.json`;
- `docs/PASS65_DECISION_RECEIPTS.schema.json`;
- `docs/PASS65_WORK_BREAKDOWN_RUNBOOK.md`;
- `docs/PASS65_PROJECT_SKILLS_SPEC.md`;
- `docs/PASS65_TECHNICAL_CONTRACT_SKETCHES.md`;
- `docs/PASS65_ESTIMATION_AND_CRITICAL_PATH.md`;
- `docs/PASS65_OWNER_HITL_CHECKLIST.md`.

The P0 boundary expressly excludes:

- `acceptance/pass-65.json`: the current executable schema has no pending/skeleton status, requires sequential `R1..Rn`, and requires `status="accepted"` even before its separate human-acceptance object can pass. The runtime contribution therefore creates no P0 placeholder. After exact runtime source `S0` and `pr-preview-<pr>-<S0>` exist, Q10 adds one manifest-only descendant `S0M` with `R1..R99` mapped deterministically from the planning matrix, allowed evidence kinds, `status="accepted"`, and all pre-HITL mechanical/visual/independent-review fields complete while omitting `humanAcceptance`; phase-tagged R04 public-release evidence is not claimed early. Its sole expected gate error is missing Dave approval. After Dave approves exact S0, S1 changes only `humanAcceptance`.
- `.agents/skills/**`: currently full-impact and therefore created and forward-tested on B1, not disguised as process-only.
- baselines, package scripts, QA code, runtime source, tests, assets, workflows, and release-shell files.
- any Pass 65 live/stable configuration or publication action.

Unknown or mixed paths fail closed to full runtime impact. The final P0 diff must be classified from exact `B0` to exact head; a prose declaration is not proof.

## 3. Planning-corpus contract

The repository package is self-contained and mechanically reconciled:

- 99 unique `R###` requirements, each with expected result, active falsifier, evidence, and state;
- 15 unique `DEC-##` product/engineering decisions plus canonical schema-v1 receipts in `docs/PASS65_DECISION_RECEIPTS.json`; all P0 receipts are `OPEN`, have null authoritative values, and therefore unlock nothing;
- 122 unique implementation/verification/release tasks, including explicit B1.0 lifecycle/authority and PV01 S0-freeze gates;
- 122 matching P50/P90 estimate rows with no missing or extra task IDs;
- balanced Markdown code fences, no duplicate IDs, no stale audit counts, and no missing index target;
- design contracts for authority/presentation separation, stable identity and life epochs, catalogs/loadout migration, ordnance, strict support-state unions, destructible sheet surfaces, settings normalization, audio budgets, and evidence lineage;
- one concise owner/taste HITL route backed by exhaustive precomputed mechanical evidence.

The estimates are planning distributions, not a promise. Current totals are 813 P50 and 1,624 P90 active agent-hours before cross-lane reserve; the program model applies 15% P50 and 20% P90 integration reserve. The conjectured dependency-critical path is 307–575 active elapsed hours plus CI, artifact-generation, cache, and owner waits. Any implementation that materially changes this graph must update the estimate instead of silently preserving an obsolete number.

## 4. Base and integration discipline

1. `B0` is the exact successfully released Pass 64 main SHA named above.
2. P0 uses one owner and one worktree on `contrib/dave-gaming-pc/codex/pass65-p0`.
3. P0 changes only the repository agent-routing contract and documentation; it must pass process-only classification, static/unit gates, and repository preflight.
4. An independent integrator inspects the real diff and checks before merge.
5. `B1` is the exact `origin/main` SHA after P0 merges and all required checks succeed.
6. The central runtime integration worktree and every specialist worktree start from the same `B1` and record base, upstream, owner, write lease, source commit, integrated commit, patch provenance, and post-integration evidence.
7. Before specialist features, F11/B1.0 must install the generation-aware arena transaction, idempotent lifecycle registry, static-authority parity adapter and presentation-authority separation, then pass the named rapid same-tab falsifier.
8. Shared hotspots are single-writer. Specialists never edit the integration worktree or publish.

## 5. Observations, assumptions, unknowns, and falsifiers

Observed:

- Pass 64 release evidence and public routes agree on the exact identities in section 1.
- The P0 worktree started clean at `B0`, contained current `origin/main`, and passed the repository contributor preflight before implementation.
- The current classifier recognizes every intended P0 path as process-only.

Assumed until challenged on B1:

- The current four-slot coordination model remains available: one integrator and at most three non-overlapping specialists.
- The intended local hardware review target remains the recorded RTX 5080 system at 2560×1440; the B1 baseline task must capture browser adapter/backend, driver, OS/browser version, DPR, refresh, preset, seed, and scene corpus rather than trust this prose.
- Defaults in `DEC-01` through `DEC-15` are provisional engineering choices, not statements already approved by Dave.

Unknown until the named spikes or decisions close:

- exact authored asset/audio sourcing and production throughput;
- final killstreak roster/cost/duplication/care-pool rules;
- final photosensitive-flash standard and numerical thresholds;
- exact destructible-shed budgets after same-machine baseline capture;
- whether the intended TSL deformation/mask path satisfies colour, depth, and shadow parity on the target renderer;
- whether Pass 62 remains offline/reconstructible or gains a deliberate public path.

Falsifiers that stop progression include a P0 path classifying as runtime or release-shell, `origin/main` moving before review without reconciliation, duplicate/missing requirement or task IDs, a task/estimate mismatch, a hidden runtime diff, or a failed required check.

## 6. Non-negotiable publication stop

P0 authorizes architecture and implementation work only. It does not authorize a Pass 65 release.

The final candidate must stop at one immutable preview source SHA after all runtime, release-shell, evidence, multiplayer, renderer, performance, accessibility, asset-provenance, and rollback gates are green. Dave then performs the owner HITL route in `PASS65_OWNER_HITL_CHECKLIST.md`. Only Dave's explicit approval of that exact candidate may unlock an approval-only lineage commit, final exact-main checks, and the protected production workflow. Any later runtime or release-shell change invalidates approval and requires a new immutable preview and HITL.
