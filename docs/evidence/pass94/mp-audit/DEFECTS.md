# HF-504 — multiplayer systematic audit: defect register

Owner, 2026-09-04 21:50, verbatim: *"ensure you are properly debugging multiplayer -
some of the issues are the same we have had for months: in lobby, guest/host, desync,
cannot reload or pick up guns, so many issues"*.

Lane: `contrib/dave-gaming-pc/claude/mp-audit-hf504`, base
`origin/contrib/dave-gaming-pc/claude/pass93-candidate` @ `8d6b41f2`.
Driver: `scripts/qa/mp-audit.mjs` — host + **two** guests, real menu and lobby,
headless, ports 4198/4199. Raw evidence: `baseline-audit.json`, `baseline-run.log`.

## Why two guests

Every pre-existing multiplayer driver in this repo is two-sided (host + one guest).
With one guest, *"the host's view"* and *"the other player's view"* are the same view,
so **guest-to-guest replication has never been observed at all**. Three of the rows
below (P-3, R-1, X-1) are only visible with a third peer. That is the structural
reason a class of these defects has survived every pass.

## On "months-old"

The repository's first commit is **2026-07-11**, so nothing in it literally predates
2026-07. The useful signal is code that has survived unchanged since the original
build-out (`1f0a1661b`, 2026-07-25, the legacy-main split). Rows marked
**ORIGINAL** are that bucket — present since the beginning and never corrected,
which is what the owner is describing.

## Claim-states

- **MEASURED** — reproduced by the driver in this run, with the trace excerpt attached.
- **TRACED** — proven by reading the code path end to end; not exercised by this run.
- **DRIVER-ARTIFACT** — the driver produced a failure that is the harness's fault, not the product's.

---

## A. The owner's named items

| # | Owner's words | Status this run | Row |
|---|---|---|---|
| 1 | "in lobby" (ready / start / roles) | **MEASURED** — START enabled with an incomplete roster | L-1, L-2, L-3 |
| 2 | "guest/host" asymmetry | **TRACED** — 10 lobby surfaces render local state instead of the authority | L-4 |
| 3 | "desync" | **MEASURED** — 57.27 m position split on one sample | X-2 |
| 4 | "cannot reload" | **TRACED** — reload is bricked from a guest's first death onward | R-1 |
| 5 | "cannot pick up guns" | **TRACED** — a rejected pickup permanently poisons the drop | P-1 |

---

## B. Register

### P — weapon pickup

