# Pass 65 Work Breakdown and Agent Runbook

This runbook turns the master plan into bounded handoffs. Estimates are planning ranges, not deadlines. Tasks may run in parallel only when dependencies and write scopes do not overlap.

## 1. Handoff contract

Every specialist receives:

- Exact absolute repo/worktree path, full canonical branch ref, upstream, B1/base SHA, owner agent/task ID and common Git directory.
- One bounded outcome and explicit non-goals.
- Requirement/falsifier IDs.
- Owned paths and forbidden shared hotspots.
- Required repo instructions/skills/references.
- Smallest validation plus wave-exit validation.
- Authority, presentation, accessibility, provenance, and performance invariants.

Every specialist returns:

- Exact source commit SHA and clean status.
- Changed-path inventory.
- Observations, inferences, assumptions, unknowns, and falsifiers kept distinct.
- Commands/tests run and full pass/fail summary.
- Evidence artifact paths and exact source/build identity.
- Residual risks and explicit “not verified” claims.
- No merge, publish, release dispatch, or integration-worktree mutation.

Integrator acceptance sequence:

1. Verify worktree identity, ancestry, remote, clean state, and commit object.
2. Inspect diff and requirement mapping.
3. Re-run the smallest relevant validation.
4. Challenge at least one named falsifier.
5. Accept/cherry-pick serially with `-x` or patch-ID provenance.
6. Record source commit, integrated commit, integrated tree digest and hotspot lease release.
7. Run shared-hotspot and impacted-group tests at the integrated SHA; specialist evidence is provisional until reproduced.
8. Update central ledger with exact commit/evidence state.

## 2. File-contention rules

Single-writer hotspots:

- `src/legacy-main.ts`
- `src/protocol.ts`
- `src/ui/pass64-shell.ts`
- `src/style.css`
- `src/gameplay.ts` while catalog extraction is active
- `src/field-support.ts` while killstreak extraction is active
- `src/audio.ts` while mixer extraction is active
- `acceptance/pass-65.json`
- `docs/PASS65_DECISION_RECEIPTS.json`
- `docs/PASS65_DECISION_RECEIPTS.schema.json`
- `package.json`
- release workflow/topology scripts

Rules:

- The foundation owner changes protocol/catalog seams first; downstream writers wait for the interface commit.
- Specialists add domain modules and tests. Integrator owns final coordinator/shell/package/acceptance wiring unless explicitly delegated serially.
- Art producers own source assets and manifest fragments, not runtime mechanics.
- QA owner does not edit feature code while acting as independent falsifier reviewer.
- No agent “helps” another by editing its worktree.
- Every single-writer hotspot has a lease recording owner agent/task ID, acquisition time, start SHA, expected paths and release time.

## 3. Gate and release-control tasks

| Task | Owner | Dependencies | Outcome | Requirements | Smallest validation | Exit evidence |
|---|---|---|---|---|---|---|
| G01 | Integrator | None | Monitor Pass 64 task without repo mutation. | R001 | Bounded task snapshot only. | Task ID/status/cursor in ledger. |
| G02 | Integrator | Material release state exists | Reconstruct PR/main/check/workflow/Pages/receipt truth without waiting for task finality or treating task text as proof. | R001,R007 | Exact-SHA GitHub queries. | Central release ledger. |
| G03 | Browser verifier | G02 deployment | Cache-busted chooser/live/stable/alias rendered checks and logs. | R001,R612 | Direct public browser observation. | Screenshots/DOM/log summary tied to time/SHA. |
| G04 | Benchmark guardian | G02,G03 | Freeze three distinct roles: byte-exact Pass 63 Stable/no-rebuild rollback, immutable Pass 64 failed-regression evidence/repair comparator, and Pass 62 offline/reconstructible benchmark. Never map Pass 64 to Stable. | R002,R003 | Source/Pages/path/count/digest/workflow/check/receipt reconciliation plus staged Pass 63 restore and role-confusion negative fixtures. | Complete off-repo stable/regression/benchmark evidence packet and machine-readable field contracts; B1 persists them. |
| G05 | Integrator | G04 | Fetch exact successfully released Pass 64 main as B0 and create only the isolated P0 worktree/branch. | R004 | Git preflight. | Absolute path/full ref/upstream/B0/owner/clean/common-Git record. |
| G06 | Release classifier owner | G05 | Freeze exact P0 changed-path allowlist against the current base/head impact classifier. | R007,R009 | Positive and negative classifier fixtures. | Signed process-only path report. |
| B01 | Hardware/budget guardian | G04,P04[DEC-10=FROZEN] | Capture same-machine Pass 63 known-good RTX baseline and separately reproduce/label Pass 64 freezing as regression evidence at the frozen resolutions; freeze absolute and Pass-63-delta renderer/resource/network/disposal/chaos thresholds. | R606,R607,R610 | Repeatable environment/scene/seed/resolution manifests with stable/regression role assertions. | Baseline/regression digests and go/no-go budget manifest. |

Stop condition: any disagreement among main SHA, required checks, production run, Pages SHA, receipt, route bytes, rendered identity, or logs keeps G05 blocked.

## 4. Process-only preparation tasks

