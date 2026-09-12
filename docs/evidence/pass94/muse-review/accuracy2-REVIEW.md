# PASS 94 accuracy-2 lane review (Muse Spark skeptic) — HF-477

Branch: `contrib/dave-gaming-pc/claude/nuketown2-bo2-accuracy`
Range: `origin/contrib/dave-gaming-pc/claude/nuketown2-handedness..HEAD` (5 commits, 9 files, +1331/−316)
Authority: `C:/Users/david/projects/aa-claude-research/docs/references/nuketown-2025/FINDINGS.md` (BO2-2025 only).
Lane report: `docs/evidence/pass94/nuketown2-accuracy2/REPORT.md`.
Claim-states: VERIFIED (saw it in diff/test/reference), CLAIMED (lane says so, not independently re-run — no builds/browsers per brief), OPEN (needs capture/test).

No src/ modified by this review. No builds, browsers, npm install, or test suites run.

## (1) Re-derived fidelity bands — nothing loosened for garage-RIGHT or spawn fairness

VERIFIED: garage-RIGHT gate untouched and still the strictest claim on the map.

- `src/nuketown2-fidelity.test.ts:671` — `puts each garage on the RIGHT of its own house, seen from that house own back-yard spawn` still asserts `side > 0` for every spawn on both halves (cross-product sign, `toGarage·right`). No edit in this range.
- `src/nuketown2-fidelity.test.ts:705` — half-mirror gate + minimap-agrees-with-world still present. No edit in this range.
- Lane report CLAIMED `handedness-frame.txt — all twelve spawns report garage RIGHT`; the gate code that produces it is unchanged, so the claim is structurally credible.

VERIFIED: `MAX_STREET_CENTRE_RUN_METRES` unchanged at 21.2, derivation transferred not loosened.

- Old (`git show origin/...handedness:src/nuketown2-fidelity.test.ts`, band comment): `The band is re-derived from the body that stops it now: the head car ... parked ACROSS the centre-line at x [2.3, 6.7]. The run from the west sample is 17 + 2.3 = 19.3 m, plus one 0.5 m sample step. Measured: 20.0 m ... THE VALUE IS UNCHANGED AT 21.2`.
- New (`src/nuketown2-fidelity.test.ts:240-258`): `HF-477 CHANGED THE BODY AND NOT THE BAND ... the derivation transfers to it intact: authored x [2.8, 7.2], run from the far sample 17 + 2.8 = 19.8 m plus one 0.5 m sample step. THE VALUE IS UNCHANGED AT 21.2`.
- Same promise ("street is not a shooting gallery"), new carrier is the green classic (`NUKETOWN2_STREET_CARS.classic`, `src/nuketown2-layout.ts:427-432`), the only body across z=0. Strictness preserved; deletion/shortening/push-off-line still moves the number.

VERIFIED: z-half floors (the actual fairness bands) survive untouched.

- New `src/nuketown2-fidelity.test.ts:1760-1762`: `expect(half.zNeg ...).toBeGreaterThan(20); expect(half.zPos ...).toBeGreaterThan(20);` — identical floors, comment says `this is the half of the old band that survives untouched. ... The coach alone is 23.7 m² on one side; the truck is 30.4 m² on the other.`

VERIFIED with explicit reason: x-half floors replaced, and the replacement is more specific, not looser.

- Old: `expect(half.xNeg ...).toBeGreaterThan(20); expect(half.xPos ...).toBeGreaterThan(20);` (removed).
- New (`src/nuketown2-fidelity.test.ts:1764-1785`): `expect(inBulb / asymArea ...).toBeGreaterThan(0.6); expect(inStem ...).toBeGreaterThan(8);` with the honest reason: `With a turning head CENTRED on the map, "cover on both sides of the origin" and "cover in the head" were the same statement. Under the lollipop they differ and only one is a property of the reference ... asking for 20 m² in the far half of the stem would be asking for a body the reference does not have.` x=0 is now mid-stem, not a map feature — correct to stop gating on it.
- Added guard `expect(half.xNeg + half.xPos).toBeCloseTo(asymArea, 6)` keeps the partition honest.