| ID | Symptom | Repro | Trace / evidence | Root cause | Fix | Months-old |
|---|---|---|---|---|---|---|
| **P-1** | Guest presses F, the feed says `PICKED UP`, the gun appears, then silently reverts — and that drop never works again | Guest claims a drop the host rejects (already taken, stance/position mismatch) | host sends a canonical drop record on **every** reply incl. rejection (`legacy-main.ts:15483`); guest discarded it | `legacy-main.ts:15592-15595` — `applyCanonicalPickupDrop` was reached only on the accepted path, so the guest restored its own **stale** drop verbatim and the next F-press failed identically, forever | **FIXED** — adopt the host record on rejection + `PICKUP DENIED` feed + diagnostic | no — 2026-08-22 |
| **P-2** | Rejected claim rolls back up to 1.5 s later with no signal | drop the `pickup-result` | `expirePendingLocalPickup`, deadline 1500 ms | `legacy-main.ts:15567-15577` | TODO — needs a user-visible pending state | no — 2026-08-22 |
| **P-3** | Guest B re-simulates guest A's **unvalidated** pickup claim and never gets a correction | 3 peers only | `relay` in `baseline-audit.json`: `pickup` is in guestA's `sent` **and** guestB's received set | `network.ts:1285-1286` — `pickup` is not in the allow-list at `:1271-1280`, so the transport blindly relays a guest's raw claim to every other guest; `pickup-result` is unicast (`:15486`), so guest B has no repair channel | **TODO (design)** — stop relaying raw `pickup`; broadcast the accepted `pickup-result` instead. Must land together with P-4 or guests freeze | no — relay 2026-07-21, handler ORIGINAL |
| **P-4** | A guest that rejects a pickup freezes that player until they die | follows P-3 | — | `legacy-main.ts:13498-13517` — the `return` at `:13516` runs on **guests** too, so guest B drops every later state message from that player | **TODO** — pairs with P-3 | ORIGINAL (guard), 2026-08-22 (the `return`) |
| **P-5** | Auto-scavenge mutates guest state with no rollback record | walk over a drop | — | `legacy-main.ts:15375-15416` sets no `pendingLocalPickup`; the result handler's `pending === null` branch then force-switches the weapon (`:15558-15560`) | TODO | no — 2026-07-25 / 2026-08-22 |
| **P-6** | Drops are not host-authoritative: every peer spawns its own copy | any death | ids match (`death-${nonce}`), **content does not** | `legacy-main.ts:15091` called from `processDeath` on all peers; weapon/position from each peer's local view | TODO — feeds the `weapon-mismatch`/`drop-distance` rejections that P-1 then makes permanent | ORIGINAL |
| **P-7** | Driver reported `PICKUP-NO-EFFECT` on both guests | this run | `interact.returned: false`, `sentPickup: false` | **DRIVER-ARTIFACT** — `spawnDeathDrop` stages a drop from `victim: player.id`, i.e. the guest's *own* identical full-reserve primary, which `consumeDeathDropWeapon` correctly refuses | **FIXED in the driver** — stage an alternative primary, then re-equip, so the F-press is a genuine cross-weapon pickup | n/a |

### R — reload

| ID | Symptom | Repro | Trace / evidence | Root cause | Fix | Months-old |
|---|---|---|---|---|---|---|
| **R-1** | **Reload stops working for the rest of the match after a guest's first death** | guest reloads ≥1×, dies, respawns, reloads | host `reject('action-sequence')`; guest's `reloadState` cleared silently | host rebuilds per-guest authority on every life change (`guest-reload-authority.ts:62`, `lastActionSequence = -1`) and demands `=== last + 1` (`:83`); the guest's allocator was reset only on network reset, guest-resume and `startGame` — **never on respawn**. The reject path stores the *unchanged* state, so the mismatch never heals | **FIXED** — `localReloadActionSequence.reset()` in the new-life branch of `respawn()` | no — 2026-08-02 / 2026-08-22 |
| **R-2** | Same, via a lag spike instead of a death | bounded movement resync | `reload-result` stamped with the host's `lifeId` is dropped by the guest's own filter (`:6471`) | `legacy-main.ts:13559` bumps the host's lifeId on `movement.resynchronized` with **no** corresponding guest increment; every rejection is then undeliverable | TODO | ORIGINAL / 2026-08-02 |
| **R-3** | A legitimate in-flight reload is cancelled by a shot the host is about to reject | fire while reloading, out of ammo | guest gets `status:'cancelled'`, `reloadState` nulled silently | `legacy-main.ts:14341` — `cancelRemoteReloadAuthority` runs **before** the `missing-history` / `bad-origin` / `empty-magazine` rejections return | TODO — move the cancel after admission | no — 2026-08-02 |
| **R-4** | Ammo desync never self-heals | any missed projection | — | the host's only push-repair channel is inert: a `state` message about the guest applies **only `hp`** and returns (`:13308-13320`), never reading the attached `combatInventory` the host sent at `:13513` | TODO | no — 2026-08-02 / 2026-08-22 |
| **R-5** | Reload is invisible to other players | always | `PlayerSnapshot` has no reload field (`protocol.ts:142-162`) | not replicated | TODO (gameplay tell, not a break) | ORIGINAL |
| R-6 | guest reload acknowledgement | — | — | — | **OTHER LANE** (`mp-bugs-hf498`) | — |

