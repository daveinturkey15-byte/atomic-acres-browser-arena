# Atomic Acres Pass 66 recent-request and ref audit

Date: 2026-08-01
Audit snapshot: `17d8b8bd30e88ca0cc31ab181069579a5f25c94d` plus the shared, dirty Pass 66 final-adjustments worktree
Integration base: `eb813af228bd31fefce90ffaa1078372480328c0`
Status: **ACTIVE HITL CANDIDATE WORK — NOT COMPLETE, NOT APPROVED, NOT PUBLISHABLE**

This audit answers two separate questions:

1. Were recent Atomic Acres owner requests, including Qoder work and divergent local refs, recovered into the current line or explicitly tracked?
2. What still lacks the proof required to call the next build stable?

It does not treat a commit message, a ledger row labelled `IMPLEMENTED`, a screenshot without an exact source identity, or the presence of code as completion.

## Scope and status language

- Scope is only the Atomic Acres browser game in this repository. Sibling and unrelated work is excluded. In particular, `contrib/dave-gaming-pc/hermes/sea-dragon-island-patrol` is not an Atomic Acres request and was not imported.
- `VERIFIED` is reserved for digest-bound proof from one clean frozen candidate SHA. The current worktree is dirty, so no result in this snapshot is `VERIFIED`; a green dirty-worktree contract is still only `CANDIDATE` evidence.
- `CANDIDATE` means an implementation and some relevant tests/evidence exist, but a required browser, native-WebGPU, multiplayer, visual, performance, or exact-SHA gate is missing.
- `OPEN` means the requested result is absent, owner-rejected, or still lacks the core implementation rather than only final verification.
- `DEFERRED` means the owner explicitly removed it from this correction wave.
- `INPUT` means external evidence is required before the item can be analysed honestly.

The current public channel was not changed by this audit. Byte-exact Pass 63 remains the stable rollback.

## Sources inspected

The following repository-owned sources were read and normalized against the current code and refs:

- `docs/pass65-sources/attached-pass65-spec-2b63e579.txt` — broad Pass 65 baseline specification.
- `docs/pass65-sources/desktop-untitled-2026-07-27.txt` — the request set that was partly worked in Qoder.
- `docs/pass65-sources/codex-owner-feedback-2026-07-29.txt`.
- `docs/pass65-sources/codex-owner-feedback-v66-2026-07-29.txt`.
- `docs/pass65-sources/codex-owner-feedback-v66-2026-07-30.txt`.
- `docs/PASS65_HITL_ROUND1_CORRECTION_LEDGER_2026-07-26.md`, currently through `HF-190`, used as an index rather than proof.
- `docs/PASS66_FINAL_ADJUSTMENTS_LEDGER_2026-08-01.md` and the 1 August owner correction list, reconciled against the live dirty worktree because concurrent work has already made parts of the older ledger stale.
- All local branch tips dated 27 July or later that are not ancestors of the current candidate, plus their `git cherry` and relevant tree/content differences.

## Qoder and divergent-ref reconciliation

### Qoder checkpoint

- The preserved Qoder payload is merge/stash checkpoint `c827d76c1c7eb84923bd43c108034e49fe92e269` on `backup/pass65-qoder-dirty-20260728`.
- It is based on `3dad9acb2072ff89fb833c006987593ad48a2cc3`, has parents `3dad9ac...` and `c3feb68...`, and is not an ancestor of the current branch.
- Its tracked payload is 35 files, 827 insertions and 161 deletions.
- Its owner source is preserved at `docs/pass65-sources/desktop-untitled-2026-07-27.txt`.
- The behavior was reconciled into the current lineage mainly through `87226d72aa6bc3035086b882ea8067e269aa04a0` and later refinements, rather than by merging the stash commit wholesale.

Current-tree evidence retains the Qoder-requested distinct Max profile, uncapped/high-refresh behavior and focus reset, transactional multi-edit graphics settings, 108 m/s crossbolt, actor-stuck double crossbolt/Semtex effects, world-`F` priority, repeatable streak ladder, Piloted Drone motion corrections, 24-unit spread swarm, carpet payload/damage/presentation, and Pass 65 changelog coverage. The focused deterministic suite listed below covers those contracts.

### Other non-current refs

