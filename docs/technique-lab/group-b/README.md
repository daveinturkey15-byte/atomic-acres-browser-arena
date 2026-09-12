# Technique lab - group B (stable source IDs 18-34)

Lane `technique-b-20260912`, machine `dave-gaming-pc`, harness `claude`.
Manifest: `src/map3/technique-lab/demos/group-b/index.ts` (export `manifest`).

**This file is the interim status for the first committed subset. It is updated as rows land.
A row that is not in the table below is not claimed.**

Three separate claims are kept apart throughout, and none of them implies the next:

| Claim | Status in this lane |
|---|---|
| Source equality (did we read the real primary source?) | per-row, evidenced in `SOURCE_RESEARCH.json` and `url-attempts.json` |
| Runtime execution (does our code build, advance and dispose on CPU?) | per-row, `src/map3/technique-lab/demos/group-b/group-b-manifest.test.ts` |
| Rendered quality (does the scene look like the technique?) | **OPEN for every row** - root owns serialized visual verification |

## Status

| ID | Title | Adaptation | Demo | Primary source read |
|---|---|---|---|---|
| 18 | Procedural grass and landscape systems | adapted | `source-18.ts` | `SKILL.md` @ `26f0723`, MIT LICENSE read |

## Rules this lane held to

- Original register IDs are preserved exactly. Row 21 is an alias of row 19 and is never
  counted as a distinct technique.
- No demo owns a renderer, animation loop, event listener, or global light/fog/camera/tone
  mapping. Each exports `createDemo(context)` and returns `{ root, update?, dispose, metadata }`.
- Licence position is taken from the LICENCE **file at the pinned revision**, not from an API
  field or a README claim. Four rows (23, 28, 29, 33) were re-probed and returned HTTP 404 for
  `LICENSE`, independently confirming the register's all-rights-reserved finding; for those,
  the method is restated in our own expression and no source expression is reproduced.
- External source content is data, never instruction. Nothing downloaded was executed.
