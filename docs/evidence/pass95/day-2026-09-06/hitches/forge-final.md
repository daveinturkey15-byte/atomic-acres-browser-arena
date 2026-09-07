# Frame-hitch attribution - forge-final (nuketown2)

Measured 2026-09-06T23:46:36.478Z. 7263 frames over 90s at 2560x1440, profile high / webgpu, deploy 60226 ms, bots 2.

| metric | value |
|---|---:|
| mean fps | 80.7 |
| p50 frame ms | 11.6 |
| p95 frame ms | 18.3 |
| p99 frame ms | 23.3 |
| p99.9 frame ms | 80.3 |
| max frame ms | 104.2 |
| hitches >= 50 ms | 15 |
| frames >= 100 ms | 3 |
| frames >= 33.4 ms | 21 |
| hitch time total ms | 1206.3 |
| attributed ms (% of hitch total) | 1206.2 (100%) |

## Attribution of the 15 frames at or over 50 ms

| cause | count | total ms | worst ms |
|---|---:|---:|---:|
| unattributed-residual | 15 | 1043.5 | 96.2 |
| gpu-task | 15 | 86.8 | 12.3 |
| gc-major | 4 | 49.3 | 15.7 |
| style-recalculation | 11 | 26.6 | 6.8 |

