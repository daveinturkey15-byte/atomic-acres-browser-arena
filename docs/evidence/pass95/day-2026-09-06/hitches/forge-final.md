# Frame-hitch attribution - forge-final (nuketown2)

Measured 2026-09-07T00:21:05.062Z. 6528 frames over 90s at 2560x1440, profile high / webgpu, deploy 57585 ms, bots 2.

| metric | value |
|---|---:|
| mean fps | 72.6 |
| p50 frame ms | 13.3 |
| p95 frame ms | 20.1 |
| p99 frame ms | 24.7 |
| p99.9 frame ms | 47.3 |
| max frame ms | 65.9 |
| hitches >= 50 ms | 4 |
| frames >= 100 ms | 0 |
| frames >= 33.4 ms | 21 |
| hitch time total ms | 227 |
| attributed ms (% of hitch total) | 210.1 (92.6%) |

## Attribution of the 4 frames at or over 50 ms

| cause | count | total ms | worst ms |
|---|---:|---:|---:|
| unattributed-residual | 3 | 138.3 | 48.9 |
| gpu-task | 4 | 51.1 | 29.9 |
| gc-major | 1 | 11.8 | 11.8 |
| style-recalculation | 4 | 8.8 | 3.4 |
| pipeline-shader-compile | 1 | 0.1 | 0.1 |

