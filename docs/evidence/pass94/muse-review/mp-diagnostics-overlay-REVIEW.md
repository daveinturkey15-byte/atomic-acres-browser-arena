# Muse review — mp-diagnostics-overlay (third pair of eyes)

**Scope:** `contrib/dave-gaming-pc/claude/mp-diagnostics-overlay` at `d4ac3bed`
(= HEAD `fix(mp-diagnostics-overlay): verify - harden the analyser against hostile bundles`),
diffed against `origin/contrib/dave-gaming-pc/claude/pass93-candidate` (`465ae6b7`),
plus the **uncommitted Luna follow-up worktree changes** reviewed as-found
(`src/legacy-main.ts`, `src/netcode-diagnostics.ts`,
`src/netcode-diagnostics-runtime.ts`, `src/netcode-diagnostics.test.ts`,
`src/ui/surface-registry.ts`, `src/ui/surface-registry.test.ts`).
Read `REPORT.md` and `VERIFY.md` first, then the code.
Static review only: no builds, no browsers, no GPU, no `npm` runs per task constraints.
Nothing in this review re-runs a gate; every verdict below is a reading of the code.

**Verdict: SHIP-WITH-FIXES** (carry into integration; do not publish — no acceptance
manifest change exists on this branch, and the strongest fixes are still uncommitted).
Three reasons:

1. The four load-bearing safety claims reproduce in the source as quoted:
   allocation-free hot path, byte-capped content-free bundles, allowlisted analyser
   with sanitised rendering, and no code-execution sink. Quotes in §1–§3.
2. The uncommitted follow-up closes the verifier's two publish-relevant TODOs
   (peer lifecycle wiring, bounded peer map + cached host lookup) and the lane's
   own OPEN-1 (surface-registry entry) — correctly, with narrow tests. The branch
   to ship must include that work; HEAD alone still has all three gaps.
3. What remains is bounded polish, none of it architectural: first-16-win cap with
   no eviction (§4-F1), one rare-path spread allocation (§4-F2), analyser column
   overflow for long ids (§4-F4, cosmetic), and the already-declared OPEN recording-
   overhead measurement. No test was loosened (§5).

---

## 1. Zero per-frame allocation — HOLDS (steady state), one rare-path nit

Model tier (`src/netcode-diagnostics.ts`):

- `NumericRing.push` (`src/netcode-diagnostics.ts:95-104`) writes into one
  `Float64Array`, rejects non-finite input by counter. No allocation.
- `RequestOutcomeRing.record` (`src/netcode-diagnostics.ts:202-212`) mutates a
  preallocated slot in place: `slot.used = true; slot.kind = kind; …` — never
  constructs an object, as the comment claims.
- `RecordRing.nextSlot` (`src/netcode-evidence-recorder.ts:158-166`, class at
  145) same shape for traces/diffs. `recordTrace`/`recordDiff` (`:249-266`) only
  assign scalars plus `safeId` (a bounded `slice`) and `sanitiseTraceKind` (a
  `Set.has`). No allocation per message.
- All six `record*` entry points now null-guard the capped `peerFor`
  (`src/netcode-diagnostics.ts:396-467`, each `if (!peer) return;`).
  `recordRttSample` (`:396`) additionally validates `sampleMs` **before**
  `peerFor`, so junk samples no longer mint peer rows — strict improvement over HEAD.

Overlay (`src/netcode-diagnostics-overlay.ts:118-130`): `update()` early-outs on
`!visible` → `model.revision === lastRevision` → 250 ms interval
(`NETCODE_OVERLAY_REPAINT_INTERVAL_MS`, `:39`), reuses the session-lifetime
`lines` array via `renderDiagnosticsLines(model, nowMs, lines)` (`:122`), and only
touches the DOM when the joined text differs (`:126-128`). Per-repaint (4 Hz, not
per-frame, not per-message) costs are one `lines.join('\n')` (`:123`), one
`PeerSummary` object per peer (`summarisePeer`, `src/netcode-diagnostics.ts:509`),
and format strings — all documented in the code (`:469-472`) and acceptable.