| Task | Owner | Dependencies | Outcome | Requirements | Smallest validation | Exit evidence |
|---|---|---|---|---|---|---|
| P01 | Spec owner | G05,G06 | Add repo-local numbered Pass 65 spec mapped to all 99 requirements/15 decisions. | R005 | Acceptance schema lints. | Spec digest and mapping report. |
| P02 | Integrator | G05 | Add forging-team path ownership, waves, handoff contract, central ledger. | R004 | Process-only impact classifier. | Owner/path/worktree table. |
| P03 | Estimation owner | P01,P02 | Add per-task P50/P90 effort, lane, confidence, external wait and rework allowance; compute dependency critical path. | R004,R009 | Referential-integrity and DAG calculation. | Auditable effort/wall-time model. |
| P04 | Decision owner | P01 | Maintain canonical `docs/PASS65_DECISION_RECEIPTS.json` against its schema. P0 historically instantiated 15 `OPEN` receipts; Dave's 2026-07-26 reply freezes all 15. Only the current validated structured receipt and canonical digest satisfy `P04[DEC-x=FROZEN]`; DEC-03 retains supersession lineage. | R005 | Schema, ID/status/field/dependency/digest linter rejects missing/duplicate/OPEN receipts, bad supersession, incomplete slot families and stale care-weight formula. | Validated product-decision registry and digest. |
| P05 | QA owner | P01,G06 | Add classifier-safe policy for table-order `R1..R99` ↔ stable planning `R###` mapping and allowed acceptance evidence translation; do not create an invalid pre-preview `acceptance/pass-65.json`. | R005,R009 | Impact classifier, requirement-order/mapping and evidence-policy lint. | Process-only QA policy. |
| P06 | Release owner | P01,P02,P03,P04,P05,G06 | Open/merge process-only `65-P0` with every intended artifact present. | R007 | Exact changed-path classifier + required checks. | PR/merge exact SHA. |
| P07 | Integrator | P06 | Record exact post-P0 main as B1 and create integration/specialist worktrees from B1 only. | R004,R613 | Git preflight plus canonical branch-name linter. | Full worktree identity/owner/hotspot-lease table. |

## 5. Foundation tasks

| Task | Owner | Dependencies | Outcome | Requirements | Smallest validation | Exit evidence |
|---|---|---|---|---|---|---|
| F00 | Release/benchmark owner | P07,G04,P04[DEC-15=FROZEN] | Persist a schema-v1 byte-exact Pass 63 Stable rollback record, a separate Pass 64 failed-regression record, and the frozen Pass 62 offline/reconstructible policy; generalize verification and implement protected byte-preserving Pass 63 rollback rehearsal. | R002,R003,R007,R612 | Generalized verifier with `--verify-git`, release-topology verifier, negative digest/exclusion/role-swap fixtures and staged Pass 63 smoke. | Runtime-PR commit plus machine-readable stable/regression/benchmark receipt. |
| F13 | Skill/rules owner | P07 | Initialize six repo-local domain skills, validators and responsibility rules, including canonical-catalog projection rules that make future IDs automatically complete or mechanically fail every downstream mirror. | R004,R600,R613 | `quick_validate.py`, repo instruction/path checks and catalog-projection ownership audit. | Valid skill/rule folders, UI metadata and projection graph. |
| F14 | Skill owner + fresh agents | F13 | Forward-test each skill on raw known-good, intentionally incomplete and synthetic future-content mutations. | R613 | Every validator accepts good, rejects incomplete, and rejects stale add-two/rename/retire mirrors without owner prompting. | Forward-test findings and revisions. |
| F15 | Physics/effects inventory owner | P07,B01 | Generate whole-game physics/effects and active WebGPU feature-to-setting-or-rationale inventory. | R111,R300,R606 | Registry/source scan plus unsupported/fixed rationale linter. | Inventory digest and missing-owner failure fixture. |
| F16 | Audio inventory owner | P07 | Generate all-game sound-event inventory with bus/spatial/variant/provenance/cap policy. | R308,R600 | Registry completeness and missing-event fixture. | Audio event inventory digest. |
| F01 | Combat schema | P07,F13 | Add `WeaponDefinition`, families, slots, fire kinds, optics, movement and provenance schema. | R220–R232,R236,R600 | Schema unit/property tests. | Catalog schema commit. |
| F02 | Combat schema | F01 | Adapt existing weapons into canonical catalog without behaviour drift. | R227,R233,R600 | Exact existing-stat snapshot comparison. | Adapter parity report. |
| F03 | Combat schema | F02 | Add exhaustive weapon registry verifier. | R232,R236,R600 | Intentionally incomplete fixture fails. | Coverage report. |
| F04 | Loadout owner | F01,P04[DEC-01=FROZEN] | Add curated-or-custom `LoadoutPresetV2`, frozen enabled-preset/manage layout, sanitized local name and exact curated-ID migration. | R200–R205 | Decision/schema/migration/property/corrupt-storage/fault-injection tests. | Storage migration receipt. |
| F05 | Ordnance schema | F01,P04[DEC-07=FROZEN,DEC-08=FROZEN] | Add one-family/one-count/one-cap frag-smoke-flash inventory, corpse-ammo-pickup replenishment contract, and discriminated projectile/effect schemas with the exact impact-armed crossbow fuse/damage values. | R203,R204,R223,R233–R236,R600 | Strict catalog/parser/cap/kill-negative/corpse-pickup/fuse/delay/replay tests. | Ordnance schema commit. |
| F06 | Support schema | P07,P04[DEC-02–DEC-06=FROZEN,DEC-13=FROZEN] | Add strict per-kind killstreak/support catalogs, exact family-constrained five-slot loadout, catalog-derived future-complete care-pool formula, optional player gunner over always-AI chopper flight, immutable DroneGunProfileId and host/public state schemas. | R500–R512,R600 | Definition/state resolution, gun-profile, slot-family/duplication, add-two-future-streak weight recomputation, gun-control/flight-isolation and privacy schema tests. | Support schema commit. |
| F07 | Interactive-world schema | P07,B01,P04[DEC-09=FROZEN] | Add stable interactive-object, damageable-sheet, shed, door, exact-aperture/chunk/state schemas with frozen maxima. | R400–R413,R600 | Bounds/ID/revision/parser/cap tests. | Interactive schema commit. |
| F08 | Settings owner | P07,B01,P04[DEC-10=FROZEN,DEC-14=FROZEN],F15 | Add bounded versioned graphics/audio/accessibility settings schemas, apply modes and normalization. | R300–R307,R600 | Corrupt/unsupported/capability/property/apply-mode tests. | Settings schema commit. |
| F09 | Protocol owner | F01,F04,F05,F06,F07 | Define protocol v7 identities/messages/bounds and explicit mismatch path. | R203,R204,R234,R235,R500,R601 | Parser and mixed-version tests. | Protocol spec/commit. |
| F10 | Authority owner | F09 | Complete target life ID, health revision, action sequence and round epoch invariants. | R602,R603 | Respawn/reorder/replay races. | Invariant trace. |
| F11 | B1.0 lifecycle/transaction owner | P07,F02,F05,F06,F07,F08 | Before feature work, establish one idempotent lifecycle registry, generation-aware arena prepare/commit/rollback transaction, authoritative collision/raycast parity adapter and behavior-preserving monolith seams; presentation may not mutate authority. | R306,R400,R605,R610,R613 | Delayed/failing arena switches, stale continuations, double-dispose, cached-root ownership, presentation-authority negative fixture and existing comparators. | B1.0 project-map, transaction/lifecycle counters and authority-parity receipt. |
| F12 | Determinism owner | F09 | Provide canonical shared seed/time and injectable presentation capture clock. | R604,R608 | Repeat-run hashes and static random/time scan. | Determinism contract. |

