# PASS 95 — adversarial verification of the netcode diagnostics overlay lane

**Lane:** `contrib/dave-gaming-pc/claude/mp-diagnostics-overlay`
**Head verified:** `5273052bbb903bc1866a7ce09371a6bdfd23340b`
**Base:** `origin/contrib/dave-gaming-pc/claude/pass93-candidate` @ `465ae6b7`
**Worktree:** `C:/Users/david/projects/aa-wf-diag`
**Verifier:** Claude Code (Opus), adversarial pass — the goal was to REFUTE the lane, not to confirm it.

## Verdict: SHIP-WITH-FIXES — but do not publish

Every gate the lane quoted reproduced. Two real defects were found and fixed on the branch.
The lane's own `OPEN-1` (the overlay is not in `src/ui/surface-registry.ts`) is confirmed real and
still blocks publish. "Ship" here means the branch is trustworthy to carry into integration; it does
not mean it may be published.

### Three reasons

1. **Every quoted gate reproduced, at the exact numbers claimed.** `npx tsc --noEmit` clean; the
   eleven named vitest suites `11 passed / 143 passed`; `npm run qa:mp-evidence:contract`
   `11 pass / 0 fail`; `npx vite build` clean; the fixture analyser run reproduced byte-for-byte
   including the `1.870 m` asymmetry row and `EXIT=2`; and the headless boot check reproduced
   `overlayCountBeforeF3: 0`, `hiddenAfterSecondF3: true`, `errors: []`. Nothing was rounded,
   nothing was quoted from a different run. The size ratchet is genuinely untouched:
   `src/legacy-main-size-ratchet.test.ts` has **no diff at all** against the base, `LINE_CEILING`
   is still `37_396`, and no `*.test.ts` in the tree was modified — the diff against base is
   17 added files and exactly 3 modified ones (`package.json`, `src/legacy-main.ts`,
   `src/network.ts`), so there is nowhere for a weakened assertion to hide.

2. **The "bundles are untrusted" claim was false where it mattered most, and is now true.**
   The header of `scripts/qa/mp-evidence-analyse.mjs` promised untrusted-input handling, and that
   promise covered parsing and arithmetic but not *rendering* — which for a tool whose only output
   is a verdict a human reads is the half that matters. A crafted bundle was built and run against
   the shipped script: a newline inside `peers[].peer` split one table row into several lines and an
   ESC byte inside a trace `kind` reached the terminal verbatim. The sender of a bundle could
   therefore forge a plausible extra row and a second `VERDICT:` line under the real one. Fixed with
   `safeLabel`/`safeCount` at the point values leave the bundle (so `--json` consumers are covered
   too), plus three contract tests that replay both payloads. Contract is now `14 pass / 0 fail`.

3. **The boot gate was real but not reproducible as quoted, and now says so.** `node
   scripts/qa/netcode-overlay-boot-check.mjs` does not start a server; run on its own it died on a
   raw Playwright `ERR_CONNECTION_REFUSED` stack, which reads as "the feature broke" rather than
   "you forgot the preview". The script's own docblock does document the two-step, so the claim was
   abbreviated rather than untrue — and once `vite preview --port 4207 --strictPort` was started the
   check passed exactly as quoted. The navigation is now wrapped so the setup mistake is named.
   Notably the first attempt at this fix — a `fetch()` preflight — was itself wrong and was thrown
   away: vite binds `::1` only on this machine, `fetch('http://localhost:4207/')` resolves to
   `127.0.0.1` and fails against a server Chrome loads perfectly well, so the preflight would have
   redded this gate on a machine where the overlay is fine. The guard wraps the real `page.goto`
   instead, so it cannot disagree with the check it guards.

## What was checked and did NOT refute the lane

- **Host authority.** The feature is observe-only; it mints no state and gates no gameplay. No
  guest-forgeable path into authority was found. Guest-supplied numbers (`message.reportedRttMs`)
  do reach the host's overlay, but display-only, and `NumericRing` rejects non-finite samples.
- **The privacy claim holds structurally.** `recordTrace` takes `{t, dir, kind, peer, seq, bytes}`
  and there is no path by which message content is copied. `sanitiseTraceKind` is a genuine
  `Set`-backed allowlist, so the `Object.prototype` lookup case (`type === 'constructor'`, reachable
  because `observeInbound` runs before any validation) returns `'other'` rather than a function.