| Ref or commit family | Reconciliation result |
|---|---|
| Recent Pass 65 branches reported by `git cherry` with only `-` patches | Patch-equivalent changes already exist in current history. No action. This includes the atomic-stability, destruction-material, recovered arms baseline, drone-motion, F-arbitration, completeness, ladder, observer, native-gate, railgun, smoke, red-team, targeting, text-integrity, UV, chopper, stability and GTAO branches. |
| Old Pass 65 backup/rig refs (`e7bfee2`, `0050b15`, `1fd02a8`, `1fe03af`) | Historical baselines are superseded by later current-tree ballistics, weapon, operator, settings and changelog generations. They are not a source to merge over Pass 66. |
| Preview/media refs (`addb62c`, `2d50046`, `ec8f743`) | The authored sources and selected-map media family are present or superseded by later current assets. Final selected-map landmark and rapid-switch visual proof remains required; branch presence is not visual acceptance. |
| Flash authority `9ea9936` | The key flash authority/protocol/browser files match the current tree. Not lost. |
| Chopper fire ray `2802c16`, support vehicles `5f4d771`, drone correction `0dfef04` | Current code and assets are later revisions of these paths. The authority tests remain; final support stress and owner visual approval are still required. |
| Third-person operator `c62cd6a` and weapon corpus `e5d0737` / `21d51b4` / `2f524f3` | The current tree retains the authored families or later revisions. This does not close the rejected first-person arms/knife quality request. |
| Adaptive admission `0ff778c9`, `63c8ed11`, `221f35fb` | Functionally reconciled and refined in current history by `3f2d2b32`, `d2427f5f` and `src/webgpu-adaptive-epoch.integration.test.ts`. Do not cherry-pick the divergent sequence over the newer epoch logic. |
| Support `5ad8b5c5` | Reconciled in current history at `6d27f729`; current `interaction-press-lifecycle` and `killstreak-drone-formation` modules retain the intended contracts. |
| Interaction/glass `675df63b` | Reconciled in current history at `12984e7d`; current slot-possession and continuous-audio ownership modules retain the intended contracts. |
| Support/field-kit presentation `974b5200`, `32f820c3` | Reconciled and refined in current history, including `86090d07`, `field-kit-weapon-presentation`, `killstreak-demo-presentation` and readability CSS. Eleven real-runtime posters now exist, but the requested unique demo videos are still absent. |
| Pass 66 owner-evidence runner `23c6ece` | Current evidence tooling is a later version. This is release-gate tooling, not missing gameplay. |
| Arms/knife experiment `d2ec780b` | Deliberately preserved as WIP and not merged. Importing that rejected experiment would be a regression; later current-tree authored arms/knife work supersedes it and remains a candidate pending frozen-SHA proof and owner HITL. |

No Atomic Acres request was found whose only surviving implementation is a non-current ref. That conclusion does **not** mean every request is complete: several are absent or still fail the required quality/stability gate, as recorded below.

## 1 August correction list coverage

