# PASS 94 — animation + skins lane: Muse skeptic review

Scope: `git log --oneline origin/contrib/dave-gaming-pc/omp/pass84-overnight..HEAD`
(6 commits, `f8130395`–`7f9c6a3b`), `git diff --stat` 11 files / +2156 −6,
`docs/evidence/pass94/animation-skins/PLAN.md`, `REPORT.md`. New modules read in full:
`src/operator-skin-look-registry.ts` (412 lines), `src/operator-skin-tsl-materials.ts`
(387), `src/operator-posture-layer.ts` (348); modified-file hunks read in full
(`operator-model.ts`, `rigged-operator-animation-director.ts`, `legacy-main.ts`,
`scripts/pass94/capture-operator-looks.mjs`); tests
(`-registry.test.ts`, `-tsl-materials.test.ts`, `-posture-layer.test.ts`,
`-posture-director-integration.test.ts`) read at the asserted rows.
Claim-states: **VERIFIED** = read/measured this review. **RECORDED** = prior pass evidence.
**ASSUMPTION** = reasoned. **OPEN** = not done. No code was run; no `src/` touched.

## 1. Owner's mocap rule — HONOURED, in plan and in code

- PLAN.md §1 states the rule concretely and scopes it to three facts (video-mocap
  REJECTED for admitted assets on licence grounds; mocap never drives weapon-holding
  poses; permissive variant = SOMA-30 only, never SMPL-X; public-URL shipping means the
  "just local" non-commercial carve-out does not apply). VERIFIED — read.
- Code honours it: the three new modules import only `three`, `three/webgpu`,
  `three/tsl`, `./animation-blend-graph`, `./prone-transition`, and the look registry.
  No GVHMR/SMPL-X/Mixamo/video/comfy import, no new dependency (`package.json` not in
  the diff). Animation comes from the shipped 24-clip Quaternius corpus plus procedural
  layers; Kimodo text-to-motion is fenced to non-weapon motion *iff* licences are
  re-answered (PLAN §4 slice 4); H3/image correctly classified as reference/props/gear,
  never a rig source. VERIFIED — import blocks + diff file list.
- No finding. No fix.

## 2. Skins — tint path genuinely replaced; clone claim holds with one asterisk

- Replacement is real, not a tint: `operatorLookInstanceMaterial`
  (`src/operator-skin-tsl-materials.ts:284-313`) writes `colorNode`/`roughnessNode`/
  `metalnessNode` outright, detaches the authored base-colour map to
  `userData.authoredBaseColorMap`, keeps the normal map. Gate
  (`src/operator-model.ts:982-987`) applies only for `appearance === 'team'` on the
  WebGPU backend and only for the three authored garment roles; Skin/Visor/unknown,
  `showcase`, `neon-purple` dummies, and all of WebGL2 fall through to the shipped
  path unchanged. Fail-closed on undeclared backend
  (`operator-skin-tsl-materials.ts:337-339`). VERIFIED.
- Clones share pipelines: one base material per (look, role) in `_materialCache`,
  one graph per (look, role) in `_graphCache` (`:239-257`, `:223-231`); clone copies
  node references (`:264-266`), pinned by test asserting `colorNode`/`roughnessNode`/
  `metalnessNode` identity **and** identical `customProgramCacheKey()`
  (`src/operator-skin-tsl-materials.test.ts:57-65`). VERIFIED on the installed three.
- **F1 (asterisk, docs-only).** `flattenMaterials === true` sets `metalnessNode = null`
  on the clone, so flattened (bot/distant) instances hash differently from full ones:
  12 graphs → up to 24 programs in a mixed lobby. `where`: `tsl-materials.ts:300-306`.
  `why`: contradicts REPORT §3 "twelve node graphs for the whole game" in the letter
  (not the spirit — flatten is the pre-existing contract). `fix`: one sentence in
  REPORT §3 — "12 graphs, ≤24 programs with the flatten variant".
- Separability: enforced at load — ≥2 looks/team, within-team redmean ≥ 42,
  cross-team ≥ 90 (`registry.ts:111,118,232-283`), pinned by tests
  (`registry.test.ts:53-72`). **But the numbers are a proxy, not a measurement:**
  `lookSignatureColour` (`registry.ts:171-182`) mixes base/blotch/trim with a fixed
  `TRIM_SILHOUETTE_SHARE = 0.14` — no lighting, fog, distance, or weave-fade in the
  model — and captures are CPU-swiftshader only (receipt admits; GPU re-capture OPEN).
  **F2:** claim-state for "separable at gameplay range" is ASSUMPTION, not VERIFIED.
  `fix`: GPU re-capture then pixel-sample the skins sheet at range; until then
  downgrade REPORT §2/table-1 wording to "load-enforced proxy + CPU visual corroboration".

## 3. Posture layer — presentation-only VERIFIED; prone-transition contract matched

