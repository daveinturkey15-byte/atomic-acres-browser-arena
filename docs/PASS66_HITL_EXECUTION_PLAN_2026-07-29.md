# Pass 66 Release Execution Plan

Status: **IN DEVELOPMENT — OWNER AUTHORIZED PROTECTED PUBLICATION WHEN THE EXACT CANDIDATE IS GREEN**

Baseline: `7c57f0bcdedd66236767a4e7e92afabf2769506e`  
Integration branch: `contrib/dave-gaming-pc/codex/pass66-integration`  
Feedback contract: `HF-001` through `HF-160`  
Target outcome: one clean immutable Version 66 candidate promoted as `The Big One`, with byte-exact Pass 63 retained as Stable.

## 1. Release boundary

- Pass 63 remains the byte-exact Stable rollback.
- Pass 65 is superseded and its draft PR is closed. Its exact branch/SHA remains audit evidence only and may not be promoted.
- Pass 66 contains every correction after the inspected Pass 65 SHA and is the sole live candidate.
- Dave explicitly removed the discretionary HITL feedback round and authorized protected publication when Pass 66 is complete and green. This does not authorize a fabricated/backdated acceptance receipt, a weakened exact-SHA gate or a manual Pages push.
- The integrator freezes the final immutable Pass 66 SHA, records only truthful acceptance evidence permitted by the repository contract, and uses the protected workflow. After the immutable preview exists, a process-only acceptance update may bind Dave's standing conditional instruction to that exact green SHA at the real binding time; it must explicitly avoid claiming that Dave inspected that preview. No new subjective review round or owner interaction is required.
- No specialist may edit `main`, `gh-pages`, Pass 63 artifacts, production workflow receipts or release metadata.

## 2. Priority law

1. Crash, freeze, frame-tail, focus and loading lifecycle.
2. Authoritative gameplay correctness: interaction input, collision, glass, smoke, flash, bots, support and destruction.
3. First-person arms and contact quality.
4. Hero models, cockpit/video fidelity and modern readable UI.
5. Bounded cleanup only after measured behavior is green.

A later visual improvement never excuses a P0 regression. Averages never hide severe frame tails. A visible effect never substitutes for host authority.

## 3. Current observations

- Hidden tabs currently call almost the entire game `frame()` every 50 ms while skipping only final presentation.
- Visible-but-unfocused presentation can continue, and focus plus visibility restoration can reset pacing twice.
- Menu startup begins full shared, weapon and world asset preparation immediately; individual GLTF parse/model-construction work can block the preview decoder and input.
- The 38 FPS report occurred while the RTX 5080 showed roughly 18% utilization and about 2.6 GB VRAM use; CPU samples were roughly 62–77% with sufficient free memory. Other desktop work costs headroom, but the low GPU occupancy and common plateau point first to CPU/main-thread scheduling, prewarm and lifecycle work.
- Production arms satisfy structural checks but remain low-poly procedural geometry with poor hand anatomy and contact.
- The existing DJMaesen CC-BY-4.0 candidate is a possible authored foundation but currently fails finger, support-hand and weapon-contact gates.
- Preview architecture already uses one prerecorded selected decoder and posters; current media is 960×540 at 24 FPS. A bounded 1280×720 at 30 FPS upgrade is feasible without restoring live menu rendering.
- Ambient audio loops a short broadband procedural buffer and does not consume the declared arena modulation values, making the reported hiss plausible.
- The accepted Railgun world beam begins 2.4 m ahead of the shooter for camera safety, causing a weak muzzle creation point.

## 4. Inferences, assumptions, unknowns and falsifiers

### Inferences

- The flat 38 FPS behavior is more likely main-thread or scheduler pressure than raw GPU saturation.
- Loading-video jutter can persist even with prerecorded video if GLTF parsing and pipeline preparation compete on the same main thread.
- The crossbow/window failure is a shared material/projectile lifecycle defect until proven otherwise, not a crossbow-only visual bug.
- Bot smoke and flash failures require one shared perception authority; aim spread alone would conceal continued wallhacking.

### Frozen assumptions

