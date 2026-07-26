# Pass 65 HITL Round 1 Correction Ledger

Status: **BLOCKING CORRECTION WAVE — NOT APPROVED, NOT PUBLISHABLE**

This ledger is the authoritative translation of Dave's first local Pass 65 review and the immediately following corrections. It supplements the 99-row frozen planning matrix without renumbering that release contract. Every item below must map back to one or more existing planning requirements before a replacement `S0` preview is offered.

## 1. Evidence and release posture

- Failed-HITL source baseline: `ec8a55fa83f194f34abe6708cab727e45057285e`.
- Preserve that exact preview/build as regression evidence until its replacement has complete evidence.
- Pass 63 remains the byte-exact Stable channel and rollback target.
- Pass 64 remains failed-regression evidence; it must not become Stable.
- Pass 65's eventual Live label is `The Big One`.
- No local success, branch push, draft PR, owner HITL approval, or moving preview authorizes publication. Publication requires a separate explicit confirmation after exact-SHA gates.

## 2. Severity and closure vocabulary

- `P0`: crash, unplayable freeze, wrong lifecycle, corrupt persistence, unsafe release lineage, or invalid renderer/backend.
- `P1`: materially broken combat/readability/control/asset behavior.
- `P2`: polish that still blocks the requested owner-quality bar.
- `OPEN`: requirement captured but no verified fix.
- `IMPLEMENTED`: code/assets exist at an exact SHA; not proof of correctness.
- `VERIFIED`: falsifier exercised by digest-bound evidence on the exact candidate.
- `HITL`: owner taste/feel judgement remains after mechanical evidence is green.

## 3. Blocking correction ledger

