# Eye-clearance stages 1-3 for map3 (PASS 87, 2026-09-03)

## Stage 1 - npx tsx scripts/qa/sweep-eye-clearance-spots.ts
```
map3: 232 colliders (2 floor) -> 3399 legal hug spots (3 colliders with no legal adjacent stance)
```

## Stage 2 - sweep-eye-clearance-live.mjs --arenas map3 --url http://127.0.0.1:4194
```
[eye-clearance] live sweep roster (1): map3
map3               spots=3399 traces=23721 VIOLATIONS=24 {"prone":24}
[{"arena":"map3","spots":3399,"violations":24,"byStance":{"prone":24}}]
```

## Stage 3 - verify-eye-clearance-runtime.mjs --arenas map3 --url http://127.0.0.1:4194
```
[eye-clearance] runtime verifier roster (1): map3
map3               sweep=24 checked=24 REMAINING=0
SUMMARY [{"arena":"map3","sweep":24,"remaining":0}]
```

Stage 3's URL is passed explicitly: scripts/qa/verify-eye-clearance-runtime.mjs hardcodes
http://127.0.0.1:41975 as its default (residuals-lane item 9), so it cannot follow the
preview server run-with-preview-server.mjs actually started.
