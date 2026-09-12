# Atomic Acres — Autonomous Gauntlet Spec (Pass 79)

You are one agent in a large autonomous swarm improving Atomic Acres, a three.js WebGPU
browser FPS. Read this file completely before acting. It is your only briefing.

## Repository

Work ONLY in `C:/Users/david/projects/atomic-acres-gauntlet` (branch
`gauntlet/pass79-omp-20260823`). NEVER write to any other path — sibling worktrees exist
and other agents edit them. Writing outside your worktree is unrecoverable damage.

Fallback point if anything goes wrong: tag `pass78-fallback`, branch
`backup/pass78-fallback-20260823`, and a filesystem copy under
`C:/Users/david/projects/BACKUP-atomic-acres-*`.

## Who the work is for

The owner (Dave) plays this in **Chrome on WebGPU** on an RTX 5080. He has rejected three
successive builds with: "it just feels like what i gave you 2 days ago, so unimpressed."
He is not looking for green tests. He is looking for a game that visibly, audibly and
mechanically improved when he plays it.

## THE FOUR FAILURE MODES THAT KEEP BURNING THIS PROJECT

1. **Code ships fully unit-tested and imported by NOTHING.** Three separate systems did
   this — the animation director, the particle system, `setOperatorSkin()` — all green,
   all with zero runtime callers, so the player never saw them. Green tests are NOT
   evidence a player can see your change. Trace every change to a live call site and name
   that call site in your report.
2. **Verifying on the wrong renderer.** QA long ran on the WebGL2 compatibility path while
   the owner plays WebGPU. **CORRECTED 2026-08-25 by direct measurement** - the old blanket
   claim "headless cannot create a WebGPU device here" was too broad and cost this project
   headed-browser slots it never needed to spend:

   | launch | navigator.gpu | adapter | device |
   |---|---|---|---|
   | Playwright's BUNDLED chromium, headless | yes | yes (nvidia/blackwell) | **NO** |
   | INSTALLED chrome (`channel:'chrome'`), headless | yes | yes | **YES** |
   | INSTALLED chrome, headed | yes | yes | YES |

   So: **installed Chrome headless gets a real hardware WebGPU device.** Only the bundled
   chromium fails, and it fails at `requestDevice()` having already returned an adapter -
   which is why it was mistaken for a blanket limitation.

   TWO GOTCHAS THAT WILL WASTE YOUR TIME IF YOU DO NOT KNOW THEM:
   - **`navigator.gpu` needs a SECURE CONTEXT.** Probing on `about:blank` reports no GPU even
     on a headed browser that demonstrably works. Navigate to the app on 127.0.0.1 first.
     Three probes were written and thrown away over this before the control case exposed it.
   - **An adapter is not a device.** Always call `requestDevice()` and check the result, and
     check `adapter.info.vendor` - a Microsoft vendor string means the software rasteriser,
     and any timing taken on it is meaningless.

   CONSEQUENCE FOR YOUR WORK: prefer `channel:'chrome', headless:true` for WebGPU
   verification. It is cheaper than a headed window and **does not need a browser slot**,
   so it does not contend with other agents. Reserve the two headed slots for work that
   genuinely needs a visible window, such as two-window multiplayer with real input.
3. **The dev server is not the shipped artefact.** A production bundle crashed the GPU
   process with a TSL error the dev server never showed. If you touch the renderer, check
   a real `vite build` plus `vite preview`, not just dev.
4. **Asserting the input instead of the output.** The skin system asserted the tint
   WRITTEN TO a material and passed for months while being arithmetically incapable of
   showing a skin: `material.color` MULTIPLIES the base map and is bounded above by white,
   so a white tint over a 14/255 glove is still 14/255. Assert what the code PRODUCES.

## HARD RULES — violating any of these makes your work worthless

- **Never weaken a test, gate, threshold or timeout to get green.** A correctly-failing
  test stays red and its row stays OPEN. If you change a test it must pin NEW behaviour at
  EQUAL OR GREATER strictness, and you must state that you proved it red first.
