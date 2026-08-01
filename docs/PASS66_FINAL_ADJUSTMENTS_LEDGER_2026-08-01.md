# Atomic Acres — Pass 66 final-adjustments ledger

Date: 2026-08-01  
Status: **ACTIVE CANDIDATE — NOT APPROVED, NOT PUBLISHABLE**

This is the single coverage ledger for the owner's final-adjustment report. A row is not complete because code exists or an older note says it is complete. `FIXED` means the current candidate has a focused mechanical regression. `CANDIDATE` means the latest integration branch contains a plausible implementation that still needs the stated current-SHA verification. `OPEN` means the requested result is absent or the owner has rejected the existing result.

## Release truth

- Public Pass 66 channel source: `ca24d4dbbc5c15491be7e7d32f5ce84ecb1f4fff`.
- Public Pages commit: `7c648793e5c4ce61b06572d980fb64413c0f11e2`.
- Latest recovered Pass 66 integration source: `eb813af228bd31fefce90ffaa1078372480328c0`.
- This candidate branch: `contrib/dave-gaming-pc/codex/pass66-final-adjustments-20260801`, based on `eb813af228bd31fefce90ffaa1078372480328c0`.
- The public Pass 66 channel is therefore missing hundreds of later integration commits. It remains untouched while this candidate is corrected and verified.
- Byte-exact Pass 63 remains the stable rollback. No replacement release is authorized by this ledger.

## Owner report coverage

