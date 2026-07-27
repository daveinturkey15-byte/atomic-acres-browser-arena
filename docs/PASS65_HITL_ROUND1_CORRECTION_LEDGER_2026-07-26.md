# Pass 65 HITL Round 1 Correction Ledger

<!-- owner-feedback-ledger-version: 1; latest-id: HF-072 -->

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
| HF-030 | P1 | Custom names, loadouts, grenade, killstreak choices and settings persist across reload/rejoin/day/build migration. | Local profile/persistence | Versioned transactional local-profile schema, malformed/old/future/fault-injection tests and cross-build fixtures. | Client profile | IMPLEMENTED |
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
| HF-056 | P0 | Every arena-selection preview is a distinct prerecorded compressed video, never a live map render. Nuke Town, Terminal and RustRig retain the authored helicopter/cockpit choreography and Gun Range retains the authored cat POV, but runtime menu browsing performs zero arena construction, gameplay compile, WebGPU submission or live preview physics. | Preview media + lifecycle/performance | Per-map WebM/MP4/poster/provenance set equality, codec/fallback/reduced-motion checks, rapid A→B→C switch race, decode budget and runtime telemetry proving zero menu renderer submissions/arena construction before explicit deploy. | All menu previews | OPEN |
| HF-057 | P1 | Advanced Graphics uses Cyberpunk-class feature categories as research inspiration but exposes only original, technically supported WebGPU/TSL controls that actually change the renderer or scene; no decorative toggle is allowed. | Graphics research + renderer/settings | Primary-source research receipt, canonical feature-inventory→UI→normalizer→apply→runtime-telemetry set equality, synthetic add/rename/retire mutations, capability reasons and before/after deterministic captures for every shipped control. | Options + all arenas | OPEN |
| HF-058 | P1 | Semtex must read immediately as an authored wrapped bundle of explosive charges with its own held, thrown, stuck and world silhouettes, not a recoloured generic grenade. | Ordnance asset forge | Blender/editable-source or licence-vetted source, UV/tangent/PBR/LOD/provenance/action/socket validator and held/flight/world/attached deterministic captures. | Semtex | OPEN |
| HF-059 | P0 | Piloted Drone, autonomous Drone and Chopper Gunner apply their authored support-weapon damage rather than a placeholder one-point hit, and owner-control uses an unobstructed first-person camera plus dedicated readable HUD. | Support combat/possession/HUD | Damage boundary and TTK matrix, no literal/fallback `1` path, camera near-plane/asset-occlusion sweep, HUD viewport matrix, input/exit/death/disconnect restoration and two-peer authority evidence. | Drone + Chopper Gunner | OPEN |
| HF-060 | P0 | `F` is globally arbitrated: while controlling a drone/chopper it always enters/exits that support before any nearby door, care package, weapon or other interaction; otherwise exactly one deterministic prompt/action wins. | Input/interaction coordinator | Candidate collection and explicit priority/tie-break tests for every overlapping pair, held-key debounce, range/LOS changes, death/menu/focus cleanup and two-peer exactly-once admission. Competing feature-local `F` listeners fail. | All interactions | OPEN |
| HF-061 | P1 | Bots cycle through the complete canonical shipped weapon roster, including newly added weapons, and through all four grenade families. Future catalog additions auto-enrol or fail rather than waiting for owner feedback. | Bot/combat registry | Catalog-derived weapon/grenade set equality, deterministic no-avoidable-duplicate cycles, synthetic add-two/rename/retire mutation, per-fire-kind bot behavior and all-grenade authority/presentation tests. | Bot-enabled maps | IMPLEMENTED |
| HF-062 | P1 | Atomic Acres solo reinforcements advance once per ten defeated bots rather than every five, retain the existing initial count and hard cap, and do not silently alter sibling-map bot rules. | Bot/match rules | Threshold tests at 9/10/19/20/29/30/39/40 deaths, cap and non-finite cases, rematch reset, UI rules label and sibling-map negative matrix. | Atomic Acres solo | IMPLEMENTED |
| HF-063 | P1 | The in-match menu uses a blurred capture of the last valid gameplay frame and contains no retired Nuke Town placeholder screenshot or unrelated image. | Menu lifecycle/HUD | Exact source-canvas/frame/hash telemetry, capture-before-hide ordering, cross-origin/failure fallback, stale-age bound, pause/resume/map-switch tests and screenshot inspection. | In-match menu | IMPLEMENTED |
| HF-064 | P0 | Starting/joining a match must not immediately bounce the player back to the menu and require Resume; lifecycle ownership keeps the deployment transition hidden until active play is ready. | Match lifecycle | Twenty solo starts plus host/guest joins, menu event/state trace, focus/pointer-lock variants and assertion that no unsolicited menu-open transition occurs between countdown and active play. | All match starts | IMPLEMENTED |
| HF-065 | P0 | Atomic Acres remains materially choppier than Terminal on the owner machine despite continuity passing; smoothness is judged by tail latency and long frames, not average FPS alone. | Performance/arena forge | Same-build foreground native-WebGPU Atomic↔Terminal trace with p50/p95/p99/max presentation and CPU frame time, >20/33/50/100ms counts, long tasks, queue latency, compile/decode/upload events, movement/combat/support phases and bounded deltas. | Atomic Acres vs Terminal | IMPLEMENTED |
| HF-066 | P1 | Care Package and Carpet Bomber targeting creates a large host-admitted red ground `X` visible to all relevant players; the carpet-bomb caller additionally sees a large red world-space payload corridor across the map before commit. | Support targeting/presentation/protocol | Anchor/path protocol validation, host/guest world-coordinate equality, caller/peer visibility policy, depth/terrain projection, map bounds, cancel/commit/expiry teardown and two-peer captures. | Care Package + Carpet Bomber | IMPLEMENTED |
| HF-067 | P1 | The Railgun retains the requested unmistakable map-spanning bolt/laser through buildings and map geometry, visible to the shooter and every peer along the authoritative penetration path. Existing damage/rechamber tests alone are insufficient. | Railgun presentation/network | Local and two-peer shot capture, 180m+ beam length/radius/duration/material assertions, through-building depth/penetration alignment, remote replication, pool/expiry and audio synchronization. | Railgun on supported maps | IMPLEMENTED |
| HF-068 | P1 | Chopper/Drone support damage numbers and hit feedback appear over the actual damaged enemy's projected world location, never at the caller's current reticle; behind-camera/off-screen targets do not create misleading centre-screen markers. | Support HUD/presentation | Authoritative target-ID/position event binding, moving-target projection tests, caller aim deliberately offset from victim, off-screen/behind-camera suppression or edge policy, multi-hit accumulation and two-peer capture across chopper, piloted/autonomous drone and swarm. | Support damage HUD | IMPLEMENTED |
| HF-069 | P0 | Every independently falsifiable outcome in the attached Pass 65 specification and every subsequent correction in this Codex conversation is represented once, including scope words, negations and supersessions, and reaches an executable owner and evidence path; no prompt may be silently ignored or accepted from prose alone. | Specification/integration governance | Generate the prompt-to-feedback-to-planning-to-canonical-owner-to-test-to-artifact graph, prove set equality and exact source identities, and run deliberately omitted, duplicated, stale-supersession and missing-evidence mutations. A missing outcome, orphan owner, unexercised falsifier or disguised OPEN P0/P1 item fails candidate construction. | Whole Pass 65 repository and HITL candidate | OPEN |
| HF-070 | P1 | Every user-meaningful supported WebGPU/TSL presentation feature is available through the appropriate Quality, Performance or Custom/Advanced Graphics path and is deliberately showcased in the scenes it affects; every visible control changes a real runtime consumer and unsupported capabilities remain honestly unavailable with a reason. | Graphics research/settings/renderer | Prove canonical feature-inventory to UI to normalizer to apply-mode to scene/runtime consumer to telemetry to persistence set equality, synthetic add/rename/retire failures, capability-clamp reasons and deterministic before/after captures for every control. An orphan, no-op, unshowcased active feature or decorative option fails. | Options, all arenas and representative WebGPU hardware | OPEN |
| HF-071 | P1 | All requested gameplay features are complete production implementations with canonical typed ownership, host authority where shared, versioned protocol and persistence, bounded resources, documentation and regression tests; placeholders, one-point fallbacks, no-op interactions and one-off mirrors do not satisfy the request. | Gameplay architecture/integration | Trace every gameplay requirement through catalog/authority/protocol/persistence/presentation/audio/bot/telemetry/test consumers, run future-ID and malformed/reordered/reconnect mutations, and exercise the complete all-map/two-peer lifecycle and stress matrix at the exact candidate SHA. Any missing consumer, fallback path, authority divergence, crash or freeze fails. | All gameplay systems, maps and peer modes | OPEN |
| HF-072 | P1 | Graphics, models, rigs, animations, materials, textures, effects and audio reach a coherent release-grade authored quality bar, are well structured and documented, and are refined enough for owner delight rather than merely being mechanically present. | Asset forge/art direction/visual QA | Require editable Blender or licence-vetted source, complete provenance/PBR/LOD/socket/action/budget validators, deterministic near/mid/far and action contact sheets, independent visual red-team review and final owner HITL on the immutable candidate. Generic procedural hero assets, inconsistent texel/material quality, missing states or self-attested taste fail. | All first-person, character, vehicle, weapon, world, HUD and preview presentation | OPEN |