VERIFIED: window drop-out ceiling re-derived, strictly stronger (adds a floor).

- Old: `expect(end.y ...).toBeLessThan(1.9)` (bare 1.7 + 0.2 slack).
- New (`src/nuketown2-fidelity.test.ts:1305-1312`): `const KERB_CEILING_M = 0.30; expect(end.y ...).toBeLessThan(1.7 + KERB_CEILING_M); expect(end.y ...).toBeGreaterThan(1.65);` — ceiling now tied to the same 0.30 m kerb constant the carriageway class uses; new floor rejects below-ground passes the old case would have passed. Nearest rejected surfaces 3 m from either band edge (documented in comment). Strictly tighter.

VERIFIED: road/verge/ground re-derivation pays with properties, not name lists.

- Road z-mirror exactness (`src/nuketown2-fidelity.test.ts:1798-1801`), kerb-height cap 0.30 m (`:1805-1808`), street-corridor confinement (`:1813-1817`), verge region symmetry on 0.5 m lattice (`:1837-1845`), ground 180-symmetry off-carriageway (`:1730-1742`). Each fails on real regressions (wall joining carriageway list, tile dropped/moved). No band was deleted without a named replacement.

## (2) The lollipop — head end IS derived; third house IS out of bounds; one hardcode to fix

VERIFIED: head/stem assignment derived from the orange garage, not copied.

- `src/nuketown2-layout.ts:122-183` (NUKETOWN2_CUL_DE_SAC block): authored +x = stem (off-map at `BOUNDS.maxX`), authored −x = cul-de-sac (centre −8.5, closed −16.5, mouth −0.5); world mirrored by `NUKETOWN2_HANDEDNESS = -1` so world cul-de-sac is +x. Derivation chain written in comment: north house is orange (`src/nuketown2-arena.ts` siding block), its garage hangs off its +x authored end, FINDINGS Q4 puts the orange garage AWAY from the third house/head (stem side) — therefore authored −x is the head. Consistent with FINDINGS frame (`+x` = cul-de-sac/third house in FINDINGS world frame; frames differ by the authored/world mirror, relation preserved).
- Bulb keeps the measured 16 m width; stem keeps `STREET_HALF_WIDTH`; aerial proportion check 10.6/16 vs 425/630 px = 1.9% low, documented. Inset 1.5 m verge honestly marked AUTHORED/OPEN (FINDINGS open item 5).

VERIFIED: third house entirely outside bounds, on the closed end, unreachable by players.

- `src/nuketown2-arena.ts:2825-2872` (`thirdHouse()`): `nearX = BOUNDS.minX − 1.2`, all bodies at authored x ≤ −19.2 (world ≥ +19.2 past the perimeter wall at |x|=18 inner face); drive beside the house (not in front) after the gate caught the first attempt inside the map.
- Fidelity gate (`src/nuketown2-fidelity.test.ts:1849-1861`): every `beyond-bounds` body plan-footprint entirely outside `NUKETOWN2_BOUNDS` + sign equals closed-end sign derived from the head's own footprint (`bulbWorld` vs `stemWorld` centres), not a literal. Perimeter wall 3.2 m just inside bounds (`src/nuketown2-arena.ts:2876`) bars player reach; solid colliders on block/eaves/roof/car (`{cast:true}` default-solid) are intentional so rounds/chopper don't pass through a house-shaped hole — correct, and out-of-play so not a fairness surface.

FINDING F1 (minor, fix before merge): third-house POSITION is hardcoded, only its TEST side is derived. `src/nuketown2-arena.ts:2830` hardcodes `nearX = NUKETOWN2_BOUNDS.minX - 1.2` and never reads `NUKETOWN2_CUL_DE_SAC.closedX`; the `void head` at `:2872` admits it. Move the bulb 1 m and the vista house stays. Smallest fix: `const nearX = head.closedX - 2.7` (≈ −19.2 today: closed −16.5 minus 2.7) with the 1.2 m past-bound invariant as a `toBeLessThan(BOUNDS.minX)` assert, or delete `void head` and document the hardcode as deliberate.