Wave exit: all existing Pass 64 gameplay runs through adapters and frozen comparators remain green before any requested content is enabled.

## 6. Authority-foundation tasks

| Task | Owner | Dependencies | Outcome | Requirements | Smallest validation | Exit evidence |
|---|---|---|---|---|---|---|
| A01 | Combat authority | F09,F10 | Host per-life inventory/action reducer owns equip, mags, reserve, reload, switch, spin-up, grenade counts. | R203,R204,R228,R602,R603 | Pure reducer and forged-intent tests. | State-transition trace. |
| A02 | Combat authority | A01 | Extend shot admission with ammo/reload/switch/spin-up legality. | R220–R232,R510 | Cadence/ammo/forgery matrix. | Host admission receipt. |
| A03 | Combat authority | F10 | Consolidate canonical health/death/score/attribution result path. | R223,R501–R510,R603 | Duplicate/reorder property tests. | Exactly-once invariant report. |
| A04 | Ordnance authority | F05,F09,F10,F11,A03 | Generic host projectile/effect lifecycle with stable IDs, discriminated fuse state and repairable snapshots. | R223,R233–R235,R602,R607 | Detonation/delay/replay/retry/late-join/rematch tests. | Lifecycle trace/hash. |
| A05 | Visibility authority | A04 | Semantic smoke volume and flash result query contracts. | R229,R234,R235,R605 | Smoke/bullet/LOS/angle pure matrix. | Visibility authority report. |
| A06 | Support authority | F06,F09,F10,A03 | Host activation/reward/support-entity reducers and reliable lifecycle/snapshot split. | R500–R511,R602,R603 | Forged reward/pose/hit tests. | Support authority trace. |
| A07 | Collision authority | F07,F10,F11 | Unified revisioned static+dynamic movement/ballistic/melee/LOS/bot-nav query surface, replacing direct presentation/mutable-array authority reads. | R403–R411,R605 | Cross-consumer static parity and presentation-mutation negative fixtures before dynamic state. | Collision adapter parity report. |
| A08 | Network owner | A01,A04,A05,A06,A07 | Bounded replication, strict snapshots, late join/resync and state hashes. | R601,R602,R607 | Delay/loss/dup/reorder simulation. | Host/client hash evidence. |
| A09 | Telemetry owner | A01,A04,A06,A07 | Bounded diagnostics for inventory/effects/support/sheds without sensitive data. | R606,R607,R610 | Schema/retention/size tests. | Evidence-ready telemetry. |

Wave exit: no client can author shared inventory, effect, support, collision, health, death, score, or reward state.

## 7. Sensory, settings, and audio tasks

