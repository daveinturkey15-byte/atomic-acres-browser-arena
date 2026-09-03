# Lane AE — the emulated mobile pass

**Pass labelling, so nobody hunts for the wrong directory:** this is Lane AE of
the **PASS 85** lane sweep, worked in the **PASS 87** window (2026-09-03) and
landing in the PASS 87 cut. The commit subjects and this evidence directory are
both labelled `pass85`; anything below that says "PASS 87" means the window and
the cut, not the evidence path. Branch
`contrib/dave-gaming-pc/claude/mobile-emulated-pass`, base `d329628d`.

Everything here was measured by `npm run qa:mobile:emulated`
(`scripts/qa/verify-mobile-emulated-devices.mjs`) driving headless installed
Chrome with real CDP touch input. No browser window was ever shown.

- Receipt: `mobile-emulated-devices.json` — the run in the table below,
  verbatim. It is the **repair re-run of 2026-09-03 03:09 BST**, taken after the
  skeptic pass, with the instrument corrections listed at the bottom of this
  file (sprint measured, the stability filter no longer forgiving a control that
  becomes blocked, the carousel exclusion narrowed to its own container).
- Screens: `screens/` — the full seven-screen journey for atomic-acres on every
  device, plus in-match/pause/settings for Raid (`test2`). PNGs over 600 KB were
  halved until under it. **These are from the first run of the same build and
  the same fix**, not the repair re-run: the repair changed the instrument and
  the prose, not a pixel of the game, so the captures still show what each
  screen looks like. Every number in the table comes from the receipt.
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

## The measurement (repair re-run, 2026-09-03 03:09 BST)

`sprint samples` is the number of 120 ms samples in which `player.sprinting` was
true while the move stick and the sprint button were both held, out of the
samples taken; the metres are the ground covered during that hold. `false` after
release on every cell.

| device | arena | verdict | controls | boot ms | fps~ | mean ms | move m | look rad | ammo | reload | ADS down/up | swap | jump m | sprint samples | tier | pad hide/restore | page errors |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| phone-portrait | atomic-acres | **pass** | 16 | 11394 | 57.5 | 17.4 | 6.674 | 3.2134 | 30→26 (1 tap) | yes | true/false | carbine→pistol | 0.384 | 6/6 (7.984 m) | touch | true/true | 0 |
| phone-portrait | test2 | **pass** | 16 | 1398 | 57.5 | 17.41 | 5.195 | 3.6546 | 30→26 (1 tap) | yes | true/false | carbine→pistol | 0.592 | 6/6 (9.219 m) | touch | true/true | 0 |
| phone-landscape | atomic-acres | fail¹ | 16 | 7269 | 61.9 | 16.14 | 6.674 | 3.054 | 30→25 (1 tap) | yes | true/false | carbine→pistol | 0.592 | 6/6 (7.009 m) | touch | true/true | 0 |
| phone-landscape | test2 | fail¹ | 16 | 4166 | 59.2 | 16.88 | 8.444 | 3.307 | 30→25 (1 tap) | yes | true/false | carbine→pistol | 0.621 | 4/5 (7.078 m) | touch | true/true | 0 |
| tablet-portrait | atomic-acres | fail² | 16 | 3056 | 48.9 | 20.46 | 10.422 | 3.2348 | 30→25 (1 tap) | yes | true/false | carbine→pistol | 0.529 | 6/6 (9.969 m) | touch | true/true | 0 |
| tablet-portrait | test2 | fail² | 16 | 3056 | 47.3 | 21.14 | 8.31 | 2.5381 | 30→26 (1 tap) | yes | true/false | carbine→pistol | 0.343 | 6/6 (6.508 m) | touch | true/true | 0 |

¹ `pause-controls-not-tappable: room-input, join` — OPEN item 2 below. Both
landscape cells now, not one: the repair to the stability filter stopped
forgiving a control that becomes blocked after the settle, which is how
`phone-landscape / atomic-acres` was passing.
² `settings-controls-not-tappable: graphics-render-scale, graphics-adaptive` —
OPEN, see `OPEN-collapsed-advanced-graphics-lays-out.md`.

**Frame rate is an upper bound.** This is a desktop RTX at a phone viewport, and
the owner's ComfyUI shares the GPU. No handset will reach these numbers; section
B of the phone checklist is the real measurement.

