# Pass 63 cleanup, Project Map, chat, and deferred visual repairs

Date: 2026-07-24  
Impact: `runtime`  
Base: `249a7ee77dce761eb237f3eb0e0d0ea1d0356317`  
Release intent: local immutable HITL candidate only; do not publish before Dave tests it.

## Overview

Pass 63 is the first recurring whole-project hygiene pass. It removes proven
duplication and obsolete presentation wiring, establishes a visible project
architecture map, adds private-room text chat, and closes the three visual
defects explicitly deferred from Pass 62. It preserves Pass 62 gameplay,
physics, netcode, release topology, and the user-accepted Rustworks rebuild.

The cleanup is deliberately progressive. Moving roughly two hundred source
files in one gameplay pass would create a large, low-signal diff and make
regressions harder to diagnose. Pass 63 instead introduces one canonical typed
project tree, validates its real paths, and begins the physical module split at
the menu/dialog boundary. Later weekly passes can migrate one bounded domain at
a time without changing the public tree or its identifiers.

## Context and claim states

- **Observed:** the protected Pass 62 receipt names source
  `249a7ee77dce761eb237f3eb0e0d0ea1d0356317`, Pages
  `27c90967bdaf5387c0372933c7965a60ce75a765`, Pass 62 Live, and byte-exact
  Pass 60 Stable.
- **Observed:** Dave accepted Rustworks in Pass 62, then reported light leakage
  and black house doors in Atomic Acres plus wall-like/pass-through door and
  cockpit surfaces in Skyline Terminal.
- **Inference:** the visual faults are presentation/occlusion ownership defects,
  not permission to alter the shared physics world.
- **Assumption:** private-room chat should be ephemeral, bounded, and available
  in both lobby and match without external storage.
- **Unknown:** final visual preference and real multi-household chat/network feel
  require Dave's HITL session.
- **Falsifier:** any Pass 62 gameplay/netcode change, Rustworks regression,
  profile-dependent collision, browser error, or failed requirement below
  rejects the Pass 63 candidate.

## Measured cleanup inventory

The 2026-07-24 base contains 215 TypeScript source/test files, 64 scripts and
82 documentation files. The largest active source boundaries are `main.ts`
(480,145 bytes), `additional-maps.ts` (124,614), `art-kit.ts` (84,952), and
`style.css` (61,644). Strict TypeScript's optional unused-symbol pass identified
14 unused imports, locals, or constructor properties. Those symbols are safe
Pass 63 removals after the parallel visual/chat lanes reconcile.

The runtime import audit also found four modules not reached from the browser
entry. They are intentionally retained: gameplay replay/canonical-state and
gameplay-contract code feed deterministic baseline generation, while
network-chaos feeds the matrix and soak runners. Calling those files "dead"
would weaken QA rather than simplify production.

The refreshed registry audit identified one production-scoped high advisory in
Vite's locked PostCSS 8.5.16 dependency. Pass 63 applies only the compatible
8.5.23 transitive override and returns `npm audit --omit=dev` to zero. The full
development tree still reports seven high advisories through asset-authoring
and Worker toolchains. Broad downgrade/major-version fixes are not mixed into
this gameplay candidate; they remain a measured maintenance follow-up.

## Requirements

### R1 - Atomic Acres opaque-surface integrity

Opaque house walls must occlude practical lights and selective effects. House
entrances, upstairs doors, and sibling apertures must not contain black slabs or
opaque leaves unless they are intentionally closed and collision-backed.

### R2 - Skyline Terminal opening authority

Terminal doors, boarding routes, aircraft cabin openings, and the cockpit must
look open exactly where movement and projectile authority says they are open.
True glass remains transparent; signs and displays remain opaque/readable.

### R3 - Shared private-room text chat

Pressing Enter in a hosted lobby or live private match opens/focuses a compact
chat composer. Enter sends, Escape cancels, and gameplay/menu hotkeys do not
fire while typing. The host validates and relays bounded sanitized messages so
every connected player sees the same sender, order, and text. Chat is ephemeral
and is not written to browser diagnostics, reports, or external services.

### R4 - Visible Project Map foundation

A `PROJECT MAP` control sits beside `LAST RELEASE`. Its accessible dialog has
separate Overview, Structure, Changes, and Archive views. The same canonical
typed data drives the UI and two downloads:

- a concise human-readable Markdown document;
- a complete agent/debug JSON bundle.

Both downloads begin with the current architecture and release snapshot, then
include the historical release archive and change records. Tests must reject a
documented source path that does not exist.

### R5 - Bounded recurring cleanup

Extract release/project-map dialog rendering and lifecycle out of the monolithic
runtime shell, remove the replaced duplicate wiring, and make domain ownership
explicit without altering gameplay authority. Record further large-module and
dependency cleanup as measured follow-up work rather than performing an
unreviewable tree-wide move.

### R6 - Preserve accepted Pass 62 contracts

Rustworks remains unchanged and keeps its accepted one-ramp, 8/4/4 container
layout. Pass 62 host-authoritative shot timing, DHV, 2x Damage, corpse,
redeploy, rendering-profile, collision, and release-channel contracts remain
green.

### R7 - HITL before release

Produce one served local/immutable Pass 63 candidate with focused visual,
protocol, UI, and regression evidence. Do not alter `main`, `gh-pages`, or
release channels until Dave explicitly accepts that exact candidate.

## Mechanical acceptance criteria

- **C1:** focused Atomic browser capture/probe shows no black doorway slab and
  no selected light/effect contribution through a representative opaque wall in
  both Performance and Quality.
- **C2:** focused Terminal probe traverses every audited opening and proves
  presentation/collider parity in both profiles.
- **C3:** protocol/state tests reject oversized, malformed, spoofed, stale, and
  duplicate chat messages; a real-peer browser test proves common ordering.
- **C4:** keyboard tests prove Enter/send/Escape behavior and input suppression
  in lobby and match.
- **C5:** Project Map unit tests validate stable IDs, real paths, current-first
  download ordering, complete changelog archive, and safe text serialization;
  a browser test exercises tabs and both downloads.
- **C6:** TypeScript, focused suites, core gameplay contract, asset provenance,
  production build, release-tree audit, and representative bounded browser
  groups pass without weakening existing thresholds.
- **C7:** final contribution preflight is clean and the exact HITL build SHA is
  recorded before Dave is asked to test.

## Out of scope

- Publishing Pass 63 or changing Pass 60/62 release-channel identities.
- Replacing the PeerJS/WebRTC star, adding TURN, host migration, accounts, chat
  persistence, moderation services, or public matchmaking.
- A wholesale move/rename of all existing source files.
- New Rustworks art, layout, collision, or lighting work.
- The full Pass 64 visual redesign; Pass 63 only provides the clean data and UI
  boundary it will consume.

## Decisions and follow-up

- The project tree is a product contract with stable domain IDs, not a dump of
  the filesystem.
- Current facts and historical archive are derived from one source each; the UI
  and downloads do not maintain separate hand-written copies.
- Weekly cleanup should start from measured hotspots and preserve positive
  contracts. `main.ts` and other large modules are split at real ownership
  boundaries, one bounded pass at a time.
- Dependency advisories are audited separately. Production dependency safety
  remains release-blocking; broad breaking dev-tool upgrades require their own
  reviewed maintenance pass.
