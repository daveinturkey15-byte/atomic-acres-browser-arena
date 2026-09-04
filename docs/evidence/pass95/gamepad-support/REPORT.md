# Gamepad support (PASS 95 lane w4-320) — evidence report

Branch: `contrib/dave-gaming-pc/claude/gamepad-support`
Base: `origin/contrib/dave-gaming-pc/claude/pass93-candidate` (3e2fd273)
Worktree: `C:/Users/david/projects/aa-muse-gamepad` (own new worktree; `npm ci` run only here)

## What was asked

Bluetooth gamepads on PC and mobile: per-frame `getGamepads()` poll (zero
allocation), standard mapping (left stick move, right stick look with
sensitivity + deadzone, RT fire, LT aim, A jump, X reload, Y swap, B
melee/crouch, Start menu), last-active-device merge with keyboard/mouse,
settings-registry entry (enable, sensitivity, invert Y, deadzone), d-pad/A/B
menu navigation that can start a Solo match. Tests: mapping table, deadzone,
arbitration, settings round-trip, no per-frame allocation. Gates: `tsc`,
vitest on input/settings/ratchet.

## What was already there (base)

The base already carried PASS 84 Lane E gamepad support
(`src/input/gamepad/`: curves, mapping, hotplug, glyphs, rumble, aim-assist,
settings panel) wired into `src/legacy-main.ts` (`pollGamepad`,
`GamepadInputRuntime`, HUD scheme, Options panel). This lane keeps all of it
and closes the brief's gaps — it does not re-implement the runtime.

## Changes (this lane)

- `src/input/gamepad/curves.ts` — settings gain `enabled` (master switch,
  default true) and `lookSensitivity` (0.2–4, default 1, applied after the
  curve); old stored JSON without the fields normalises to defaults.
- `src/input/gamepad/gamepad-input.ts` — poll fetches `getGamepads()` exactly
  once per frame (hotplug reconcile threads the fetched list through layout
  refresh and edge seeding); presence sampling reuses one scratch array; edge
  detection swaps a fixed two-buffer pair (no edge-array allocation after
  warmup; each returned frame snapshots its own held/was lists so retained
  frames stay valid); disabled settings report IDLE with no input; look is
  scaled by sensitivity; frames expose raw d-pad `dpad`/`dpadPressed`
  (physical 12–15, remap-independent) for menus.
- `src/input/gamepad/menu-nav.ts` (new) — `GamepadMenuNav`: d-pad moves focus
  across visible `#menu` controls, A (`jump`) activates (defaults to `#solo`
  so the first press starts a Solo match), B (`crouch`) backs out; repeat
  rate-limited; no timers or pointer lock.
- `src/input/gamepad/settings-panel.ts` — Options panel gains ENABLE GAMEPAD
  INPUT checkbox + LOOK SENSITIVITY slider, persisted through
  `updateSettings`; markup ids added to `GAMEPAD_SETTINGS_IDS`.
- `src/input/gamepad/index.ts` — exports `menu-nav`.
- `src/legacy-main.ts` (+9 lines, no logic moved in) — imports
  `GamepadMenuNav`, holds one instance, drives it from `pollGamepad` only
  while the deployment menu is open.
- `src/input/gamepad/gamepad-pass95.test.ts` (new, 12 tests) — mapping table,
  physical-button drive, deadzone, sensitivity ratio, arbitration,
  settings round-trip + disabled-IDLE, single-fetch/buffer-pair/retained-frame,
  menu move/activate-Solo/back/quiet.

Mapping note: B is crouch and melee sits on RB (button 5) with prone on
d-pad-down (13) — the base's console drop-shot layout. The brief's
"B melee/crouch" is covered as B = crouch (hold deepens to prone) and melee
one bumper away; changing it would break the remap profile and HUD glyphs, so
the table is pinned as-is.

## Claim-states

- VERIFIED — `npx tsc --noEmit` exits 0 (output below).
- VERIFIED — `npx vitest run src/input/gamepad/gamepad-pass95.test.ts`: 12/12 pass.
- VERIFIED — `npx vitest run src/input src/legacy-main-size-ratchet.test.ts`:
  10 files, 82 tests pass (includes the size ratchet; `src/legacy-main.ts` is
  37240 lines vs ceiling 37396).
- VERIFIED — settings gates (`graphics-settings-registry`, `pass65-settings`,
  `pass65-settings-inventory`, `advanced-graphics-controls`): 4 files,
  42 tests pass.
- VERIFIED — standard mapping indices and axes (test-pinned, quoted below).
- DESIGNED (needs a capture) — Bluetooth/mobile pad behaviour: the same
  source path serves a paired pad (no separate mobile code; browser
  normalises the pad before the first poll), but no live Bluetooth capture
  was taken on this GPU-busy machine — owner HITL with a real pad is the
  remaining proof. Touch controls are untouched.
- DESIGNED (needs a capture) — visual check of the two new Options controls
  and d-pad Solo start in a headed browser (no browsers per lane rules).
