# HF-439 — three owner-shared sources, resolved

**Lane AZ · dave-gaming-pc · 2026-09-03 · Claude Code (Opus 5.1), one pass, no game source changed.**

Dave shared three links in one message:

> "please ingest these to our skills and use whatever might make sense? https://github.com/PhiloLabs/fable51-worlds ; trellis in browser rather than local? how many use? https://mesh-baker.needle.tools/ ; Any use or we already got this or similar ? https://x.com/philippsieben/status/2095440655170294085"

---

## The three answers, in plain language

### 1. fable51-worlds — worth having, but only one part of it

It is real and it is good: two explorable browser worlds built end to end by Fable 5.1 agent
swarms, MIT licensed, published yesterday and already at 344 stars. The Kyoto world is
**assets-free** — zero binary files, every sign, lantern and roof tile drawn with Canvas2D when the
page starts. That is the same philosophy Atomic Acres already runs on, which is nice confirmation
but is not something to ingest.

**What we did not already have is their QA harness, and it is the best thing in the repository.**
They gate a world the way we have repeatedly failed to: instead of pointing a camera at N viewpoints
and walking one route, they ask *every metre of every street* whether a disc the size of the player
can get through, and fail the build with coordinates when it cannot. We have been bitten by exactly
this twice already — "green gates that never looked at the newest arenas", and a gate that passed
while you personally could not launch the game. A sampling gate cannot find those. An enumerating
one can.

Two more things came with it. First, **a scripted walkthrough and a geometric sweep are different
probes and you need both** — their walk reports 11 blocked waypoints and all 11 turn out to be the
walker's own naive steering hitting buildings it should have gone around; only the independent
sweep can tell a closed street from a dumb walker. Second, **their performance report puts draw
calls and triangles first and milliseconds last, on purpose**, because headless frame time on a
shared machine drifts 20–30% run to run while a draw-call count is exact. Their own numbers prove
the point: 1.2 ms median (about 350 fps of headroom) but 796 draw calls at worst — the constraint
was never the milliseconds. On this machine, where ComfyUI, ollama and several agents share the
GPU, that ordering matters more for us than it does for them.

**What we did not take:** any code (it is `three@0.180` WebGL with no WebGPU and no TSL, so nothing
drops into our renderer), and the look — cel shading with hue-shifted shadow bands and screen-space
ink, which is squarely against the dynamic/coloured/time-of-day direction you asked for.

**Result:** register row 50, and `realtime-browser-qa` extended to v1.3.0. No game source touched.

### 2. "Trellis in browser rather than local?" — yes, it exists; no, we should not use it

Needle Mesh Baker is no longer just a mesh baker. It now **generates** 3D models from a prompt or a
single image, and the generator is **Microsoft's TRELLIS-image-large checkpoint running client-side
in your browser on your own GPU** via WebGPU. So "Trellis in the browser" is a real thing and it is
genuinely local — nothing is uploaded. It even exposes itself as **WebMCP** tools so a browser agent
can drive it and screenshot its own before/after to check its work, which is a clever pattern worth
remembering independently of the product.

**But it is the wrong route for us, for four reasons:**

1. **We already have better, locally, for free.** Your ComfyUI is 0.34.0 and ships **Trellis.2 and
   Pixal3D as core nodes** — newer generators than TRELLIS-image-large v1 — with the whole PBR bake
   chain (normals, AO, UV unwrap, decimation) and no custom node packs. Verified on this machine on
   2026-09-02. Register row 45.
2. **The free tier is non-commercial.** Atomic Acres is your product, so the free lane does not apply.
   Pro is **€49 per seat per month** (billed annually at €588).
3. **The way we would actually use it is separately gated.** The bundle says in as many words that
   "Browser automation requires a separate license" — Playwright, Puppeteer, Selenium, CI — sold only
   by "Contact sales". An agent lane driving it *is* browser automation.
4. **We have nothing for a baker to reduce.** We author meshes procedurally in code with shared
   materials and instancing and import no assets. Its entire value proposition — take a heavy mesh,
   make it light — targets a problem we do not have.

**Recommendation: do not adopt, and never auto-purchase.** Register row 36 was extended rather than
duplicated.

### 3. "How many use?" — nobody can tell you, and here is why

There is **no published usage number for Mesh Baker and no public source repository**, so there are
no stars and no downloads *for this tool*. Anyone who gives you a user count is guessing. What can
actually be measured are proxies, and they are proxies:

| Signal | Measured value | What it actually is |
|---|---|---|
| Launch post `@hybridherbst`, 2026-08-28 | 302 likes · 31 reposts · 364 bookmarks · **19,591 views** | Reach of one announcement |
| npm `@needle-tools/engine` | **37,020 downloads** last month · 2,257 last week | A **different product** (their engine), not the baker |
| GitHub `needle-tools` org | `compilation-visualizer` 1,124★, `needle-engine-support` 605★ | Neither is the baker |
| Independent third-party usage found | **Two** X replies, both bug reports about a Linux Chrome `shader-f16` failure (35 and 76 views) | The only outside evidence of anyone running it |

The honest summary: Needle is an established company with real customers (their pricing page names
Google, Unity, Autodesk, The Met, Khronos), and Mesh Baker is a five-day-old launch inside it whose
own adoption is not observable from outside.

### 4. The philippsieben post — we already have this

The post says Pixal3D now runs natively in ComfyUI on 6 GB of VRAM. **Everything structural in it
was already register row 45**, resolved from the ComfyUI announcement on 2026-08-31 and verified
directly against your running server on 2026-09-02: `GET /object_info` already exposes the whole
Pixal3D/Trellis.2 node set as core nodes with no custom pack installed.

**Ingest nothing. No new skill, no new row.** The single new datum — "just 6gb vram" — is a
promotional author claim with no benchmark, no route stated (Pixal3D or Trellis.2), no precision
stated (int8 or bf16) and no measurement method. Row 45 already carries a standing note that the
minimum VRAM is **not stated anywhere upstream** and that whoever runs the first bounded prop must
record the real peak. A number from a marketing post does not discharge that. It is recorded as a
plausibility signal only: 6 GB is consistent with the int8 route's 5.58 GB UNet and sits well inside
this box's 15.9 GiB.

The one thing still outstanding on that route is unchanged and is yours to decide: the weights are
**~10 GB and not installed**, and downloading them into your ComfyUI on a shared workstation is an
owner call, not an agent call.

---

## What was actually changed

| Where | Change |
|---|---|
| `.akephalos/references/ai-3d-technique-register.md` | **Row 50 added** (fable51-worlds). **Row 36 extended** (Mesh Baker re-measured: browser TRELLIS, WebMCP, pricing, adoption). **Row 45 extended** (second owner share; the 6 GB claim recorded as a claim). 49 → 50 rows. |
| `Skills/software-development/realtime-browser-qa/SKILL.md` | **v1.2.0 → v1.3.0.** New step 10, one gotcha, three pitfalls, two checklist boxes, description clause. Additive only — steps 1–9 and every pre-existing gotcha, pitfall and checklist box are byte-identical. |
| `.akephalos/skill-evaluations/realtime-browser-qa.json` | Rewritten as the paired evaluation for this update; accepted **scoped** (`--skill realtime-browser-qa`). |
| `Dev-Practices/AI 3D Technique Register.md` (vault) | 2026-09-03 intake section, so an agent entering through Obsidian finds row 50 and its carrying skill. |
| Atomic Acres game source | **Nothing.** This lane is docs and governance only. |

### Gates run

- `skill_regression_guard.py accept --skill realtime-browser-qa` → `PASS accepted skills=realtime-browser-qa`. Scoped; the ~14 other drift entries are other lanes' debt and were **not** blanket-accepted.
- `technique_register_guard.py check --machine dave-gaming-pc` → row 50 has **no findings**. Two findings it raised against row 50 on the first run were fixed properly, not waived: the pin was short (now the full 40-hex `1dcc255adc5600cfec8a7e3e38c896074668dd1e`) and the licence field was mis-formatted so the guard could not see the verdict.
- A first draft of the skill description was **386 characters and failed** the guard's 360 limit. It was trimmed to 265. The policy was not touched.

---

## Two things you should look at

**1. Skill discovery is broken for five harnesses right now.** Running
`_Scripts/link_skills.ps1 -VerifyOnly` reports:

```
DIFF Claude Code     0/163 skills  (junction)
DIFF Codex           0/163 skills  (junction)
DIFF dsh             0/163 skills  (junction)
DIFF Continue        0/163 skills  (junction)
DIFF Antigravity     0/163 skills  (junction)
OK   Hermes        163/163 skills  (junction)
read-through probe ('macos-personal-automation' via Claude root): FAILED
```

