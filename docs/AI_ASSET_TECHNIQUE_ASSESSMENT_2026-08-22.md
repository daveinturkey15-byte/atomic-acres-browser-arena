# AI asset & workflow techniques — assessment against Atomic Acres

Three techniques the owner shared on 2026-08-22, assessed against what this codebase
actually is: ~31,700 lines in `legacy-main.ts` alone, six arenas, host-authoritative
PeerJS multiplayer, 3,200+ tests, and a clean-room asset boundary with per-asset
provenance manifests.

The honest summary first: **one of these addresses a real, measured weakness in how
this project is being built. One is useful for a narrow class of asset. One is
roughly where this project started.**

---

## 1. Scaffold + AI-generated hero GLB (@filiksyos)

> Scaffold a three.js project, generate a `.glb` hero object with AI, combine them.

**Verdict: below the current bar. Nothing to adopt.**

This is a greenfield starting workflow. Atomic Acres already has authored arenas with
collision authority, ballistic surfaces, LOD tiers and a coplanar-surface audit. The
most-upvoted replies to that post make the operative point themselves — the hard part
is harmonising assets, animation, gameplay and difficulty, not producing a GLB.

Recorded so nobody re-proposes it as an improvement.

---

## 2. Image-gen API + image-to-3D API + **browser self-verification loop** (@anshuc)

> Gave the agent: an image-gen API (Gemini), an image-to-3D API (fal.ai), and a
> browser self-verification loop, so it could generate assets **and verify them
> visually to close the loop**.

**Verdict: ADOPT the third component immediately. It is the most valuable idea in all
three posts, and it is not the asset generation.**

The self-verification loop targets a weakness this project has demonstrated
repeatedly and expensively:

| Incident | What green tests failed to catch |
| --- | --- |
| Boot failure (`#lobby-squad-name`) | 2,858 tests passed; the game would not start. **The owner found it by opening the page.** |
| HF-344 glass wiring | tsc clean, source-text test passing, six intact Terminal windows became walk-through |
| Background chiptune | 3,196 tests pass; **nobody has ever heard it** |
| HF-331 Firefox measurement | First run measured SwiftShader and would have invented a 15x gap out of nothing |

The pattern is constant: **unit tests verify propositions about code; they do not
verify that the game looks or sounds right.** Every one of those defects lived in the
gap between "the assertions pass" and "a person opened it".

### What we already have, and what is actually missing

Already present: Playwright 1.61.1, a QA capture harness
(`scripts/qa/capture-pass60-visual-acceptance.mjs`), a topology runner
(`npm run qa:playwright-topology`), and `window.__ATOMIC_ACRES_DEBUG__` exposing
`startSolo()`, `snapshot()`, `samplePresentationTelemetry()` and
`sampleEnduranceHealth()`.

Missing, and the honest blocker: **headless Chromium on this machine falls back to
SwiftShader** (`softwareAdapter: true`, measured 2026-08-22). So a headless loop can
verify *structure* — did the arena boot, is the canvas visible, are there console
errors, does the renderer stamp its backend — but it cannot verify *appearance or
performance*, because it is rasterising in software. Any visual-quality or frame-rate
claim from a headless run is worthless. That is a real constraint, not an excuse, and
it splits the loop in two:

- **Structural self-verification — adopt now, no blocker.** In flight as
  `tests/e2e/pass74-arena-boot-smoke.spec.ts`: boot all six arenas, assert no
  pageerror, no console error, canvas visible, backend stamped. This would have
  caught the `#lobby-squad-name` failure before the owner did.
- **Appearance/performance verification — needs a headed run on a quiet machine.**
  `scripts/qa/measure-hf331-firefox-gap.mjs` already defaults to headed and documents
  the SwiftShader trap. It must not be run headless, and it must not be run while
  swarms saturate the machine.

### Asset generation halves (image-gen, image-to-3D)

See §3 — the same constraints apply, and they are the binding ones.

---

## 3. Vibe3d for procedural cities / "hardbody models" (@DerekBrenner)

> Adding procedural cities using Vibe3d to a three.js game; a game changer for
> hardbody models.

**Verdict: adopt for HARD-SURFACE PROPS ONLY, behind two existing gates. Do NOT use
it for characters.**

### Why not characters

The operator-skin lane (HF-360) is bound by a canonical rig contract: **62 joints, 24
animation clips, and four material names** (`Skin`/`Swat`/`Swat_Black`/`Visor`) that
runtime team-tinting depends on. The Blender procedural pipeline preserves that
contract by construction, and the receipts verify it by parsing the exported binaries
rather than trusting the tool. Image-to-3D generators do not produce a conforming rig,
and a character that does not match the rig cannot be animated or tinted by the
existing runtime. The generated mesh would be the easy 10% of that lane.

### Where it genuinely fits

Hard-surface set dressing: crates, machinery, vehicles, barriers, signage,
architectural blocks. "Procedural cities" maps onto the Atomic Acres neighbourhood and
Skyline Terminal directly. This is real value.

### Gate 1 — provenance and licence, non-negotiable

Every asset in this repo carries a `.provenance.json` sibling recording creator,
licence, source policy, generator and SHA-256. The MiniMax H3 licence already forced a
recorded gate (Community Licence excluding UK use absent written rights; the owner
authorised local, non-distributed use only). **Any generator's output licence and
training-data terms must be recorded the same way before its output ships in a build.**
An asset with no provenance row does not enter the repo.

### Gate 2 — a mesh is not an asset in this codebase

This is the constraint most likely to be underestimated. Assets here carry collision
authority, ballistic surfaces, LOD tiers, and polygon-offset tiers that the coplanar
audit checks. Concretely, **HF-344 is the cautionary tale**: glass colliders derived
from *rendered GLB AABBs* were larger than the authored opening and created invisible
blockers the owner could not walk through — and the AABB differed between graphics
profiles. The fix was to derive collision from **authored** bounds instead.

So an AI-generated GLB dropped in with `Box3.setFromObject` collision would
reintroduce precisely the defect just fixed. Imported meshes must get authored
collision, pass `arenaHorizontalSurfaceAudit`, and respect the texture budget (the
skins GLBs are already texture-dominated: 4.4 MB at LOD2 for 3,949 triangles).

---

## Adoption plan

| Action | Status |
| --- | --- |
| Structural self-verification loop — six-arena boot smoke | **In flight** (wave 8) |
| Headed appearance/perf verification on a quiet machine | Owed; scripts exist and default to headed |
| Image-to-3D for hard-surface props, behind both gates | Approved in principle; not started |
| Image-to-3D for characters | **Rejected** — breaks the 62-joint rig contract |
| Scaffold + hero-GLB workflow | **Rejected** — below current bar |

### The general lesson worth keeping

All three posts are demos of **greenfield velocity**: three prompts, two hours, from
nothing. This project's cost centre is not creating things — it is *not breaking* the
things that already work, across six arenas, host-authoritative multiplayer and 3,200
tests. Techniques that generate content are worth adopting where they clear the
existing gates. Techniques that generate content *by skipping* those gates are how
HF-344 happened in the first place.

The one technique that transfers wholesale is the self-verification loop, precisely
because it does not generate anything — it **checks**.