- `30% of current` binds the standalone manual drone's inspected 10 m/s value to 3 m/s; autonomous remains 6 m/s. Drone Swarm speeds remain separate.
- `one bot` applies to solo skirmish on every bot-enabled arena. Hosted choices remain unchanged.
- Tap `F` means release before 1,000 ms; support hold commits at 1,000 ms. A press pins candidates and may commit exactly one action.
- Smoke lifetime is deterministically sampled from five to ten seconds and replicated; colour is one bounded readable palette selection per activation.
- A single admitted grenade must cause major shed collapse; a Carpet Bomber strike must obliterate it within persistent-debris budgets.
- Browser background work means fetch/decode/preparation where Chromium permits. It does not mean hidden rendering or a guaranteed hidden-tab FPS.

### Unknowns to measure

- Whether the 38 FPS plateau reproduces on a clean idle desktop after removing hidden full-frame work.
- Which GLTF parse or compile slices dominate cold menu and deploy latency.
- Whether preview audio, arena air, support beds or duplicate lifecycle nodes produce the reported hiss.
- Whether current prone clipping originates in capsule/eye interpolation, floor authority, camera near plane or viewmodel offsets.
- Whether the DJMaesen candidate can pass the contact matrix within the overnight window without unsafe provenance or runtime fallback.

### Hard falsifiers

- Any crash, device loss, unhandled rejection or browser page termination.
- Any steady-state frame over 100 ms; repeated frames over 50 ms; a foreground return that remains cadence-limited.
- Any hidden WebGPU presentation submission.
- Any duplicate arena root, prewarm generation, audio source, `F` action, projectile result or support reward.
- Any visual/collision mismatch across Performance, Quality and Max.
- Any bot firing during full admitted flash blindness or precise continuous tracking through blocking smoke.
- Any crossbow pass through intact glass without the same tick admitting a breach.
- Any intact-looking glass pane that has detached collision, or detached-looking pane retaining intact collision.

## 5. Work lanes

### Lane A — scheduling, loading and frame pacing

Owned outcomes: `HF-002`, `HF-003`, `HF-041`, `HF-064`, `HF-065`, `HF-098`, `HF-115`, `HF-118`, `HF-121`, `HF-124`, `HF-138`, `HF-151`, `HF-152`, `HF-156`.

- Extract a pure scheduling lifecycle with foreground presentation, minimal hosted authority and paused offline modes.
- Never call the complete visual frame while hidden or ineligible.
- Coalesce focus and visibility into one recovery generation.
- Bound regain deltas and clear stale input/audio once.
- Replace eager menu prewarm with a generation-aware, sliced priority coordinator.
- Present the first decoded preview frame before background asset preparation.
- Escalate the same preparation generation on Deploy; never launch a duplicate.
- Make Escape from active-match Options return to active play after one settings transaction.
- Add clean-idle and loaded profile trials, real background-throttling tests and mixed gameplay stress.

### Lane B — interaction, drones and support

Owned outcomes: `HF-017`, `HF-045`–`HF-055`, `HF-060`, `HF-077`–`HF-082`, `HF-090`, `HF-116`, `HF-125`, `HF-127`, `HF-129`–`HF-132`, `HF-142`–`HF-144`, `HF-149`.

- Implement one pure `F` press reducer and one runtime integration point.
- Pin tap and hold candidates at keydown; render support hold progress; cancel every stale lifecycle.
- Correct the full drone keyboard, pointer and gamepad sign path end to end.
- Bind standalone manual/autonomous speeds to 3/6 m/s without changing Swarm calibration.
- Preserve 24-unit centred Swarm deployment and enforce separation during same-target engagement.
- Keep Carpet Bomber target, red X, direction corridor, aircraft axis, payload and reward consumption in one state machine.

### Lane C — destruction, materials and projectiles

Owned outcomes: `HF-033`–`HF-039`, `HF-095`, `HF-096`, `HF-136`, `HF-154`, `HF-155`, `HF-157`, `HF-158`.

- Recalibrate shed thresholds from explicit weapon/explosive profiles rather than presentation impulses.
- Make door/support/panel detachment one structural state machine with collider and prompt parity.
- Retain bounded sleeping major debris; never disappear gameplay-significant structure by profile.
- Add canonical glass states and damage profiles for knife, bullet and explosion.
- Resolve projectile-versus-glass ordering before bolt integration and replication.
- Audit prone capsule, eye, floor and viewmodel clearances on all maps/profiles.

### Lane D — smoke, flash, bots and match catalog

Owned outcomes: `HF-019`, `HF-020`, `HF-033`, `HF-061`, `HF-062`, `HF-089`, `HF-145`, `HF-146`, `HF-159`, `HF-160`.