| ID | Pri | Observation / frozen correction | Owner lane | Mechanical falsifier and required evidence | Maps / modes | State |
|---|---:|---|---|---|---|---|
| HF-001 | P0 | Atomic Acres crashes as the match begins. | World/runtime + integrator | Deterministic join/start loop on native WebGPU, console and uncaptured-GPU-error capture, first-fault stack, 20 consecutive starts, two-peer start and teardown. Any crash/device loss/fatal promise rejects. | Atomic Acres | OPEN |
| HF-002 | P0 | Loading stalls/jutters for roughly 10–15 seconds before arena load. | Loading/performance | Cold/warm transition trace; main-thread long tasks, shader/pipeline compilation, asset decode/upload, first-frame and input-ready timing. No loading-screen live render may compete with critical arena work. | All transitions | OPEN |
| HF-003 | P0 | Map/menu switching freezes or feels clunky and resources may survive transitions. | Lifecycle/performance | Ten delayed A→B→C/menu/back circuits with generation ownership, disposal counters, frame-time trace and zero stale mutation/duplicate owner/GPU error. | All | OPEN |
| HF-004 | P1 | A compressed high-quality loading video or static fallback is preferred on constrained hardware if live rendering causes stalls. | Loading/UI | Capability/profile decision is explicit; media is predecoded/bounded and never delays gameplay; static poster/reduced-motion fallback works. A missing invented asset is not accepted. | Loading | OPEN |
| HF-005 | P1 | Deploy/field-kit/streak list is squashed at top-left and overlaps the map title. | HUD | Screenshot matrix at 1280×720, 1600×900, 1920×1080, 2560×1440, ultrawide, narrow and high-DPI; automated bounding-box collision/overflow scan. | Menu/HUD | OPEN |
| HF-006 | P1 | HUD typography is tiny, white-box heavy and regressed rather than a modern dynamic FPS HUD. | HUD research/design | Tokenized hierarchy, minimum text sizes, contrast/readability and combat-noise captures; independent visual QA and owner HITL. Preserve every gameplay/diagnostic surface. | All HUD | OPEN |
| HF-007 | P1 | Countdown needs stronger animation and a distinctive bounded countdown sound. | HUD/audio | Deterministic 3-2-1 sequence, focus/rejoin/restart cleanup, mixer bus and peak/voice-cap test; reduced-motion alternative. | Match start | OPEN |
| HF-008 | P1 | Main menu helicopter and killstreak chopper need visible spinning main/tail rotors. | Vehicle presentation | Exterior, cockpit and first-person deterministic captures; rotor blur/rate scales correctly and disposes. No static rotor or aliasing explosion. | Menu + Chopper Gunner | OPEN |
| HF-009 | P1 | Helicopter cockpit/HUD/glass must be authored, three-dimensional, sleek, with restrained green/blue neon instruments. | Vehicle asset/HUD | Source/licence digest, LOD/material/sockets validator, glass depth/occlusion and day/night captures. Reject flat overlay or hollow primitive shell. | Menu + Chopper Gunner | OPEN |
| HF-010 | P2 | Helicopter needs a quiet low rotor/engine bed. | Audio | Spatial/mixer profile, peak and concurrency cap, start/stop/transition leak tests. | Menu + Chopper Gunner | OPEN |
| HF-011 | P2 | Cat POV is enjoyable but ears/paws need clearer authored art and silhouette. | Character/preview | Asset/provenance/skin/material validation, close/medium capture and full loop with no clipping; reduced-motion pose. | Gun Range preview | OPEN |
| HF-012 | P1 | Gun Range is much too dark and static. | Lighting | Deterministic exposure/luminance/contrast captures, physical light declarations and occlusion tests. Bright neon ceiling/floor/side practicals must not leak through walls or destroy target readability. | Gun Range | OPEN |
| HF-013 | P1 | The requested moving targets were misunderstood; create genuinely new illuminated targets moving left/right around 150 yards or between the blue/yellow lanes. | Range gameplay/world | New catalog IDs and separate geometry, host-authoritative bounded lateral track, target-mounted practical, collision/shot registration, reset and two-peer convergence tests. Lighting existing static targets fails. | Gun Range | OPEN |
| HF-014 | P1 | All maps except Gun Range expose every selectable killstreak through ordinary earning/activation. | Killstreak/runtime | Arena capability set equality derived from the canonical catalog; synthetic new-streak mutation; legitimate earning/activation matrix. Gun Range explicitly denies normal support. | All arenas | OPEN |
| HF-015 | P1 | Care Package and Carpet Bomber require a large aircraft flyover; Chopper Gunner requires its visible aircraft. | Support presentation | Entity/presentation mapping, ingress/egress, audio, shadow/LOD/budget and teardown captures. Effect without vehicle fails. | All support-enabled maps | OPEN |
| HF-016 | P0 | Earned unconsumed killstreak rewards survive any number of deaths until consumed or match epoch end; per-life progress still resets. | Support authority | Unit/property/two-peer death×N, reconnect, duplicate message, consume exactly once and rematch reset tests. | All support-enabled maps | IMPLEMENTED |
| HF-017 | P1 | Piloted Drone is first-person and current inverted-feeling controls are corrected. | Possession/control | Input sign matrix for mouse/gamepad, first-person camera, wall/restore/death/disconnect/fuel cases and two-peer authority. | All support-enabled maps | OPEN |
| HF-018 | P1 | Minigun cannot critical-hit and its damage is reduced exactly 25% from the failed-HITL baseline. | Arsenal/balance | Baseline digest, damage/headshot matrix, modifier/penetration/TTK tests and bot/remote parity. | Combat | OPEN |
| HF-019 | P1 | Flashbang detonates on first valid impact with no beeping delay. | Ordnance authority/audio | Collision matrix, exactly-once impact detonation, no countdown voice/event and network replay/reorder tests. | Combat | OPEN |
| HF-020 | P1 | Flashbang produces an intense HUD-preserving whiteout and deafening-feeling bounded transient, then gradually recovers. | Feedback/audio/accessibility | HUD mask exclusion, envelope captures/audio peak, synchronized remaining-duration behavior and DEC-14 sliding-window safety analyzer. Reduced sensory always wins. | Combat | OPEN |
| HF-021 | P1 | Arms are opaque, correctly skinned and materially improved; no transparent regression. | Character rig/asset | Blender/licensed source, skeleton/skin-weight/tangent/PBR validator, neutral/action captures and representative-hardware material check. | First person | OPEN |
| HF-022 | P0 | Standard gun view never displays a floating knife unless the knife action/state requires it. | Viewmodel state | Exhaustive equip/switch/ADS/reload/grenade/melee transition test plus captures for every weapon. | First person | OPEN |
| HF-023 | P1 | ADS must be snappy, aligned and weapon-appropriate across the complete arsenal. | Viewmodel/arsenal | Per-weapon sight-axis/socket tolerances, in/out duration bands, clipping/retreat tests and owner feel review. | First person | OPEN |
| HF-024 | P1 | Every weapon has materially distinct cadence, damage, recoil, falloff, penetration, handling and sound; Uzi cannot feel like a renamed generic SMG. | Arsenal/audio | Pairwise role-distance matrix, catalog uniqueness validator, TTK/recoil/falloff/penetration/audio-profile corpus and dominance report. | Combat | OPEN |
| HF-025 | P1 | Crossbow is fully redesigned as a recognisable crossbow with compact 1.5× optic; bolt remains sticky on valid impact. | Weapon forge/projectile | Authored source/PBR/LOD/action/provenance, sight-axis and 1.5× test, world/player stick and exactly-once fuse tests. Reject pistol-plus-addon silhouette. | Combat | OPEN |
| HF-026 | P1 | Weapon/operator hero models are properly authored in Blender or ingested from a licence-vetted source, with high-quality PBR maps and required animation. | Asset forge/governance | `.blend`/source or source package digest, licence, UV/tangent/normal/ORM/albedo/emissive checks, skeleton/sockets, first/world/drop LODs, animation corpus, budgets and review cameras. Generic procedural fallback fails release. | All characters/weapons | OPEN |
| HF-027 | P1 | Main settings surface exposes only Quality (default), Performance and Custom. Advanced Graphics is collapsed by default; any advanced edit selects Custom. | Settings/HUD | Schema migration and served UI state tests, keyboard/focus behavior and reload persistence. Legacy High/Max storage migrates without loss. | Options | OPEN |
| HF-028 | P1 | Target FPS is a slider beyond 144, with a truthful adaptive target/unlimited-cap distinction. | Settings/frame pacing | Finite bounded normalization, >144 cases, display-aware labels, scheduler/adaptive behavior and frame-time telemetry. Never label an adaptive target as a hard cap. | Options/runtime | OPEN |
| HF-029 | P1 | Advanced WebGPU graphics exposes current cataloged controls and automatically surfaces or fails on future renderer features. | Renderer/settings governance | Canonical feature-inventory set equality, synthetic feature add/rename/retire mutation, apply-mode and profile-authority tests. | Options/WebGPU | OPEN |
| HF-030 | P1 | Custom names, loadouts, grenade, killstreak choices and settings persist across reload/rejoin/day/build migration. | Local profile/persistence | Versioned transactional local-profile schema, malformed/old/future/fault-injection tests and cross-build fixtures. | Client profile | OPEN |
| HF-031 | P2 | Do not invent account/login security in this correction wave. Make local persistence migration-safe now; treat cloud identity/sync, privacy and recovery as a later explicit product/security decision. | Product/security | Architecture decision remains explicit; no hidden identifier or remote PII write. | Identity | OPEN |
| HF-032 | P1 | RustRig gains occlusion-correct red/orange/yellow practical lighting through container routes. | Lighting | Declared fixture/emissive pairs, occlusion policy, gameplay-contrast captures, High/Performance parity and GPU budget. | RustRig | OPEN |
| HF-033 | P1 | Smoke has materially better volume motion; admitted bullet corridors locally advect/open the semantic density without changing bullet collision. | Smoke/visibility | Host-owned bounded density/impulse grid, bullet-pass invariant, both-team/AI query, late join, cap/disposal/network tests and captures. | All combat maps | OPEN |
| HF-034 | P1 | Every cataloged collision material supports consistent bounded decals unless explicitly excluded. | Material/decal governance | Material→decal set equality, synthetic material mutation, per-map ray matrix, round persistence, cap/eviction and pooling tests. | All maps | OPEN |
| HF-035 | P1 | Green shed decal behavior is identical on RustRig and Terminal and the roof orientation/normals are correct. | Destructible world/art | Same definition/material IDs, normal/winding validator and deterministic impact captures on both maps. | RustRig + Terminal | OPEN |
| HF-036 | P1 | Shed door shows `F to open/close`, has authoritative one-second interaction, and can be physically pushed/woken by player contact. | Interaction/physics/HUD | Range/LOS/prompt state, obstruction/reversal, contact impulse, collider/mesh/state parity, late join and two-peer tests. | Shed maps | OPEN |
| HF-037 | P1 | Repeated hits in one region visibly degrade sheet material; explosions detach/smash it; a sufficiently weakened corner can cause bounded partial collapse. | Destruction authority | Canonical local damage accumulation, threshold boundary/property tests, visible aperture=ballistic aperture parity, exactly-once detach/collapse and caps. | Shed maps | OPEN |
| HF-038 | P1 | House/shed major fragments remain physical and interact with each other/world rather than disappearing arbitrarily. | Destruction/performance | Major/minor classification, sleeping/wake policy, settled persistence duration, collision/contact and cap/eviction evidence. Critical gameplay geometry may not vanish due to quality. | Destructible maps | OPEN |
| HF-039 | P1 | Semtex becomes a fourth selectable grenade family, sticks to world/current actor life, deals high local damage and has required prone mitigation. | Ordnance/protocol | Canonical catalog/protocol/loadout mapping, one-count lifecycle, host attachment, target-life reset, prone/distance damage matrix and duplicate/reconnect tests. | Combat | OPEN |
| HF-040 | P1 | Helicopter path variance remains subtle, smooth and host-authoritative for the killstreak; menu variance remains seeded presentation-only. | Vehicle motion | Fixed review seed plus varied session seeds, acceleration/flight-volume bounds and peer convergence; no targeting/LOS/survival drift. | Menu + Chopper | OPEN |
| HF-041 | P0 | No replacement candidate is offered until Atomic start, RustRig stress, map switching and representative match play are free of user-visible freezing. | Performance gate | Native-WebGPU p50/p95/p99 frame time, long-task/hitch ledger, shader compile count, GPU error/device-loss, ten-transition soak and worst-scene traces. | All | OPEN |
| HF-042 | P0 | Requirement omission becomes mechanically detectable rather than dependent on owner HITL. | Governance/QA | One owner per domain, requirement→code→test→artifact graph, change-impact routing, synthetic catalog mutations and incomplete-fixture failures. | Repository | OPEN |
| HF-043 | P1 | Benchmarks/evals improve or remain stable every pass; regressions require an explicit waiver and owner-visible evidence. | Benchmark guard | Immutable baseline records, thresholded comparisons, trend report and no overwrite of known-good artifacts. | Repository/release | OPEN |
| HF-044 | P1 | Specialist asset team is benchmark/eval supported for characters, rigging, textures, animation and weapons. | Asset coordinator | Lane ownership map, authored-asset definition-of-done, validators, visual corpus, performance/provenance budget and fresh-agent skill fixture. | Asset pipeline | OPEN |
| HF-045 | P1 | Every aircraft/drone model declares a canonical forward/up axis and route poses face velocity; Care Package aircraft must never fly backwards. | Support asset/motion | Asset-axis/socket validator plus seeded ingress/egress captures and pose-dot-velocity property test for every route direction. | Support entities | OPEN |
| HF-046 | P1 | Care Package crate has a clearly visible parachute throughout descent. | Support presentation | Aircraft→crate→parachute lifecycle mapping, cloth/line silhouette captures, LOD/budget and detach/landing cleanup tests. | Care Package | OPEN |
| HF-047 | P0 | Care Package crate displays `F to collect killstreak` in valid range/LOS and collecting awards exactly once; current no-op behavior fails. | Support authority/HUD | Prompt state matrix, continuous-F admission, range/LOS/damage/death interruption, owner/enemy timing, reward reveal, duplicate/reorder/reconnect and two-peer tests. | Care Package | OPEN |
| HF-048 | P1 | Piloted Drone reuses the higher-quality Drone Swarm visual family, with PBR textures, articulated/animated propulsion and a visible mounted machine gun; sphere fallback is removed. | Asset forge/support | One canonical drone asset family with explicit variant definitions, Blender/source/provenance, axis/sockets/LOD/material/action validator and close/mid/far captures. | Piloted Drone + Drone Swarm | OPEN |
| HF-049 | P1 | Piloted Drone and Drone Swarm use the identical frozen gun profile and modern visible muzzle action, report, tracer, impact, hit marker and damage feedback. Only reserve/lifetime/control specs may differ. | Support combat/audio | Cross-variant gun-profile identity, ammo/cadence/reload/host-hit matrix, gun socket/action mapping, sound/tracer/impact corpus, exactly-once score/damage and owner-recipient HUD evidence. | Piloted Drone + Drone Swarm | OPEN |
| HF-050 | P1 | Calling player receives legible Chopper Gunner damage/hit feedback; gun report and firing animation are strengthened without audio clipping. | Support HUD/audio/presentation | Owner-recipient event mapping, damage-value/hit-marker accumulation/expiry, remote privacy, action markers, mixer peak/concurrency and capture. | Chopper Gunner | OPEN |
| HF-051 | P2 | Adrenaline activation has a distinctive bounded HUD treatment and sound, with clear 15-second expiry and reduced-sensory alternative. | HUD/audio/support | Start/refresh/non-stack/expiry/death sequence, timer synchronization, mixer/peak tests, reduced-motion/sensory captures and teardown. | Adrenaline | OPEN |
| HF-052 | P0 | Piloted Drone activation on Atomic Acres must not crash, stall or strand control. | Runtime/support | Native-WebGPU activation/exit/destruction/death/disconnect/fuel matrix on Atomic, first-fault logs, 20 repeated activations and two-peer control restoration. | Atomic Acres | OPEN |
| HF-053 | P0 | Performance/Quality/Custom may change presentation budgets only; visible gameplay geometry and authoritative collision remain semantically identical. Atomic's invisible kitchen collision in Performance is a release blocker. | Renderer/arena authority | Semantic geometry↔collider manifest set equality across profiles, deterministic paired captures/rays/navigation/LOS, synthetic hide/substitute mutation failure and all-map suite. | All maps/profiles | OPEN |
| HF-054 | P0 | Support activation and interaction paths may not synchronously compile/decode/allocate enough work to freeze gameplay. | Performance/runtime | Prewarm/pool inventory, activation-frame long-task trace, allocation/construction counters, bounded queue/backpressure and repeated mixed-support stress. | All support-enabled maps | OPEN |
| HF-055 | P1 | Standalone drone deployment offers an explicit autonomous-AI or first-person owner-control choice while retaining the approved standalone health, ammunition, fuel and sensor rules. | Support authority/UI | Mode-selection admission, AI/manual transition policy, input isolation, same gun profile, control restoration and all death/disconnect/destruction/fuel terminal cases under two-peer tests. | Piloted Drone | OPEN |

