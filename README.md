# Atomic Acres

A polished, original near-future agritech browser arena FPS with three readable combat routes, fast respawns, four field kits, repeatable field support, bot skirmishes and peer-to-peer multiplayer.

> **Original fan project:** this repository does not include Activision branding, game code, textures, models, audio, or extracted map geometry. The layout and procedural art are original while pursuing the quick, close-quarters suburban-arena feel Dave requested.

## Play

1. Open the deployed site in a desktop Chromium/Firefox browser.
2. Enter a callsign and choose **Aqua** or **Coral**.
3. Choose:
   - **Bot Skirmish** for an offline match with bots.
   - **Host Lobby** to open a human-only waiting room and generate a room code/invite link.
   - **Join** after opening an invite link or pasting a room code.
4. In a private lobby, the host chooses **Team Deathmatch** or **Free For All**, a four- or six-player capacity, and optional team auto-balance. Everyone marks ready; only the host can start.
5. Click the game view to capture the mouse after the synchronized deployment countdown.

### Controls

| Input | Action |
|---|---|
| WASD | Move |
| Shift | Sprint |
| Space | Jump |
| Mouse / RMB / LMB | Aim / ADS / fire |
| R | Reload |
| C / Z or Ctrl | Crouch / prone |
| V / G / F | Knife / frag / interact with weapon drop |
| 1 / 2 | Field-kit primary / sidearm |
| Tab | Field roster |
| Esc | Release pointer / pause panel |

## Multiplayer architecture

The host browser is an authoritative lightweight relay over PeerJS/WebRTC. Static files can therefore run on free hosting without a paid game server.

- Private multiplayer is human-only: four-player rooms reject a fifth connection, while six-player rooms support one host plus five guests. Bots remain exclusive to Bot Skirmish.
- A reliable, ordered event lane carries lobby control, match start, combat, scores, pickups and world changes. Guest firearm triggers are host-resolved shot requests with idempotent results; guest hit claims do not apply firearm damage.
- A separate unordered movement lane uses `maxRetransmits: 0`; snapshots adapt among exact 20, 30 and 40 Hz tiers under measured pressure.
- Four cadence layers stay independent: display presentation, fixed-step simulation, adaptive movement snapshots and weapon-authored fire events. Remote movement is bounded pose estimation from timestamped snapshots, not exact reconstruction.
- Interpolation delay adapts smoothly from snapshot interval, measured jitter and repeated underruns inside cadence-specific bands: 20 Hz = 80–120 ms, 30 Hz = 60–90 ms and 40 Hz = 40–70 ms. Diagnostics expose the chosen delay and target-view rewind headroom beneath the rare 250 ms ceiling.
- Guests connect only to the host. The host binds messages to admitted player identities, owns lobby settings/readiness/start time and score replication, and suppresses a guest's own movement echo.
- The synchronized match epoch is estimated from host clock probes, so every browser derives countdown and remaining time from the same host-owned timeline.
- A 30-second reservation and browser-local resume token allow a reloaded guest to reclaim the same identity and recover an active match. Host loss still ends the session; host migration is intentionally out of scope.
- Invite links prefill the room code; `autojoin=1` is available for automated smoke testing. Room codes are unlisted invitations, not account/password authentication.
- The default public PeerJS service provides signalling, not TURN relay. Restrictive NATs, VPNs, firewalls, symmetric NAT or blocked UDP can still prevent a connection; add TURN only if real multi-household testing demonstrates that need.

This remains a friendly-session architecture, not cheat-resistant ranked netcode. The host validates and owns match/lobby state and resolves immutable per-bullet requests from bounded pose history: shooter origin at authored fire time, remote targets at authored target-view time, and stale requests rejected rather than clamped onto old poses. Movement remains host-admitted rather than fully host-simulated.

## Callsigns and persistent records

- Deployment is blocked until the player enters a valid 1–16 character callsign.
- The callsign and top 20 completed-match records use stable, versioned same-origin browser storage, so they survive asset-hashed build updates on the same site and remain available if the network service is unavailable.
- Records rank match kills first, then best streak, fewer deaths and victory.
- Same-origin tabs update live through `BroadcastChannel`; active PeerJS players exchange bounded leaderboard snapshots on join and new records at match end.
- When `VITE_GLOBAL_LEADERBOARD_URL` is configured, season-scoped personal-best streaks are also read from and submitted to the separately deployed Cloudflare Worker/D1 service. The Worker validates origin, payload bounds, idempotency and rate limits; browser-local and peer-carried records remain the offline fallback.
- The global service is shared and persistent, but it is not cheat-resistant ranked authority because the browser still reports its result. Competitive public play would require server-owned simulation and hit validation.

## Rendering and performance

Pass 28 adds **Atomic Signal**, one bounded full-screen post-process that keeps the authored scene in linear HDR, then applies the same ACES filmic response used by the direct renderer plus restrained contrast, route-aware shadow/highlight tint, dithering, a soft vignette, and optional five-tap sharpening in Quality Graphics.

