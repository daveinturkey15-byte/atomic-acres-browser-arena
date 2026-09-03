# The five-minute phone check — Dave only

Everything on a phone that a machine in this house **can** check is checked by
`npm run qa:mobile:emulated` (three emulated devices, real touch input, every
control measured and tapped). This page is the short list of things it
**cannot** check, because they need a physical handset that only you hold.

Five minutes, two phones, one pad. Tick or write what you saw — a "no" here is
worth more than a hundred green emulated cells.

**Where to play:** open the live site on the phone, pick **PASS 87** (or
whichever channel you are checking) from the chooser.

---

## A. iPhone, Safari — 90 seconds

Safari is the row emulation cannot reach at all: Playwright's WebKit has no
WebGPU, so no automated lane on this machine has ever booted the game in it.
Everything below is unknown until you look.

| # | Do this | Expect |
|---|---------|--------|
| A1 | Open the site in Safari and wait for the menu | The menu appears and the arena cards are readable. **If it never loads or shows a renderer error, stop and tell me — that is the whole iOS row.** |
| A2 | Pick Nuke Town, tap **DEPLOY** | You get into a match. Note roughly how long it took. |
| A3 | Look at the four corners of the screen | Nothing important is under the notch, the Dynamic Island or the home bar. Ammo, health, timer all fully visible. |
| A4 | Move with the left stick, look with the right | Both respond immediately; the view does not drift when you let go. |
| A5 | Tap **FIRE**, then **RLD** | The gun fires and reloads. |
| A6 | Double-tap near a button, then pinch | The page does **not** zoom and does **not** scroll. |
| A7 | Rotate the phone to landscape and back | The controls re-lay out both ways; nothing ends up off screen or under your thumb rest. |
| A8 | Tap **PAUSE** | The pause menu opens, and **only** the pause menu — no second panel on top of it. Tap **RESUME**: you go straight back to the match. |

## B. Android, Chrome — 90 seconds

Emulation is Chrome, so this row is the closest to covered — but on desktop
silicon. What a real handset adds is thermals, a real GPU and a real network.

| # | Do this | Expect |
|---|---------|--------|
| B1 | Open the site in Chrome and deploy into Nuke Town | You get into a match. |
| B2 | Play for **two full minutes** without stopping | It stays smooth. Watch for it getting gradually choppier — that is thermal throttling, and it is the one thing no emulated run can show. Note when it started. |
| B3 | Feel the phone | Warm is fine. Too hot to hold is a result — tell me. |
| B4 | Check the battery percentage before and after those two minutes | Note the drop. |
| B5 | Turn Wi-Fi off so it falls to mobile data, then host a lobby | It still hosts and a friend can still join. |
| B6 | Look at the HUD text at arm's length | Ammo, health and the timer are readable without squinting. |

## C. A Bluetooth pad on each phone — 90 seconds

The pad is fake in every automated run: a `navigator.getGamepads` stub, not
radio. Pairing, latency and the button map are unproven until you hold one.

| # | Do this | Expect |
|---|---------|--------|
| C1 | Pair the pad to the **iPhone**, then get into a match | The on-screen touch controls **disappear** the moment the pad connects. |
| C2 | Move and look with the pad sticks | Both work; look feels smooth rather than stepped. |
| C3 | Press every face button, both bumpers, both triggers | Each does what its label says. Anything wrong, note the button. |
| C4 | Turn the pad off mid-match | The touch controls come **back**, in the same match, and you can keep playing. |
| C5 | Repeat C1–C4 on the **Android** phone | Same behaviour on both. |
| C6 | Aim at an enemy with the pad, then with your thumbs | Both should feel like they help a little near the target. Touch should help **most**. If either feels sticky or fights you, say so. |

## D. The two-phone question — 60 seconds

| # | Do this | Expect |
|---|---------|--------|
| D1 | Host a lobby on one phone, join from the other | The join works first time. |
| D2 | Both players deploy into the same map | Both land in the match and can see each other. |
| D3 | Lock one phone's screen for ten seconds, unlock it | That player comes back into the match rather than being dropped. |

---

## What I already know without your phone

So you do not spend the five minutes on things that are covered:

- **Measured on three emulated devices** (6.1" phone portrait, the same phone in
  landscape, a 10" tablet), on the arenas the registry offers, headless: every
  touch control is on screen, at least 44 px, non-overlapping, and actually
  drives the game — move, look, fire, reload, ADS, weapon switch, jump, pause,
  settings, resume. HUD text is at or above the 9 px floor and no console sits
  under a control. A connected pad suppresses the overlay and disconnecting
  restores it; touch holds the strongest aim-assist tier.
- **Fixed in PASS 87 by this lane:** tapping PAUSE used to open the pause menu
  **and** the project-map panel on top of it, leaving the pause surface
  unusable — the tap's synthesised click landed on the menu button the overlay
  had just stopped covering. Step A8/`only the pause menu` is the row that
  confirms it on real glass.

## What emulation can never tell us

- **iOS/Safari at all** — no WebGPU in the automated WebKit build.
- **Real frame rate.** Emulated numbers come off a desktop GPU and are an upper
  bound no handset will reach. Section B2 is the real measurement.
- **Thermal throttling** after minutes of play, and battery drain.
- **A real Bluetooth pad** — pairing, radio latency, the actual button map.
- **Real notch/home-bar safe-area insets**, which the emulator reports as zero.
- **Cellular network** behaviour for hosting and joining.

## If something is wrong

Tell me the step number and what you saw. If you can, the phone model and OS
version — a defect that only appears on one handset is a different bug from one
that appears on both.