Per-frame path (`src/netcode-diagnostics-runtime.ts:176-184`): `tickNetcodeDiagnostics`
→ `setNetcodeSession` (early-outs when nothing moved, `:161`, so no `revision`
churn) → `updateNetcodeOverlay` (false when the overlay was never opened).
`messageBytes` (`:195-202`) checks `if (!recording) return 0` **first**, so idle
players never `JSON.stringify`. As claimed.

## 2. Evidence bundle exporter — HOLDS

- **Size cap on the real serialisation**, not an estimate
  (`src/netcode-evidence-recorder.ts:348-356`):
  `while (JSON.stringify(bundle).length > EVIDENCE_MAX_BYTES …)` sheds traces
  oldest-first in 20% chunks and accounts them in `dropped.byBytes`. Cap value
  `EVIDENCE_MAX_BYTES = 4_000_000` (`:45`).
- **No personal data beyond peer ids / room code.** Trace entry is
  `{t, dir, kind, peer, seq, bytes}` (`:249-258`); chat contributes size + the word
  `chat`, never text. `sanitiseTraceKind` (`:60-62`) is a `Set`-backed allowlist,
  unknown → `'other'`. Request reasons pass `/^[a-z0-9-]{0,32}$/u` or become
  `'other'` (`:283`). Peer/room ids pass `safeId` (64-char clamp, `:199-201`).
  The name-absent serialisation test cited by REPORT still exists in
  `src/netcode-evidence-recorder.test.ts` (unchanged by the follow-up).
- **Schema stable.** `EVIDENCE_SCHEMA_VERSION = 1` (`:35`); `validateEvidenceBundle`
  (`:373-396`) rejects version mismatch plus mistyped `roomCode`/`localPeerId`/
  `localRole` and non-finite peer numerics. `evidenceFileName` (`:415-419`)
  strips to `[A-Za-z0-9_-]`. `build()` is correctly marked the ONLY allocating
  path, run on the export key (`:191-196`).

## 3. Analyser treats bundles as untrusted — HOLDS

- No execution sink: `eval(`, `Function(`, `child_process`, `spawn`, `execSync`
  occur zero times in `scripts/qa/mp-evidence-analyse.mjs`; the single
  `JSON.parse` is a `readFileSync` + try/catch load. Bundle strings never reach a
  command — argv paths are operator-supplied local files.
- `validateBundle` gates before any field is read; derived numbers are recomputed
  (`recomputedDesync`, recorder `:404-412`) rather than trusted — the REPORT
  design-bug fix (`desyncSessionP95`) is present at recorder `:324-327`.