- **Performance:** one source sample, no sharpening, 0.75 initial pixel ratio, adaptive quality, no shadows.
- **Quality Graphics:** five source samples, restrained sharpening, authored environment and static shadows. The internal `blender` profile ID remains supported for saved settings and old links.
- **Compatibility:** bypasses Atomic Signal and uses the direct ACES renderer.
- Detected software rasterizers such as SwiftShader, llvmpipe, WARP and Microsoft Basic Render Driver also use direct ACES by default so post-processing cannot collapse already-limited frame pacing. `?signal=on` is the explicit QA override; `?signal=off` is the deterministic direct-render baseline.
- The render target and first output frame are validated; an incomplete framebuffer, shader-black output, or runtime post-process exception falls back to direct rendering.
- Runtime material auditing keeps albedo/emissive maps in sRGB, data maps linear, anisotropy profile-bounded, dark non-protected surfaces readable, and PBR values within restrained limits.
- The live FPS counter is always anchored in the top-right during gameplay. Its cadence, active profile, render-target dimensions, shader health, texture-sample count and material corrections are available in the debug snapshot.

See `docs/PASS28_ATOMIC_SIGNAL_RENDER_SPEC_2026-07-17.md` for the exact color-space contract and verification evidence.

## Local development

```bash
npm ci
npm run dev
```

Open `http://localhost:5173`.

## Verification

```bash
npm run lint
npm test
npm run build
npm run preview

# Against a running preview and PeerServer:
QA_BASE_URL=http://127.0.0.1:4180/ QA_PEER_PORT=9000 npm run qa:multiplayer
QA_BASE_URL=http://127.0.0.1:4180/ QA_PEER_PORT=9000 QA_MULTIPLAYER_CYCLES=3 npm run qa:multiplayer:lifecycle
QA_BASE_URL=http://127.0.0.1:4180/ QA_PEER_PORT=9000 npm run qa:private-lobby
```

Current release and verification documentation:

- [`docs/INDEX.md`](docs/INDEX.md) — canonical documentation map and historical-pass boundary.
- [`src/changelog.ts`](src/changelog.ts) — player-facing production release ledger; exact public-promotion times are added only after successful deployment.
- [`docs/PASS52_RECONCILED_MULTIPLAYER_CHANGELOG_SPEC_2026-07-21.md`](docs/PASS52_RECONCILED_MULTIPLAYER_CHANGELOG_SPEC_2026-07-21.md) — retained multiplayer and changelog foundation, superseded where newer scoped contracts and executable tests differ.
- [`docs/VERIFICATION_AND_RELEASE_HYGIENE.md`](docs/VERIFICATION_AND_RELEASE_HYGIENE.md) — local/CI gates, portability, provenance, and legal-distinction rules.
- [`docs/CONTRIBUTION_AND_RELEASE_PIPELINE.md`](docs/CONTRIBUTION_AND_RELEASE_PIPELINE.md) — mandatory multi-machine contribution, integration, and production-promotion contract.

The automated private-lobby gate uses isolated browser contexts and checks the initial four-player room, capacity-four overflow rejection, real six-player admission/start, TDM auto-balance, FFA settings, shared match epoch/timer, zero bots, event/state channel properties, ping samples, self-echo suppression and active-match reload recovery. This is strong local topology evidence, not a six-household WAN/NAT guarantee.

Before release, also run a real multi-device or multi-household smoke test:

1. Host a room on one device/network.
2. Open the invite on the other devices/networks.
3. Confirm roster/settings/readiness, synchronized start, movement, combat, disconnect grace and reload recovery.

## Free hosting

`vite.config.ts` uses `base: './'`, so the production `dist/` works from a GitHub Pages project subpath or any static host.

### GitHub Pages

This repository publishes the built `dist/` folder to a dedicated `gh-pages` branch. Normal production promotion is serialized through the `release-production` GitHub Actions workflow using an exact green `main` SHA.

Direct `npm run deploy` is recovery-only. Contributors and ordinary agent tasks must not run it; follow `docs/CONTRIBUTION_AND_RELEASE_PIPELINE.md`.

GitHub Pages remains configured as **Deploy from a branch → `gh-pages` / root**. The production workflow is the only normal writer to that branch.

## Design notes

The arena combines deterministic original Blender-authored GLB assets with generated Three.js presentation and canvas textures:

- two asymmetric retro houses with traversable ground-floor lanes;
- central coach, moving truck and cover props;
- `VERDANT ARRAY`, `CIVIC TRANSIT` and `HELIO SERVICE` route identities;
- greenhouses, irrigation, solar/battery service hardware, fences, garages, backyards, operators, signage and authored sunset lighting;
- four original field-kit primaries and issued sidearms with distinct cadence, recoil, spread and audio;
- 5-minute team deathmatch, first team to 25 eliminations.

No external runtime assets are required except optional Google Fonts; system fallbacks keep the game usable if font loading is blocked.