- **The byte cap is enforced on the real serialisation**, not an estimate — a
  `while (JSON.stringify(bundle).length > EVIDENCE_MAX_BYTES)` shed loop, as claimed.
- **Idempotency.** `setNetcodeSession` early-outs when nothing moved, so the per-frame call does not
  churn `revision` and defeat the overlay's repaint suppression. Confirmed by reading, and the
  overlay does zero work when it has never been opened (`overlay` is `null`).
- **The HUD gates the lane admits it skipped, pass.** `src/ui/surface-registry.test.ts` and
  `src/ui/menu-preview-camera.test.ts` were run here: `13 passed`. That is why `OPEN-1` is a policy
  gap rather than a red gate — nothing currently *enforces* registry membership, so the registry
  will silently not know about this surface.

## TODOs — larger than a verify-pass fix, recorded not fixed

- **TODO-V1 (lifecycle, highest of these).** `forgetNetcodePeer()` and
  `resetNetcodeDiagnosticsRuntime()` have **zero production call sites** — only tests call them.
  Peer rows are therefore cleared only inside `setNetcodeSession`, and only on a *role* change. A
  disconnecting guest is never forgotten, so its row persists in the overlay and in any bundle
  exported afterwards. Wire `forgetNetcodePeer` to the existing peer-departure path and
  `resetNetcodeDiagnosticsRuntime` to return-to-lobby.
- **TODO-V2 (unbounded, unvalidated peer rows).** `observeNetcodeInbound` is the **first statement**
  of `onNetworkMessage`, before any participant or authority validation, and `peerFor()` has no cap
  on `model.peers`. A peer sending messages with varying `by` ids creates unbounded peer records —
  each holding several `Float64Array` rings — and can place ids the game never admitted into an
  evidence bundle a friend then emails to the owner. Cap the map, and/or observe after admission.
- **TODO-V3 (allocation on the always-on path).** `observeOutboundToHost` does
  `for (const peer of model.peers.values())` on **every** client-side send, allocating a Map
  iterator per message. Small, but the lane's "always on and allocation-free" framing does not
  cover it. Cache the resolved host peer id and invalidate on role change.
- **TODO-V4 (display ambiguity).** `pad(row.peer, 14, false)` truncates; two peers sharing a
  14-character prefix render as the same label in the divergence table, which is exactly the table
  meant to tell two peers apart.
- **TODO-V5 (bookkeeping).** The lane's summary states `src/legacy-main.ts` went
  `37,231 -> 37,262 (+31)`. Measured here: **37,261 (+30)**. The ceiling is unaffected.

## Gates re-run in this verification pass (all after the fixes below)

| Gate | Result |
| --- | --- |
| `npx tsc --noEmit` | clean, no output |
| 11 lane+network suites + `src/ui/surface-registry.test.ts` + `menu-preview-camera` | `12 files / 151 tests passed` |
| `npm run qa:mp-evidence:contract` | `14 pass / 0 fail` (11 original + 3 new hostile-input) |
| `npm run qa:mp-evidence -- .../fixture` | identical table, `1.870 m` divergence, `EXIT=2` |
| `npx vite build` | `built in 3.77s` |
| `node scripts/qa/netcode-overlay-boot-check.mjs` (preview on 4207) | `errors: []`, `OK`, exit 0 |
| size ratchet | `LINE_CEILING` `37_396` unchanged; ratchet test file has no diff vs base |

## Fixes applied on the branch by this pass

1. `scripts/qa/mp-evidence-analyse.mjs` — `MAX_LABEL_LENGTH`, `safeLabel()`, `safeCount()`, applied
   to every string and count lifted out of an untrusted bundle before it reaches the report or the
   `--json` output.
2. `scripts/qa/mp-evidence-analyse.test.mjs` — three tests: control-character stripping and length
   clamping, `safeCount` coercion, and a hostile bundle that must not be able to forge a table row
   or emit an escape byte.
3. `scripts/qa/netcode-overlay-boot-check.mjs` — the navigation is wrapped so a missing preview
   server produces the command to run instead of an unhandled Playwright stack.

## Housekeeping

One `vite preview` on port **4207** was started for the boot check and stopped again; `netstat`
shows no listener on 4207 afterwards. Dave's `:4300` was never touched, no other worktree was
entered, and no `npm install`/`ci`/rebuild was run.
