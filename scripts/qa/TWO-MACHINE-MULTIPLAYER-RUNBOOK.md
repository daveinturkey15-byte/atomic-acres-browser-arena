# Two-Machine Multiplayer — Owner Runbook (10 minutes)

Two-machine play has never been tested. Everything to date is two windows on one PC.
This is the close-out bar. Follow this top to bottom; each step says what PASS looks
like and what to capture. Total time after one-time setup: about 10 minutes.

## Why this test is different from everything run so far

Three facts shape every step (all verified in source, exact anchors at the bottom):

1. **The room code IS the host's PeerJS id, and real matches use the public PeerJS
   cloud signalling server.** Every automated harness in `scripts/qa/` uses the
   machine-local QA path (`?multiplayerQa=1`), which is hard-refused unless the page
   hostname is `localhost`/`127.0.0.1`. Two machines therefore exercise, for the first
   time ever: public signalling reachability from both PCs, and a real NAT traversal
   (ICE) between two different machines. A green same-machine matrix does NOT predict
   this result.
2. **Each machine loads its own copy of the game over `http://localhost:<port>`.
   Never browse the other machine's LAN URL** (e.g. `http://192.168.x.x:41911`). Plain
   HTTP on a non-localhost origin hides `navigator.gpu` entirely, and the game
   fail-closes with "GAMEPLAY RENDERER BLOCKED". Only WebRTC game traffic should cross
   the network; the pages themselves stay local.
3. **Both machines must run the same build.** Compare `git rev-parse HEAD` on both;
   they must be identical, or any desync you see proves nothing.

## 0. One-time setup, second machine (~15 min, skip afterwards)

On machine B (guest):

```
git clone <repo>   # or fetch + checkout the SAME commit hash as machine A
git rev-parse HEAD          # must equal machine A's output exactly
npm ci
npm run build
npx vite preview --host 127.0.0.1 --port 41911 --strictPort
```

Leave that preview running; it serves only machine B's own browser.
If Windows Firewall prompts Chrome for network access: allow on Private networks
(WebRTC needs local-interface access for LAN play).

Machine A already has a served build (the usual preview on 41911). Confirm it responds:
open `http://localhost:41911/` — menu appears, NO "GAMEPLAY RENDERER BLOCKED" banner.

## 1. Pre-flight, one machine, automated (~1 min, optional but recommended)

Proves the host+guest flow works at all before blaming the network:

```
node scripts/qa/verify-hf347-arena-movement-matrix.mjs --only atomic-acres
```

PASS = `"verdict": "PASS"` with both roles moving metres above threshold and empty
error arrays. Measured 2026-08-25 on this tree: PASS, host 5.30 m / guest 7.74 m,
zero page errors. If THIS fails, fix locally first; the network test would be noise.

## 2. Host opens a lobby — machine A

1. Open Chrome → `http://localhost:41911/`. F12 → Console tab open for the whole session.
2. Enter player name (e.g. `Host-A`). Arena: **atomic-acres**, mode: TDM.
3. Click **HOST LOBBY**. The lobby card shows a room code.
   - PASS: status line reads "Private lobby ready — share the invite and ready up".
   - Capture: screenshot of the lobby card WITH the code visible.
4. Console probe (paste, record output):
   `__ATOMIC_ACRES_DEBUG__.snapshot().networkLifecycle.role`
   - Expected: `"host"`.

## 3. Guest joins — machine B