| Owner request | Status | Current evidence and remaining gate |
|---|---|---|
| M40 ADS turns white | **CANDIDATE** | `tests/e2e/pass66-scoped-ads-regressions.spec.ts` rejects opaque centre layers and proves frame advance at 2560×1440 and 3840×2160 on the current WebGL2 path. Repeat on the frozen SHA and native WebGPU. |
| Field Kit Custom cards unreadable until hover | **CANDIDATE** | Persistent high-contrast Custom cards, labels, selected state and stats exist in `src/ui/pass66-readability.css` and the field-kit browser gate. Repeat the viewport matrix on the frozen SHA. |
| Every gun has the same red ADS circle | **CANDIDATE** | `src/ads-sight-profile.ts` owns a catalog-complete distinct sight signature, with set-equality/uniqueness and served centre-ray coverage. The clean-SHA WebGL2/WebGPU catalog receipt and owner visual review of every weapon are still required. |
| M14 EBR freezes when entering ADS | **CANDIDATE** | The thermal path is prewarmed and the focused 1440p/4K WebGL2 ADS gate advances frames. Cold/warm native-WebGPU ADS/fire/un-ADS/swap loops on every arena/profile are still mandatory. |
| Railgun lost its through-wall scope | **CANDIDATE** | The cyan hostile-reveal scope and firing persistence are restored; `tests/e2e/pass64-railgun.spec.ts` and the retained multi-peer railgun suites cover the path. Re-run three-peer authority and native-WebGPU presentation on the final SHA. |
| Pick up a weapon, then immediately re-pick the swapped weapon | **CANDIDATE** | The death-drop/re-pick path and focused tests exist, including the independent second `F` pickup in `tests/e2e/atomic-acres.spec.ts`. Re-run the full served path on all maps, especially RustRig crates. |
| Arms, hands, knife, scale and actions remain poor at 1440p/4K | **CANDIDATE** | The authored two-chain arms and wrist-mounted knife pass paused and temporal 1440p/4K/ultrawide framing with opaque connected hands, 30 articulated finger bones, strict ADS/receiver contact, visible knife/grip contact and materially distinct reload/melee poses. A real-wall browser gate and 108 focused tests are green; the evidence verifier now rejects stale receipts and requires a clean exact source SHA. Owner HITL acceptance remains required. |
| Chopper/care/carpet silhouettes need Apache-level panel fidelity | **CANDIDATE** | The bounded V4 reference-led Blender/PBR/LOD pass now supplies a 59,740-triangle armed attack helicopter with layered armour, fasteners, louvers and full stores; a four-engine heavy care aircraft with framed flight deck, gear and rear ramp; a panelled flying-wing bomber with buried intakes and framed bay; and a detailed crate/parachute. All eleven optimized GLBs remain within the original ceilings with unchanged canonical sockets, 29 focused tests and the real slot-key-6 Chopper browser path green. Bright close-up sheets replace the rejected generic evidence. The prerecorded cockpit preview must still be recaptured against the final source hash and owner visual approval remains required. |
| Chopper Gunner does no damage | **CANDIDATE** | The current two-peer authoritative support-damage gate proves remote damage and rejects occluded hits in `tests/e2e/pass65-support-visual-gate.spec.ts`. Repeat on final SHA. |
| Piloted Drone/Chopper operation wording is oversized/misplaced | **CANDIDATE** | The existing assigned-slot-key wording is a compact live-positioned banner immediately below the support information box, with slightly larger information text. The authored gate covers 700×720, 1280×720, 2560×1440 and 3840×2160 and requires a real visible pixel delta; its frozen-SHA execution remains. |
| Killstreak descriptions | **CANDIDATE** | Typed set-equality covers every selectable reward. Yardhawk describes the homing explosive; Piloted Drone/Chopper describe assigned-key operation; Nuke exposes the canonical five-second warning; and Drone Swarm projects one 30 s lifetime through catalog, runtime and menu. Semantic/unit coverage passes; final viewport capture remains. |
| Grey-room gallery demos and thumbnails | **IN PROGRESS** | The off-range live demo bay/capture route, eleven unique real game-rendered posters and lifecycle-safe decoder exist. The poster-only receipt is stale by design. Final clips remain held until source freeze; their wrapper-only replacement gate binds clean SHA, owned preview, served runtime tree, recursive `src/**`/`shared/**`/`public/**`, build/env/topology recipes, exact support-to-file paths and a media-only clean descendant commit. |
| Five-second Gun Range tunnel, secure thump door, large bay, slow unarmed dummies, every weapon/support | **CANDIDATE** | The dirty worktree now has an active `src/gun-range-test-bay.ts` contract: 30.75 m at 6.15 m/s (5 s), 3,104 m² floor, 720 ms proximity door with thump and dynamic collision, four slow unarmed dummies, every canonical weapon station and every canonical support station. Runtime weapon/support interaction is integrated through `src/legacy-main.ts`; offline/host-only training support grants pass normal activation admission. Unit contracts pass. The current E2E is authored to prove the door's real collider, moving dummies, M14 station use, Chopper station activation and Chopper damage to a dummy, but this audit did not execute that browser test and it does not enumerate every station. |
| Flamethrower appears on top of RustRig halfway through | **CANDIDATE** | The full pickup-only protocol v12/catalog/bot/audio/ballistics/stream/GLB/LOD/texture/provenance/timed-authority/checkpoint family now exists. The real two-peer RustRig mid-match spawn, guest rejoin and no-replay case is green; final asset/exact-SHA gates remain. |
| Flare gun appears in the Terminal aircraft halfway through | **CANDIDATE** | The full finite-ammo projectile/effect/audio/asset/provenance/timed-authority family exists. Canonical bot set-equality now includes it, while ordinary bot spawn kits still respect pickup-only ownership; a dedicated gravity-compensated host projectile adapter reuses the finite flare simulation/presentation pool and is mechanically barred from hitscan fallback. Depleted rejoin and active-flare late-join authority repair are green in the real two-peer three-case gate; final exact-SHA rerun remains. |
| High-quality skies on all maps; no blocky floating sky assets | **CANDIDATE** | Separate restored 4096×2048 Atomic sunset, RustRig storm-night and Terminal dawn panoramas now pass pinned authoring, provenance, entropy/detail, 48 px periodic seam and minimum-byte gates. Legacy point stars and giant cloud planes are retired. Complete 3840×2160 WebGL2 and installed-Edge hardware-WebGPU matrices cover every outdoor map plus seam ±/centre views and player-height Atomic context with healthy renderer/watchdog telemetry, one arena root, no square stars, no flying sky geometry and no visible hard seam. Owner HITL approval remains. |
| RustRig large volatile waves with real physics | **CANDIDATE** | `src/water-system.ts` shares a deterministic five-band warped spectrum between rendering and CPU physics at 1.55 m Max amplitude, with normals, vertical velocity, buoyancy and drag. Unit sampling proves more than 2.5 m crest-to-trough range and the native Edge/WebGPU two-time gate is green; owner visual/performance review remains. |
| Prone weapon clips into floors/walls | **CANDIDATE** | A real-wall browser path proves retreat/lift in a bounded case. The authored clean-SHA matrix covers every arena and Performance/Quality/compat profile in solo and two-peer modes, but it has not run because this worktree is dirty; until that receipt exists, broad floor/wall closure is unproved. |
| Half-load/freeze, then second Join is instant | **CANDIDATE** | The preview poster can release preparation without waiting forever for `loadeddata`/`playing`, and the UI now truthfully says preparation continues in the background. A three-map hidden-tab contract requires selected-sky and map-specific asset fetch/decode while CPU preparation continues, with no hidden GPU/audio/authority tick. Chromium and Playwright-WebKit deployment smokes have passed; the frozen-SHA hidden-tab matrix, repeated native-WebGPU starts, cache/no-cache and real-browser runs remain. |
| Chrome, Firefox, Edge and other browser support | **CANDIDATE** | Chromium, installed Edge WebGL2/native WebGPU and Playwright WebKit smokes are green. Stock Firefox 153 and Playwright Firefox 151 both fail while creating a blank automated page in this Windows compositor environment across multiple graphics modes, before Atomic Acres loads; Firefox remains unverified rather than a product failure. Playwright WebKit is not proof of installed Safari. |
| Player and host/server stack traces when things break | **CANDIDATE** | Bounded, secret-redacted browser stacks now enter the local technical match JSON and shortened traces appear in the runtime error panel for both host and guest peers. `worker/src/index.ts` also logs a bounded service-side stack with a generated incident ID while returning only that ID to the player; uploaded match diagnostics intentionally strip stacks. The focused client/diagnostic/Worker suite is 31/31 green. Provider log retention/access remains an operational policy. |
| Host crashes and rejoins the active game instead of a stuck lobby | **CANDIDATE** | Protocol v12 and checkpoint schema v3 plus a hidden-tab-safe host-liveness watchdog now pass the final current-worktree owned-production-topology Chromium renderer-crash/rejoin case: two real peers deplete two sniper rounds and one grenade, the host crashes and recovers, a fresh wrong-kit guest document joins, and exact room/identity/epoch, bots, guest pose/loadout/host-owned health, compact ordinary magazine/reserve/grenade inventory, finite railgun state, phases, remotes, roster, scores and repair commits converge. Checkpoint writes remain on a two-second cadence, so a hard crash can roll back inventory changes made since the most recent successful checkpoint. This is dirty candidate evidence; the frozen-SHA rerun remains. |
| Guest crashes/rejoins or joins late without desync | **CANDIDATE** | Protocol v12 retains epoch-paired event/state lanes and adds two-phase admitted transport replacement: a higher-generation same-token candidate stays provisional beside the admitted transport; only exact asynchronous credential confirmation promotes it and closes the prior lanes, while candidate rejection or close leaves the active transport intact. A reliable interactive-world snapshot is applied before resume authority, whose `worldRevision` queues authority until the matching world revision is applied. The 1,000-seed clean/normal/adverse chaos matrix still has zero duplicate side effects. The frozen-SHA impairment run remains. |
| Dane multiplayer JSON | **INPUT** | No Dane JSON exists in this repo/worktree. It must be supplied, preserved locally, identity/free-text redacted, then compared with cadence, state, shot, bot and rejoin diagnostics. |
| Host can change map easily in the lobby | **VERIFIED CANDIDATE** | The host/guest UI gate now repeatedly cycles RustRig → Terminal → Gun Range → Nuke Town → RustRig. Every transition requires equal lobby arena state, exactly one matching active scene root, matching navigation colliders, usable ready controls and a disabled guest selector; the local two-browser run passes. Repeat on the frozen SHA. |
| Adrenaline Rush corrupts the host lobby | **CANDIDATE** | State is reset across lobby/match epochs. Host/guest rematch and crash/rejoin regression still required. |
| Bots work only for host; guest sees stale/no bots | **CANDIDATE** | Hosted bot snapshots/results continue while the host player is dead and canonical score rows survive every heartbeat. Host-authored bot damage/HP admission now keys from bot identity and replay authority independently of any lossy, missing or stale replica; replica gates suppress only cosmetic hit reaction. Bot flamethrower streams and flare launches retain bounded host-authored guest presentation lanes with correct audio and no duplicate impact/tracer authority. Focused protocol/replay/integration/audio tests pass; final frozen-SHA impairment proof remains. |
| Reconnected lobby is out of sync with host and bots | **CANDIDATE** | Reliable repair commits, rejoin identity and bot checkpoints converge in both guest-rejoin and real host-crash/reclaim browser gates, including exact member/bot/score state. Final frozen-SHA impairment rerun remains. |
| Hosted bots do not behave like skirmish bots | **CANDIDATE** | Hosted bots use the same canonical AI, firing and damage scaler as solo skirmish; guests interpolate ordinary snapshots and snap only lifecycle discontinuities. Source-contract and two-peer evidence are green; owner behavior review remains. |
| Slight orange highlight on other multiplayer players | **CANDIDATE** | `src/remote-player-readability.ts` and the multiplayer UI gate provide the requested remote-human highlight. Team/FFA captures plus explicit no-through-wall proof remain. |
| Lobby and in-game chat clearer and better placed | **CANDIDATE** | The chat is persistent/discoverable in lobby and a larger bottom-left match surface. The two-peer browser gate is green with no HUD overlap at 720p, 1080p, 1440p, 4K and 3440×1440; owner visual review remains. |
| Shed door | **DEFERRED** | Explicitly deferred by the owner for this correction wave. Destructible shed stability remains in scope even though new door work does not. |

