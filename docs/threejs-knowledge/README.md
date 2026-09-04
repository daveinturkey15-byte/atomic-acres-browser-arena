# Three.js knowledge directory

The project's local Three.js memory: where you look things up, and where a pattern worth
keeping gets written down so nobody re-derives it next month.

Created for owner directive **HF-481** (2026-09-04). The governing rule is AKP
`rules/threejs-source-priority.dave-gaming-pc.md`, scoped to `dave-gaming-pc` only.

Installed renderer version, which is what actually compiles: **`three@0.185.1`**.

---

## Look things up in this order

1. **Current Three.js docs.** `https://threejs.org/docs/llms.txt` (index) and
   `https://threejs.org/docs/llms-full.txt` (full text). Dated local snapshots with hashes:
   [`upstream/`](upstream/SOURCES.md).
2. **Poimandres docs MCP** for React Three Fiber, Drei and the wider ecosystem:
   `https://docs.pmnd.rs/api/mcp`. It is an MCP endpoint — a browser GET returns 405, which is
   not an outage. Registration state per harness is recorded in `upstream/SOURCES.md`'s sibling
   note in the AKP rule file.
3. **Current source and examples**, for implementation detail or visual inspiration:
   [`mrdoob/three.js`](https://github.com/mrdoob/three.js) (especially
   [`examples/`](https://github.com/mrdoob/three.js/tree/dev/examples)),
   [`pmndrs/react-three-fiber`](https://github.com/pmndrs/react-three-fiber),
   [`pmndrs/drei`](https://github.com/pmndrs/drei).

Then: prefer current **WebGPU/TSL** for new work, but check project and browser requirements
before replacing anything stable that runs on WebGL. **Installed skills give workflow and
heuristics; they never override current upstream docs or source.** For visually ambitious
work, search existing examples *first*. Check installed versions before copying an API from
HEAD. Validate FPS, draw calls, memory/disposal, mobile and resize before claiming adoption.

## Write a recipe when you find a strong reusable pattern

One file per pattern in [`recipes/`](recipes/), named `<slug>.md`. Keep it short — a recipe is
a pointer plus the three things a link cannot give you: what it costs here, what it breaks
here, and how you knew it worked.

```markdown
# <Pattern name>

**Upstream:** <exact URL — a doc page, an example, or a file at a pinned ref>
**Fetched:** YYYY-MM-DD   **Applies to:** three@<version>   **Renderer:** WebGPU/TSL | WebGL

## What it does
Two or three sentences, in our words. If you cannot restate it without pasting the source,
it is not understood yet and it is not a recipe.

## How we express it here
Our contracts, not theirs: WebGPU/TSL only, no `ShaderMaterial`, no `RawShaderMaterial`,
no GLSL strings, no `onBeforeCompile`; presentation-only and additive; seeded determinism,
never `Math.random`. Name the file(s) in `src/` that carry it.

## Cost
Measured, on this machine: frame time, draw-call delta, memory, and the quality tier it is
gated behind. An unmeasured recipe is a proposal.

## Falsifiers
At least two checkable statements that would show this recipe is wrong here.
```

**Never paste upstream code into a recipe.** Link and pin it. The house rule (owner HF-472) is
re-implement, never copy or fork — a missing licence is not a blocker and a permissive licence
is not permission to vendor.

## Where the rest of the knowledge lives

| What | Where | Role |
|---|---|---|
| The source-priority rule itself | AKP `rules/threejs-source-priority.dave-gaming-pc.md` | authority, machine-scoped |
| Canonical technique register (identity, licence read from the LICENSE **file**, pinned commit, bounded decision) | AKP `references/ai-3d-technique-register.md` | authority |
| Ingestion state for owner-shared sources — has it actually landed, who carries it | vault `Ingestion/REGISTER.md` + `Ingestion/PIPELINE.md` | state view |
| Discovery pointer for the techniques | vault `Dev-Practices/AI 3D Technique Register.md` | index |
| Per-source studies done inside this repo | [`../technique-studies/`](../technique-studies/) | working notes |
| Prior upstream extraction pass | [`../UPSTREAM_TECHNIQUE_EXTRACTION_2026-08-30.md`](../UPSTREAM_TECHNIQUE_EXTRACTION_2026-08-30.md) | history |
| AI asset technique assessment | [`../AI_ASSET_TECHNIQUE_ASSESSMENT_2026-08-22.md`](../AI_ASSET_TECHNIQUE_ASSESSMENT_2026-08-22.md) | history |

Those registers are **linked, not moved**. They are authority surfaces owned by AKP and the
vault; relocating them into this repo would fork the authority, which is the failure mode the
ingestion hub was built to stop.
