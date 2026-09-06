# Frame-hitch attribution - host4-skyline-terminal-repro (skyline-terminal)

Measured 2026-09-06T06:07:26.148Z. 10373 frames over 120s at 2560x1440, profile high / webgpu, deploy 46377 ms, bots 4.

| metric | value |
|---|---:|
| mean fps | 86.4 |
| p50 frame ms | 11 |
| p95 frame ms | 17.7 |
| p99 frame ms | 21.3 |
| p99.9 frame ms | 39.1 |
| max frame ms | 61.4 |
| hitches >= 50 ms | 5 |
| frames >= 100 ms | 0 |
| frames >= 33.4 ms | 15 |
| hitch time total ms | 276.7 |
| attributed ms (% of hitch total) | 201.5 (72.8%) |

## Attribution of the 5 frames at or over 50 ms

| cause | count | total ms | worst ms |
|---|---:|---:|---:|
| unattributed-present | 3 | 125.5 | 58.9 |
| unattributed-js | 1 | 41.5 | 41.5 |
| gc-major | 1 | 22.9 | 22.9 |
| style-recalculation | 1 | 9.7 | 9.7 |
| gpu-task | 1 | 1.9 | 1.9 |