## Earlier 27–30 July requests not to lose

| Request cluster | Status | Audit result |
|---|---|---|
| Actual selected-map menu/loading video; half-size chopper/cat preview UI and rotor framing | **OPEN MEDIA** | The 2560×1440 source/encoding/rotor contract is authored, but the shipped media is still the previous 1280×720 family and fails the current production gate. Recapture, finalization, provenance binding, landmark-by-map, rapid-switch/decode/disposal and owner visual review remain. |
| Care Package collection by `F`; Care/Carpet crosshair call-in instead of overview map | **CANDIDATE** | Authority and interaction paths exist. Repeat host/guest range/LOS/overlap/exactly-once and target-marker tests on final SHA. |
| Carpet Bomber 3× damage, twenty visible shells, large smoke/fire/explosion/audio, route direction and shed destruction | **CANDIDATE** | Canonical damage/payload/presentation paths and stress tests exist. Native-WebGPU all-map repeated lifecycle, shed impact and teardown with zero crash/device loss remain release gates. |
| Piloted Drone direction, manual/autonomous speed, HUD, low-lag possession and centre/spread ingress | **CANDIDATE** | Input and deployment contracts exist, including later owner speed overrides. Repeat native-WebGPU possession stress, control traces and multiplayer authority. |
| Drone Swarm exactly 24, separated groups, fast behind-caller ingress, map exploration and no ground skimming | **CANDIDATE** | Deterministic formation/deployment/navigation tests exist. Final 24-entity performance, obstacle/no-fly and host/guest convergence remain. |
| Smoke: immediate impact, no beep, random readable colour, 150% semantic radius, 5–10 s life and shot corridors | **CANDIDATE** | Authority and presentation code/tests exist. Native visual/overdraw and host/guest smoke-corridor proof remain. |
| Bots lose aim/lock through smoke and are authoritatively blinded by a facing flash | **CANDIDATE** | Shared perception/flash authority exists. Final deterministic bot traces and guest-observed results remain. |
| World `F` beats support interactions; latest override uses the owned streak slot key again to enter/exit Drone/Chopper | **CANDIDATE** | Current reducers cover interaction priority, press lifecycle and slot possession. Repeat served rebinding/blur/death/epoch/overlap and two-peer exactly-once tests. |
| Repeatable same-life killstreak ladder | **CANDIDATE** | Current deterministic runtime tests cover recycle behavior. Final multiplayer progression/rejoin check remains. |
| Semtex sticks to current-life humans/bots, doubles radius/damage and shows `STUCK` | **CANDIDATE** | Current protocol/ordnance tests cover canonical actor attachment and multipliers. Repeat served host/guest reorder/reconnect cases. |
| Crossbolt 108 m/s; actor-stuck bolt doubles damage/radius and shows `STUCK` | **CANDIDATE** | Current deterministic ordnance/integration contracts pass. Repeat served projectile/authority cases. |
| Performance/Quality/Max/Custom; Max distinct; uncapped FPS; Custom inheritance; batch save; in-match settings; alt-tab recovery | **CANDIDATE** | Current settings/adaptive tests pass and the divergent adaptive branch was reconciled into the newer epoch implementation. A new exact-SHA native-WebGPU matrix now applies Performance, Quality and Max in fresh 2560×1440 contexts and fails profile substitution, duplicate runtime identities, nonzero frame caps, targets below 240 FPS, fallback adapters or sub-45 Hz queue progress. It remains pending execution after the candidate is frozen; monitor-panel refresh and perceived smoothness remain HITL. |
| Intermittent one-minute white noise | **CANDIDATE** | The stale overdrive/hiss path is removed, browser audio creation now fails safely across standard/WebKit/unavailable contexts, and `tests/e2e/pass66-audio-long-run.spec.ts` physically starts Solo/audio on all four arenas, samples the final compressed output at 2 and 32 seconds, then samples every second from 60 through 65 seconds. Every run measures the actual time-domain/spectrum output, rejects broadband high-frequency hiss, retains exactly the two intentional ambience oscillators and two spatial chains, keeps bounded buses and advancing frames, and requires zero page/runtime faults. Repeat this 4.3-minute gate on the frozen SHA. |
| One enemy bot in solo without changing hosted lobby choices | **CANDIDATE** | Runtime/catalog authority and the main served contract now agree on one initial solo bot, one→two escalation after ten defeats, and unchanged hosted-lobby selection. The stale two-bot test was corrected and 105 focused tests pass; the served browser case remains in the frozen-SHA queue. |
| Railgun multi-hit, exact 50 body damage, no crit, one-second large observer-visible beam/report, kill attribution and muzzle origin | **CANDIDATE** | The retained three-peer suite covers aligned victims, exact damage/deaths, one semantic beam/report and replay rejection. Re-run it on final SHA and inspect native presentation/audio. |
| Modern menu/options/lobby/post-match surfaces, Escape from in-match Options resumes play | **CANDIDATE** | Current HUD/menu code contains the reskin and lifecycle work. Complete viewport, focus, pointer-lock and no-lost-control matrix remains. |
| Honest Field Kit weapon stills, complete stats, cyclic DPS, recoil/range/penetration/wallbang and Custom inheritance | **CANDIDATE** | `src/ui/field-kit-weapon-presentation.ts` derives canonical metrics and binds model-backed stills; set-equality tests exist. Final truth/rounding, responsive layout and visual-identity review remain. |
| Killstreak menu spacing and hover/focus demo on the right | **CANDIDATE / OPEN MEDIA** | Layout and accessible poster rail exist and do not claim fabricated videos. The specifically requested unique real demo clip for every streak remains absent. |
| Hidden-tab map asset fetch/decode without hidden presentation frames | **CANDIDATE** | The frozen contract covers Atomic Acres, RustRig and Terminal separately, requiring each selected panorama and map-specific quality assets to fetch/decode while hidden CPU preparation continues. It forbids GPU/frame/audio/authority ticks and browser-throttling bypass. The exact-SHA background/foreground browser matrix remains. |
| Nuke Town/Terminal cold and warm starts, Terminal invisible walls, sniper/death freezes | **CANDIDATE** | Corrections and focused tests exist, but the owner reports are stability blockers until repeated native-WebGPU all-profile start/ADS/death loops pass with zero fault and Terminal collider ownership is enumerated. |
| Glass: knife/bullet/crossbolt/Railgun/explosion authority, breached aperture and inert fallen debris | **CANDIDATE** | A unified glass lifecycle and tests exist. All families/maps, late join/reset, collider/aperture equality and player traversal remain final gates. |