## 4. Canonical contract supersessions

These corrections are authoritative and must be reflected without creating a second source of truth:

1. `DEC-07`: grenade families are now `frag`, `smoke`, `flash`, `semtex`; still exactly one selected, one spawned, cap one, kills do not replenish, the valid corpse-ammo-pickup transaction restores exactly one.
2. `DEC-13`: `deathClearsUnconsumedRewards` is `false`; progress remains per-life and resets on death; earned unconsumed rewards remain until consumed or match epoch end.
3. Human-facing graphics presets supersede the earlier four-label surface: `Quality`, `Performance`, `Custom`. Internal quality tiers may exist only as resolved settings/benchmarks, not as a contradictory top-level choice.
4. `DEC-14` is not weakened by the request for a stronger flash. The effect is one strong bounded onset plus monotonic recovery, never a repeated full-screen strobe; reduced-sensory precedence and peak-limited audio remain mandatory.
5. Pass 65 owner HITL will apply only to a new immutable replacement `S0`; the failed `ec8a55f…` preview cannot be retrospectively approved after runtime edits.
6. Renderer quality profiles are presentation-only. They may reduce texture resolution, shadow/particle/decal/LOD budgets or non-authoritative minor debris, but may not remove/substitute semantic structures while retaining their colliders, or otherwise change cover, LOS, navigation, movement, ballistics or target visibility.
7. Every support asset declares and validates its modelling-axis conversion once. Route code uses the canonical forward axis; ad-hoc sign flips in individual abilities are forbidden.
8. Drone visual and weapon identity are shared by catalog projection, not copy-pasted: Swarm and standalone variants reference the same asset family and `DroneGunProfileId`; variant policy may change control mode, reserve and lifetime only where already frozen.

