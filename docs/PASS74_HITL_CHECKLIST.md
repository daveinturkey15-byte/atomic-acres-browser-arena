# Pass 74 — owner HITL checklist

**Preview:** <http://127.0.0.1:41874/> (local only; nothing published, nothing pushed)
**Exact source SHA:** `97faa806349ca8e593e03f87d526b9546da95471`
**Branch:** `contrib/dave-gaming-pc/claude/pass74-20260821` · base Pass 73 `506d6142`
**Mechanical state:** TypeScript 0 errors · 392 test files / 2858 tests passing, 1 file + 2 tests skipped

Add `?renderer=webgpu` to force the fail-closed WebGPU route. Chrome and Firefox
are the two primary browsers.

---

## Read this first

Three honest caveats, so nothing here is oversold:

1. **Nothing was published.** No push, no deploy, nothing past Pass 73, as instructed.
2. **Green tests are not proof of your bugs being fixed.** Several rows below changed
   real behaviour that only you can judge, and a few landed as tested modules whose
   runtime effect still needs your eyes.
3. **No live browser session was run.** Every claim below is from source and unit
   tests. The Firefox 10 FPS report (HF-331) is completely unverified — the probe
   runbook is written but was never executed, because measuring frame timings while
   twenty agents hammered the machine would have produced worthless numbers.

---

## A. Please try these first — the things you complained loudest about

| # | What to try | What should happen | Row |
|---|---|---|---|
| A1 | In a hosted match, walk over a dropped gun and pick it up, then shoot and reload it | Both work. Previously the host silently rejected the swap and you were left holding a gun it did not believe you had | HF-315 |
| A2 | Reload repeatedly in a hosted match, ideally on a poor connection | Reload never stops working permanently. Previously one lost message disabled reload for the rest of the match | HF-315 |
| A3 | Join a lobby, leave, rejoin quickly; also spawn into RustRig and Terminal TDM | You can always move. Previously a rejoin inside the 90s identity window could freeze you as a statue permanently, with no reason shown | HF-322 |
| A4 | Click the ROOM CHAT box in the lobby, and press Enter after clicking READY | Chat opens and you can type. Previously there was no way to open it at all after touching any lobby button | HF-324 |
| A5 | Start a match while someone is mid-join | The host waits for them rather than starting and bouncing them | HF-323 |
| A6 | Man the Chopper Gunner or pilot a drone while damaged | Health regenerates during possession | HF-338 |
| A7 | Fire a rocket/grenade near yourself, then listen to the map ambience for a minute | Ambience returns to normal. Previously the first explosion ducked it to 40% for the rest of the match, on every map | HF-350 |
| A8 | Walk into a training dummy in the Gun Range test bay | It blocks you. Previously you walked straight through | HF-318 |
| A9 | Look at your right arm with a rifle, pistol and knife | The elbow should read naturally. Thickness and how the arms run off-screen are deliberately unchanged — you liked those | HF-340 |
| A10 | Open the KILLSTREAKS menu; try setting slot 3 to the reward already in slot 4 | It swaps instead of silently refusing. The panel should also read clearly now rather than as a washed-out white card | HF-316, HF-333/362 |

## B. New and changed — worth a look

- **Farcrysis is the fifth map.** Jungle/beach research station, revived from the
  Pass 69 lane. Its centre building is enterable and its wind/god-rays/water now
  actually animate — both were broken and fixed after an audit.
- **Filmic grading** (HF-363) — the image should read richer without crushing shadow
  detail where enemies hide, and without bloom blinding you.
- **Explosions** (HF-349/351) — spatialised with per-family character, a near-blast
  tinnitus tail, and blasts that survive a frame hitch instead of vanishing.
- **Screen feel** (HF-352) — camera shake scaled by blast distance, kill-confirm pulse.
- **TDM teams** (HF-328) — assigned, not picked, with fixed colour identities.
- **Care package** (HF-334) — 10% chance of the flamethrower.
- **Carpet Bomber** (HF-317) — corridor targeting module landed; **not yet wired**, so
  in-match behaviour is unchanged this pass.

## C. Known gaps — deliberately not fixed, so you are not surprised

| Gap | Why |
|---|---|
| **Farcrysis map card shows a standby placeholder, not a flyover** | The authored helicopter flyover video does not exist. A fake or borrowed video would have been worse; the real render is outstanding |
| **Farcrysis terrain visually undulates ~2.2m but collision is flat** | Found by audit, not fixed. You will walk level through visible hills |
| **Farcrysis spawn sits 1.10m from a palm collider** | Found by audit; below the intended 6m clearance |
| **Terminal z-fighting (HF-346) is NOT fixed** | The ledger wrongly claimed it was. Arena geometry was never touched; corrected to OPEN |
| **Gun-range rack caching (HF-330)** | Two attempts from an unreliable model were reverted, the second having broken the rack's fail-closed contract |
| **Firefox performance (HF-331)** | Pin corrected and an inverted fail-closed assertion fixed, but the live probe was never run |
| **Several modules are landed but unwired** | Carpet corridor, killstreak activation gate, rare-weapon announcement, prone clearance, team prescription, coplanar audit. Tested, not yet reachable in play — tracked as HF-364 |
| **Operator skins produced no GLB** | Specs, authoring script and catalog exist; the Blender run died when a provider hit its monthly quota |

## D. If something is wrong

Everything is local commits on the contrib branch. `git log --oneline 506d6142..HEAD`
shows the ten commits; any one can be reverted in isolation. Nothing was pushed, so
Pass 73 remains exactly as it was.