Clean on every cell, every device: 16 visible touch controls, **0** outside the
viewport, **0** below the 44 px target floor **on the touch overlay** (the menu
is a softer floor and has 15 rows under it — see the next section), **0**
overlapping pairs, **0** HUD
strings below the 9 px floor, **0** HUD consoles under a control, **0** px of
horizontal document overflow, **0** page or console errors, and
`straySurfacesOpenedByTheSameTap` empty everywhere.

## Reported, not failed: 15 settings rows at 24 px

Every cell measures the same 15 checkbox rows in the **settings** panel at
**24 px** tall — under the 44 px target floor:

- `audio-ambience-mute`, `audio-announcements-mute`, `audio-game-music-mute`, `audio-master-mute`
- `audio-menu-music-mute`, `audio-movement-mute`, `audio-sfx-mute`, `audio-ui-mute`
- `gamepad-invert-y`, `gamepad-rumble`, `mobile-touch-controls-toggle`, `reduced-damage-flash`
- `reduced-motion`, `reduced-sensory-effects`, `share-global-leaderboard`

They are recorded as `settings.controlsBelowTargetHeight` and deliberately do
NOT fail the cell, for the reason written into `auditMenuSurface`: the 44 px
floor is enforced **hard** on the touch overlay, where a miss costs a life,
while menu control HEIGHT is a soft floor — a full-width settings row is a wide
strip that is still an easy thumb target, and failing it would be answered by
padding the panel out of the viewport. That choice is defensible, but it is a
measured finding and it is disclosed here rather than left inside the JSON: the
report's "0 below the 44 px floor" headline is about the OVERLAY, not the menu.
Whether those rows are actually fiddly on glass is a row in the owner's phone
checklist. The settings-panel CSS belongs to the menu work assigned to Lane AR,
so nothing here was widened by this lane.

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
   landscape phone — **both arenas** in the repair re-run — `#room-input` and
   `#join` hit-test to `section#menu` itself once the pause surface has settled:
   they are enabled, and something painted by `#menu` is over them. On
   `atomic-acres` the receipt records `becameBlockedAfterSettle: true`, i.e.
   both controls were reachable on the first read and covered 500 ms later;
   that cell read PASS in the first run only because the stability filter was
   clearing exactly that direction. On `test2` both reads are blocked. In the pre-match lobby the same
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

Four of this lane's own findings were the harness, not the game, and each is
now written into the script so it cannot recur:

- A control scrolled out of a scrolling panel still has a viewport position, so
  `elementFromPoint` there returns whatever is painted behind the panel. Without
  clip-awareness the audit reported options rows as "blocked by `canvas#game`".
- Menu surfaces animate in; a single hit-test read taken mid-transition catches
  controls still behind an outgoing scrim. The audit therefore reads twice,
  500 ms apart, and **believes the later read**. It does not average the two:
  the first version cleared a blockage whenever the reads disagreed in either
  direction, which forgave the one direction that is a real defect — a control
  that is tappable at first and then vanishes under a surface animating IN over
  it. That transition is now tagged `becameBlockedAfterSettle` and still fails
  (repair pass, after skeptic review).
- **Sprint was tapped, never measured.** The first version of the sweep pressed
  SPRINT for 400 ms and recorded `sprintButtonPresent: true`, and the lane
  report listed sprint inside a claim that said the whole loop was driven by
  touch. It was a presence check wearing a behaviour check's clothes. Sprint
  cannot be measured by a lone tap in any case: legacy-main computes
  `currentSprinting` as the sprint request AND `input.lengthSq() > 0` AND
  grounded AND a valid sprint direction, so a stationary player holding RUN is
  correctly not sprinting. The sweep now holds the move stick forward and the
  sprint button at the same time (two CDP touch points), samples
  `player.sprinting` every 120 ms while both are down, fails the cell if no
  sample sprints, and fails it again if sprint is still on after the release.
  `sprint` also joined `REQUIRED_TOUCH_CONTROLS`, so a sprint button that
  disappeared from the overlay would now fail rather than pass unnoticed.
- Order matters in the play loop. With the sticks first, the move stick drove
  the player 6.7 m into a wall and every later shot was refused — the game's own
  diagnostics reported 54 refusals, all `viewmodel-contact-raise`, with
  `lastFiredAtMs: 0`. That is the muzzle-against-a-surface rule working, but it
  reported as "the mobile FIRE button does not fire" on one device and one arena.
  Weapon actions now run first, from the pose the match admitted, and the fire
  probe reads `snapshot().fireBlock` on failure so the next such case is
  attributed rather than guessed.