## 5. Execution waves and merge order

### Wave A — truth, crash and lifecycle

1. Preserve the failed build and collect first-fault Atomic/transition evidence.
2. Fix the crash and transition ownership/disposal before visual expansion.
3. Prove native-WebGPU arena start/transition/endurance on the representative NVIDIA machine.

### Wave B — interaction contracts

1. Integrate reward persistence, Semtex schema, flash impact semantics, minigun balance and drone control.
2. Validate host authority, duplicate/reorder/reconnect and life/epoch boundaries.
3. Keep Gun Range's support restriction explicit while deriving all other maps from the catalog.

### Wave C — HUD, settings and persistence

1. Correct the overlap/readability regression before adding decoration.
2. Ship the three-choice graphics surface, advanced disclosure and truthful FPS range.
3. Transactionally migrate one versioned local profile containing all requested persistent preferences.

### Wave D — assets, motion and maps

1. Replace invalid arms/floating-knife/crossbow presentation with validated rig/action contracts.
2. Establish the Blender/licensed-source/PBR/LOD/provenance pipeline before calling any hero asset complete.
3. Add authored Gun Range targets/lights, RustRig practicals, decals, smoke response and shed/destruction consistency.
4. Refine helicopter/cat/aircraft presentation only within measured budgets.

### Wave E — integration and candidate construction

