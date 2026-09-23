# Pass 74 HITL checklist — regenerated 2026-08-22 (late evening)

Play at **http://127.0.0.1:41876/** — the integration build: Pass 74 + Codex's High
Seas + music + skins. Local only; nothing is pushed or deployed.

Regenerated from the owner-feedback ledger after the evening work landed. When this
file and the ledger disagree, believe the ledger and tell the orchestrator.

## A. New since you last played

- **High Seas** — the sixth arena: Codex's original superyacht map, fully merged.
  Twelve spawns, engine corridor, two-storey cabins, ocean at −2.2 m.
- **Background music** — two original chiptune tracks rotating between matches,
  never the same one twice in a row, quiet by design (Options → music slider,
  default 68). *Nobody has heard these yet — you are the first listener.*
- **OPERATOR SKINS are selectable** (HF-360) — new OPERATOR SKIN dropdown in the
  deployment manifest: Standard, Sunspire Wayfarer (explorer), Carapace Bulwark
  (symbiote), Tidewrack Operative (naval ops). Your pick persists, replicates
  through the host, and other players see it on your third-person model. Check:
  does the silhouette still read against the hit feel? (The authored envelope is
  capped at the hit-proxy outline — symbiote at 1.0022/1.1.)
- **Host handover is ARMED** (HF-325) — if the host drops mid-match, the elected
  successor now promotes itself into the SAME room code after the 15 s + 90 s
  loss window, adopting the mirrored match ledger; other guests reconnect to the
  promoted host through the normal rejoin path, and a returning old host stands
  down instead of splitting the match. **Worth a deliberate two-browser test:
  host a match, kill the host tab, wait ~2 minutes.**

## B. Fixed this pass — worth testing deliberately

- **Farcrysis boots clean** — the palm-crown NaN that poisoned the WebGL2 render
  batch is fixed at the index buffer; boot smoke is 6/6 arenas green for the
  first time this pass.
- **Gun Range multiplayer** (HF-347) — dummies patrol identically for host and
  guest AND guest damage now counts: the host resolves your hits against the
  host-time dummy pose, your hitmarker/score come from the host's answer, and
  kills replicate to everyone. *RustRig and Terminal multiplayer faults are
  separate rows, still open.*
- **Key-3 while dead / warmup** (HF-316 residual) — pressing a killstreak key
  while down or before the match now SAYS why ("UNAVAILABLE WHILE DOWN", "MATCH
  NOT ACTIVE") instead of silently doing nothing.
- **Chopper missiles** (HF-335) — launch from alternating wing sockets and fly a
  true 3D path again. Merged into this build.
- **Chopper spectator lag** (HF-336) — LOD retune + decimated shadow. Fly the
  chopper with a second player watching; the *watcher* should be smooth now.
- **Support audio** (HF-337) — footsteps stay audible during sustained
  chopper/drone fire; enemies' support fire is quieter (0.35 gain) than your
  team's; distance-culled beyond 180 m.
- **Glass** (HF-344) — the Atomic Acres upstairs front window is walkable when
  open; all six Terminal facade windows still block when intact.
- **Terminal z-fighting** (HF-346) — fixed, zero coplanar pairs across all six
  arenas, direction-verified.
- **Rare-weapon announcements** (HF-339) — now audible (reuses the overdrive
  sting), not just the banner.
- **WebGL2 water** (HF-358) — if you float, you float on the water you can see;
  the two surfaces were ~1 m apart on the compat path.
- **Match start** (HF-323), **lobby movement/typing** (HF-322/324), **pickup/reload**
  (HF-315), **regen while piloting** (HF-338) — all landed earlier this pass.

## C. Known gaps — deliberately open, so you are not surprised

| Gap | State |
|---|---|
| **Care package flamethrower (HF-334)** | **NOT implemented — needs your call.** Every naive wiring was refuted: the grant would consume the world pickup (it would vanish mid-match for whoever was walking to it), and "exactly 10%" cannot be honest while flamethrower authority is arena-bound. Decide: separate weapon instance, or a different reward? |
| **Firefox (HF-331)** | Fresh quiet-machine numbers: Chromium on the WebGL2 compat path runs ~74 Hz in-match (real RTX 5080, hardware ANGLE). Playwright's bundled Firefox hangs at launch even on a quiet machine, so the Firefox-side number comes from the installed-browser WebGPU parity harness — see `artifacts/qa/browser-frame-parity-receipt.json` for the current receipt. Play in Chrome meanwhile. |
| **Host handover HITL** | Armed and unit-tested, but the live two-browser handover matrix has not been run by a human yet. That test is the close-out bar. |
| **Skins HITL** | Integrated and selectable, but nobody has eyeballed the three archetypes live against team readability and hit feel. |
| **Farcrysis terrain vs collision** | Terrain visually undulates ~2.2 m but collision is flat — you walk level through visible hills. Found by audit; not yet fixed. |
| **Farcrysis map card** | Standby placeholder, no flyover video — the authored render doesn't exist yet; a borrowed one would violate the asset policy. |
| **Streamline pass (HF-355)** | Still open; the failed lane's wreckage stays parked at `../pass74-parked/`. |

## D. If something breaks

Say which arena, solo or hosted, and what you saw. The boot path is covered by an
automated six-arena smoke (6/6 green), but *your* eyes are still the only test for
feel, mix levels and readability.