| Task | Owner | Dependencies | Outcome | Requirements | Smallest validation | Exit evidence |
|---|---|---|---|---|---|---|
| S01 | Feedback owner | F11,F12 | Pure concurrent directional-damage state + presenter. | R101 | Eight directions, camera yaw, four-source merge/decay tests. | Deterministic captures. |
| S02 | Feedback owner | F08,F11,F12,P04[DEC-14=FROZEN] | Low-health hysteresis, TSL/DOM presentation, breathing/heartbeat lifecycle under frozen flash limits. | R102,R103,R305 | Health transition, final-frame flash analysis and reduced-sensory tests. | Visual/audio sequence. |
| S03 | Audio owner | F08,F11,F16 | Extract semantic mixer buses, global/per-bus caps and persisted category controls. | R303,R306–R308 | Gain/mute/storage/autoplay/cap tests. | Mixer telemetry. |
| S04 | Audio owner | S03,A08 | Bounded HRTF spatial voice pool, listener/source API, occlusion. | R104,R307 | Pan/rolloff/voice-cap/disposal tests. | Spatial voice receipt. |
| S05 | Audio owner | S04,F09 | Local/remote/bot admitted grounded-velocity/distance/surface footstep emitters. | R104 | Grounded/airborne/jump/landing/teleport/stale/reconcile and two-peer scenarios. | Footstep telemetry/capture. |
| S06 | Arena audio owner | S03,S04,F16,P04[DEC-12=FROZEN] | Per-arena ambience definitions/zones and original/licensed stems. | R304,R307,R308,R008 | Arena identity, provenance and arena-switch disposal tests. | Audio manifest + captures. |
| S07 | Settings UI owner | F08,F11 | Graphics Performance/High/Max/Custom and effective-value UI. | R300–R302,R306 | Capability clamp/live-vs-reload/storage tests. | Responsive surface captures. |
| S08 | Settings UI owner | S03,F08,F11 | Audio and accessibility menu surfaces/focus/keyboard behaviour. | R303,R305,R609 | Surface registry and viewport/accessibility tests. | UI evidence corpus. |
| S09 | WebGPU owner | S01,S02,S07,F15,B01 | TSL HDR feedback/effect graph and curated feature-setting application with full renderer-truth telemetry. | R100–R103,R111,R300–R302,R605,R606 | Backend/adapter/pipeline/HDR-sample/no-GLSL/depth-bloom/profile/disposal tests. | Renderer telemetry/captures. |

## 8. Arsenal and viewmodel tasks

Mechanics and presentation are separate commits but one weapon is not complete until both are integrated.

| Task | Owner | Dependencies | Outcome | Requirements | Smallest validation | Exit evidence |
|---|---|---|---|---|---|---|
| V01 | Rig specialist | P07,F12,F14,P04[DEC-11=FROZEN] | Dedicated first-person skeleton, complete weapon/bolt/pump/knife/grenade sockets, LOD/budget/provenance contract. | R105,R108,R008,R613 | Asset validator + neutral-pose captures. | Rig asset digest/provenance. |
| V02 | Animation specialist | V01,F12 | Capability-conditioned action graph, grenade/dry-fire actions, forbidden transitions, additive idle/inertia/stride/landing and grip IK. | R106,R107,R108 | Deterministic required-action and forbidden-transition tests. | Base action corpus. |
| V03 | Weapon forge | F02,V01,V02 | Existing weapons migrated to distinct definitions/assets without release fallback. | R108,R109,R236 | Every existing ID action corpus + comparator. | Migration evidence. |
| W01 | Arsenal mechanic | A01,A02,F03 | Balanced rifle definition/authority/balance vertical slice. | R225,R232,R236 | Full mechanics/property matrix. | Complete rifle registry report. |
| W02 | Weapon forge | W01,V02,V03 | Balanced rifle original model/material/clips/audio/effects. | R108,R109,R225 | Asset/action/audio validators and corpus. | End-to-end vertical slice. |
| W03 | Arsenal mechanic/forge | W02 interface freeze | Uzi-role micro-SMG end to end. | R220,R232,R236 | Role/TTK + action corpus. | Integrated weapon evidence. |
| W04 | Arsenal mechanic/forge | W02 interface freeze | MP5-role compact SMG end to end. | R221,R232,R236 | Comparative SMG matrix + corpus. | Integrated weapon evidence. |
| W05 | Arsenal mechanic/forge | W02 interface freeze | AK-role rifle end to end. | R226,R232,R236 | Comparative AR matrix + corpus. | Integrated weapon evidence. |
| W06 | Arsenal mechanic/forge | W02 interface freeze | Loud always-on flashlight pistol end to end. | R222,R232,R236 | Light occlusion, audio peak, mechanics + corpus. | Integrated sidearm evidence. |
| W07 | Arsenal mechanic/forge | A04,W02 interface freeze | Explosive crossbow end to end. | R223,R232,R236 | Projectile/exactly-once + action/audio corpus. | Integrated sidearm evidence. |
| W08 | Arsenal mechanic | F04,F03,A01 | Machine pistol selectable and role verified. | R224,R232 | Loadout/lifecycle/recoil/TTK tests. | Loadout evidence. |
| W09 | Arsenal mechanic | F04,F03,A01 | Existing LMG selectable without stat drift. | R227,R232 | Comparator + loadout lifecycle. | LMG evidence. |
| W10 | Arsenal mechanic/forge | A01,A02,W02 interface freeze | Minigun with frozen exact spin-up/magazine, 0.80 movement and bounded heat/presentation. | R228,R232,R236 | Catalog/forgery/movement/heat/resource + corpus. | Integrated minigun evidence. |
| W11 | Arsenal mechanic/forge | A05,W02 interface freeze | DMR 2.5× smoke-only thermal end to end. | R229,R232,R236 | Smoke/wall optic tests + corpus. | Integrated DMR evidence. |
| W12 | Arsenal mechanic/forge | W02 interface freeze | Slug shotgun end to end. | R230,R232,R236 | One-projectile/falloff/role + corpus. | Integrated slug evidence. |
| W13 | Arsenal mechanic/forge | W12 | Rebalance conventional scatter shotgun coherently. | R231,R232 | Pellet total/spread/range/TTK regression. | Before/after balance report. |
| W14 | Knife forge | V01,V02 | Authored knife/passive/attack/material/lighting end to end. | R106,R107,R108 | Melee comparator + action corpus. | Knife evidence. |
| W15 | Loadout UI owner | F04,W03–W13,P04[DEC-01=FROZEN,DEC-07=FROZEN] | Curated plus frozen custom/manage layout; choose primary/secondary/exactly one grenade family and display count/cap one. | R200–R205 | Storage/UI/deploy/spend/kill-negative/corpse-pickup/respawn/rematch/two-peer tests. | Complete loadout evidence. |
| W16 | Balance/red team | W03–W13,S07 | Freeze exact adjectives into role/TTK/falloff/recoil/wallbang/modifier/spin-up/magazine/shot-count bands. | R220–R232,R501 | Property suite and dominance/calibration report. | Frozen initial balance table. |

