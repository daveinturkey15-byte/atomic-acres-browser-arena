# Pass 80 status delta — 2026-08-26 (Claude Code, dave-gaming-pc)

Branch `gauntlet/pass79-omp-20260823`. Base for this session: `501df17a` (the OMP
fleet wave-1 checkpoint). Two commits added: `40fb8f59`, `b5a4d764`.

This is a **delta**, not a replacement handoff. It exists because the Pass 80
handoff set carries several confidently-stated facts that are wrong, and three
separate sessions have now spent time re-deriving them. Everything below was
measured on this tree, not recalled.

**Nothing was published. Live channels are untouched.**

---

## 1. Corrections to the handoff set

| Handoff claim | Source | Measured truth |
|---|---|---|
| "all four skin GLBs rebuilt at 21:27 with distinct geometry (standard/explorer/symbiote/navalops)" | `04-OMP-PASS80`, §3 HF-380 | **False on every count.** There are three archetypes, not four. The files were dated Aug 23 21:27 — they predated the profile work by three days. All three bodies were 1.8538 m tall and 1.676 m wide to the millimetre; explorer and symbiote differed by **5.1 mm**. Now fixed — see §2. |
| "No other scratch/`tmp-*` files remain in `src/`" | `04-OMP-PASS80`, §1 | **False.** Five `src/__hf387-*.scratch.test.ts` probes were still present, and had been *committed* in the checkpoint. Four carried zero vitest assertions; one shadowed `expect` with a local stub. Removed. |
| "farcrysis mountains — terrain still maxes ~2.2 m" | `03-ATOMIC-ACRES`, §6 | **Stale.** The highland massif ring landed. Analytic terrain now spans **-3.98 m to +7.79 m** (66,049 samples over the full bounds). What is fair to say instead: it is *flat in the middle* — 35% of the island sits in y ∈ [0,1), and only ~9.7% is above 4 m. |
| "RAY TRACED preset ... reflective-mesh counts `3,0,0,0,0,0` across six arenas" | `03-ATOMIC-ACRES`, §6 | **Stale — the checkpoint's water registration fixed it.** Measured now: atomic-acres 2, rustworks-1v1 1, gun-range 6, skyline-terminal 10, farcrysis 3, high-seas 16. No arena is at zero. Now gated (§2). |
| `releaseHudSway` "cleanup candidate" | `04-OMP-PASS80`, §5 DeadWiring | **Wrong remedy.** It is not dead weight to delete; it is the twelfth built-but-never-wired defect. Its own contract names four states it exists for and production called it from nowhere. Wired, not deleted (§2). |
| Invisible geometry (owner complaint #1) | — | **Still disproven, re-confirmed with this session's changes in.** `audit-collider-visual-parity.ts` → 0 invisible colliders across all six arenas, exit 0. |

Two dead-export candidates were investigated and are **correctly** uncalled —
do not "fix" them: `resetLightShafts` is documented test-only (and its
publish/subscribe latch *is* live: `farcrysis-atmosphere.ts:545` →
`particles/index.ts:419`), and `tslResetWindUniforms` is a teardown safety net
whose registry provably does not leak (7 uniforms, stable across three
rebuilds — the ref-counted dispose path works).

---

## 2. What landed

### `40fb8f59` — operator silhouettes, farcrysis frame loop, HUD sway

**HF-380 is done.** The generator had grown the whole silhouette-profile system
and could never run: `enforce_silhouette_envelope` used `accessory_scale`
before assigning it, so every archetype died on its first trace entry with
`UnboundLocalError`. That is the entire reason the shipped GLBs were three
days stale. Restoring the initializer exposed two more breaks left by the same
unfinished edit (a `write_receipt` call at the old arity, and a stale duplicate
call after it) plus two real modelling bugs:

- **Limb slimming ran after the frame edits, anchored on bones the frame edits
  never move**, so it dragged reshaped shoulders back toward the canonical
  skeleton. Explorer's authored −0.18 shoulder narrowing measured out at 0.9575
  shoulder-over-hip against its own ≤0.95 gate. Radius now runs first.
- **Accessories were built off canonical bone positions after the body had been
  reshaped**, so straps and plates stayed on the old frame. They now ride the
  same transform: worst accessory-to-body gap 0.1401 → 0.0947 m (navalops),
  0.1386 → 0.0882 m (explorer) — better than the previously shipped assets.

Shipped bodies now: **explorer 1.710 m, navalops 1.766 m, symbiote 1.919 m.**
Rig contract intact on all three (62 joints, 24 clips, the four canonical
material names team tinting binds to). `navalops.legRadiusTarget` was retargeted
0.80 → 0.66 — inside contract bounds, on its own slim-limb intent, because the
per-vertex slim factor delivers about a third of the authored target. **No gate
was moved.**

`src/operator-skin-silhouette.test.ts` pins this against the **shipped bytes**.
That matters: the generator's gates run inside Blender against geometry in
memory and prove nothing about what is under `public/` — which is exactly how
this shipped broken. Verified to fail on the previous assets.

**Farcrysis frame loop.** Four module-level animation registries (`_lodPairs`,
`_vines`, `_reeds`, `_foamWashRings`) never reset on rebuild. Measured doubling
on the second build: 69 → 138 reeds, 29 → 58 vines, 3 → 6 foam rings, 2 → 4 LOD
pairs — pinning disposed geometry alive and growing the per-frame loop linearly
with rebuild count. Also hoisted two time-invariant per-frame recomputes: the
wave surface was recomputing `swellDepthFactor` for all 625 vertices (a terrain
sample each, twice per vertex) and re-uploading a byte-identical colour buffer
every frame; the foam rings were recomputing a constant `atan2` per vertex per
ring per frame.

**`releaseHudSway`** is now gated on the four states its contract names
(reduced motion, menu/pause surface, death, possession handover), latched so a
stopped HUD is not rewriting four custom properties every frame.

**Scratch removal.** Suite wall clock **67 s → 36 s**. The landed HF-387
contract in `arena-layout.test.ts` is untouched.

### `b5a4d764` — RAY TRACED coverage gate

The interrupted RtxProxies item, finished. A ratchet on the measured per-arena
counts plus a hard "never zero anywhere" floor, because reflective coverage is
a property of the art and cannot be asserted into existence by a renderer flag.
Verified to fail (farcrysis → 0) when the water registration is removed.

---

## 3. Open, with the evidence to act on it

**Nine atomic-acres metal surfaces sit one hundredth outside the mirror
ceiling.** Both garage doors, the interior ramp rails, the east irrigation
vessel and the entrance canopies are authored at roughness **0.230** against a
**0.22** ceiling, at metalness 0.76. That is why the flagship map has two
reflective meshes. The ceiling is combat-tuned and must not move; dropping
those materials below it changes how they look on **every** renderer, not just
this preset. **This is an owner decision, not a gate fix.** Recorded in the
header of `arena-proxy-coverage.test.ts`.

**FarCrysis is flat in the middle, not short.** The massifs exist; the interior
does not use them. Super-terrain partitioned cliffs/arches remain the Wave-2
item — but scope it against the measured histogram above, not against the
retracted "2.2 m" figure.

**Still untouched from the handoff's list:** `SprawlAudit` `CLEANUP-PLAN.md`
(and the 756 MB `_probe-full.bundle` decision), the HEAD-vs-`c736d48c`
viewpoint regression run, AKP bookkeeping §7, two-machine multiplayer.

---

## 4. Verification at `b5a4d764`

```
vitest        487 files / 4366 tests green, 1 file + 2 tests skipped
tsc --noEmit  0 errors
qa:governance 5/5
provenance    151/151 digests
vite build    clean
collider parity  0 invisible colliders, six arenas, exit 0
```

Every fix in §2 was falsified before being claimed: the source was reverted (or
the fix neutered) and the new test was watched to fail for the stated reason.
