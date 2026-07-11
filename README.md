# Atomic Acres

A polished, original retro-future browser arena FPS with a compact two-house test-town layout, fast respawns, three weapons, practice targets and peer-to-peer multiplayer.

> **Original fan project:** this repository does not include Activision branding, game code, textures, models, audio, or extracted map geometry. The layout and procedural art are original while pursuing the quick, close-quarters suburban-arena feel Dave requested.

## Play

1. Open the deployed site in a desktop Chromium/Firefox browser.
2. Enter a callsign and choose **Aqua** or **Coral**.
3. Choose:
   - **Train Solo** for an offline target drill.
   - **Host Lobby** to generate a room code and invite link.
   - **Join** after opening an invite link or pasting a room code.
4. Click the game view to capture the mouse.

### Controls

| Input | Action |
|---|---|
| WASD | Move |
| Shift | Sprint |
| Space | Jump |
| Mouse | Aim/fire |
| R | Reload |
| 1 / 2 / 3 | Carbine / SMG / scattergun |
| Tab | Field roster |
| Esc | Release pointer / pause panel |

## Multiplayer architecture

The host is a lightweight relay over PeerJS/WebRTC. Static files can therefore run on free hosting without a paid game server.

- Host and guests exchange validated, bounded protocol messages.
- Player snapshots are interpolated on peers.
- Shots, damage, deaths, respawns, team scores and disconnects are relayed through the host.
- Invite links prefill the room code; `autojoin=1` is available for automated smoke testing.
- The default public PeerJS signalling service is used. Strict corporate/mobile NATs may require a TURN-backed PeerJS deployment later.

This is a friendly-session architecture, not cheat-resistant competitive netcode. Clients currently report hits; a future public-ranked version should use host-authoritative rewind validation.

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

The test suite covers collision sliding/bounds, framerate-independent interpolation, callsign sanitizing, protocol validation and malformed-message rejection. A real two-peer browser smoke test should also be run before each release:

1. Host a room in one tab.
2. Open the invite in another tab/profile.
3. Confirm both roster entries, movement replication, firing, damage, death, respawn and disconnect cleanup.

## Free hosting

`vite.config.ts` uses `base: './'`, so the production `dist/` works from a GitHub Pages project subpath or any static host.

### GitHub Pages

The included `.github/workflows/pages.yml` builds and publishes `dist/` on pushes to `main`.

1. Create/push a GitHub repository.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Push `main` and verify the Pages deployment.

## Design notes

The arena uses only generated Three.js geometry and canvas textures:

- two asymmetric retro houses with traversable ground-floor lanes;
- central coach, moving truck and cover props;
- fences, garages, backyards, mannequins, signage and sunset lighting;
- three procedural weapons with distinct cadence, recoil, spread and audio;
- 5-minute team deathmatch, first team to 25 eliminations.

No external runtime assets are required except optional Google Fonts; system fallbacks keep the game usable if font loading is blocked.