## (3) Car-paint uniform — collapses the pipeline explosion; residual bakes are bounded

VERIFIED: the fix is real and minimal. `src/nuketown2-vehicle-materials.ts:22,70`: `uniform` added to TSL destructure; `const base = uniform(new THREE.Vector3(baseColor.r, baseColor.g, baseColor.b)).add(flake)` replaces `vec3(r,g,b)`. Graph identical per colour → one compiled pipeline shared by aqua driveway car (`0x3d6f80`, `src/nuketown2-arena.ts:1064`), navy saloon (`0x27394f`), jade classic (`0x2f8f77`). Matches REPORT's deploy-fence story (3rd/4th compile pushed first submission past 12 s; plain-material control deployed). Nothing about flake/roughness/metalness changed.

VERIFIED, bounded residual (not a fence risk): two other factories still bake hex into the graph — `src/nuketown2-facade-materials.ts:112,114` (`vec3(baseColor.r, ...)` lap siding, called exactly twice: `0x9f6147` / `0xeae3cf` at `src/nuketown2-arena.ts:1122-1123`) and `src/nuketown2-interior-materials.ts:177` (drywall, called exactly once: `0xdbd1ba` at `:1086`). Fixed call-site counts → fixed pipeline counts (2 + 1), unlike the car factory which scales with parked cars. Single-call literal-`vec3` materials (coach cream, truck cab/box, glass, chrome, lights, tires) are likewise one pipeline each. No action required for the fence; if a future lane parameterises siding/drywall per-instance, apply the same `uniform()` pattern then.

FINDING F2 (note, not a blocker): `carA` aqua (`0x3d6f80`) survives on the driveway pair (`src/nuketown2-arena.ts:2287`). FINDINGS names no aqua car; it is the old invented head-car paint reused for driveways. Harmless (shares the one pipeline now) but confirm the driveway colour against a BO2-2025 frame or mark OPEN alongside the saloon/classic hexes (REPORT already marks those OPEN).

## (4) Sibling-lane conflicts

VERIFIED no conflict: materials lane siding pins AGREE. `origin/.../nuketown2-materials:src/nuketown2-materials/index.ts:156-160` pins `sidingA 0x9f6147 wainscot 0xeae3cf / sidingB 0xeae3cf` — byte-identical families to this lane's `0x9f6147`/`0xeae3cf`. Merge is mechanical (registry vs direct calls), not a colour dispute. Coach red `0xa8382c` also agrees across both lanes.

FINDING F3 (real conflict, fix at merge): techniques-lane hob BLUE diverges from this lane's appliance BLUE. Techniques `src/nuketown2-yard-props.ts:211-212`: hob red `0xb8352c` / hob blue `0x2f5f92`; this lane `src/nuketown2-arena.ts:1145-1146`: appliance red `0xa8382c` / appliance blue `0x46809f` (deliberately the demoted old house-blue). Reds agree to 3/255; blues are different paints (deep `2f5f92` vs saturated `46809f`). Both lanes claim red-north/blue-south chirality anchors (yard hobs vs verge cooker banks) with matching SIDES (north=orange=red, south=white=blue — consistent), so the conflict is hue, not side. Smallest fix: integrator picks ONE blue (recommend `0x2f5f92` if the reference blue tops read deep, else `0x46809f`), applies to both `createHobMaterial` and `applianceBlue`, and pins both in one test (extend `src/nuketown2-fidelity.test.ts:900-906` margin loop to the yard hobs or cross-reference the yard-props gate).

No geometry conflict: techniques yard props (glasshouse, pod, sand, grime) live in yards/outside carriageway with `-3` tier fencing; this lane's bulb/verge retiling is in the street corridor. Both emit through `pair()`; no shared function edited by both except the batcher call site (mechanical merge).