## 9. Ordnance and optic tasks

| Task | Owner | Dependencies | Outcome | Requirements | Smallest validation | Exit evidence |
|---|---|---|---|---|---|---|
| O01 | Ordnance owner | A04,P04[DEC-07=FROZEN] | Migrate frag through typed one-count/cap-one lifecycle with comparator parity and shared corpse-ammo-pickup replenishment. | R203,R204,R233 | Frag unit/network/E2E, kill-negative, pickup-exactly-once and cap tests. | Parity/replenishment receipt. |
| O02 | Ordnance owner | A04,A05,P04[DEC-07=FROZEN] | Smoke grenade authority, both-team semantic volume, particles, late join/disposal and cap-one inventory. | R234 | Bullet pass, player/AI block, lifecycle and count tests. | Smoke evidence. |
| O03 | Ordnance owner | A04,A05,F08,P04[DEC-07=FROZEN] | Flash host result, exact 0.5 friendly multiplier/full self calculation, cap-one inventory and accessible presentation. | R235,R305 | LOS/angle/distance/team/self matrix + two-peer. | Flash evidence. |
| O04 | Optics owner | O02,W11 | DMR thermal integration and hard wall depth occlusion. | R229,R234 | Normal/thermal/smoke/wall pixel+geometry cases. | Optic evidence. |
| O05 | Projectile owner | A04,W07,P04[DEC-08=FROZEN] | Sticky bolt world/current-life attachment, impact-armed 1.25s fuse, 45 direct plus 60-to-15/3.5m blast, accelerating beep and exactly-once result. | R223 | Boundary/damage plus retry/reconnect/respawn/rematch chaos. | Bolt evidence. |
| O06 | Performance owner | O01–O05 | Pool/prewarm smoke/flash/bolt/explosion/audio/light paths. | R307,R610 | No construction/long task on effect frames; disposal. | Stress receipt. |

## 10. Destructible-world tasks

| Task | Owner | Dependencies | Outcome | Requirements | Smallest validation | Exit evidence |
|---|---|---|---|---|---|---|
| DW01 | Collision specialist | A07 | Dynamic door/sheet/debris revision reaches all authority consumers. | R400,R411,R605 | Static parity, then fixed-angle consumer parity. | Cross-consumer report. |
| DW02 | Shed authority | F07,A08,DW01 | Host shed state/revisions/snapshots/hash/reset, including reconstructible blocked-door trajectory. | R400,R403,R404,R410,R411 | Parser/reorder/late-join/rematch tests. | State trace. |
| DW03 | Door specialist | DW02 | One-second F door with range/LOS/cooldown/sequence, reversal/resume and swept obstruction. | R403,R404 | Five-angle + player/synthetic-obstacle/bullet interruption tests; real debris deferred to DW09. | Door evidence. |
| DW04 | Ballistics specialist | DW02,DW01 | Surface-local bounded canonical aperture union consumed identically by rendering/trace. | R405,R406 | Visible-hole/ballistic/cap-transition parity property tests. | Aperture evidence. |
| DW05 | Fracture specialist | DW02,DW01 | Wall/roof/door/detached-sheet dents, marks, stress zones and pre-authored detach thresholds. | R407,R408 | Deterministic threshold/duplicate/detached-mark tests. | Damage-state evidence. |
| DW06 | Rapier specialist | DW02,DW05 | Host major chunks, always-valid shot wake/impulse, non-flat contact nudge and flat/sleep hysteresis. | R409,R412 | Body/CCD/sleep/flat-shot/nudge/forgery/cap tests. | Physics evidence. |
| DW07 | TSL specialist | DW04,DW05 | Hole mask, rim, scorch, dent/deform color/shadow/depth parity. | R402,R405,R407 | WebGPU material/depth/shadow spike and captures. | TSL evidence. |
| DW08 | Asset specialist | F07,DW05,B01,P04[DEC-11=FROZEN] | Original cube/roof/door/frame/sheets/chunks and exact LOD/texture/material/provenance budgets. | R402,R008 | Asset validator, byte-budget report and review cameras. | Asset digest/provenance. |
| DW09 | Vertical-slice owner | DW03–DW08,B01 | One complete greybox→authored shed passes authority/visual/network/budget stop gate, including real-debris door obstruction. | R400,R402–R413 | Full one-shed suite and same-machine target sample. | Signed wave-exit receipt. |
| DW10 | Arena owner | DW09,P04[DEC-09=FROZEN] | Apply the frozen outdoor classification and place ≥2 per classified map. | R401 | Registry count, spawn/traversal/LOS/nav tests. | Map placement evidence. |
| DW11 | Performance/red team | DW10,B01 | Hole saturation, max fracture/debris, packet chaos, late join, rematch, 10 switches. | R410–R413,R606,R607,R610 | Manifest-driven RTX/network/disposal stress. | Multi-shed receipt. |