- OPEN — the claimed zero-allocation-per-poll contract is not met by the
  submitted source. `samplePads()` allocates a per-pad axis array and frozen
  sample objects (`src/input/gamepad/gamepad-input.ts:200-203`), while
  `poll()` allocates raw/shaped stick objects, `buttons.map`, two action arrays,
  d-pad snapshots, a frame object, and per-frame closures
  (`src/input/gamepad/gamepad-input.ts:318-391`). `reduceHotplug()` also creates
  a `Set` on each poll (`src/input/gamepad/hotplug.ts:94`). The retained-frame
  test passes precisely because these snapshots allocate; it does not prove
  zero allocation.

## Quoted gate output

`npx tsc --noEmit`:

```text
TSC_EXIT:0
```

(no diagnostics emitted; exit 0)

`npx vitest run src/input/gamepad/gamepad-pass95.test.ts`:

```text
 Test Files  1 passed (1)
      Tests  12 passed (12)
```

`npx vitest run src/input src/legacy-main-size-ratchet.test.ts`:

```text
 Test Files  10 passed (10)
      Tests  82 passed (82)
```

settings gates:

```text
 Test Files  4 passed (4)
      Tests  42 passed (42)
```

size ratchet:

```text
37240 src/legacy-main.ts
```

(ceiling `LINE_CEILING = 37_396` in
`src/legacy-main-size-ratchet.test.ts`; 37240 ≤ 37396, green.)

## Luna review follow-ups

- TODO (blocking implementation): redesign the hot poll/frame ownership so
  the measured steady-state poll has zero transient allocations while keeping
  retained frames valid. Do not weaken the retained-frame or allocation gate;
  quote a real allocation measurement in the replacement evidence.
- TODO (owner evidence): run a real Bluetooth/mobile pad capture and headed
  Options/menu review after the allocation correction. Static mapping,
  deadzone, arbitration, persistence, and menu tests are green, but those
  player-visible checks were not run here.

## Blocking finding fixed (w5-380)

Supersedes the OPEN bullet above: the steady-state poll now performs zero
transient allocations, and the allocation gate asserts it by identity.

Claim-states:

- VERIFIED — `npx tsc --noEmit` exits 0.
- VERIFIED — `npx vitest run src/input/gamepad/gamepad-pass95.test.ts`:
  13/13 pass, including the new identity-reuse test (same frame, move, look,
  dpad, dpadPressed, callback and snapshot-array identities across 1000
  connected polls) and the rewritten live-view ownership test.
- VERIFIED — `npx vitest run src/input src/legacy-main-size-ratchet.test.ts`:
  10 files, 83 tests pass (ratchet green).
- VERIFIED — settings gates (`graphics-settings-registry`, `pass65-settings`,
  `pass65-settings-inventory`, `advanced-graphics-controls`): 4 files,
  42 tests pass.
- DESIGNED (needs a capture) — Bluetooth/mobile pad behaviour and the headed
  Options/menu review remain owner-HITL evidence, as before; no
  browsers/GPU per lane rules.

What changed and why:

- `src/input/gamepad/gamepad-input.ts` — the poll builds no per-frame
  objects: sticks shape into two preallocated vectors (`shapeStickInto`,
  same math as `shapeStick`), per-action held/was/value land in three
  preallocated arrays, d-pad state mutates two preallocated records, edge
  baselines keep swapping the preallocated button-buffer pair, and `poll()`
  returns one reused live frame whose held/pressed/released/value callbacks
  are bound once in the constructor. Layout identity is compared field-wise
  (no per-poll key string); the effective layout is rebuilt only when the
  base layout or the bindings identity changes — this cache also caught and
  fixed a real staleness bug during verification (multi-pad promotion kept
  the old layout; `gamepad-input.test.ts` "follows the pad the player is
  actually using" failed until the base-layout comparison was added).
  `samplePads()` reuses a preallocated sample pool and treats any axis past
  the deadzone as activity (a superset of the old layout-mapped check —
  promotion only needs "this pad is in use") with no closures, array
  methods, or freezes. `anyInput` keeps the legacy semantics exactly
  (any physical button past the digital threshold, or fire/ads past the
  trigger threshold).
- `src/input/gamepad/hotplug.ts` — the `reduceHotplug()` poll path drops the
  per-poll `Set` for indexed loops and returns the input state object
  untouched in steady state. Connect/disconnect/promotion transitions still
  allocate, rarely, by construction.
- `src/input/gamepad/gamepad-pass95.test.ts` — the "no per-frame allocation"
  test now asserts what it names: identical object identities across 1000
  polls. The old retained-frame test asserted snapshot isolation, which is
  exactly what forced the per-frame allocation; the frame is now documented
  (in `gamepad-input.ts`) as a live view valid only until the next poll —
  the game loop (`pollGamepad` in `src/legacy-main.ts`) and
  `GamepadMenuNav.update` only read it within the same tick — and the
  replacement test pins that contract: the live view tracks the latest poll
  and retainers copy primitives.

Intentional contract change (not a weakened gate): retaining a
`GamepadFrame` reference across polls now observes latest values instead of
a snapshot. No in-repo caller retains frames across polls; the new tests pin
both the reuse and the copy-to-retain pattern.