## (5) Terracotta hex OPEN — what settles it

REPORT §Colour is honest: `0x9f6147` (hue 17.7°, chroma/value −5% from measured `#a85e46`) still reads hotter than the reference, and part of the delta is not albedo at all — the reference orange is a mullioned window BAND (orange mullions/spandrels between glass), not a solid wall, so no flat hex can match it under all light. OPEN item 4 in FINDINGS agrees (families, not droppers).

Settle capture (one frame, two conditions): a BO2-2025 capture of the orange house's upper wall in FLAT overcast-equivalent light (no direct sun, no haze bloom) at eye level, WITH a neutral reference in frame (white cabinet/appliance white or a grey card if staging in-engine), shot beside an in-engine capture of `nuketown2-front-porch.png` viewpoint under the review hour with the mullion grid (if any) masked out of the mean. Compare hue at fixed 17–18° and chroma deltas, not absolute sRGB; if the in-engine lit face still reads >5% high-chroma vs the masked reference band, move chroma down another step (do not touch hue). If the gap persists after two chroma steps, the remainder is the mullion-band geometry — close the hex and open an art task for the band, per REPORT's related-OPEN.

## Minor notes (no action unless touching the lines)

- Porch: posts GONE (`PORCH_CANOPY_POST` deleted, `postSize` dropped from `NUKETOWN2_PORCH_CANOPY`, builder post loop removed), width 4.0→6.6 m cantilever, inboard face on wall plane — matches FINDINGS Q3 cantilever read; floating-geometry gate rationale documented. VERIFIED in diff.
- Deck/stair: moved garage-end → non-garage-end via `BACK_UPPER_WINDOW` mirror (`[-5.75,-3.25]`→`[0.75,3.25]`) + `BALCONY_CENTRE_X = (BACK_UPPER_WINDOW[0]+HOUSE_X0)/2`; single centre pier replaces corner posts for spawn clearance (spawns x=−5,−1, z=−25 line) — matches FINDINGS Q3 opposite-garage read. VERIFIED in diff.
- Letterbox exception cell now read off the BUILT lid (`src/nuketown2-fidelity.test.ts:1440-1443`) after the verge furniture line moved to |z|=8.5 to clear the bulb — entitlement unchanged (one lid). VERIFIED, good practice.
- REPORT OPEN items 1 (base `pass93-candidate` nonexistent, built on `5f5ecc47`), 4 (head illegible in-engine, black asphalt — pre-existing), 6 (patio/water-butt crowding review cameras), 7 (`PASS73_NATIVE_WEBGPU=1` npm-script gap), 8 (shared node_modules clobber) are all honestly recorded and none is introduced by this lane's geometry.

## Verdict: SHIP-WITH-FIXES

1. Fairness preserved or tightened: garage-RIGHT and z-half cover untouched, x-band replacement more specific with reason quoted, drop-out ceiling gains a floor, road fairness proved directly (z-mirror) with kerb/corridor caps — no loosening for anything the owner cares about.
2. Reference corrections verified against BO2-2025 frames: orange-over-cream/white-cream + blue-grey glazing (Q2), deck/stair opposite garage + cantilever porch (Q3), lollipop + vehicles + third house out-of-play (Q4), with the head end derived from the orange garage and the house position/orientation consistent with the FINDINGS frame.
3. Merge needs two small reconciliations, neither a rework: F1 derive (or document) the third-house offset from `NUKETOWN2_CUL_DE_SAC`, and F3 unify the hob/appliance blue (`0x2f5f92` vs `0x46809f`); terracotta stays OPEN with the falsifier above, and the car-paint uniform genuinely removes the deploy-fence scaler.

Findings index: F1 `src/nuketown2-arena.ts:2830` (derive nearX from head); F2 `src/nuketown2-arena.ts:1064,2287` (aqua driveway OPEN); F3 techniques `src/nuketown2-yard-props.ts:212` vs `src/nuketown2-arena.ts:1146` (one blue).
