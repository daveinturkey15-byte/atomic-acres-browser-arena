# Pass 65 Estimation and Critical-Path Model

This is an engineering estimate, not a deadline or a promise. It exists to make the 122-task runbook auditable and to expose the strongest counterargument to an overnight release: even perfect four-way parallelism cannot erase the serial architecture, integration, evidence, owner-review and release gates.

## 1. Estimation rules

- `P50` includes implementation, the task's smallest validation, ordinary local correction and handoff.
- `P90` includes one substantial design/asset/test rework loop and slower integration on the same bounded task.
- Hours are active agent-hours. Hosted CI, Pages, asset-generation and owner waits are recorded separately and do not consume a slot continuously.
- An integrated specialist result is not complete until the integrator reruns its evidence at the integrated SHA; those costs live primarily in Q01 and the wave-exit QA tasks.
- Tasks may overlap only when the runbook dependencies and write leases allow it. One integrator plus at most three specialists means four active slots, not four interchangeable writers.
- Confidence is `H` for known release/test work, `M` for extension of existing game systems, and `L` for authored asset/destruction/flight work with material discovery risk.
- The P90 figure already carries task-local rework. The program additionally reserves 15% P50 / 20% P90 for cross-lane integration rework after summing tasks.

## 2. Task-level effort register