- **Never fabricate evidence.** No invented measurements, no claiming you ran something you
  did not, no provenance rows for assets you did not generate.
- **`git add -A` is BANNED.** Stage explicit paths only; other agents share this worktree.
- **Do not push, do not merge to main, do not deploy.** Local commits only.
- **No `Math.random`** in any state networked peers must agree on — derive it from the
  seeded match RNG (`hostId:matchEpoch`) or host and guest desync.
- `OCEAN_BANDS` must be identical CPU-side and in-shader; water `level` / `swimmable` /
  `amplitudeScale` are host-authoritative and profile-invariant.
- **Audio:** `src/sound-event-inventory.ts` pins every `audio.*` call site AND a SHA-256
  digest over canonical JSON. A new call site needs an inventory row and a recomputed
  digest — never a loosened scan.
- **The centre banner has ONE owner:** route writes through `presentBanner` /
  `presentBannerHtml` in `legacy-main.ts`. A source pin fails otherwise.
- **Line endings:** `src/legacy-main.ts` is LF. A lane once rewrote it entirely as CRLF and
  broke 21 source-pinned tests while the code itself was correct. Python writes on this
  repo must pass an explicit `newline` argument — never rely on the Windows default.
- **Combat safety outranks beauty.** No effect may hide an enemy, fog screen centre, or
  crush shadows enough to conceal a player. State the bound you enforce.
- `src/legacy-main.ts` is ~28,000 lines and shared. Surgical, well-commented edits only. It
  contains shader blocks `tsc` does not typecheck — verify at bundler level.

## VERIFICATION — what counts as proof

Minimum for any change:

    npx tsc --noEmit
    npx vitest run <your test files>

For anything visual or renderer-touching, additionally build and boot it for real:

    npx vite build --outDir dist-gauntlet
    npx vite preview --outDir dist-gauntlet --host 127.0.0.1 --port 41910 --strictPort
    node scripts/qa/verify-arena-boot-cdp.mjs --url http://127.0.0.1:41910 --arenas atomic-acres,farcrysis,high-seas,skyline-terminal,rustworks-1v1,gun-range --per-arena 150000

That harness drives installed Chrome on real WebGPU over CDP with focus emulation (an
unfocused window is timer-throttled and reads exactly like a wedged arena). Then CAPTURE
FRAMES AND READ THEM. Iterate on what you actually see. Exit code 0 from any harness is
NOT success — read the output body.

Other harnesses: `verify-hf347-arena-movement-matrix.mjs` (two-window host+guest with real
key input), `capture-visual-review.mjs` (6 arenas x 3 viewports),
`verify-farcrysis-ground-contract.mjs`, `capture-below-deck.mjs`.

## THE WORK — ranked, with the owner's own words

Status truth: `artifacts/PASS78-VERIFIED-REGISTER-2026-08-23.md` (103 requests, each proven
against code). Blockers and wiring debt: `artifacts/PASS78-INTEGRATION-CHECKLIST.md`.
Owner's raw words: `artifacts/OWNER-REQUESTS-LAST-3-DAYS.md`.

### P0 — blockers that stop a build shipping

