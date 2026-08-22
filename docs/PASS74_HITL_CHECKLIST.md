# Pass 74 HITL checklist — regenerated 2026-08-22 (evening)

Play at **http://127.0.0.1:41876/** — the integration build: Pass 74 + Codex's High
Seas + music. Local only; nothing is pushed or deployed.

The previous version of this file contradicted the ledger in both directions - it
claimed HF-334 landed (it did not), HF-317 unwired (it is wired), and HF-346 broken
(it is fixed). It was regenerated from the ledger, which is the source of truth.
When they disagree, believe the ledger and tell the orchestrator.

## A. New since you last played

- **High Seas** — the sixth arena: Codex's original superyacht map, fully merged.
  Twelve spawns, engine corridor, two-storey cabins, ocean at −2.2 m.
- **Background music** — two original chiptune tracks rotating between matches,
  never the same one twice in a row, quiet by design (Options → music slider,
  default 68). *Nobody has heard these yet — you are the first listener.*
- **Skins pipeline** — three original archetypes (explorer / symbiote / navalops)
  now produce real GLBs: 62 joints, 24 clips, 3 LODs each. **Not yet selectable
  in-game** — staged assets only (HF-360/HF-364).

## B. Fixed this pass — worth testing deliberately

- **Chopper spectator lag** (HF-336) — LOD retune + decimated shadow. Fly the
  chopper with a second player watching; the *watcher* should be smooth now.
- **Support audio** (HF-337) — footsteps should stay audible during sustained
  chopper/drone fire; enemies' support fire is quieter than your team's.
- **Gun Range multiplayer** (HF-347, partial) — dummies now patrol identically for
  host and guest. *Dummy damage is still peer-local — guests' hits on dummies
  don't replicate yet.*
- **Glass** (HF-344) — the Atomic Acres upstairs front window is walkable when
  open; all six Terminal facade windows still block when intact.
- **Terminal z-fighting** (HF-346) — **fixed**, zero coplanar pairs across all six
  arenas, direction-verified.
- **Chopper missiles** (HF-335) — launch from alternating wing sockets and fly a
  true 3D path again *(landing in a lane as you read this — if they still drop
  vertically from the sky, that lane hasn't merged yet)*.
- **Rare-weapon announcements** (HF-339) — now audible (reuses the overdrive
  sting), not just the banner.
- **WebGL2 water** (HF-358) — if you float, you float on the water you can see;
  the two surfaces were ~1 m apart on the compat path.
- **Match start** (HF-323), **lobby movement/typing** (HF-322/324), **pickup/reload**
  (HF-315), **regen while piloting** (HF-338) — all landed earlier this pass.

## C. Known gaps — deliberately open, so you are not surprised

| Gap | State |
|---|---|
| **Care package flamethrower (HF-334)** | **NOT implemented.** Every naive wiring was refuted: the grant would consume the world pickup (it would vanish mid-match for whoever was walking to it), and "exactly 10%" cannot be honest while flamethrower authority is arena-bound. Needs your call on weapon instancing. |
| **Host disconnect (HF-325)** | Checkpoint replicates to the successor, but promotion is OFF: no host stand-down path exists yet, so enabling it could split-brain a match. If the host drops, everyone still gets kicked after the 90 s window. |
| **Firefox (HF-331)** | Still slow. Measured so far: the WebGL2 path itself costs ~3× vs WebGPU *in Chrome* (49 Hz vs 150+). The remaining ~5× is unmeasured — needs a quiet machine. Play in Chrome. |
| **Key-3 while dead / in warmup** | Still gives zero feedback (the input gate returns before the killstreak denial can speak). Known, recorded, needs its own row. |
| **Skins not selectable** | GLBs exist; no lobby UI, protocol field or loader consumes them yet. |
| **Farcrysis terrain vs collision** | Terrain visually undulates ~2.2 m but collision is flat — you walk level through visible hills. Found by audit; not yet fixed. |
| **Farcrysis map card** | Standby placeholder, no flyover video — the authored render doesn't exist yet; a borrowed one would violate the asset policy. |

## D. If something breaks

Say which arena, solo or hosted, and what you saw. The boot path is covered by an
automated six-arena smoke now, but *your* eyes are still the only test for feel,
mix levels and readability.
