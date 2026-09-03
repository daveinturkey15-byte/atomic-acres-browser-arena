# Lane AE — the emulated mobile pass

PASS 87 window, 2026-09-03. Branch
`contrib/dave-gaming-pc/claude/mobile-emulated-pass`, base `d329628d`.

Everything here was measured by `npm run qa:mobile:emulated`
(`scripts/qa/verify-mobile-emulated-devices.mjs`) driving headless installed
Chrome with real CDP touch input. No browser window was ever shown.

- Receipt: `mobile-emulated-devices.json` (the run below, verbatim minus local
  screenshot paths).
- Screens: `screens/` — the full seven-screen journey for atomic-acres on every
  device, plus in-match/pause/settings for Raid (`test2`). PNGs over 600 KB were
  halved until under it.
- Owner's own five minutes: `docs/MOBILE_PHONE_CHECKLIST.md`.

## What was run

Three emulated devices x two arenas, WebGPU (`--render quality`, the shipped
route), each cell booting the game, deploying by touch, playing the whole loop
by touch, connecting and disconnecting a pad, pausing, opening settings and
resuming.

| device | viewport | dpr |
|---|---|---|
| phone-portrait | 393x852 | 3 |
| phone-landscape | 852x393 | 3 |
| tablet-portrait | 820x1180 | 2 |

Arenas: `atomic-acres` (Nuke Town) and `test2` (Raid), as the lane brief asked.
The script's default roster is the whole registry-derived selectable list.

## The measurement (final run, after the fixes below)

| device | arena | verdict | controls | boot ms | fps~ | mean ms | move m | look rad | ammo | reload | ADS down/up | swap | jump m | tier | pad hide/restore | page errors |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| phone-portrait | atomic-acres | **pass** | 16 | 12244 | 58.8 | 17.02 | 6.674 | 2.800 | 30→24 (1 tap) | yes | true/false | carbine→pistol | 0.648 | touch | true/true | 0 |
| phone-portrait | test2 | **pass** | 16 | 2428 | 64.4 | 15.52 | 7.705 | 3.325 | 30→25 (1 tap) | yes | true/false | carbine→pistol | 0.673 | touch | true/true | 0 |
| phone-landscape | atomic-acres | **pass** | 16 | 1612 | 50.7 | 19.74 | 6.674 | 2.404 | 30→25 (1 tap) | yes | true/false | carbine→pistol | 0.064 | touch | true/true | 0 |
| phone-landscape | test2 | fail¹ | 16 | 6289 | 59.2 | 16.90 | 5.195 | 3.402 | 30→25 (1 tap) | yes | true/false | carbine→pistol | 0.621 | touch | true/true | 0 |
| tablet-portrait | atomic-acres | fail² | 16 | 4988 | 47.1 | 21.24 | 6.674 | 2.674 | 30→25 (1 tap) | yes | true/false | carbine→pistol | 0.064 | touch | true/true | 0 |
| tablet-portrait | test2 | fail² | 16 | 5782 | 62.8 | 15.92 | 5.195 | 3.203 | 30→26 (1 tap) | yes | true/false | carbine→pistol | 0.697 | touch | true/true | 0 |

¹ `pause-controls-not-tappable: room-input, join` — OPEN, see below.
² `settings-controls-not-tappable: graphics-render-scale, graphics-adaptive` —
OPEN, see `OPEN-collapsed-advanced-graphics-lays-out.md`.

**Frame rate is an upper bound.** This is a desktop RTX at a phone viewport, and
the owner's ComfyUI shares the GPU. No handset will reach these numbers; section
B of the phone checklist is the real measurement.

Clean on every cell, every device: 16 visible touch controls, **0** outside the
viewport, **0** below the 44 px target floor, **0** overlapping pairs, **0** HUD
strings below the 9 px floor, **0** HUD consoles under a control, **0** px of
horizontal document overflow, **0** page or console errors, and
`straySurfacesOpenedByTheSameTap` empty everywhere.

