# Pass 60 fast-feedback ledger

## Release boundary

- Base: Pass 59 production source `31591b2655034788a19f4a2a68c6ab788926be53`.
- Stable fallback embedded in Pass 60: Pass 59 Pages `b29d44f1f45a6ade65e72738fc4adb58235f6f26`.
- Pass 60 is a runtime change. It must use the normal PR, exact-head checks, exact-main production workflow, receipt, and cache-busted browser smoke.
- Browser-viewable match history is a non-critical follow-up. It must not delay this playable build.

## Implemented in the first playable slice

- Sniper headshots use a sniper-specific 3x multiplier; other weapons retain 1.5x.
- Sniper ADS keeps the complete HUD/status visible.
- Damage feeds sit lower and per-hit event-feed duplication is removed.
- Field Support UI is 25% larger without changing its format.
- Completed matches expose two separate JSON files: a human summary (accuracy, K/D, shots, hits, damage, headshots and streak) and a bounded technical log (events, renderer/browser context and the exact weapon/penetration table). Both remain downloadable after returning to the main menu, until a new match begins.
- Both upstairs house windows are breakable. Prone camera smoothing is bounded inside the authoritative capsule.
- Quad presentation shaders are prewarmed; synchronous layout forcing at spawn is removed; the next-frame spawn cost is recorded in technical diagnostics.
- Tri-Pass uses the same left/right handedness as the HUD minimap.
- Rustworks has 20 perimeter containers instead of 16.
- Skyline Terminal gains transparent staff-door glazing and denser lounge/screens/cart presentation.
- LMG ADS uses a dedicated high-contrast aperture and front dot.
- Gun Range has a four-lane material/thickness wallbang lab and private multiplayer with no bots, FFA-only configuration, live per-player points/hits/accuracy and host-authoritative score snapshots. Distinct players remain hostile even when their presentation colour matches, and host-side shot admission derives reduced player damage through the real lab surfaces.
- A flying 100 HP black cat loops through the range with an animated black-star trail. Every hit is critical, a kill awards 500 points, and its respawn delay is exactly 30 seconds.

## Confirmed existing balance contracts

Every firearm has explicit damage, minimum damage, RPM, falloff, hip/ADS/movement spread, directional recoil, stance recoil, and a calibre-specific penetration profile. Materials have separate entry and thickness costs. Tests enforce material ordering, range energy loss, oblique thickness, repeated-wall limits, rifle-versus-SMG behaviour, and fail-closed unknown materials.

## Observations, inferences and unknowns

- Observation: the supplied recording has usable video but no recoverable spoken commentary; measured audio is effectively silent.
- Observation: sampled frames show wall/door camera clipping and sparse areas, but do not prove a Quad-spawn freeze.
- Inference: the Quad hitch can plausibly come from first-visible shader work and synchronous DOM reflow; this pass removes both likely sources and adds frame evidence.
- Assumption: the reported Tri-Pass mirroring refers to its horizontal handedness relative to the HUD minimap.
- Unknown: the exact Rustworks object described as going opposite the main ramp is not uniquely identifiable from the silent sampled recording.
- Falsifier: if the technical report records a normal Quad next-frame time while a freeze is reproduced, shader/layout first-use is not the cause and the next investigation should capture a performance trace around networking/audio/GC.

## Deliberately deferred small pushes

1. Browser-viewable match-history screen using the scoreboard-style presentation and local retained reports.
2. A deeper authored Terminal asset/texture reskin after feedback on the denser first slice.
3. A named reproduction or screenshot for the ambiguous Rustworks opposite-ramp object, followed by a surgical geometry correction.
4. Further Atomic Acres prop collider additions only when a visible prop can be paired with an exact authority box and traversal test; no speculative blanket collision volumes.