1. Cherry-pick isolated lane commits in dependency order; resolve central hot files only in the integration worktree.
2. Run static/unit/typecheck/build, catalog mutations, viewport matrix, native-WebGPU deterministic visuals, performance traces, lifecycle/endurance, two-peer/chaos and provenance gates.
3. Rebuild the correction ledger from evidence; no `OPEN` P0/P1 item may be disguised as accepted.
4. Create a new exact-SHA local/immutable preview and provide Dave with its build identity, URL and concise HITL route.
5. Stop after HITL. Do not publish until Dave separately confirms the exact publish-ready main SHA and topology.

## 6. Benchmark and team contract

Each specialist lane has four distinct responsibilities even if one person/agent fills more than one role:

- **Researcher:** gathers primary references and measurable constraints; cannot approve its own implementation.
- **Implementer/forge:** changes only declared paths and emits source/provenance/build evidence.
- **Benchmarker:** compares exact candidate artifacts with the failed-HITL baseline, Pass 63 Stable where relevant, and frozen Pass 62 netcode evidence.
- **Red-team verifier:** attempts the explicit falsifiers, malformed/future catalog mutations, lifecycle abuse, viewport overflow and resource exhaustion.

The integrator owns cross-domain hot files, decision lineage, requirement mapping, merge order, exact-SHA evidence and the stop-before-publish rule. A lane report without executable evidence is a handoff, not verification.