Aim assist and pad suppression, which Lane E shipped in PASS 84 measured at one
viewport (844x390), now hold on all three profiles: `tier === 'touch'` while the
overlay drives the view, a connected pad hides the overlay within 6 s, and
disconnecting restores it in the same match.

## Fixed in this lane

**The PAUSE tap fell through onto the menu it uncovered.** Tapping PAUSE opened
the pause menu *and* the project-map modal on top of it, leaving the pause
surface unusable — the options tab and RESUME were both under a full-screen
modal. Isolated, not inferred: dispatching only `pointerdown` left the modal
closed; a real touch tap at the same point opened it. A tap is a `pointerdown`
plus a synthesised compatibility `click` on `touchend`, and that click is
hit-tested against the DOM the `pointerdown` just changed; the mobile PAUSE
button sits at 333,8 52x48, exactly where the menu header's project-map button
appears. Cancelling `pointerdown` does not suppress compatibility mouse events —
only cancelling `touchstart` does. Fixed in `src/mobile-touch-controls.ts`
(commit 586b29f2), asserted by the sweep's fall-through check on every cell and
source-pinned in `src/mobile-touch-controls.test.ts`.

## OPEN — outside this lane's ownership, with patches

1. **A collapsed Advanced Graphics lays out 2,815 px over the Options panel.**
   Full diagnosis, desktop reproduction and the one-line patch in
   `OPEN-collapsed-advanced-graphics-lays-out.md`. Owner:
   `src/ui/advanced-graphics.css`.

2. **The paused deck leaves the lobby join row enabled but covered.** On the
   landscape phone, `#room-input` and `#join` hit-test to `section#menu` itself
   for at least 500 ms after the pause surface opens — they are enabled, and
   something painted by `#menu` is over them. In the pre-match lobby the same
   two controls are fully reachable on both orientations (measured: after
   `scrollIntoView`, `elementsFromPoint` returns `INPUT#room-input` /
   `BUTTON#join` on 852x393 and 393x852), so this is specific to the paused
   surface. **Proposed remedy, and it is also the correct behaviour:** a player
   cannot join another room mid-match, so the paused deck should mark that row
   `disabled` (or the panel `inert`) rather than leave live controls under a
   scrim. The sweep already ignores controls that are `disabled`,
   `aria-disabled` or inside `[inert]`, so doing that clears the row honestly
   instead of hiding it. Owner: the paused-surface branch of the menu shell.

3. **DEPLOY is below the fold on a phone in landscape** — measured, reported on
   every cell as `deployButton.deployBelowTheFold`. At 852x393 the lobby's
   scroll container is 313 px tall with 2,025 px of content, and `#solo` sits at
   y=448 in a 393 px viewport. It is reachable after a scroll (the sweep scrolls
   it into view, as a player would) and every landscape cell then deploys
   normally, so this is friction rather than a break — but the primary action of
   the whole menu is off-screen in the orientation a shooter is played in. This
   belongs with the PASS 87 HUD/menu overflow work already assigned to Lane AR
   (the 8-arena-card overflow row), and is deliberately not restructured here to
   avoid two lanes editing the same menu CSS.

## Instrument notes worth keeping

Three of this lane's own findings were the harness, not the game, and each is
now written into the script so it cannot recur:

- A control scrolled out of a scrolling panel still has a viewport position, so
  `elementFromPoint` there returns whatever is painted behind the panel. Without
  clip-awareness the audit reported options rows as "blocked by `canvas#game`".
- Menu surfaces animate in; a single hit-test read taken mid-transition catches
  controls still behind an outgoing scrim. The audit now requires a control to
  be blocked in two reads 500 ms apart.
- Order matters in the play loop. With the sticks first, the move stick drove
  the player 6.7 m into a wall and every later shot was refused — the game's own
  diagnostics reported 54 refusals, all `viewmodel-contact-raise`, with
  `lastFiredAtMs: 0`. That is the muzzle-against-a-surface rule working, but it
  reported as "the mobile FIRE button does not fire" on one device and one arena.
  Weapon actions now run first, from the pose the match admitted, and the fire
  probe reads `snapshot().fireBlock` on failure so the next such case is
  attributed rather than guessed.