## Direct deterministic audit run

Two no-browser commands were run against the shared dirty worktree on 1 August:

1. A 21-file focused suite covering settings/adaptive quality, ordnance, interaction, support, authoritative shot/host time/lag compensation, network sync/chaos/fairness/lifecycle, private match, protocol and text chat: **21 files passed, 205 tests passed**.
2. `npx vitest run src/gun-range-test-bay.test.ts src/host-match-checkpoint.test.ts src/interaction-arbitration.test.ts src/killstreak-runtime.test.ts`: **4 files passed, 51 tests passed**.

The commands overlap in interaction and killstreak coverage, so the counts must not be added as if every test were unique. Neither command substitutes for browser, GPU, multiplayer or final-SHA evidence.

Subsequent current-worktree proof has closed several of those browser gaps: the unchanged Pass 63 text-chat/guest-rejoin/hosted-bot gate is green; a real Chromium host-renderer crash/reclaim converges the same room, identities, phases, remotes, bots and scores; Pass 61 authoritative netcode is 7/7 under event impairment; the six-page private-lobby gate reaches five remotes per page; reliable fallback/identity rejoin and the responsive multiplayer UI gate are green. The 1,000-seed clean/normal/adverse chaos matrix reports zero duplicate side effects. These runs still require one final repetition after the candidate is frozen.

