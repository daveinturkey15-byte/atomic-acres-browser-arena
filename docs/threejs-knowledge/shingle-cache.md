# Shingle texture row cache

VERIFIED 2026-09-12: Windows CI34681068137 measured417.245ms for a1024-square
shingle set against the existing400ms median ceiling. The source recomputed
the course, row offset and per-shingle hash at every texel.

The implementation now retains the exact original row expressions and caches
the wrapped lattice tone in Float64 storage. Sampling coordinates and the
remaining arithmetic keep their original order. Cache memory is at most one
image row; tiny images or unusually wide physical tiles use the original hash
expression. No output buffers, visual constants, thresholds or tests were relaxed.

Root compared36 complete buffers across9 configurations against the original
450134666 generator, before installing the change. All bytes matched, including
negative and positive pixel origins, multiple seeds/scales and the tiny-image
fallback. Their original SHA256 values are retained in the new regression test.
The first diagnostic accidentally supplied an invalid1.5m tile; the original
generator correctly rejected it. The successful set uses valid3m/6m/9m tiles.

Seven alternating1024-square runs on this PC measured median60.70ms before and
44.26ms after (27% lower). This is local evidence, not a CI timing guarantee.
The original all-family400ms gate remains required on CI.

Diagnostic and raw comparison: `artifacts/pipeline/completion-shingle-compare.mts`
and `completion-shingle-compare.json`. This is an in-house CPU texture-generation
optimization; it introduces no new rendering API or dependency.
