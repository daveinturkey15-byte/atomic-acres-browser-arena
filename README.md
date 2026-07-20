# Atomic Acres

A polished, original near-future agritech browser arena FPS with three readable combat routes, fast respawns, four field kits, repeatable field support, bot skirmishes and peer-to-peer multiplayer.

> **Original fan project:** this repository does not include Activision branding, game code, textures, models, audio, or extracted map geometry. The layout and procedural art are original while pursuing the quick, close-quarters suburban-arena feel Dave requested.

## Play

1. Open the deployed site in a desktop Chromium/Firefox browser.
2. Enter a callsign and choose **Aqua** or **Coral**.
3. Choose:
   - **Bot Skirmish** for an offline team match.
   - **Host Lobby** to generate a room code and invite link.
   - **Join** after opening an invite link or pasting a room code.
4. Click the game view to capture the mouse.

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

The host is a lightweight relay over PeerJS/WebRTC. Static files can therefore run on free hosting without a paid game server.

- Host and guests exchange validated, bounded protocol messages.
- Player snapshots are interpolated on peers.
- Shots, damage, deaths, respawns, team scores and disconnects are relayed through the host.
- Versioned high-score records persist in the browser and merge with current-lobby peers through bounded protocol messages.
- Invite links prefill the room code; `autojoin=1` is available for automated smoke testing.
- The default public PeerJS signalling service is used. Strict corporate/mobile NATs may require a TURN-backed PeerJS deployment later.

This is a friendly-session architecture, not cheat-resistant competitive netcode. Clients currently report hits; a future public-ranked version should use host-authoritative rewind validation.

## Callsigns and persistent records

- Deployment is blocked until the player enters a valid 1–16 character callsign.
- The callsign and top 20 completed-match records use stable, versioned same-origin browser storage, so they survive asset-hashed build updates on the same site.
- Records rank match kills first, then best streak, fewer deaths and victory.
- Same-origin tabs update live through `BroadcastChannel`; active PeerJS players exchange bounded leaderboard snapshots on join and new records at match end.
- This serverless leaderboard is durable per browser and peer-carried between players who meet. It is not a tamper-resistant global ladder; that would require a separately deployed authoritative HTTPS backend.

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
```

The test suite covers collision sliding/bounds, deterministic gameplay, framerate-independent interpolation, mandatory callsigns, continuous streak/reward-cycle separation, persistent-score validation, protocol admission and malformed-message rejection. A real two-peer browser smoke test should also be run before each release:

1. Host a room in one tab.
2. Open the invite in another tab/profile.
3. Confirm both roster entries, movement replication, firing, damage, death, respawn and disconnect cleanup.

## Free hosting

`vite.config.ts` uses `base: './'`, so the production `dist/` works from a GitHub Pages project subpath or any static host.

### GitHub Pages

This repository publishes the built `dist/` folder to a dedicated `gh-pages` branch, which avoids requiring GitHub Actions workflow-token permissions.

```bash
npm run deploy
```

The first deployment enables **Settings → Pages → Deploy from a branch → `gh-pages` / root**. Later deployments only need the command above.

## Design notes

The arena combines deterministic original Blender-authored GLB assets with generated Three.js presentation and canvas textures:

- two asymmetric retro houses with traversable ground-floor lanes;
- central coach, moving truck and cover props;
- `VERDANT ARRAY`, `CIVIC TRANSIT` and `HELIO SERVICE` route identities;
- greenhouses, irrigation, solar/battery service hardware, fences, garages, backyards, operators, signage and authored sunset lighting;
- four original field-kit primaries and issued sidearms with distinct cadence, recoil, spread and audio;
- 5-minute team deathmatch, first team to 25 eliminations.

No external runtime assets are required except optional Google Fonts; system fallbacks keep the game usable if font loading is blocked.