### W — firing / weapon swap

| ID | Symptom | Repro | Trace / evidence | Root cause | Fix | Months-old |
|---|---|---|---|---|---|---|
| **W-1** | **"Sometimes randomly cant shoot ... after picked one up"** — dead trigger for up to ~944 ms after a swap or pickup | fire a slow weapon, swap/pick up a fast one, fire | silent except a `rate-of-fire` `fireBlock` counter | `player.nextShotAt` is a deadline in the **previous** weapon's cadence. Four weapon-granting paths clear it (gun-range armory, timed-map acquire, flamethrower, QA hook); the two **real gameplay paths** — `switchWeapon` (`:19202`) and `interactWithDeathDrop` (`:15330`) — did not | **FIXED** — clear it in both, plus a ratchet test so a seventh path cannot skip it | **ORIGINAL** |
| **W-2** | A silent fire refusal with no telemetry | timed-map weapon consumption rejected | nothing recorded | `legacy-main.ts:19467` returns without `refuseFire(...)` | TODO | no — 2026-08-02 |
| **W-3** | Host shot rejections never reach `fireBlockTelemetry` | guest dead trigger caused by host authority | `fireBlock.last` shows the *previous local* reason | rejections land in `recordShotProtocol`, not the fire-block telemetry | TODO — the owner's dead trigger is unattributable while this holds | no — 2026-08-23 |
| **W-4** | `finishReload` credits `player.weapon`, not `reloadState.weapon` | reload gun X, pickup reply switches to Y | — | `:19264-19271`; the pickup writers at `:15507` and `:15559` rewrite `player.weapon` with no `reloadState` check | TODO | ORIGINAL / 2026-08-22 |
| **W-5** | Guest writes reserve ammo locally with no authorization and no rollback | walk over a drop | inflated reserve passes the local reload gate, host rejects `nothing-to-reload` | `legacy-main.ts:15390` `autoScavengeDeathDrop` | TODO | **ORIGINAL** |

### L — lobby (ready / start / roles)