## 11. Killstreak tasks

| Task | Owner | Dependencies | Outcome | Requirements | Smallest validation | Exit evidence |
|---|---|---|---|---|---|---|
| K01 | Support owner | A06,P04[DEC-03=FROZEN,DEC-13=FROZEN] | Implement exact slot families, distinct slots 3/4, mutually exclusive Nuke/Drone Swarm, persistence/match freeze and keys 3–7. | R500,R512 | Catalog/UI/lifecycle/decision/property tests including illegal free-pick and duplicate fixtures. | Selection evidence. |
| K02 | Modifier owner | A01,A03,K01,P04[DEC-02=FROZEN] | Adrenaline 15s ×1.10 damage/move ×0.90 reload, named ordering, non-stack and refresh-only reactivation. | R501 | Reducer/shotgun/minigun/DHV/Overdrive/retrigger matrix. | Modifier evidence. |
| K03 | Package owner | A06,DW01,P04[DEC-05=FROZEN] | Plane/parachute/crate/F admission/expiry/single consume within exact descent envelope. | R502,R510 | Physics/envelope/loot/retry/reconnect tests. | Package lifecycle evidence. |
| K04 | RNG/Nuke owner | F12,K03,P04[DEC-03=FROZEN,DEC-13=FROZEN] | Derive the exact integer pool from the unique catalog on every change: all eligible nonretired nonrecursive IDs once, highest-band Scout, Care Package zero, selectable Nuke exactly 1%, hidden roll and no second list. | R503,R512,R604 | Add-two-future-streak/rename/retire/cost/weight mutations, set equality, formula recomputation, forced-every-reward, privacy, repeat-seed and forced-Nuke tests. | Catalog/pool-set equality, roll/weight/completeness and Nuke report. |
| K05 | Bomber owner | A06,DW01,P04[DEC-13=FROZEN] | Use only the frozen activation anchor; host-seeded RNG selects a random valid ingress and exactly 20 pooled zigzag bombs stay inside the arena-relative strip bounds. | R505,R511 | Seeded ingress/path/schedule/count/bounds/occlusion tests. | Bomber evidence. |
| K06 | Flight-nav owner | A07 | Arena portals/ceilings/no-fly/recovery for support entities. | R509 | Deterministic per-arena nav scenarios. | Nav map/evidence. |
| K07 | Chopper owner | A06,K06,A05,P04[DEC-04=FROZEN] | Always-host-AI 30s flight; AI gun default; owner `F` gun-only enter/exit throughout active time; AI resume, vulnerable body, LOS/cover and calibrated survival. | R504,R510,R511 | Flight-isolation, dual-controller rejection, F timing, body death/exit, target/DPS/cover/smoke matrix. | Chopper control/pressure evidence. |
| K08 | Drone base owner | A06,K06,A03,P04[DEC-13=FROZEN] | Targetable 50-HP drone entity, immutable shared gun profile, hitbox/shot bands, pose history, ammo/reload/damage/destruction and per-mode reserve policy. | R506,R507,R510 | Byte-identical gun-profile, unlimited-until-expiry swarm reload, finite piloted ammo, moving-target/forgery/lifecycle tests. | Drone-base evidence. |
| K09 | Swarm owner | K08,A05,P04[DEC-13=FROZEN] | Exactly 12, 20-round unlimited reload loops, ≤60s, indoor/outdoor acquisition of eligible opposing living players and bots, and frozen approximately-five-second exposure/escape survival pressure. | R506,R511 | Count/HP/ammo/lifetime/nav plus player/bot/team/life target matrix and fixed-start/cover/seed/sample survival-percentile stress. | Swarm eligibility and pressure evidence. |
| K10 | Possession owner | K08,F08,P04[DEC-06=FROZEN] | Piloted input, Space/crouch vertical, 30s fuel, 2×20, immobile fully vulnerable body and exactly-once clean exits. | R507,R510 | Input/OOB/body death/drone death/fuel/ammo/disconnect/round-end matrix. | Possession evidence. |
| K11 | Sensor owner | K10,A05 | Living-hostile-only through-wall drone sensor isolated from DMR/ballistics. | R508 | Capability isolation/team/death/wall-shot tests. | Sensor captures. |
| K13 | Chopper motion owner | K06,K07,F12 | Add host-seeded band-limited pitch/yaw/bank/direction/altitude variation around the tactical chopper route while preserving collision, no-fly, targeting and LOS authority. | R115,R504,R509,R510 | Multi-seed fixed-step bounds, two-peer pose/hash convergence, nav/targeting comparator and capture. | Chopper motion trace and review reel. |
| K12 | Support perf/red team | K03–K11,K13,B01 | Combined package/chopper/bomber/swarm/pilot resource and manifest-driven chaos stress. | R510–R512,R606,R607,R610 | RTX/network/disposal matrix against frozen thresholds. | Support stress receipt. |

## 12. Arena, menu, and structure tasks