### 3A. Planning-requirement projection

The feedback IDs remain the correction source; these ranges bind each row back to the frozen 99-row planning matrix without duplicating implementation state.

| Feedback IDs | Planning requirements |
|---|---|
| HF-001–HF-004 | R307, R608, R610 |
| HF-005–HF-007 | R109, R304, R305, R609 |
| HF-008–HF-011 | R108, R109, R112–R115, R504, R608 |
| HF-012–HF-013 | R111, R302, R303, R605 |
| HF-014–HF-020 | R233–R235, R305, R500, R502, R504–R507, R510–R512 |
| HF-021–HF-026 | R104–R109, R220–R232, R236, R608 |
| HF-027–HF-031 | R300, R301, R306, R613 |
| HF-032–HF-038 | R110, R111, R234, R307, R400–R413, R605, R610 |
| HF-039–HF-040 | R233, R236, R504, R509, R510 |
| HF-041–HF-044 | R004, R005, R006, R606, R607, R610, R613 |
| HF-045–HF-051 | R108, R109, R304, R501–R507, R510, R608, R609 |
| HF-052–HF-055 | R307, R504, R507, R510, R605, R610 |
| HF-056 | R112–R114, R307, R608–R610 |
| HF-057 | R100, R111, R300, R307, R308, R610, R613 |
| HF-058 | R108, R233, R236, R608 |
| HF-059–HF-060 | R504, R507, R510, R609, R610 |
| HF-061–HF-062 | R104, R232, R236, R605, R613 |
| HF-063–HF-064 | R307, R609, R610 |
| HF-065 | R606, R610 |
| HF-066 | R502, R505, R510, R609 |
| HF-067 | R109, R232, R236, R601, R608 |
| HF-068 | R504, R506, R507, R510, R609 |
| HF-069 | R005, R111, R600, R608, R611, R613 |
| HF-070 | R100, R111, R300-R302, R307, R308, R608, R610, R613 |
| HF-071 | R200-R205, R220-R236, R400-R413, R500-R512, R600-R610, R613 |
| HF-072 | R008, R105-R115, R236, R300, R402, R608, R613 |

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
9. Runtime map previews supersede the earlier live-render interpretation of R112–R114: authored paths remain offline video-generation inputs and evidence, while the shipped menu plays prerecorded compressed media and submits no gameplay frames.
10. Atomic Acres reinforcement cadence is one added opponent per ten defeated bots, starting from the existing two and capped at six; the old fifth-death wording is retired.
11. Support HUD damage feedback is target-bound world projection. Centre-reticle damage numbers remain valid for the player's own camera-centred firearm hit only, not remote/AI support damage.

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
