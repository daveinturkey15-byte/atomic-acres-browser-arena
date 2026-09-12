# Pass 95 — astra relay fixes (F1/F2/F3 of mp-swap-reload-relay-REVIEW.md at 70b932cd)

## Scope and claim state

- [VERIFIED] Work performed only in `C:/Users/david/projects/aa-astra-pass95-relay` on branch `contrib/dave-gaming-pc/codex/pass95-relay-review-fixes`. No other worktree touched; `:4300` untouched; no browser launched; no owner process terminated.
- [VERIFIED] `git status` clean before edits; no merges from any other branch.
- [VERIFIED] Host authority, identity/epoch/life/idempotency checks, every existing test/fence/timing bound, and the `legacy-main` ceiling 37396 are unchanged (file measures exactly 37396 lines after the fix; the one added admission line is funded by joining the two-line timed-map fence into one line with identical semantics).

## Commits

- `8cc366a2` — F1/F2/F3 source, focused tests, and REPORT wording fix (5 files, +61/−5).
- Lane REPORT commit recorded below at handoff (this file only).

## Changed paths

- `src/multiplayer-relay.ts` — new pure helper `clampAdmittedHeldWeapon(snapshot, sidearm)`.
- `src/legacy-main.ts` — import extended (same line); timed-map holder fence joined 2 lines → 1 (verbatim semantics, pinned substring preserved); one-line host clamp after the primary/secondary gates, before trigger-reset/store/broadcast.
- `src/multiplayer-relay.test.ts` — F1 behavioral regression block (3 tests).
- `src/hf504-multiplayer-audit-fixes.test.ts` — vacuous weapon-spread pin replaced with a clamp-call pin (F3).
- `docs/evidence/pass95/mp-swap-reload-relay/REPORT.md` — reload broadcast wording corrected (F2).

## F1: host allow-lists guest-claimed equipped `snapshot.weapon`

- Defect: only `railgun` and timed-map weapons were holder-fenced; an ordinary claimed weapon (e.g. `sniper` over an `m4a1/pistol` loadout) passed every gate, was stored (`remote.snapshot`) and rebroadcast in canonical state. Bounded blast radius (ammo authority stays in the host ledger; projections pair-keyed and caps-checked) — peer-presentation spoof, not ammo/fire.
- Fix: `clampAdmittedHeldWeapon` clamps a claimed ordinary weapon outside the admitted `{primary, sidearm}` pair to the admitted primary, using the post-gate admitted primary so pickup-authorized and respawn-canonical pairs behave. Pass-through: either pair member; holder-gated specials that survived their fences (`railgun`, `flamethrower`, `flare-gun`); `crimson-flamethrower`, a personal care-package grant with no host holder registry — matching `canonicalRetainedGuestSnapshot`, which likewise passes it through rather than clamping it to primary.
- Source tracing guardrails: respawn merge already forces `weapon = primary`; pickup-authorized primary changes admit the new pair before the clamp runs; `remoteLoadoutSidearm` preserves the dhv-X `magnum` mapping; the clamp sits before `resetIfWeaponChanged`, pending-reload weapon-mismatch, store, and broadcast, so all downstream consumers see the admitted value.

## F3: vacuous source-text assertion replaced (not deleted)

- The old pin `remote.snapshot = { ...remote.snapshot, weapon:` matched 3 railgun paths on base — green without the fix. Replaced with a pin on `clampAdmittedHeldWeapon(admittedIncoming, remoteLoadoutSidearm(admittedIncoming))` inside `onNetworkMessage` (verified enclosed in that function body; 0 hits on base → genuine RED), beside the kept genuine `applyRemoteInventoryProjectionToMaps(` pin.

## F2: REPORT wording corrected

- `docs/evidence/pass95/mp-swap-reload-relay/REPORT.md` §Reload said the host result goes "to every admitted peer except the claimant". `network.send(result)` carries no exclusion (`broadcast` skips only the named `exceptPlayerId`), so the claimant receives it too — necessarily, since `acceptLocalReloadResult` is the claimant's own commit path. Now reads "claimant included".

## Behavioral cases (new tests, `src/multiplayer-relay.test.ts`)

- Forged `sniper` over `m4a1/pistol` → clamped to `m4a1`; forged value run through `createCanonicalRemoteState` proves guest B's held weapon renders `m4a1`, never `sniper`.
- Legitimate swap (`pistol`, `m4a1`) passes through byte-identical (same reference).
- `railgun`, `flamethrower`, `flare-gun`, `crimson-flamethrower` pass through.

## Checks: executed vs OPEN

- [EXECUTED] `git diff --check` — clean.
- [EXECUTED] `git status` — only the 5 intended files modified, then committed as `8cc366a2`.
- [EXECUTED] `legacy-main` line count — exactly 37396 (ceiling unchanged, ratchet-safe); LF endings intact, no CRLF.
- [EXECUTED] Source-level negative-case analysis (no `node_modules` in this worktree, so no runtime): forged-ordinary clamp, valid-swap pass, holder-special pass, non-holder-special drop (fences above, verbatim), crimson carve-out, pickup/respawn ordering, dhv-X sidearm, pinned-substring preservation (`timedMapWeaponStates[admittedIncoming.weapon].holderId !== admittedIncoming.id` still present for `timed-map-weapon-main-integration.test.ts`), clamp enclosed in `onNetworkMessage` for the new `functionBody` pin.
- [OPEN] `npx tsc --noEmit`, focused Vitest gate (`multiplayer-relay`, `hf504`, relay/rejoin/size set), soak-contract units — for the orchestrator (lane constraints: no build, no npm installs).
- [OPEN] Permitted three-peer headless browser audit (SWAP/RELOAD/RELAY-GAP live clearance) — for the orchestrator.

## Unresolved risks

- `crimson-flamethrower` has no host holder registry, so a forged crimson claim still passes presentation (same as `canonicalRetainedGuestSnapshot` today). No ammo/fire authority is gained (ledger + caps-checked projections hold), but a dedicated remote crimson-grant authority would be needed to close the presentation gap — deliberately out of scope (would grow architecture).
- The timed-map fence join is a single 166-char line; no prettier gate exists in this repo (lint is text-integrity + tsc), and longer precedents exist in-file, but flagging in case a future formatter rewraps it (rewrap would add lines against the frozen ceiling).