| ID | Symptom | Repro | Trace / evidence | Root cause | Fix | Months-old |
|---|---|---|---|---|---|---|
| **L-1** | **START enabled while the roster was incomplete** | host alone, before a guest connects | **MEASURED** — `LOBBY-START-EARLY` fired during both joins | `private-match.ts:392-400` `canHostCommitStart` requires only `connected.length >= 1` | TODO (product decision: is a 1-player start intended? The owner says "game starts before all people join") | no — 2026-07-25 |
| **L-2** | Players inside the 90 s rejoin grace are invisible to the start gate | start while someone is rejoining | — | `private-match.ts:399` filters to `connected`, which `markLobbyDisconnected` has already set false | TODO | no — 2026-07-25 |
| **L-3** | Host renders itself `SETTING UP` next to an **enabled** START | always | — | two divergent predicates: `canHostStart` (host must be ready) vs `canHostCommitStart` (host exempt); the UI uses the exempting one and the commit path force-writes host ready | TODO | no — 2026-07-21 |
| **L-4** | Guest and host see different lobbies | first seconds after JOIN | 10 surfaces enumerated in REPORT.md §Lobby | `renderPrivateLobby` falls back to local state: roster, every config field, ready label, ping, HOST badge; `#join` reveals the panel **without** calling `renderPrivateLobby()`, so a joining guest sees fabricated `1 / 4` markup with an enabled READY that dead-ends | **PARTIALLY FIXED** — the stale-ready fallback (below); the other nine remain TODO | **ORIGINAL** |
| **L-5** | A guest the host dropped keeps rendering `READY ✓` | grace expires / rejoin denied / room closed | — | `localLobbyReady = localMember?.ready ?? localLobbyReady` — stale local value survives absence from the authoritative roster | **FIXED** — clear when a snapshot exists and does not list this player | **ORIGINAL** |
| **L-6** | Host closes the room; the guest keeps a live-looking lobby with a dead READY button | host resets the lobby | `network.ts` records the farewell (`noteValidHostMessage`) but **nothing forwarded it to the app** | `onNetworkMessage` had no `lobby-closed` branch — it fell through to `return false` | **FIXED** — tear down like the sibling `lobby-reject` does, with a reason string | **ORIGINAL** |
| **L-7** | The displayed countdown is wrong by the raw host↔guest OS clock offset | any start | clamp `max(1, min(5, …))` hides it: the guest pins at `DEPLOYING IN 5` | `:10844` subtracts the guest's `Date.now()` from the **host's** epoch; `estimateHostClockOffset` exists and **has no caller outside tests**. (The actual deploy instant *is* correctly skew-mapped) | TODO | no — 2026-09-01 |
| **L-8** | A promoted successor host is silently ignored by its own followers | host crash | successor restarts revision below its followers' | `:8855` restores `revision` from the mirror, then broadcasts `+1`; guests hold a higher revision and drop every snapshot at the `<` guard (`:10450`). No repair path | TODO | **ORIGINAL** |
| **L-9** | The roster is destroyed and rebuilt at least every 2 s on both sides | idle in the lobby | `clock-ping` (2 s/guest) drives a full `broadcastHostLobby` + `roster.innerHTML` rewrite | `:10769` + `:9971` — `revision` becomes latency telemetry rather than a state-change signal, which is the root enabler of L-8; an open DHV dropdown cannot survive | TODO | **ORIGINAL** |
| **L-10** | A countdown joiner gets a start deadline already in the past | join at t+4.5 s | fixed 5 s lead stamped at host-click time | `:9671-9676` | TODO | no — 2026-08-02 |
| **L-11** | A rejoin that begins in `countdown` and lands after `active` regresses **every** guest's phase | race | `currentPhase` captured before two `await`s, then published at a higher revision | `:9563` + `:9668` | TODO | no — 2026-08-02 |
| **L-12** | `lobby-start` accepted at equal revision with no nonce dedupe | countdown joiner gets both the broadcast and the unicast | `>=` at `:10706`, no `processedNonces` consult | absorbed only by luck of the admission identity dedupe | TODO | **ORIGINAL** |

### D — damage, credit, respawn

| ID | Symptom | Repro | Trace / evidence | Root cause | Fix | Months-old |
|---|---|---|---|---|---|---|
| **D-1** | Victim sees full health, everyone else's damage math uses a lower value | adrenaline killstreak, 15 s | direction is the worst one — the next hit snaps them down | `local-health-regen.ts:24-25` models adrenaline; `advanceRemoteHealthAuthority` takes no adrenaline parameter and is never passed one | TODO — this is the literal "10 hp on my screen, full health on his" | no — 2026-08-22 |
| **D-2** | A guest dies to fall damage / own grenade and the host never learns | fall on a guest | no death on the scoreboard, no kill feed, permanent HP disagreement | `:27120` / `:23076` call `applyDamage` on clients; `:15056` suppresses the death message for clients; the host then stamps the guest's HP back to its stale value | TODO | no — 2026-07-22/23 |
| **D-3** | Kill **and** the victim's death are both lost when the killer left | killer disconnects between the hit and `processDeath` | the victim's death is recorded inside the same branch that credits the killer | `authoritative-death-outcome.ts:91` | TODO | no — 2026-08-20 |
| **D-4** | Suicides never increment deaths | fall damage on the host | feed line, zero scoreboard effect | `authoritative-death-outcome.ts:85` short-circuits when killer === victim | TODO | no — 2026-08-20 |
| **D-5** | Host is unkillable for 1350 ms after every respawn in TDM; guests get 0 ms | TDM respawn | `RemoteHealthAuthorityState` has **no** invulnerability field at all | `spawn-safety.ts:8-11` — the FFA fix was never extended | TODO — a fairness asymmetry favouring the host | no — 2026-07-25 |
| **D-6** | Respawn position is entirely guest-chosen | any respawn | host accepts any in-bounds point; no spawn-list, separation or reservation check | `:17253` + `remote-movement-admission.ts:38-39` | TODO — also a free teleport primitive for a modified client | **ORIGINAL** (oldest row here) |
| **D-7** | Every guest's shot is rejected for ~150 ms after **any** host respawn | host respawns | including guest-A-shoots-guest-B, which the host was not part of | `:14466-14476` hard-`return`s where the remote-target loop one block later uses `continue` | TODO | no — 2026-07-24 |
| **D-8** | Two incompatible lag-compensation models coexist | melee/explosive vs gun | legacy path double-counts: `sampleAgeMs` is already one-way, then adds `rttMs / 2` | `network-fairness.ts:48-50` vs `authoritative-shot.ts:121-124` | TODO | no — 2026-07-23 |
| **D-9** | A real player is silently evicted from every guest's scoreboard | a non-member id gets a score row | the other two projections of the same map filter by identity; this one truncates by insertion order | `:9976` `.slice(0, capacity + bots)` | TODO — self-heals on the next heartbeat | no — 2026-07-23 |