Only Hermes can currently read the shared skill store. `~/.claude/skills` points at
`~/.agents/skills` rather than the vault, and that junction was created **today at 00:55** — it
looks deliberate and recent, so this lane did **not** relink it unilaterally. If it was not
deliberate, the fix is `link_skills.ps1` without `-VerifyOnly`. This is also the root cause of the
register guard's mirror findings against all 18 carrying skills, not just this one.

**2. The scheduled gates are still paused.** The Hermes `akephalos-sync` cron job — the only
scheduled thing that runs either mechanical guard — has been paused since 2026-08-10. Both guards
currently protect nothing on a schedule; they only run when an agent runs them by hand, as here.
This is already recorded as an open item in the register and remains a one-line owner action.

---

## Sources, as fetched

Every claim above comes from something fetched this session. Nothing was taken from a search
snippet and no login was used.

| Source | Status | Bytes | Licence |
|---|---|---|---|
| `api.github.com/repos/PhiloLabs/fable51-worlds` (via authenticated `gh`) | 200 | — | MIT (API field) |
| `raw.githubusercontent.com/.../LICENSE` | 200 | 1,066 | **MIT (c) 2026 PhiloLabs — read as a file** |
| `raw.githubusercontent.com/.../README.md` | 200 | 5,256 | — |
| git tree @ `1dcc255adc…` (461 blobs) | 200 | — | — |
| `.../kyoto-higashiyama/FINAL_QA_REPORT.md` | 200 | 11,311 | — |
| `.../kyoto-higashiyama/tools/passability.mjs` | 200 | 4,880 | MIT |
| `.../kyoto-higashiyama/tools/perf.mjs` | 200 | 5,700 | MIT |
| `.../kyoto-higashiyama/package.json` | 200 | 688 | MIT |
| `mesh-baker.needle.tools/` | 200 | 7,784 | Proprietary hosted product |
| `mesh-baker.needle.tools/_app/immutable/chunks/Be1XoTti.js` | 200 | 179,058 | Proprietary |
| `needle.click/mesh-baker-docs` → `engine.needle.tools/docs/products/needle-mesh-baker` | 302 → 200 | 58,713 | Proprietary |
| `cloud.needle.tools/pricing?source=baker` | 200 | 79,964 | Proprietary |
| `api.npmjs.org/downloads/point/last-month/@needle-tools/engine` | 200 | 92 | — |
| `api.fxtwitter.com/philippsieben/status/2095440655170294085` | 200 | 7,035 | — |
| `api.fxtwitter.com/hybridherbst/status/2093299068441092380` | 200 | 7,078 | — |
| `api.fxtwitter.com/Reelix/status/2095421179267895608` | 200 | 2,193 | — |
| `api.fxtwitter.com/_EricFrost_/status/2095367464720671094` | 200 | 2,140 | — |

One unauthenticated `api.github.com` call returned **403 (rate limit)** and was redone through
authenticated `gh`; that is the only non-200 in the set. The Mesh Baker one-time licence price is
server-populated and was **not captured** — it is recorded as unresolved rather than estimated.

### Claim states

- **Verified (read from a file or an API field this session):** the fable51-worlds licence, pin,
  star/fork/commit counts, tree contents, the Kyoto world being assets-free, both QA tool
  behaviours, the QA report's numbers; Mesh Baker's TRELLIS model and client-side execution, its
  WebMCP origin trial and expiry, the Needle pricing tiers, the npm download counts, the X
  engagement figures, and the ComfyUI node set (row 45, verified 2026-09-02).
- **Reported claim, not verified:** philippsieben's "6 GB VRAM"; Needle's "1,300,000 triangles down
  to 5,900" marketing figures; the customer logos on the pricing page.
- **Unresolved:** the Mesh Baker one-time licence price.
- **Not measurable:** any Mesh Baker user count.

### Boundaries kept

Untrusted web content was treated as data throughout — the register row, the skill and this document
quote what these sources *say* and separate it from what was independently checked. No code was
copied from any source, including the MIT-licensed one, because the transferable thing is the
method: the skill deliberately does **not** restate fable51-worlds' constants (1.5 m stations,
0.34 m disc) as values to adopt, since ours is a different game with a different player radius.
Nothing was purchased and no paid API was called. No verifier, threshold or gate was weakened
anywhere. `C:/Users/david/projects/aa-omp-pass84`'s working tree was not touched.