- Reads `stance` + planar speed, writes clip-selection speed, `cadenceScale`, aim-pitch
  scale, sprint envelope, lean. Touches no authority: eye height
  (`characterPhysics.setStance`, `legacy-main.ts:8647`), hit proxies
  (`hitProxyRootTransform` in `poseOperator`, `art-kit.ts:1975-1978`), movement speeds
  (`movementProfile`/`botStanceSpeedCap`), replication snapshots — all outside the lane
  diff. Per-posture caps (stand 12 / crouch 2.6 / prone 1.1,
  `operator-posture-layer.ts:113-117`) only cap *clip selection* and report
  `residualSpeedMps`, never absorb speed into `timeScale` (integration test
  `:137-138`); cadence re-clamped to the existing playback limits
  (`rigged-operator-animation-director.ts:294-309`). Omitting `stance` reproduces prior
  behaviour exactly (`:324-331`, `:346`). VERIFIED.
- Transition durations derived from `DROP_SHOT_TIMING`, not re-tuned
  (`operator-posture-layer.ts:72-83` vs `prone-transition.ts:58-61`); crouch↔prone as
  remainder with 0.05 s floor. Matches the contract. VERIFIED.
- **F3 (cosmetic, real).** Two sprint definitions now drive one body (REPORT §5.3
  self-admits): latched hysteretic posture sprint (5.2/4.4 m/s + 0.22/0.16 s ramp,
  `posture-layer.ts:124-128`) for lean/aim vs stateless
  `smoothstep(speed, 3.2, 6.8)` for the weapon socket (`operator-model.ts:878-880`).
  `why`: the socket finishes dropping (~6.8) after the lean has barely started (5.2) —
  sprint reads as two systems. `fix` (one line): drive the socket blend from
  `runtimeState.lastPosture?.sprint ?? <current smoothstep>`.

## 4. Multiplayer — no new replicated state; look id not guest-spoofable

- Lane adds zero netcode surface: posture follows the existing stance channels
  (gameplay stance via pose snapshots, idle-stance preference via lobby `stanceId`);
  skin look is *derived* deterministically from `(skinId, team)` through the frozen
  registry + explicit `SKIN_LOOK_VARIANT` table (`registry.ts:385-401`) — no look id
  crosses the wire. `skinId` is host-validated against the selectable catalog
  (`legacy-main.ts:9574,9713,10444`); unknown ids fall to variant 0 rather than
  black-screening (`registry.ts:397-401`). A guest can only pick its *own* skin
  (legitimate customization), never dictate another peer's look. VERIFIED.
- Cosmetic divergence only: backend gate is per-peer, so a WebGL2 peer renders tint
  where a WebGPU peer renders procedural. No authority impact. No fix.

## 5. Bots — same path VERIFIED; REPORT's bot rows are stale (strongest finding)

- Bots go through the same path: `buildOperator` → `createOperatorInstanceMaterialResolver`
  → `materialForTeam` (procedural skins, flatten variant) and
  `poseOperator` → `updateRiggedOperator` (posture solve, `art-kit.ts:1982`,
  `operator-model.ts:2355-2372`). VERIFIED.
- **F4 (report correctness).** REPORT §2 claims "Bots publish `stance: 'stand'`
  unconditionally at `legacy-main.ts:8310` and `:14033` — VERIFIED", and §6 OPEN 1 says
  the stance-authority half is missing. At HEAD neither line exists with that content;
  base already carries bot stance authority: `src/bot-stance.ts:91-97` (policy),
  `:105-108` (speed caps via `movementProfile`), `legacy-main.ts:21035-21041`
  (host sim), `:20270` (replication), `:20372-20373` (guest pose),
  `:13525-13528`/`:20943-20945` (history). The two remaining hardcoded
  `stance: 'stand'` sites are legitimate: spawn-initial history (`:20094-20100`,
  stance simulated afterwards) and static gun-range dummies (`:14448`, stand proxies
  by contract). `why`: a stale VERIFIED row in durable audit evidence misdirects the
  integrator (and understates this lane — the posture layer *does* fire for bots
  today). `fix`: amend REPORT §2/§6.1 to RECORDED-superseded-by-base, citing
  `bot-stance.ts`; keep slice 2 only for whatever policy/difficulty work is genuinely left.
- **F5 (silent skip, minor).** `applyBotEmissiveBrightness` walks materials with
  `instanceof THREE.MeshStandardMaterial` (`operator-model.ts:60-62`), which node
  materials fail (REPORT §5.2 self-admits; pinned
  `tsl-materials.test.ts:67-77`). `why`: correct-by-design today (no emissive fill to
  scale) but silent — a future brightness tune will visibly do nothing on WebGPU
  operators. `fix`: one-line comment at `:60-62` referencing §5.2.

## Verdict: SHIP-WITH-FIXES

1. Correct the stale bot-stance evidence rows (F4) before the report hardens into audit
   history — a wrong VERIFIED is worse than an OPEN.
2. Run the unrun browser gates (`qa:stock-boot`, gun-range boot smoke) and the GPU
   re-capture (REPORT §6.6–6.7 admit CPU-only/unrun) before publish; do not report them
   as green.
3. Unify the sprint socket blend onto `lastPosture.sprint` (F3, one line) or track it as
   OPEN; fold the flatten-programs asterisk (F1) and emissive-skip comment (F5) in.
   The code itself is shippable: presentation-only, fail-closed, backward-compatible
   (optional `stance`), well-tested, and honest about its OPEN items.