| Task | Owner | Dependencies | Outcome | Requirements | Smallest validation | Exit evidence |
|---|---|---|---|---|---|---|
| M01 | Surface owner | W15,S07,S08,K01 | Complete surface inventory for loadout/settings/streak menus and all states. | R201–R205,R300–R305,R500,R609 | Registry coverage and responsive viewport matrix. | Surface report/captures. |
| M02 | Arena forge | F11 | Audit/prune bad structures and semantic mismatches per arena. | R110,R605 | Deterministic cameras, movement/projectile semantics. | Per-arena audit. |
| M03 | Arena forge | S06,DW10,K06 | Integrate audio zones, sheds and flight nav without spawn/sightline regressions. | R304,R401,R509 | Arena traversal/spawn/LOS/nav matrix. | Integration map report. |
| M04 | Renderer owner | S09,DW09,O06,V03,W02–W14,F15,F16 | Unify all inventoried effects/materials in WebGPU TSL HDR path and frozen budgets. | R100,R108,R109,R111,R308,R402,R605 | Renderer-truth/no-GLSL/depth-bloom/fail-closed/device/disposal tests. | Renderer inventory/captures. |
| M05 | Preview media owner | F11,F12,M02,M04 | Refine every helicopter map's offline spline with smooth seeded micro-variation, forge the sleek cockpit/canopy, author the Gun Range cat POV's comfortable joyful moment, then render/compress one distinct WebM+MP4+poster set per arena. Runtime menu selection swaps media only and defers arena construction/compile/WebGPU submission until explicit deploy. | R112–R114,R307,R608–R610 | Offline recipe/seed/source/media digests, trajectory/loop/occlusion/reduced-motion checks, codec/fallback/decode budgets, rapid-switch races and zero pre-deploy gameplay-render telemetry. | Four media sets, provenance receipt, review reel and menu-runtime telemetry. |

## 13. QA, acceptance, and release tasks

