# raid2 two-client multiplayer lab run — Lane AQ (HF-408), 2026-09-03

The registry row ships `multiplayer: true` and the spawn table is solved for two
teams, and the lane shipped without ever putting two clients on the map. That is
closed here, through the sanctioned harness `scripts/qa/mp-lab/run-host-guest.mjs`
(HF-403), unmodified: two REAL headless Chromes over a local PeerJS signalling
server, joining through the REAL menu — `#host`, room code, `#room-input`,
`#join`, `#lobby-arena`, `#lobby-bots`, `#lobby-ready`, `#lobby-start`. No debug
teleport into a match.

    node scripts/qa/mp-lab/run-host-guest.mjs --map raid2 --label raid2-repair \
      --sample-seconds 20 --port 41946 --peer-port 9345

## Result

| column | raid2 | test2 (the shipped Raid, CONTROL) |
|---|---|---|
| join | ok, 1993 ms | ok, 1001 ms |
| arena sync host / guest | **73,476 / 81,377 ms** | 51,676 / 49,892 ms |
| deploy host / guest | ok, 20,656 / 20,498 ms | ok, 21,593 / 21,544 ms |
| presented FPS host / guest | 21.7 / 19.7 | 19.9 / 18.4 |
| worst stall host / guest | 412 / 346.9 ms | 272.9 / 393.6 ms |
| stalls > 250 ms host / guest | 1 / 4 | 3 / 5 |
| movement deadlocks | **0 / 0** | 0 / 0 |
| guest first move | 311 ms | 294 ms |
| console + page errors | **0+0 / 0+0** | 0+0 / 0+0 |
| join flow identical to the other arenas | **true** | true |
| harness verdict | FAIL (stall gate) | FAIL (stall gate) |

## How to read that, honestly

**The functional half is VERIFIED.** Two independent clients reach a running
raid2 match through the real lobby, both deploy, the guest moves 311 ms after
deploy, neither client deadlocks, neither logs a single console or page error,
and the join flow is byte-identical in shape to every other arena's. That is
what "the registry row says multiplayer: true" needed to be backed by, and it is.

**The timing half is VOID as a raid2 judgement, and the control run is why.**
The harness's own falsifier — the 250 ms stall floor, which is NOT a tuning knob
and was not touched — reports FAIL. But the run happened on the owner's shared
workstation with 13.2 of 16.3 GB of VRAM already resident and only ~3.1 GB free
at launch, i.e. exactly the state in which no timing number is admissible on this
machine. So the SHIPPED Raid was run through the identical harness, settings,
port and session immediately afterwards, and it fails the same gate HARDER: more
stalls on both clients (3/5 against 1/4) and lower FPS on both (19.9/18.4 against
21.7/19.7). A gate that a map's own predecessor fails worse, under the same load,
in the same minute, is measuring the machine and not the map.

Neither run should be quoted as a performance result for either arena. Re-run on
a quiet GPU before anyone does.

## The one difference that IS attributable

**Arena sync: raid2 73.5 / 81.4 s against test2's 51.7 / 49.9 s — about 45–63%
slower on a map with FEWER colliders (212 against 307).** Both runs shared the
same contended GPU, so the absolute numbers are not admissible, but the two
arenas were measured back to back under the same load, so the RATIO is. This is
a real OPEN item for raid2 and it belongs with the load-time work (HF-417 /
Lane H2), not with this lane's layout claims. It was not investigated here.

## Files

- `raid2.json` / `raid2-summary.json` — the harness's own per-arena record and
  summary for raid2.
- `test2.json` / `test2-control-summary.json` — the control run on the shipped
  Raid.
- `raid2-host.png` / `raid2-guest.png` — post-deploy screenshots from both
  clients, halved from the harness's 2560x1440 originals to stay under the
  600 KB tracked-evidence ceiling (originals in the git-ignored
  `artifacts/qa/mp-lab/raid2-repair/`).