A later focused multiplayer repair run on the same dirty candidate passes 8 files / 98 tests plus `tsc --noEmit`. Protocol v12 and checkpoint v3 cover two-phase admitted transport replacement, world-revision-gated repair, bot HP authority independent of replica freshness and compact host-owned guest magazine/reserve/grenade continuity. The final owned-production-topology Chromium case also passes with two real peers, actual depletion of two sniper rounds and one grenade, a host-renderer crash/rejoin, a fresh wrong-kit guest document and exact inventory/HP/loadout/railgun convergence. This is current-worktree evidence only, not owner approval or a frozen-SHA receipt, and the two-second checkpoint cadence still permits rollback of changes after the last successful checkpoint.

## Pass 63 netcode comparator

The immutable stable identity is:

- Released source: `1bd55076c952080d5f7a8a5b0b8869aaa0646a76`.
- Pages commit: `2201a606a8c9f83d441036eac07dc140bd7e63f5`.
- Route: `channels/experimental-netcode-pass`.
- Runtime set: 119 files.
- Runtime digest: `61666de694ea6bd62391c1e0661ffcc2864142bb569407c93a2ebdfd28031ce7`.
- Accepted preview source: `ac85e9b8b46cc2370aee903d564ecf3c4682b24c`.

The current candidate contains the released Pass 63 source as an ancestor. The useful functional spine is Pass 61 authoritative netcode `4fdc92b`, immutable authored bullet timelines `40cbff4`, host-authoritative room chat `51ad667`, then the released Pass 63 merge.

