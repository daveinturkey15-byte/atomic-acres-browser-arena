# Pass 66 killstreak demonstration videos

The killstreak loadout rail uses eleven short prerecorded clips captured from the real Gun Range test bay. It does not construct a gameplay arena, run support simulation, or submit renderer work inside the menu.

## Authoritative capture

Run from the repository root after all gameplay/runtime edits and every other `public/**` asset family (including menu previews) are finalized and committed. The killstreak-demo output directory is the only public subtree excluded from this capture closure, so changing another public asset afterward intentionally invalidates the clips:

```powershell
npm run author:pass66:killstreak-demo-videos
npm run finalize:pass66:killstreak-demo-videos
git add assets.manifest.json public/assets/original/killstreak-demo source-assets/killstreak-demo
git commit -m "Finalize Pass 66 killstreak demo media"
npm run qa:pass66:killstreak-demo-videos
```

The authoring command is a fail-closed source-freeze wrapper. It removes stale staged evidence, rejects any tracked or untracked worktree change, rejects ignored local Vite env override files, scrubs inherited `VITE_*` values, pins the full `HEAD` SHA, refuses an already-owned preview port, and starts a fresh built/staged release topology. The capture must fetch `channels/the-big-one/channel-provenance.json` from that owned preview and prove both the clean source SHA and served runtime-tree digest before recording.

The authoring test requires:

- machine-installed Google Chrome launched through D3D11 with GPU rendering enabled;
- FFmpeg and FFprobe on `PATH`;
- the normal Vite/Playwright test server;
- a fresh recorded browser context for each canonical killstreak.

The run fails if Chrome reports a software adapter, a non-WebGL2 backend, a lost context, an unhealthy presentation state, an incomplete bootstrap/admission state, or a player-visible runtime error. Merely producing an MP4 is not success.

The receipt binds a deterministic recursive SHA-256 closure of every file under `src/**`, `shared/**`, and `public/**` except the killstreak-demo output directory itself, plus the production environment, TypeScript config, menu choreography, package, build, release-topology, preview-server, capture, finalizer, closure-collector and documentation recipe files. Finalization recomputes exact sorted path-and-hash equality at the exact clean source commit. Release-grade `--verify-only` additionally requires a clean descendant commit whose complete diff from the receipt SHA contains only added or modified media/provenance files and the two exact Pass 66 status ledgers; deletes, renames, other docs and unrelated edits fail closed. The two ledger exceptions are non-runtime evidence surfaces so final exact-SHA gate outcomes can be recorded without creating a circular recapture requirement.

Every capture starts a real Gun Range match, walks the actual keyboard `F` interaction lifecycle at the corresponding test-bay station, completes normal targeting where required, and waits for support-specific runtime proof. Direct debug activation and demo-only substitute visuals are not accepted as evidence.

Each support has its own camera plan. World-space cameras are solved from that activation's canonical debug-snapshot positions, and the receipt stores the camera, subject positions, projected viewport coordinates and in-frame count. HUD supports store the measured visible DOM region. The eleven milestone contracts are:

- Scout Sweep: visible scout pulse and minimap;
- Adrenaline: active runtime and visible adrenaline HUD;
- Care Package: rendered aircraft and crate;
- Yardhawk: projectile and explosion presentation;
- Tri-Pass: three missiles and three impact presentations;
- Carpet Bomber: aircraft, bomb shells and impact presentations;
- Hunter Swarm: five drones and an impact presentation;
- Piloted Drone and Chopper: authoritative vehicle plus rendered presentation;
- Drone Swarm: 24 authoritative drones and 24 rendered instances;
- Nuke: warning, detonation and flash.

## Output contract

For every canonical killstreak, finalization publishes:

- `public/assets/original/killstreak-demo/<id>.mp4` - 960x540 H.264 High Profile, `yuv420p`, no audio, fast-start MP4;
- `public/assets/original/killstreak-demo/<id>.jpg` - verified poster fallback;
- one source receipt binding the clean Git SHA, served candidate runtime digest and complete capture source closure;
- one public manifest with exact bytes, dimensions, duration, frame count and aggregate digest;
- three independently decoded frame digests plus a decoded every-frame motion analysis per clip;
- an updated `assets.manifest.json` provenance family.

The schema-5 source receipt also proves the cadence actually presented by the game during the clip: at least 24 presented frames per second, no more than an 80 ms p95 presented-frame gap, and no gap over 250 ms. The encoder may target 30 fps, but the decoded output is independently rejected when near-duplicate transitions exceed 35% or a near-duplicate run exceeds six frames. This prevents a low-rate recording, including a roughly 9 fps capture padded by FFmpeg, from being represented as healthy 30 fps media.

The 960x540 resolution is deliberate for a compact looping menu preview, not a claim about gameplay render resolution. It keeps eleven local videos inside the bounded media budget while retaining a JPEG fallback and avoiding menu-time gameplay or renderer work.

H.264 MP4 is the single shipped video format because it is locally hosted and supported by the target desktop Chrome, Edge, Firefox and Safari browser families. The JPEG remains authoritative fallback when decoding or autoplay is unavailable.

## Menu lifecycle

The rail owns exactly one persistent video element. Hover, keyboard focus, or selection retargets that decoder. Leaving the killstreak tab releases the source. Reduced-motion mode never loads video and shows the matching verified poster. A visible pause/play control is provided for looping motion.

Do not patch receipt hashes, copy arbitrary videos into the public directory, or finalize a partial catalog. Any source drift or missing/duplicate media fails closed and requires a complete recapture.