| Task | Owner | Dependencies | Outcome | Requirements | Smallest validation | Exit evidence |
|---|---|---|---|---|---|---|
| RL01 | Release-shell owner | F00,M01,M02,M03,M04,M05,P04[DEC-15=FROZEN] | Stage Pass 65 Live with exact display name `The Big One`, byte-exact Pass 63 Stable under its existing verified identity, Pass 64 regression-only, the frozen Pass 62 offline/reconstructible policy, chooser/changelog/project-map, aliases and workflow labels before S0. | R002,R003,R007,R010,R611,R612 | Topology/name/alias/impact/tree tests, role-swap rejection, publication-denial and staged browser smoke. | Release-shell tree digest and candidate receipt. |
| Q01 | Integrator | Each accepted commit | Run the owner-feedback skill before implementation and after every accepted commit; reject skipped/duplicate/unowned/unmapped feedback IDs, then perform scoped validation and ledger/evidence-state update. | R004,R005,R009,R613 | `qa:pass65:owner-feedback`, negative self-test, impacted unit/browser group and exact changed-row audit. | Commit-level feedback/evidence receipt. |
| PV01 | Preview owner | RL01,Q01,M04,M05,W16,O06,DW11,K12,S09 | Freeze the final integrated source as immutable S0, record runtime/release-shell tree digests, push that exact candidate and obtain/digest `pr-preview-<pr>-<S0>`; any later runtime/release-shell edit creates a new S0. | R006,R611 | Clean SHA/build/tree/artifact identity, ancestry and deliberate mutation negative fixture. | S0 preview receipt, artifact digest and frozen-path declaration. |
| Q02 | Combat QA | PV01,W16,O01–O05,K02 | Rerun the full balance/modifier/wallbang/role property suite at exact S0. | R220–R235,R501 | Seeded repeat and boundaries tied to S0. | S0 balance report. |
| Q03 | Network QA | PV01,A08,DW11,K12,B01 | Rerun solo/two-peer/host+guest+bot authority forgery at exact S0 under the fixed-seed impairment manifest. | R601–R607,R510 | Exact profiles/seeds/events/repair deadlines/final hashes. | S0 state hashes/traces. |
| Q04 | Visual QA | PV01,S01–S09,V03,W02–W14,O02–O04,DW10,K03–K13,M04,M05 | Generate the indexed deterministic capability-applicable action/effect/map/profile corpus at exact S0, including every prerecorded helicopter/cockpit/cat preview, shared support target X, caller carpet corridor, target-bound support damage and local/remote through-geometry Railgun bolt. | R100–R115,R608,R609 | S0 capture inventory completeness, offline recipe/media-digest/loop checks, two-peer coordinate/view policy and forbidden-state tests. | S0 contact sheets/videos. |
| Q05 | Accessibility QA | PV01,S02,S08,M01,M05,O03,P04[DEC-14=FROZEN] | Rerun reduced motion/flash/sensory, preview-motion fallback, numeric final-frame flash limits, focus/keyboard/readability/audio controls at exact S0. | R114,R305,R609 | Automated standard plus viewport/state matrix tied to S0. | S0 accessibility report. |
| Q06 | RTX hardware QA | PV01,B01,S04,S05,S06,O06,DW11,K12,M04,M05,RL01 | Same-machine RTX 5080 all-arena + combined stress at exact S0 against frozen absolute/delta thresholds, with foreground native-WebGPU Atomic↔Terminal frame-pacing comparison across loading, movement, combat and supports. | R112–R115,R606,R607,R610 | OS/browser/backend/adapter/pipeline proof; CPU/presentation/queue p50/p95/p99/max, >20/33/50/100ms counts, long tasks and compile/decode/upload event correlation over repeated samples. | Immutable S0 local hardware receipt/digest and Atomic-vs-Terminal trace. |
| Q07 | Disposal QA | PV01,F11,S05,S06,S07,S09,O06,DW11,K12,M04,M05 | At exact S0 run `F-R610-01`: ten delayed A→B→C arena and chooser/latest/normal/room/stable/back same-tab circuits, rapid preview-media switches, pagehide/pageshow, match/rematch and settings changes; capture full Three.js/GPU errors, decoder state and every lifecycle counter. | R307,R610 | Zero pre-deploy arena/render work, stale-media/generation mutation/errors, exactly-once teardown/restoration ownership and numeric settle tolerances. | S0 disposal/lifecycle/media receipt. |
| Q08 | Provenance QA | PV01,V03,W02–W14,DW08,S06,F16,K03–K11,O06 | At exact S0 verify all model/texture/audio/music/generated sources are licensed and digests correct. | R008,R108,R109,R304,R308,R402 | Manifest/digest/licence audit tied to S0. | S0 provenance report. |
| Q09 | Benchmark QA | PV01,F00,RL01,P04[DEC-15=FROZEN] | At exact S0 verify Pass 62 offline/reconstructible policy, byte-exact Pass 63 Stable and immutable Pass 64 regression record; generalized verifier plus protected no-rebuild Pass 63 rollback staging must succeed. | R002,R003,R605 | Record-field/digest/exclusion/role-swap negative fixtures, triple-role verifier and staged Pass 63 rollback smoke. | S0 benchmark/stable/regression receipt. |
| Q10 | Acceptance owner | PV01,Q02–Q09 | Create manifest-only descendant `S0M`: map matrix table order to sequential `R1..R99`, preserve each stable `R###` in `planningRequirementId` and summary, translate evidence to policy-allowed kinds, set schema-required `status="accepted"`, bind every pre-HITL mechanical/visual/independent-review evidence field to S0 without depending on Dave's later verdict, and omit only `humanAcceptance`. | R005,R611 | Generic gate plus Pass 65 mapping/evidence linter; exactly one error, missing Dave approval. | S0M pre-approval manifest/evidence digest and S0 tree-parity receipt. |
| Q11 | Hosted CI owner | PV01,Q10 | Four mechanical required jobs and all Pass 65 hosted groups green on S0M; hosted jobs validate local RTX receipt schema/SHA/digest but do not claim the hardware run. | R009,R606,R611 | Hosted exact-head matrix; `requirements-acceptance` is the sole red check and its sole error is missing `humanAcceptance`. | Workflow run IDs and sole-red reason. |
| H01 | Integrator + Dave | PV01,Q11,Q06 | Immutable S0 preview plus process-only S0M manifest handoff, concise owner route and precomputed evidence review. | R006,R611 | Preview/source/runtime/release-shell/evidence/manifest digests and S0→S0M parity agree. | HITL packet. |
| H02 | Dave | H01 | Explicit approve/reject exact preview SHA. | R006 | User decision tied to SHA. | Approval timestamp/SHA. |
| R01 | Integrator | H02 approved | Create approval-only S1 by adding the timestamped `humanAcceptance` object to the S0M manifest and prove S0 ancestry plus S0/S0M/S1 runtime/release-shell tree parity. | R006,R611 | Path-impact, generic acceptance, mapping, ancestry and tree-digest comparison. | S1 approval commit and parity receipt. |
| R02 | Integrator | R01 | All five checks on S1; serial merge to S2; all five checks again on exact main. | R007,R611 | Five checks at both lineages. | S1/S2 merge/check IDs. |
| R03 | Release owner + Dave | R02 | Present exact publish-ready S2/check/topology packet, obtain Dave's separate explicit publish confirmation, then and only then dispatch protected `PASS 65` production at exact main. HITL approval alone is insufficient. | R007,R612 | Confirmation timestamp/text bound to S2 plus workflow input/ref verification and no-confirmation denial fixture. | Publish-confirmation receipt and production run ID. |
| R04 | Release/browser verifier | R03 | S0→S0M→S1→S2 lineage, controlled build differences or exact-artifact promotion, Pages/receipt/chooser/live `The Big One`/byte-exact Pass 63 Stable/Pass 64 regression-only/Pass 62 policy/aliases/logs agree. | R002,R003,R007,R010,R611,R612 | Cache-busted public/name/tree/role/lineage checks. | Final production and release-lineage receipt. |

## 14. Critical path

The dominant dependency chain is:

```text
Pass 64 publication proof plus owner freeze finding
→ Pass 63 stable + Pass 64 regression freeze/process PR
→ catalogs + protocol v7 + life/revision invariants
→ inventory/projectile/support/collision authority
→ vertical slices
→ authored assets + bulk content + flight nav
→ shed rollout + support suite
→ integration/network/visual/RTX/disposal red team
→ immutable preview
→ Dave HITL
→ protected promotion
```

Likely schedule drivers:

- First-person rig and unique weapon art/action corpus.
- Unified dynamic collision authority and shed vertical slice.
- Host support entities, indoor/outdoor flight navigation and pose-history damage.
- Cross-system performance under simultaneous smoke, drones, aircraft, bombs, destruction, lights and spatial audio.

Do not shorten the critical path by skipping authority, provenance, accessibility, disposal, exact-SHA evidence, or HITL. Shorten it by freezing interfaces early, parallelizing non-overlapping asset/content lanes, pooling/prewarming from the start, and rejecting weak vertical slices before bulk rollout.