| Area | Status | Current evidence / required next proof |
|---|---|---|
| M40 ADS blanks/whites out | **FIXED** | Scope mode forced every HUD child to full opacity, including the full-screen death/respawn fade. The candidate removes that override. `pass66-scoped-ads-regressions.spec.ts` rejects opaque white and black centre layers and proves frame advance at 2560×1440 and 3840×2160. |
| All guns use the same little red ADS circle | **FIXED** | `ads-sight-profile.ts` projects a catalog-complete, distinct ADS marker signature for every canonical weapon. Unit set-equality/uniqueness and served centre-ray coverage are present. Full native-WebGPU visual review remains required before owner approval. |
| M14 EBR freezes on ADS | **CANDIDATE** | The post-live integration prewarms the M14 thermal pipeline. The current focused Chromium/WebGL2 run enters and leaves M14 ADS at 1440p and 4K with advancing frames. Native-WebGPU cold/warm all-map/profile tails remain a release gate. |
| Railgun lost its through-wall scope | **CANDIDATE** | Post-live source restores the cyan hostile silhouette reveal and keeps it active across firing. Re-run the retained three-peer railgun gate on the final SHA. |
| Field Kit custom cards unreadable until hover | **FIXED** | Persistent Custom 1/2/3 cards now have a dark high-contrast base, readable labels/stats/DPS and selected state without hover. Unit and Chromium menu tests pass; 1600×900 evidence captured. |
| Weapon pickup then re-pick swapped weapon | **CANDIDATE** | Post-live integration contains the death-drop re-pick correction; focused death-drop/pickup tests pass. Re-run the complete served pickup path, including RustRig crates, on final SHA. |
| Arms/hands/knife too small or poor at 1440p/4K | **OPEN** | A post-live resolution-aware scale correction exists, but the owner rejects the result. Requires a new Blender rig/weight/action authoring pass and 1080p/1440p/4K/ultrawide action contact sheets—not another FOV-only adjustment. |
| Prone/wall/floor viewmodel clipping | **CANDIDATE** | Clearance/retreat logic and prone physics tests pass. Owner-visible all-map hip/ADS/reload/melee near-floor/wall captures remain required. |
| Chopper/care/carpet silhouettes and Apache-level detail | **OPEN** | Post-live source upgrades the attack-helicopter family and current asset gates exist, but the requested panel-level fidelity is a further authored Blender pass. Do not label the present model owner-approved. |
| Chopper Gunner does no damage | **VERIFIED CANDIDATE** | Current two-peer authoritative browser gate passes: chopper/drone damage reaches the remote victim and occluded hits are rejected. This correction is not in the older live source. |
| Piloted Drone/Chopper instruction too large | **CANDIDATE** | Post-live HUD uses the existing wording in a compact top banner below the match console. Current-SHA 1440p/4K overlap captures are still needed. |
| Killstreak descriptions | **CANDIDATE** | Canonical loadout panel contains one plain-language description for every selectable streak. Needs final catalog set-equality and viewport capture. |
| Killstreak grey-room gallery thumbnails | **OPEN** | The reference image is retained at `docs/assets/pass66-owner-references/grey-demo-room-killstreak-reference.png`; no real demo-stage implementation or locally hosted demo corpus exists. |
| Gun Range tunnel, five-second corridor, secure thump door, large test bay, slow unarmed dummies, all weapons/supports | **OPEN** | No implementation found. This is a new arena-side feature with navigation, collision, door/audio, dummy authority, support test policy and deterministic capture requirements. |
| Flamethrower on top of RustRig halfway through match | **OPEN** | No canonical weapon/protocol/bot/audio/GLB/provenance implementation found. Spawn timing must only be added after the full weapon family passes catalog and release gates. |
| Flare gun in Terminal aircraft halfway through match | **OPEN** | Same catalog/protocol/asset gap as flamethrower; no partial fake weapon will be shipped. |
| Skybox quality across every map / Acres sky still poor | **OPEN** | Post-live source contains a sky-backdrop correction, but the owner rejects the visual quality. Needs one arena-definition-driven sky pass with deterministic review cameras, seam/block/floating-asset checks and WebGPU/WebGL2 parity. |
| RustRig big volatile physical waves | **OPEN** | Current source has rolling ocean presentation, not an owner-approved large physical-wave system. Gameplay/collision authority and GPU budgets must be decided before adding displacement physics. |
| Loading stalls, half-load then instant second Join | **PARTIAL FIX** | WebKit visibly showed the preview poster but never released asset preparation because `loadeddata`/`playing` did not fire. The poster now counts as a valid first presented frame, allowing preparation to proceed while video may upgrade later. Chromium and WebKit deploy-to-active smokes pass. Native WebGPU endurance and real Firefox remain outstanding. |
| Chrome/Firefox/Edge/Safari compatibility | **PARTIAL FIX** | Chromium and WebKit WebGL2 deploy-to-active tests pass. The bundled Firefox 151 runner crashes before creating a page with `RenderCompositorSWGL failed mapping default framebuffer`; no Firefox app failure can yet be inferred from that harness crash, and Firefox support is not verified. Edge uses the Chromium path but still needs an installed-Edge smoke. |
| Client/player and host/server stack traces | **CANDIDATE** | Bounded full client stack traces are captured into the local technical match JSON for host and guest browser roles; a short trace is also shown in the live runtime error panel. Uploaded diagnostics deliberately exclude stacks. Cloudflare/Peer signalling service-side stacks require separate provider logging and privacy policy. |
| Host crash then rejoin / stuck lobby | **CANDIDATE** | Post-live source adds persistent room identity, host-room reclaim and an explicit rejoin action. Focused identity tests pass; real host-tab crash/reclaim plus guest convergence must run on final SHA. |
| Guest crash/rejoin and late-join desync | **CANDIDATE** | Post-live source includes rejoin resync and the Pass 61 authoritative netcode path. Must run multi-peer loss/jitter/reorder and reconnect matrix; no chat-only claim of convergence. |
| Host can easily change map in lobby | **CANDIDATE** | Post-live host-authoritative lobby map control exists. Needs host/guest served UI capture and arena-generation equality on final SHA. |
| Adrenaline Rush corrupts host lobby | **CANDIDATE** | Post-live source resets Adrenaline state across lobby/match epochs. Needs a host/guest rematch/rejoin regression. |
| Bots only work for host / guests cannot see results | **CANDIDATE** | Post-live source replicates hosted bot snapshots and authoritative results to guests. Re-run the two-peer hosted-bot parity gate. |
| Hosted bots differ from skirmish | **OPEN REVIEW** | A post-live balance correction exists, but parity needs a declared shared behavior contract plus host/guest/skirmish traces. Visual similarity alone is insufficient. |
| Slight orange highlight on other multiplayer players | **CANDIDATE** | Post-live source contains the requested remote-player highlight. Needs team/FFA/readability captures and no-through-wall proof. |
| Lobby and in-game chat clearer/better placed | **CANDIDATE** | Post-live chat is larger and bottom-left with lobby/history/rejoin support. Needs overlap matrix at 720p, 1080p, 1440p, 4K and ultrawide. |
| Dane multiplayer JSON | **INPUT NEEDED** | The file is not in the repo or this task. Preserve the raw JSON locally, redact identity/free text, then compare its cadence/desync/shot/rejoin fields against the current diagnostics schema. |
| Shed door | **DEFERRED BY OWNER** | Explicitly excluded from this correction wave. |

## Verification run in this candidate

- AKP/pipeline contributor preflight: pass.
- TypeScript `tsc --noEmit`: pass.
- Focused unit suite covering ADS profiles, menu contrast, rejoin identity, hosted lobby, prone physics, pickups, exception logs and support catalog: pass.
- Field Kit Chromium UI: pass, 4 tests.
- M40/M14 1440p + 4K scoped regression: pass.
- Chopper/drone two-peer authoritative damage gate: pass.
- Chromium WebGL2 deploy-to-active capability smoke: pass.
- WebKit WebGL2 deploy-to-active capability smoke: pass after poster-gate correction.
- Firefox: harness blocked before page creation by the Playwright Firefox compositor; not counted as a product pass or failure.

## Release blockers

1. Owner-rejected art remains open: skies, arms/hands/knife/actions, helicopter fidelity and RustRig waves.
2. Grey-room/test-bay and both new weapon families are absent.
3. Representative native-WebGPU start/endurance, scoped-switch and multiplayer reconnect/desync gates have not run on the final SHA.
4. Firefox and installed Edge have no real-browser pass.
5. Dane's diagnostic JSON has not been supplied.
6. No Pass 66 acceptance record or immutable preview receipt authorizes production promotion.