1. Chrome → `http://localhost:41911/` (machine B's own server). Console open.
2. Name `Guest-B`, same arena. Paste the room code into the room-code field → **JOIN LOBBY**.
3. PASS, on BOTH machines: roster shows 2 players; each row shows a ping in ms within
   a few seconds; no red errors in either console.
4. Console probe on B: same `networkLifecycle.role` call → expected `"client"`;
   also note `__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch?.localPingMs`.
5. Both click **READY**; host clicks **START**.
   - PASS: both screens deploy into the match. If B hangs on "Synchronizing…", that is
     a finding, not a flake — capture both consoles immediately.

## 4. The ten-minute match script

Do each check in order; after EACH, note pass/fail. "Both agree" means what A sees
matches what B sees.

| # | Do | PASS looks like |
|---|----|-----------------|
| 1 | A walks a straight line while B watches, then swap roles | Remote operator moves smoothly, delay under ~0.5 s each direction |
| 2 | A shoots B until downed; then B shoots A until downed | Victim sees damage + death; attacker sees hit feedback; BOTH scoreboards award exactly one kill (never zero, never two) |
| 3 | Press Tab (scoreboard) on both | Identical kills/deaths/pings on both screens |
| 4 | Kill an enemy, watch their respawn | Respawn visible to the other side; no ghost body left behind |
| 5 | Throw a grenade near both players | Explosion + damage appear on both machines, same location |
| 6 | Return to lobby (host ends match), host switches arena to skyline-terminal, both ready, start again | The historic wedge path: guest converges on the new arena and deploys. No permanent "Synchronizing" |
| 7 | B closes the tab entirely, waits ~20 s, reopens and rejoins the same code | A sees the leave; rejoin lands back in the room ("REJOIN" affordance) |
| 8 | End the match properly | Match-end screen offers DOWNLOAD SUMMARY / DOWNLOAD DIAGNOSTICS on both machines |

## 5. Evidence to capture (both machines — this is the deliverable)

1. **Match diagnostics JSONs**: at match end use DOWNLOAD SUMMARY and DOWNLOAD
   DIAGNOSTICS (also available in-menu afterwards as MENU download buttons). These
   contain measured `rttMs`, `jitterMs`, clock offset, interpolation stats, and the
   actual render backend (`webgpu` vs `webgl-compatibility`) — proof the owner played
   WebGPU on both machines.
2. **Screenshots**: lobby roster with codes/pings (step 2/3), mid-fight remote view
   (check 1), scoreboard from both machines (check 3).
3. **Console logs**: DevTools console right-click → Save as… on both machines. Red
   errors are findings even when gameplay looked fine.
4. **Facts**: room code used, date/time, both git commit hashes, both Chrome versions
   (`chrome://version`), and whether the two machines are on the same LAN or across
   the internet.

## 6. Quick triage

| Symptom | Likely cause | Do |
|---|---|---|
| "GAMEPLAY RENDERER BLOCKED" on B | B browsed a non-localhost URL | Use `http://localhost:<port>` on B's own server |
| Join spins, status shows a PeerJS/signalling error | Public signalling unreachable | Check both consoles for `peerjs:` errors; both machines need outbound WSS to the PeerJS cloud (`0.peerjs.com`) |
| Roster connects but remotes never move | Replication path issue — first-ever cross-machine instance | On both: paste `__ATOMIC_ACRES_DEBUG__.snapshot().networkLifecycle` and save the JSON output |
| Hits/kills disagree between machines | Authority/reconciliation issue | Download diagnostics from BOTH sides and compare damage ledgers; attach both files |
| Guest stuck on "Synchronizing" after map swap | The known wedge class | Capture both consoles + screenshots immediately; do not retry before capturing |

## Source anchors (for whoever debugs a failure)

- Real peer creation (cloud defaults): `src/network.ts` `createArenaPeer` — QA loopback-only gate at the `multiplayerQa=1` hostname check; QA peers get `iceServers: []`, real peers inherit PeerJS STUN defaults.
- Room code = host PeerJS id, star topology: header comment of `src/host-migration.ts`.
- HOST LOBBY handler: `src/legacy-main.ts` `#host` click listener; JOIN: `#join` listener; invite deep-link `?room=<CODE>&autojoin=1` auto-clicks join.
- Lobby controls: `#lobby-ready`, `#lobby-start`; roster rows: `#lobby-roster .lobby-player`.
- Runtime probes used above: `__ATOMIC_ACRES_DEBUG__.snapshot().networkLifecycle` (= `network.diagnostics()`), `.privateMatch.localPingMs`, status element `#network-status`.
- Diagnostics downloads: `#download-match-summary` / `#download-match-diagnostics` (match end) and `#menu-download-match-summary` / `#menu-download-match-technical` (menu).