- Freeze one host smoke volume contract for colour, radius, lifetime, corridors, human LOS and bot queries.
- Feed authoritative corridors to bounded WebGPU presentation.
- Give bots confidence/accuracy/fire gating from the same density ray.
- Give bots a host-owned flash-blind state with facing, distance, cover, target-lock break and bounded recovery.
- Change solo initial bots through the arena catalog and project it into labels, tests and performance scenarios.

### Lane E — arms, hero assets, previews and audio

Owned outcomes: `HF-008`–`HF-011`, `HF-015`, `HF-021`–`HF-026`, `HF-044`–`HF-050`, `HF-056`, `HF-072`–`HF-076`, `HF-109`, `HF-110`, `HF-128`, `HF-133`–`HF-135`, `HF-141`, `HF-153`.

- Attempt the licensed authored arms route behind all provenance and contact gates.
- Cover M4A1, MP5, pistol, crossbow, knife and Railgun across hip, ADS, fire, reload, sprint and melee.
- If authored arms remain below the gate, expose them only on an explicit QA route and do not silently regress the candidate.
- Upgrade previews to bounded 720p30 dual encodes while preserving one decoder, posters and zero menu renderer submissions.
- Refine the cockpit toward black structural rails, compact lower instruments, restrained green HUD and an unobstructed sightline.
- Use perspective-aware rotor arcs/hub blur rather than flat crossed rotor cards.
- Isolate preview audio, shape arena air per map and add spectrum/lifecycle evidence.
- Add a separate muzzle-socket Railgun launch bloom/bridge while retaining the camera-safe world beam.

### Lane F — HUD, field kit and killstreak gallery

Owned outcomes: `HF-005`–`HF-007`, `HF-027`–`HF-031`, `HF-057`–`HF-059`, `HF-063`, `HF-103`–`HF-108`, `HF-111`–`HF-114`, `HF-117`, `HF-122`, `HF-123`, `HF-147`, `HF-148`, `HF-150`, `HF-151`.

- Add one scoped Version 66 visual layer after existing CSS; avoid an overnight shell rewrite.
- Preserve the typed surface registry and every multiplayer/accessibility/diagnostic action.
- Enforce player-facing floors: metadata 11–12 px, body 13–14 px, actions 14–16 px, critical match values at least 14 px and usually larger.
- Use graphite tactical surfaces, calm cyan/amber signals, fewer white borders and stronger grouping.
- Open Custom slots into a large editor whose facts derive from the weapon/grenade catalogs.
- Use deterministic offline beauty renders for assets; never instantiate another live menu WebGPU renderer.
- Build the killstreak gallery from the canonical catalog with honest video/poster state.

## 6. Integration order

1. Commit this process-only ledger/rules baseline.
2. Branch isolated specialist worktrees from that exact commit.
3. Integrate Lane A first; no visual lane may mask a lifecycle failure.
4. Integrate authority lanes B–D with focused unit and two-peer evidence.
5. Integrate arms/assets/audio and then UI styling.
6. Run catalog mutations, static/type/build, all focused suites and responsive visual checks.
7. Run real installed-Chrome all-map native-WebGPU endurance and frame-tail trials on a clean idle machine.
8. Freeze one exact candidate SHA and build manifest.
9. Create and serve the immutable preview, then bind the already-recorded standing conditional publication instruction to that exact SHA in a process-only acceptance update without representing it as owner preview testing.
10. Require the corrected owner-feedback candidate gate and all five protected PR/main checks, promote only through `release-production`, and verify Pass 66 Live plus the byte-exact Pass 63 Stable channel on the canonical HTTPS site.

## 7. Minimum mechanical gate

- `npm run pipeline:preflight -- --machine dave-gaming-pc --harness codex`
- `npm run lint`
- `npm run build`
- `npm run qa:pass65:owner-feedback`
- Focused unit suites for every changed authority and presentation module.
- HUD/menu, menu lifecycle, support visual, smoke, flash, bots, destructible, Railgun and profile-authority E2E suites.
- Frame-pacing policy, cold admission, endurance, real focus/background recovery and 2560×1440 native-WebGPU stress.
- Production asset, weapon, arms, support vehicle, preview media and provenance gates.
- Responsive captures at desktop, laptop, ultrawide, narrow and high-DPI plus live HUD, lobby return and match end.

No P0 or P1 moves from `IMPLEMENTED` to `VERIFIED` without exact-SHA evidence. Dave has waived a further subjective HITL feedback round for Pass 66 only; that waiver changes neither evidence state nor the requirement for deterministic visual gates.