- Rendering boundary (the verifier's fix) is present and applied to table rows,
  `--json` output, and dropped-count arithmetic:
  `safeLabel` strips `[\x00-\x1f\x7f-\x9f]` → `'?'` and clamps to 64 with `~`
  suffix; `safeCount` coerces to finite non-negative int, else 0. Call sites cover
  `roomCode`, `localPeerId`, roles, `peer.peer`, `windowMs`, and all four
  `dropped.*` counters.

## 4. Findings (file:line + smallest fix)

**F1 — peer cap without eviction or admission check (low).**
`peerFor` returns `null` past `MAX_DIAGNOSTIC_PEERS = 16`
(`src/netcode-diagnostics.ts:40, 303`), and `observeInbound` is still the first
statement of `onNetworkMessage` (`src/netcode-diagnostics-runtime.ts:209`),
before validation. Unbounded growth is fixed, but pollution is not: 16 forged
`by` ids permanently occupy the map and a 17th legitimate peer is silently
dropped (`if (!peer) return`). *Fix (pick one):* observe inbound only after the
existing participant/admission check in `legacy-main.ts`, or evict the
least-recently-seen non-admitted row when capped. New bound test
(`src/netcode-diagnostics.test.ts:253-261`) pins the cap; extend it to pin the
chosen eviction/admission rule.

**F2 — rare-path spread allocation (nit).**
`observeOutboundToHost` fallback (`src/netcode-diagnostics-runtime.ts:268`):
`[...model.peers.values()].find(...)` allocates an array + iterator per call.
Steady state uses `cachedHostPeerId` (`:262-265`) so this runs only pre-first-
inbound or after a forget — but the verifier's TODO-V3 asked to remove the
allocation, and the spread allocates strictly more than the loop it replaced.
*Fix:* `for (const peer of model.peers.values()) { if (peer.role === 'host') … break; }`
(iterator only, no array).

**F3 — lifecycle gaps closed in worktree, verify before commit (positive, no fix).**
`resetNetcodeDiagnosticsRuntime()` wired to lobby reset (`src/legacy-main.ts:7785`),
`forgetNetcodePeer` wired to both departure paths — grace-expiry (`:9909`) and
`removeRemote` (`:16690`); `setNetcodeSession` now clears peers on **any** session
identity change, not just role change (`src/netcode-diagnostics-runtime.ts:160-168`),
with the per-frame early-out preserved. `forgetNetcodePeer` also invalidates
`cachedHostPeerId` (`:186-189`). Correct as read; this resolves TODO-V1. Note
`removeRemote` forgets before the `remotes.get` guard (`:16689-16691`) — harmless
(`forgetPeer` on unknown id returns false).

**F4 — TODO-V4 does not reproduce as written (informational, cosmetic only).**
VERIFY.md claims `pad(row.peer, 14, …)` truncates; the current `pad`
(`scripts/qa/mp-evidence-analyse.mjs:244-250`) does `if (text.length >= width)
return text` — long ids **overflow** the column instead of colliding. Two
same-prefix peers stay distinguishable; a 64-char hostile id just misaligns one
row. No fix required; optional: wrap or note the overflow in the header.

**F5 — OPEN-1 closed in worktree but uncommitted (process).**
Registry entry (`src/ui/surface-registry.ts`, `netcode-diagnostics-overlay`,
`match-hud`, `critical: false`, `kind: 'diagnostics-overlay'`, `toggleCode: 'F3'`,
`zIndex: 70`, `pointerEvents: 'none'`) matches the implementation
(`element.id = NETCODE_OVERLAY_ELEMENT_ID`, `OVERLAY_STYLE` `:55` `'z-index:70'`
and `:69` `'pointer-events:none'`, toggle `F3` `:32,145-148`). Boot ordering is
right: `ensureNetcodeOverlay(document)` (`src/legacy-main.ts:1501`) runs before
`assertUiSurfaceInventory(document)` (`:1502`), which throws on any missing
surface — the overlay would otherwise fail its own inventory assert. Cost: one
`<pre>` allocated at boot for players who never press F3; no per-frame cost
(`update` early-outs while hidden). *Fix:* commit it — publish remains blocked
until this worktree is committed, since HEAD still lacks the entry. Sole
production caller of the assert is `legacy-main.ts:1502`; no test DOMs to break.

**F6 — bookkeeping (informational).** TODO-V5 confirmed: `+31` in REPORT vs
measured `+30`. Ceiling unaffected (`LINE_CEILING = 37_396`,
`src/legacy-main-size-ratchet.test.ts:78`; ratchet file untouched in worktree).
Luna adds ~6 lines to `legacy-main.ts`; headroom remains >120 lines.

## 5. Test loosening — NONE FOUND

- HEAD vs base (committed): per VERIFY.md, no `*.test.ts` modified; ratchet file
  has no diff. Taken as read (not re-verified — no test runs per constraints);
  the worktree diff corroborates the shape (17 added files + 3 modified at HEAD).
- Worktree (uncommitted): `src/netcode-diagnostics.test.ts` changes are `peer` →
  `peer!` non-null assertions (required by the `PeerDiagnostics | null` return)
  plus the new cap test — no threshold, boundary, or expectation weakened.
  `src/ui/surface-registry.test.ts` carves `kind === 'diagnostics-overlay'` out
  of the exact-once static-HTML id check (the overlay is dynamically created, so
  the old assertion cannot apply) and adds a dedicated registry test pinning the
  full entry plus the four source constants. The carve-out is narrow (one kind)
  and the new test is stricter than what it replaces for that surface.

## 6. Still OPEN (carried, not new)

Recording overhead at 40 Hz × peers (`JSON.stringify` per message while
recording) remains unmeasured — REPORT states this honestly. Suggest the named
frame-pacing capture with recording on before offering mid-firefight recording
to friends. Not publish-blocking for integration.