Current committed code has materially changed since Pass 63: across `authoritative-shot`, `network`, `private-match`, `protocol` and `remote-hit-admission` alone, the committed diff is 389 insertions and 61 deletions. Therefore ancestry is necessary but not sufficient.

Minimum retained comparator gate for the frozen HITL SHA:

- `src/authoritative-shot.test.ts`, `src/host-time.test.ts`, `src/lag-compensation.test.ts`, `src/network-sync.test.ts`, `src/network-chaos.test.ts`, `src/network-fairness.test.ts`, `src/private-match.test.ts`, `src/network-lifecycle.test.ts`, `src/protocol.test.ts`, `src/text-chat.test.ts`, `src/text-chat-ui.test.ts`.
- `npm run qa:pass61:netcode`, `npm run qa:network-chaos`, and `npm run qa:private-lobby`.
- `tests/e2e/pass63-text-chat.spec.ts` for host/guest chat, rejoin identity, hosted bots and reliable state-commit mirrors.
- New final-SHA browser scenarios: late guest join; guest crash/rejoin; host crash/reclaim while guest remains; bot state and scores before/after; loss/jitter/reorder/duplicate injection; room/map/match epoch equality; no duplicate authority or stranded lobby.

Do not restore Pass 63 by copying old network files into Pass 66. Use its immutable runtime and behavioral receipts as the comparator, then fix the newer path where a current gate diverges.

## Remaining release blockers and overnight critical path

Source implementations now exist for the gameplay families and crash-rejoin paths identified at audit start, but they are not release-verified. The canonical candidate gate still reports partial coverage and no exact-SHA artifact catalog, so crash/rejoin, loading and freeze regressions remain blockers until one clean candidate passes the retained matrices.

1. Repeat the currently green first-person arms/hands/knife/action gates on the frozen SHA, then obtain owner HITL acceptance.
2. Recapture the four menu/loading previews at the now-required native 2560×1440 profile and rebind their provenance; the shipped media is still 1280×720 and the production verifier currently fails.
3. Capture and finalize eleven unique real killstreak videos only after those visual dependencies are stable; the current poster-only manifest deliberately fails the final-video verifier.
4. Run the expanded native-WebGPU all-map sky/loading, M40/M14 ADS, Railgun, death/respawn, support-possession and endurance matrix.
5. Run the frozen-SHA multiplayer comparator matrix again; dirty-worktree local crash/rejoin, six-player lobby, reliable fallback, impairment and Pass 63 runs have reported green, but are not release receipts.
6. Real Firefox remains blocked before blank-page creation by this machine's compositor; obtain an independent real-browser HITL result rather than claiming a product pass or failure.
7. Dane's JSON is still external input and has not been supplied.
8. Freeze a clean exact SHA, run the complete release/asset/provenance matrix, launch an immutable local preview and obtain explicit owner HITL acceptance.

## 2 August independent forensic delta

