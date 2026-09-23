# Frame-hitch attribution - before (nuketown2)

Measured 2026-09-05T06:23:17.011Z. 3751 frames over 90s at 2560x1440, profile high / webgpu, deploy 89319 ms, bots 4.

| metric | value |
|---|---:|
| mean fps | 41.7 |
| p50 frame ms | 23.2 |
| p95 frame ms | 32.9 |
| p99 frame ms | 40.3 |
| p99.9 frame ms | 65.5 |
| max frame ms | 116.6 |
| hitches >= 50 ms | 11 |
| frames >= 100 ms | 1 |
| frames >= 33.4 ms | 169 |
| hitch time total ms | 718.6 |

## Attribution of the 11 frames at or over 50 ms

| cause | count | total ms | worst ms |
|---|---:|---:|---:|
| unattributed-present | 7 | 368.6 | 66.9 |
| gpu-task | 2 | 44.1 | 32.5 |
| style-recalculation | 2 | 9.7 | 7.6 |
| paint | 1 | 4.1 | 4.1 |
| forced-layout-read | 1 | 2.2 | 2.2 |
| gpu-buffer-upload | 1 | 1.6 | 1.6 |
| pipeline-shader-compile | 3 | 0.5 | 0.3 |