| Task | P50 h | P90 h | Lane | Confidence | External wait |
|---|---:|---:|---|---|---|
| G01 | 0.5 | 2 | release gate | H | Pass 64 task |
| G02 | 2 | 4 | release gate | H | GitHub |
| G03 | 1.5 | 3 | browser proof | H | Pages/cache |
| G04 | 3 | 6 | benchmark/rollback | M | Git/Pages |
| G05 | 1 | 2 | Git/worktree | H | none |
| G06 | 2 | 4 | impact policy | H | CI |
| B01 | 4 | 8 | hardware baseline | M | local hardware |
| P01 | 3 | 5 | spec | H | none |
| P02 | 2 | 4 | ownership | H | none |
| P03 | 3 | 6 | estimation/DAG | M | none |
| P04 | 2 | 4 | product decisions | M | owner if escalated |
| P05 | 2 | 4 | evidence policy | H | none |
| P06 | 1 | 3 | P0 release | H | CI/GitHub |
| P07 | 2 | 4 | Git/worktree | H | GitHub |
| F00 | 4 | 8 | release foundation | M | CI |
| F13 | 6 | 10 | skills/rules | M | none |
| F14 | 6 | 12 | skill forward tests | M | fresh agents |
| F15 | 4 | 8 | renderer/effects inventory | M | none |
| F16 | 3 | 6 | audio inventory | M | none |
| F01 | 4 | 8 | weapon schema | M | none |
| F02 | 4 | 7 | compatibility adapters | M | none |
| F03 | 3 | 5 | registry verifier | H | none |
| F04 | 4 | 8 | loadout/storage | M | decisions |
| F05 | 4 | 8 | ordnance schema | M | decisions |
| F06 | 6 | 12 | support schema | L | decisions |
| F07 | 6 | 12 | interactive-world schema | L | baseline/decisions |
| F08 | 5 | 10 | settings schema | M | baseline/decisions |
| F09 | 6 | 12 | protocol v7 | L | none |
| F10 | 5 | 10 | life/revision invariants | M | none |
| F11 | 20 | 40 | B1.0 lifecycle/arena transaction/authority parity | L | CI/browser |
| F12 | 4 | 8 | deterministic time/RNG | M | none |
| A01 | 6 | 12 | inventory authority | M | none |
| A02 | 4 | 8 | shot admission | M | none |
| A03 | 5 | 10 | combat-result authority | M | none |
| A04 | 7 | 14 | projectile/effect authority | L | none |
| A05 | 5 | 10 | visibility authority | M | none |
| A06 | 8 | 16 | support authority | L | none |
| A07 | 10 | 20 | collision authority | L | none |
| A08 | 8 | 16 | replication/repair | L | none |
| A09 | 3 | 6 | diagnostics | M | none |
| S01 | 3 | 6 | combat feedback | M | none |
| S02 | 5 | 10 | health/sensory | M | standard/decision |
| S03 | 6 | 12 | audio mixer | M | none |
| S04 | 7 | 14 | spatial audio | L | browser audio |
| S05 | 5 | 10 | footsteps | M | two-peer run |
| S06 | 8 | 16 | ambience/audio assets | L | asset sourcing |
| S07 | 6 | 12 | graphics UI | M | none |
| S08 | 5 | 10 | audio/accessibility UI | M | none |
| S09 | 10 | 20 | WebGPU/TSL effects | L | local hardware |
| V01 | 18 | 36 | first-person rig/assets | L | asset generation |
| V02 | 14 | 28 | animation/action graph | L | asset iteration |
| V03 | 12 | 24 | existing-weapon migration | L | visual review |
| W01 | 6 | 12 | rifle mechanic slice | M | none |
| W02 | 14 | 28 | rifle asset slice | L | asset generation |
| W03 | 10 | 20 | Uzi end-to-end | L | asset generation |
| W04 | 10 | 20 | MP5 end-to-end | L | asset generation |
| W05 | 10 | 20 | AK end-to-end | L | asset generation |
| W06 | 10 | 20 | flashlight pistol | L | asset/audio review |
| W07 | 10 | 20 | explosive crossbow | L | asset/network review |
| W08 | 3 | 6 | machine-pistol option | M | none |
| W09 | 2 | 4 | existing LMG option | H | none |
| W10 | 12 | 24 | minigun end-to-end | L | asset/perf review |
| W11 | 12 | 24 | DMR/thermal | L | WebGPU review |
| W12 | 10 | 20 | slug shotgun | L | asset generation |
| W13 | 4 | 8 | scattergun rebalance | M | balance review |
| W14 | 10 | 20 | knife end-to-end | L | asset generation |
| W15 | 6 | 12 | loadout UI/lifecycle | M | decision |
| W16 | 8 | 16 | arsenal balance red team | L | simulation/HITL |
| O01 | 4 | 8 | frag migration | M | none |
| O02 | 8 | 16 | smoke | L | WebGPU/network |
| O03 | 6 | 12 | flash | M | accessibility |
| O04 | 6 | 12 | DMR optic integration | L | pixel evidence |
| O05 | 6 | 12 | sticky bolt | L | network chaos |
| O06 | 4 | 8 | effect pooling | M | performance run |
| DW01 | 8 | 16 | collision integration | L | none |
| DW02 | 6 | 12 | shed authority | L | none |
| DW03 | 6 | 12 | door | L | physics iteration |
| DW04 | 8 | 16 | apertures/ballistics | L | property tests |
| DW05 | 8 | 16 | dents/fracture state | L | asset interface |
| DW06 | 10 | 20 | Rapier debris | L | physics iteration |
| DW07 | 8 | 16 | TSL damage surface | L | hardware review |
| DW08 | 16 | 32 | authored shed assets | L | asset generation |
| DW09 | 16 | 32 | vertical slice integration | L | hardware/network |
| DW10 | 8 | 16 | map rollout | L | map review |
| DW11 | 12 | 24 | destruction red team | L | hardware/chaos |
| K01 | 4 | 8 | streak selection | M | decisions |
| K02 | 3 | 6 | Adrenaline | M | decision |
| K03 | 8 | 16 | care-package physics | L | physics/network |
| K04 | 6 | 12 | RNG/Nuke | M | decisions |
| K05 | 8 | 16 | carpet bomber | L | map/perf review |
| K06 | 10 | 20 | flight navigation | L | per-arena iteration |
| K07 | 10 | 20 | chopper | L | calibration |
| K08 | 8 | 16 | drone base | L | network/history |
| K09 | 12 | 24 | drone swarm | L | AI/performance |
| K10 | 10 | 20 | piloted possession | L | control/network |
| K11 | 6 | 12 | wall sensor | L | WebGPU/security |
| K13 | 6 | 12 | host-seeded chopper motion variance | M | multiplayer/visual review |
| K12 | 12 | 24 | support red team | L | hardware/chaos |
| M01 | 6 | 12 | surface integration | M | viewport review |
| M02 | 8 | 16 | arena cleanup | L | visual review |
| M03 | 10 | 20 | arena systems integration | L | per-arena review |
| M04 | 12 | 24 | renderer integration | L | hardware review |
| M05 | 12 | 24 | menu helicopter/cockpit/cat choreography | L | asset/visual review |
| RL01 | 5 | 10 | Pass 65 release shell | M | CI/browser |
| Q01 | 8 | 16 | serial integration receipts | M | cumulative CI |
| PV01 | 3 | 6 | exact S0 freeze and immutable preview | H | CI/artifact |
| Q02 | 8 | 16 | combat QA | M | none |
| Q03 | 12 | 24 | network red team | L | multi-peer runs |
| Q04 | 16 | 32 | visual corpus | L | capture time |
| Q05 | 6 | 12 | accessibility QA | M | frame analysis |
| Q06 | 12 | 24 | RTX hardware QA | L | local hardware |
| Q07 | 6 | 12 | disposal soak | M | elapsed soak |
| Q08 | 8 | 16 | provenance audit | M | licence review |
| Q09 | 4 | 8 | benchmark/rollback QA | H | staged browser |
| Q10 | 6 | 12 | acceptance evidence | M | none |
| Q11 | 4 | 8 | hosted CI reconciliation | H | GitHub runners |
| H01 | 2 | 4 | owner handoff | H | owner availability |
| H02 | 0 | 1 | owner decision | H | owner availability |
| R01 | 1 | 2 | approval commit/parity | H | CI |
| R02 | 2 | 4 | merge/check lineage | H | GitHub runners |
| R03 | 1 | 2 | production dispatch | H | GitHub/Pages |
| R04 | 3 | 6 | public/receipt proof | H | Pages/cache |