This section records a fresh read-only check of current local refs, current bytes and executable gates. It supersedes stronger status wording elsewhere in this document when the two conflict.

### P0

1. **Canonical request normalization is complete, but completion evidence is not ready.** The correction ledger now ends at `HF-207`: consolidated `HF-191`–`HF-207` rows project the 1 August source through 47 atomized outcomes, 75 executable test contracts and all 99 planning requirements. The completeness graph has 206 `partial` nodes, one `complete` node and zero artifact entries. `npm run qa:pass65:owner-feedback:candidate` therefore still rejects the candidate because P0/P1 rows remain `OPEN`/`IMPLEMENTED`, coverage is partial and exact-SHA artifacts are absent. `acceptance/pass-66.json` does not exist.
2. **Multiplayer recovery remains a release blocker, not a completed fix.** The dirty-worktree implementation now includes protocol v12, checkpoint v3, two-phase admitted transport replacement, world-revision-gated repair, bot HP authority independent of replica freshness and compact host-owned guest inventory continuity; its focused 8-file / 98-test run and final owned-production-topology Chromium crash/rejoin case pass. There is still no clean-SHA `T-MULTIPLAYER-STABILITY`/Pass-63 comparator receipt in the owner artifact catalog, and the two-second checkpoint cadence can roll back post-checkpoint changes after a hard crash. The candidate prose above is implementation evidence only; frozen-SHA host crash, guest crash, late join, invalid/replayed credential, bot/score convergence and impairment runs remain mandatory.
3. **Loading/start/ADS/death stability remains unclosed.** The canonical ledger still leaves Atomic start, transition ownership, no-freeze candidate gating, global stability, hidden-tab preparation, Nuke Town/Terminal admission, sniper ADS and death/respawn rows open (`HF-001`, `HF-002`, `HF-003`, `HF-041`, `HF-138`, `HF-152`, `HF-186`, `HF-189`, `HF-190`). Dirty-tree focused successes do not close the required native-WebGPU cold/warm/endurance matrix.

### P1

1. **Menu/loading media is currently inconsistent and fails its own gate.** `src/ui/menu-preview-video.ts` declares 2560×1440 and cache family `pass66-runtime-preview-v5`, but all four shipped MP4/WebM pairs under `public/assets/original/menu-previews/` are still 1280×720. `npm run qa:pass65:menu-previews` fails with 105 issues, including stale schema/provenance, invalid rotor evidence, stale digests, wrong dimensions, absent BT.709 metadata, wrong H.264 level and insufficient bitrate. This is an actual missing deliverable, not merely owner taste review.
2. **Killstreak videos are absent.** `public/assets/original/killstreak-demo/` contains eleven 960×540 JPG posters plus a schema-1 poster manifest with `videoPath: null`; it contains no final clips. `npm run qa:pass66:killstreak-demo-videos` fails on the published-manifest identity. Keep this `OPEN MEDIA` until the frozen-source capture/finalization flow succeeds.
3. **Broad all-map/all-profile claims are authored but unexecuted.** The prone matrix enumerates every arena and three profiles in solo/two-peer mode, but explicitly refuses a dirty worktree and has no current receipt. The scoped ADS gate exercises RustRig only. The Gun Range bay browser case samples M14 and Chopper rather than every station. These are suitable final gates, not evidence that the universal claims already passed.
4. **Firefox and Dane diagnostics remain external unknowns.** Firefox fails before Atomic Acres page creation on this machine and cannot be counted as either product pass or product failure. Dane's multiplayer JSON is not present, so no claim derived from it has been tested.

### P2 / stale prose corrected

- The earlier divergent-ref row saying the arms pass remained `OPEN` was stale after the later authored arms/knife work; owner HITL and exact-SHA proof remain, but the implementation is present.
- The earlier overnight list saying the support-vehicle authoring pass still had to be finished was stale after the V4 vehicle files/evidence landed; the outstanding deliverable is the recaptured cockpit/menu media and owner review.
- No current Atomic Acres request was found only on a divergent ref. `git cherry` confirms the named Pass 65 corrective branches are patch-equivalent to current history, while the Qoder checkpoint `c827d76c1c7eb84923bd43c108034e49fe92e269` remains preserved as a non-ancestor audit source.
- No cross-project implementation was imported. The unrelated Sea Dragon/Azure Coil commit `55090261482b3de7950588772ad8036324f475a4` is not an ancestor of this candidate, and its Azure Coil paths are absent from the current tree. Harness names in repository process documentation are not gameplay requests.

No publish or stable-channel change is authorized. The candidate remains incomplete while a required visual, browser, exact-SHA or owner-acceptance row is open.
