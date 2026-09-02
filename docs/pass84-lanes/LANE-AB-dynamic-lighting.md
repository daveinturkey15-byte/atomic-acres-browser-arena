# Lane AB — dynamic, coloured, time-of-day and weather lighting on every arena (owner direction since 2026-08-31)

Orchestrator: Claude Code (Fable 5.1). Owner direction on record: dynamic /
coloured / time-of-day / weather lighting everywhere; on 2026-09-02 17:05
"lighting feels a bit off"; "weather can wait" until the overnight build,
which this is.

Worktree: create `C:\Users\david\projects\aa-claude-lighting`:
`cd C:\Users\david\projects\aa-omp-pass84 && git worktree add ../aa-claude-lighting -b contrib/dave-gaming-pc/claude/dynamic-lighting <current pass85 head>`
then junction `node_modules` from aa-omp-pass84. Base = the PASS 85/86 head the
orchestrator names in your prompt (Lane I's IBL consistency fix must already
be in it; build on it, do not fight it).

## The hard constraint (PASS 82 root cause, never violate)
Three's WebGPU light set is part of every material's cache key. Adding,
removing or toggling a light at runtime invalidates every pipeline and
freezes the game. Therefore: the light SET is frozen before the coverage
fence; time-of-day and weather are UNIFORM WRITES over that frozen set
(intensity, colour, direction, shadow parameters, fog/haze/exposure/grade
uniforms), never a light-set change. The pipeline tripwire
(`scripts/qa/probe-pipeline-compile-stalls-cdp.mjs --dist dist --seconds 75`,
0 in-combat creations) is your gate on every arena.

## Facts
- Per-arena grade identity: `src/rendering/art-direction.ts` (distinctiveness
  floor test; night/indoor identities carry hue and haze, never added linear
  contrast; rustworks night shadow mass 15/255 is the combat-safety datum).
- Weather already exists in part (wind vector sampled once, fog consumers
  routed; the gap noted on 2026-08-31 was routing that vector to more
  consumers). Mist/smoke/dust tints are per-arena uniforms. Filmic chain and
  environment/IBL are in the arena definitions and `src/legacy-main.ts`.
- Multiplayer: friends must share a sky. Time-of-day and weather state are
  HOST-AUTHORITATIVE and replicated (a seed + clock offset is enough; guests
  derive the same values), with the lobby carrying the setting.
- Owner plays Chrome on an RTX 5080 at 1440p; a lighting pass that costs
  more than ~1 ms/frame or raises the draw count is a regression.

## Job
1. Design doc first (`docs/DYNAMIC_LIGHTING_2026-09-03.md`): per arena, the
   time-of-day range that fits its identity (some are night/indoor and get a
   narrow range), the weather set (clear, overcast, rain where an arena has
   it, fog), what each state writes (sun direction/colour/intensity, sky and
   ambient colour, fog density/colour, exposure, grade tint, wet-surface
   response where materials support it), and the combat-safety envelope per
   arena (shadow-mass floor, luminance band) with the numbers.
2. Implement a `LightingConditions` state (host-authoritative, replicated)
   and a per-arena preset table; drive everything by uniform writes; a
   lobby/host setting (auto-cycle over the match, fixed time, or random);
   bots and remotes unaffected. Solo picks a random time within the arena's
   range unless the player fixes it.
3. Measure per arena at three times of day and two weathers: luminance
   mean, shadow mass, the pipeline tripwire (must stay 0), draw calls, frame
   time delta. Screenshots from the review cameras for every state; look at
   them and reject any state that makes a map unreadable in combat.
4. Tests: preset envelope test per arena (values inside the safety band),
   replication determinism test (same seed + clock -> same values on two
   peers), a source-pinned test that no code path adds/removes a light after
   the fence.
5. `npx tsc --noEmit`; focused tests; commits per arena batch with explicit
   paths; evidence under `docs/evidence/pass87/dynamic-lighting/`.

## Boundaries
- You own: the lighting-conditions module, the per-arena preset rows, the
  uniform-write plumbing in arena definitions and the lighting region of
  `src/legacy-main.ts` (`// LIGHTING:` marks, LF), lobby setting UI row,
  replication field, tests.
- Do NOT: add or toggle lights at runtime; touch weapons/viewmodel, spawns,
  netcode transport beyond the replicated field, Nuke Town Rebuild or Map 3
  internals (they are being built in parallel; their presets can be added by
  their lanes later - give them a preset template in the design doc).
- Machine rules as every lane: headless only, one browser, one build, never
  kill processes, no full vitest, 3 GB free VRAM before a launch (wait if the
  owner's ComfyUI queue is running).

## Report
Design doc path, per-arena state table with numbers, tripwire results per
arena, frame-time delta, screenshots per state, tests, commits, what was
rejected and why. Claim-state every line.