## 3. Program totals and wall-time model

The task table is the source of truth; totals must be recomputed automatically after any row changes.

Planning expectation from this snapshot:

- Base active effort is 813 agent-hours P50 and 1,624 agent-hours P90 before the program-level cross-lane reserve.
- With the 15%/20% cross-lane reserve, plan around 935 agent-hours P50 and 1,949 agent-hours P90.
- Four-slot perfect-parallel lower bounds are therefore roughly 234 and 488 wall-hours. They are physically unattainable because the integrator, B1.0 lifecycle/authority gate, schema chain, vertical slices, preview-choreography/cockpit forge, S0 evidence, owner HITL, S1/S2 gates and production are serial.
- A first auditable critical-path conjecture is approximately 307–575 elapsed hours of active continuous operation, plus external GitHub/Pages/owner waits. This must be recalculated from actual task telemetry at B1.

These numbers replace the earlier unaudited 40–70 hour conjecture. A substantially earlier preview can only be a clearly labelled subset candidate; it cannot be represented as complete Pass 65.

## 4. Critical-path chain

```text
Pass 64 public proof
→ B0 + classifier-safe P0
→ B1 + B1.0 lifecycle/atomic-arena/authority-parity gate + release/skill/schema foundation
→ protocol/life/inventory/projectile/support/collision authority
→ rifle + smoke/DMR + shed vertical slices
→ viewmodel/arsenal assets + ordnance + sensory/settings
→ flight navigation + support suite + shed authored rollout
→ arena/renderer/release-shell integration
→ balance/network/visual/accessibility/RTX/disposal/provenance/rollback QA
→ explicit PV01 S0 freeze/artifact + S0-bound QA + owner HITL
→ S1 parity + five checks
→ S2 merge + five checks
→ protected production + Pages/receipt/public proof
```

The critical path is shortened only by early interface freeze, bounded non-overlapping lanes, prewarming/pooling, deterministic fixtures and rejecting failed vertical slices before content multiplication. It is not shortened by skipping authority, provenance, accessibility, rollback, hardware evidence or HITL.