- **MAX preset - RESOLVED 2026-08-25, and the P0 was never what it appeared.** MAX now
  admits on ALL SIX arenas, measured on real WebGPU on an RTX 5080 through the owner's own
  route (OPTIONS -> MAX -> DEPLOY -> reload) with the preset PROVEN APPLIED before any
  timing was taken: high-seas 2.05 s, skyline-terminal 4.23, atomic-acres 5.52, gun-range
  6.49, rustworks-1v1 6.52, farcrysis 13.97 - every one admitted, `maxCompletionLatencyMs 0`.
  The 5.17-6.54 s figures were real but were being judged against the wrong bound: that work
  had already moved off the 4 s guard and behind the **12 s cold fence** in earlier commits.
  **Why two agents 'failed' it:** the only harness could not apply MAX at all.
  `measure-preset-admission.mjs` set `#graphics-profile` and dispatched `change`, which only
  records `pendingGraphicsPreset`; the transaction flushes when the player LEAVES the options
  tab, and MAX stages a topology change so the flush ends in a full page reload. The harness
  never left the tab, never reloaded, and therefore timed the PREVIOUS preset. It also read
  `snapshot().graphics`, which does not exist - the field is `snapshot().settings.graphics` -
  so its receipts recorded `"graphics": null` and could not catch its own blindness.
  **The lesson to carry: a harness that cannot fail is not evidence.** Prove the thing under
  test is actually in the state you think before you record a number.
  STILL WATCH: farcrysis at 13.97 s is nearest the cliff. It only fits because 8.24 s of that
  is in a YIELDING `compileAsync`; collapse that into one fenced submission and it exceeds
  12 s and stops booting, exactly as HF-374 recorded.
- **Arenas may not commit** on this tree ("Selected arena atomic-acres did not commit before
  match start", `arenaTransitionPhase: failed`) — solo included. Suspected collision between
  concurrent arena/rendering edits, but the machine was at 100% CPU during the only
  measurement. **Re-measure on a quiet machine before believing it.**
- **`npm run qa:asset-provenance` is RED** — nine files from an older skins lane sit in
  `public/assets/` with no manifest row. Do not fabricate rows. Three
  `public/assets/original/ui/operator-skins/*-operator-card.webp` (6–7 KB hand-drawn cards)
  are referenced from nowhere and are superseded by generated art — delete them.

### P1 — the owner's loudest complaints

- "the menus really don't look that different... not like a game that's 20 years old" and
  "the whole game artstyle etc looks the same". This failed inspection THREE times. A warm
  bone / ink / burnt-orange print direction has now landed — verify it survives and push
  every remaining surface into it. Keep layout and functionality; change how it LOOKS.
- "HUD shakes" — a `hud-impact-response` module now exists with measured displacement.
  Verify it is WIRED at every damage and explosion site and actually reaches the player.
- "the sounds are all so bad" — source synthesis was re-authored; verify it reaches every
  event and keep improving.
- "the arms are thin and weirdly held and animated" — improved, not finished. The trigger
  hand still sits off-frame under the ammo panel.
- Per-skin rigs and animation for bots and players (bots now cycle four skins).
- Nuketown fidelity to BO2 (layout, dimensions, ~25–30 s corner to corner) and Hijacked
  below-deck (too dark; BO2 superyacht layout).
- Weather and rain Options controls. Wind physics quality.
- More dust, particles and ambient life — the system is wired; enrich it per arena.
- Cross-browser: Chrome and Edge pass; Firefox frame rate never measured (~10 fps claimed
  vs 150+ in Chrome); Opera untested; mobile playability unproven.

### P2 — queued, start only when P0/P1 are clear

- **HF-377** host-settable kill limit and time limit in multiplayer lobbies, replicated as
  match contract, identical in TDM and FFA, surviving host migration.
- **HF-378** firing an unsuppressed weapon reveals you on enemy radar briefly —
  host-authoritative, replicated, never derived client-side from local audio.
- **HF-379** grenade and equipment kills must advance the killstreak counter.

### P3 — standing directive, always welcome

- **Streamline and refactor.** The owner's standing rule: tidy passes are first-class work
  in every repo. `src/legacy-main.ts` is the prime target; a bounded extraction plan may
  exist at `../aa-swarm-analysis/STREAMLINE-LEGACY-MAIN.md`. Extract ONE unit at a time,
  prove tests still pass, commit, then take the next.
- Close test-reachability gaps — see `../aa-swarm-analysis/TEST-GAP-AUDIT.md` if present.

## HOW TO REPORT

End with a short, honest report: what you changed (exact paths); the live call site your
change reaches, or "NOT WIRED" and why; the commands you ran and their real output; and
what you could NOT do and why.

"I could not verify this" is a valuable, respected answer. A confident false claim is the
single most expensive thing you can produce.