### X — cross-cutting, only visible with three peers

| ID | Symptom | Repro | Trace / evidence | Root cause | Fix | Months-old |
|---|---|---|---|---|---|---|
| **X-1** | **The host receives guest message types it never relays to the other guest** | 3 peers | **MEASURED** — `notRelayed`: `reload-intent`, `trigger-state`, `shot-request` (both directions), plus `high-score` one way | by design for `shot-request`/`reload-intent` (host-arbitrated), but `trigger-state` is a **presentation** signal: guest B never sees guest A's trigger held, so muzzle/tracer presentation for guest-vs-guest is driven only by `shot` results | TODO — confirm intent per type; `trigger-state` looks like a genuine gap | — |
| **X-2** | **Position desync, 57.27 m** | 1 of 12 one-second samples | **MEASURED** — guestB placed guestA at `[6, 1.7, 24]`, host at `[-6, 1.7, -32]` | at `second: 0`, i.e. the first sample after deploy: guest B had not yet received guest A's first authoritative state, so it rendered a **spawn-default** position. Consistent with D-6 (each peer picks its own spawn) | TODO — needs a guest-side "not yet authoritative" gate rather than a default pose | — |
| **X-3** | **After a rejoin, no peer sees the full roster again** | guest leaves and rejoins | **MEASURED** — `REJOIN-NOT-REGISTERED`; all three peers `rejected`; `remotesAfterLeave` host=1, guestB=1 | — | **OTHER LANE** (`mp-desync-hf499` owns rejoin re-registration) — recorded here as independent confirmation that it reproduces with three peers | — |

---

## C. Counts

| | Count |
|---|---|
| Rows total | 41 |
| **Fixed this lane** | **5** (P-1, R-1, W-1, L-5, L-6) + 1 driver fix (P-7) |
| TODO | 33 |
| Other lane | 2 (R-6, X-3) |
| ORIGINAL (survived since 2026-07-25, never corrected) | 12 |
| Reproduced by the driver this run (MEASURED) | 6 |

## D. What this run did **not** exercise

Stated so the register is not read as a clean bill of health:

- **R-1 was not triggered by the driver** because the reload scenario runs *before* the
  death scenario, and R-1 only appears after a guest's first death. The owner hits it;
  the harness ordering hid it. Reordering (or a second reload pass after respawn) is the
  first improvement the driver needs.
- The impaired configuration (`--latency`, 100 ms RTT / jitter) was **not** run inside
  the time box; only the clean baseline was. D-8 and X-2 are latency-sensitive and their
  severity under impairment is unmeasured.
- Only `nuketown2` was swept. The driver takes `--arena` and the roster is derived from
  `SELECTABLE_ARENAS`, never a hand-kept list.
- Bots were not enabled, so no bot-vs-guest crediting path was observed.
