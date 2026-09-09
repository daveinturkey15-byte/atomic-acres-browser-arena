# Lane AE — the emulated mobile pass, and the five-minute phone checklist for the owner

Orchestrator: Claude Code (Fable 5.1). Owner asks: mobile is part of "friends
sharing lobbies, mainly PC and sometimes mobile"; the real-device pass was
shelved as "not night-safe" because only the owner holds the phones. This
lane does everything that does not need a phone.

Worktree: create `C:\Users\david\projects\aa-claude-mobile`:
`cd C:\Users\david\projects\aa-omp-pass84 && git worktree add ../aa-claude-mobile -b contrib/dave-gaming-pc/claude/mobile-emulated-pass <current head>`
then junction `node_modules`.

## Facts
- Touch controls: `src/mobile-touch-controls.ts` (persistence via
  `MOBILE_CONTROLS_STORAGE_KEY`); Lane E (PASS 84) added gamepad support with
  touch-overlay suppression when a pad connects, and tiered aim assist
  (touch strongest).
- Existing mobile QA: `qa:cross-browser:mobile` (`verify-mobile-touch-playability.mjs`),
  the pass69 mobile controls work, iPhone/webkit lanes (Playwright webkit has
  no WebGPU: emulate on headless Chrome with device metrics, touch and a
  mobile UA instead, and say so).
- Headless only; a guard kills headed browsers.

## Job
1. Emulate three devices on headless Chrome (a 6.1" phone portrait and
   landscape, a 10" tablet): device scale factor, touch events, mobile UA,
   viewport. Boot the menu, host a solo match on atomic-acres and Raid,
   deploy, move, aim, fire, reload, ADS, switch weapons, open the pause and
   settings, all through touch. Record: layout breakage (overlapping HUD,
   controls off-screen, unreadable text), touch targets under 44 px, frame
   time, page errors. Screenshots per screen per device.
2. Fix layout and control-size defects in the touch overlay and HUD CSS;
   verify the aim-assist tier and the pad suppression under emulation
   (connect a fake pad through `navigator.getGamepads` as Lane E's e2e does).
3. Add a repeatable `qa:mobile:emulated` script with a registry-derived
   arena roster and a contract test.
4. Write `docs/MOBILE_PHONE_CHECKLIST.md`: the five-minute check only the
   owner can do on real hardware (Safari on iPhone, Chrome on Android, a
   Bluetooth pad on each), one line per step with the expected result.
5. `npx tsc --noEmit`; focused tests; commits with explicit paths.

## Boundaries
- You own: touch overlay, HUD responsive CSS, the emulated QA script and its
  contract, the checklist doc. Not: gamepad internals (Lane E), weapons,
  arenas, netcode.
- Machine rules as every lane.

## Report
Per device per screen: defects found and fixed with before/after captures;
touch-target audit; the script name; the checklist path; commits.
Claim-state every line.
