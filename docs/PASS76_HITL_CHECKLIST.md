# Pass 76 HITL checklist — Dave

Play at **http://127.0.0.1:41876/**. Local only. Nothing has been pushed to
GitHub Pages, per your instruction.

This is the build for the test you asked for: *"a HITL version to test that
includes every single thing that has been asked for."* Everything below is
either **DONE** with the evidence named, or **NOT DONE** and said so plainly.
Where a claim rests on a machine check rather than a human looking at it, the
check is named so you can re-run it yourself.

If this file and `PASS74_OWNER_FEEDBACK_LEDGER_2026-08-21.md` disagree, believe
the ledger and tell me.

**Final verification at hand-off:** `tsc` clean · **3,396 tests passing** ·
six arenas boot at three viewports with **zero console errors** · multiplayer
matrix **6/6 lanes** · farcrysis ground contract PASS · swim verifier PASS.

---

## A. The five things you asked for most recently

### 1. Farcrysis rejigged toward Far Cry 1 / Crysis 1
**What to do:** deploy to FARCRYSIS, walk the beach, walk inland, look at the
sea, look at the sky, walk up a hill.

- **You stand on the island now.** Gameplay collision used to be a flat floor
  at sea level while the terrain was sculpted to 2.2 m, so you walked *inside*
  hills and hills blocked nothing. There is now one terrain authority and the
  physics surface follows it (2,536 collider plates, ≤0.15 m fit).
- **You can walk into the sea and swim.** The shoreline never reached swim
  depth before, so the swimmable water was unreachable on foot. Walking
  seaward from the beach now reaches swim state in about 1.5 s.
- **Props are on the ground.** ~25 vegetation layers were placed using a
  phantom terrain model that disagreed by up to 7 m — canopies hung in mid-air.
  Buried cover (an invisible-wall rock, a fully submerged crate) is re-seated.
- **Things block you now.** The catwalk was walk-through; its ramp ended in
  mid-air. Collision added for the seaplane, cave arch, beacon, tower legs,
  barrels and ~25 palm trunks.
- **The jungle actually exists now.** Two bugs did most of the "messy" damage,
  and neither was in the art: the static batcher treated `InstancedMesh` as a
  plain mesh and **silently deleted ~2,000 instanced plants**, and palm crowns
  rendered as solid brown domes because a leaf texture was mapped onto geometry
  with no UVs. Both fixed. The batcher bug affected *every* arena — Atomic
  Acres has visibly gained its grass and flowers back.
- **The sky is blue.** It was a golden-hour dusk band, and on top of that 30
  near-white clouds covered exactly the strip you look at while standing —
  forcing the sky to pure red changed nothing on screen, which is how the
  clouds were caught. Now saturated tropical daylight.
- **Frame rate at spawn went 30 → 60.**
- **Look for:** anything still floating, anything you can walk through that
  should stop you, and whether the beach-to-water transition feels right.

### 2. Hijacked below-deck is not water
**What to do:** deploy to HIGH SEAS, take either deck hatch down, walk the
corridor bow to stern, stand in the engine room.

- Both corridor ends were **unsealed** — walking to either end dropped you past
  the ocean into the hull void. Sealed with bulkheads.
- Everything under the deck outside the corridor **was the ocean plane**. There
  is now an enclosed dry bilge under the whole below-deck footprint.
- Shaped to Hijacked: one-man corridor (1.44 m), mid-ship engine-room bulge
  (4.7 m) with machinery cover leaving a single centre lane, amber practical
  lights, metal ceiling, treads on the stairs.
- **Evidence:** `node scripts/qa/capture-below-deck.mjs` walks the player to
  seven stations and screenshots each. All seven hold at eye height.
- **Look for:** whether the layout *plays* like Hijacked's lower deck.

### 3. WebGPU features + Options
**What to do:** ESC → OPTIONS → ADVANCED GRAPHICS.

Six controls that did not exist or were not reachable:

| Control | What it does |
|---|---|
| ANTI-ALIASING | now also **FXAA** and **SMAA** (post-AA stages) |
| SHARPNESS | contrast-adaptive (RCAS) sharpen, 0–100% |
| SHADOW FILTERING | `auto` / `pcf` / `pcss-soft` — was a browser sniff, now your choice |
| FILMIC GRADE | `arena-default` / performance / quality / max |
| SPECULAR RESPONSE | gained **ULTRA** (512 px reflection probe, was capped at 256) |
| ENVIRONMENT INTENSITY | 0–2× indirect light |

GTAO also stops running raw — high/ultra now denoise.
**Not done, stated:** depth-of-field and FSR1 upscale are still unwired.
**Look for:** does each control visibly change the frame? `auto` shadow
filtering is byte-identical to the old behaviour by design.

### 4. Multiplayer: no freezes, everyone can move and be seen, TDM = FFA
**What to do:** two browser windows, host + join, on **every** map, in **both**
modes. Swap the map while the guest is already in the room.

Fixed this pass:
- **Guest spawned dead and frozen** (your "can't move on RustRig/Terminal").
  Root cause: the world-repair handshake burned its whole retry cap on a burst
  of start-of-match snapshots, then declared failure — the guest spawned dead
  with no respawn. Retries are now spaced.
- **Rematch ghost.** A guest who dropped mid-match, rejoined the lobby and
  started the next match was rebuilt from the *previous* match's snapshot and
  froze for everyone, permanently.
- **FFA crate stealing.** Capture used raw team numbers, so in FFA any rival
  could tap-steal a care package instead of holding it for 2.5 s.
- **Countdown joiners** all stacked on one team in TDM.
- **Respawn crash** when debris blocked a team's whole spawn side.
- **FFA winner** could be a bot, which rendered the end screen as "STALEMATE".
- **Evidence:** `node scripts/qa/verify-hf347-arena-movement-matrix.mjs` — six
  lanes (TDM on RustRig/Terminal/High Seas, FFA on Atomic Acres/Farcrysis,
  Gun Range), real key input, and each lane asserts you can *see* the other
  player. **6/6 PASS.**
- **Look for:** anything the matrix cannot check — feel, hitreg, desync.

### 5. Polish carried over from the earlier list
- **HUD redesign** — panels *and* the third of it still on 2022 CSS (killfeed,
  damage numbers, hitmarker, respawn, banner, scope, alerts).
- **Menu redesign** + **OPERATOR tab** for skins and animations.
- **Audio** — 27 intermittent ambient events across six arenas.
- **Crimson flamethrower** (care package, 10%, 30% less damage).
- **Prone clipping** — the fix existed since HF-345 and was never connected.
- **Skies** — Farcrysis and High Seas were wearing other arenas' skies, and a
  radius-180 dome sat exactly on the camera far plane, punching a hard-edged
  hole in the sky.
- **Loading** — an unfocused window used to load forever. Alt-tab during the
  loading screen now finishes normally.

---

## B. Known not-done, so you are not surprised

- **Firefox frame rate (HF-331)** is still unmeasured. Chrome measures 142.9 fps
  median on WebGPU via the new in-page probe. Firefox's WebGPU fences all
  resolve fine (proved separately), so the browser was never the fault — and
  chasing it turned up a real bug that is now **fixed**: an unfocused window
  retried the cold prewarm forever and never finished loading, so alt-tabbing
  during the loading screen hung the game on any browser. Firefox now gets past
  that point, but the run still does not complete a measurement.
  **One minute of you playing in Firefox with the FPS counter up closes this
  row for good.**
- **Depth-of-field / FSR1 upscale** — not wired.
- **Two-machine multiplayer** — everything above is two windows on this PC.
  Real two-machine play is still the human close-out bar.
- **`coplanar-surface-audit`** ships only as a CI gate, not in the build.

---

## C. Re-run any of it yourself

```bash
npx vitest run                                          # 3396 tests
node scripts/qa/verify-hf347-arena-movement-matrix.mjs   # 6-lane multiplayer
node scripts/qa/verify-farcrysis-ground-contract.mjs     # stand + walk-to-swim
node scripts/qa/capture-below-deck.mjs                   # Hijacked lower deck
node scripts/qa/verify-swim-state.mjs                    # swim + rustworks float
node scripts/qa/capture-visual-review.mjs                # 6 arenas, 3 viewports
```
