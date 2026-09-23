# Procedural texture performance without changing the image

The brick generator repeated deterministic per-brick hashes for every texel. It now
computes those values once per wrapped brick, caches row constants by the sampled y,
and skips a corner-chip distance calculation only outside its bounding square. The
operations retain their original double precision and arithmetic order.

Independent integration verification on 2026-09-12 compared the candidate with the
unchanged generator from `089cb13a4d3e23d9f3c6ff499eda43f32670a04a`: all 28 albedo,
normal, roughness and height buffers were byte-equal across seven configurations.
These cover 64 through 1024 pixels, positive/zero/negative seeds, 0.9/1.8/2.7 metre
tiles and wrapped positive/negative origins. The two largest original configurations
also reproduce every digest in `brick-byte-identity.test.ts`.

The five-family 512-pixel test previously made 1,310,740 assertion-framework calls.
It now scans the same data and records the first non-finite height before making 25
assertions. Length checks, every height index, the red-channel maximum, strict >30
blackness bound, sizes, seeds, families and test timeouts are retained. A bad height
reports its actual index and value. The original already stops at its first bad height;
the replacement preserves that first failing predicate and index.

Independent comparison passed 185 valid/mutated cases across all five families:
NaN and both infinities at first/middle/last positions, competing failures, truncated
buffers, and exact blackness boundaries. Deliberately changed roughness, normal or
non-red colour channels remain outside this particular test's original contract;
their existing dedicated tests remain required. This is neither sampling nor a claim
that this one test validates every texture property.

On Node 24.12.0 locally, the five-family real assertion-stack median fell from
1788.7 ms to 1.3 ms. This isolated measurement is not a Windows CI or frame-rate claim.
The unchanged 400 ms 1024-generation bound and complete focused texture suite must
still pass in their actual runner. Browser appearance and overall game acceptance
remain separate checks.

Reusable method: move invariant computation outside a pixel loop only after direct
before/after buffer comparison, and keep expensive test matchers outside exhaustive
scans by retaining the first failing index. Never replace either scan with sampling.
