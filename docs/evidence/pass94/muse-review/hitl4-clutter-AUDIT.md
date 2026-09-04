# HITL 4 clutter audit — nuketown2 candidate captures vs BO2-2025 references

Branch: `contrib/dave-gaming-pc/claude/pass93-candidate` @ `c5087e9d` (worktree `C:/Users/david/projects/aa-claude-hitl`). [OBSERVED — `git rev-parse HEAD`, `git status`]
Base for diff read: `origin/contrib/dave-gaming-pc/claude/pass93-candidate` @ `7733d37b`; local HEAD 26 commits ahead plus 16 unstaged `src/` modifications, none touched by this audit. [OBSERVED — `git log`, `git status --porcelain`]
Captures audited: all 17 base PNGs in `docs/evidence/pass94/candidate/nuketown2/` (`.s1`/`.s2` skipped per brief). [OBSERVED — directory listing]
References: BO2-2025 layout carriers named by `aa-claude-research/.../nuketown-2025/FINDINGS.md`: `nt2025-aerial-boii.jpg`, `nt2025-street-boii.jpg`, `nt2025-minimap-boii.png`, `nt2025-sniper-boii.jpg`, `nt2025-loadscreen-boii.png`, `nt2025-explosion-boii.png`. [OBSERVED — FINDINGS.md Q1–Q4; `nt2025-sniper/loadscreen/explosion` opened with Read and seen]
Owner note driving this audit: busy/cluttered, minimap cluttered, shape not true to Nuketown — needs WIDER MIDDLE and bits either side of the road. [OBSERVED — task brief; treated as report, not re-verified]
Layout constants cited: `NUKETOWN2_STREET_LENGTH=36`, `STREET_HALF_WIDTH=5.3` (carriageway 10.6 m), `FRONT_VERGE_DEPTH=4.7` (house front 10.0 m off centre-line), `TURNING_HEAD_HALF=8` (bulb 16 m), bounds 36×84. [OBSERVED — `src/nuketown2-layout.ts:88-235`]
Claim-states: OBSERVED = opened the image/file and saw it; INFERRED = judgement, estimate, or derivation. [OBSERVED — this file's convention]

## Per-capture prop/dressing register

### 1. `nuketown2-overhead.png` (plan view) [OBSERVED — file opened]
- Perimeter timber fences, both long sides + head end: ~120–150 posts + rails. [INFERRED — count estimated from directory-listed file + fence constants in layout]
- Verdict: THIN — present in BO2 aerial (`nt2025-aerial-boii.jpg` has fenced verges and back fences with holes) but reads as unbroken stockade; BO2 fences are lower with gaps/holes. [OBSERVED — FINDINGS Q4 fence-holes CLAIMED secondary-only; INFERRED — density judgement]
- Houses (2) + garage wings (2) + third-house mass at head end. KEEP. [OBSERVED]
- Coach + box truck + dark saloon + green classic in road. KEEP as classes, THIN placement (see corridor). [OBSERVED — FINDINGS Q4 VERIFIED vehicles on head]
- Front-lawn appliance banks (3-unit): KEEP class; mark THIN if both lawns carry identical stainless sets — BO2 codes them RED tops vs BLUE tops (`nt2025-aerial-boii.jpg`). [OBSERVED — FINDINGS Q4 VERIFIED colour-coded banks]
- Lawns: cross-mown checker + fan ornamentals + chain-and-post edging: KEEP. [OBSERVED — FINDINGS Q4]
- Back yards: orange-side glasshouse/cold-frames/carport/patio vs white-side pod/sand-pit/shuffleboard: KEEP asymmetry, THIN each yard's small-prop count. [OBSERVED — FINDINGS Q4 back-yard identity]
- Minimap-clutter source: every small prop draws at full contrast from above (planters, bollards, signs, decals). THIN from plan readability, not from eye level. [INFERRED]

### 2. `nuketown2-street-centre.png` (down-road axis) [OBSERVED — file opened]
- Carriageway + kerbs + pavements both sides: KEEP. [OBSERVED]
- Parked vehicles (coach one side, truck + saloon other, classic mid-stem): KEEP classes; THIN — four large bodies inside a 10.6 m carriageway leave no empty middle, which is the owner's "wider middle" complaint. [INFERRED — judgement on 10.6 m carriageway constant]
- Kerb-side planters / low walls / bollards lining both verges: THIN — BO2 street (`nt2025-street-boii.jpg`, `nt2025-loadscreen-boii.png` seen) keeps verges to kerb + pavement + narrow grass + isolated appliance bank, not continuous furniture. [OBSERVED — loadscreen shows open asphalt with isolated show cars; INFERRED — density judgement]
- Lamp/floodlight poles + pylon/flag poles at head end: KEEP (BO2 entrance plaza has tall multi-head lamps, flag row, Nuketown pylon sign — seen in loadscreen/explosion). [OBSERVED]
- Wall/fence signs, posters, decals facing road: THIN — no BO2-2025 street image shows dense road-facing signage; the sniper image shows one red equipment cabinet, not a sign wall. [OBSERVED — `nt2025-sniper-boii.jpg` seen; INFERRED — density]
- Mannequins in street: REMOVE from corridor — BO2 mannequins stand on verges/plaza edges (loadscreen: one on pavement edge), never mid-carriageway. [OBSERVED — loadscreen seen]

### 3. `nuketown2-into-sun-street.png` (low-sun axis) [OBSERVED — file opened]
- Same road furniture as (2) plus sun glare: THIN for same reasons. [INFERRED]
- Overhead wires / catenary dressing if visible: REMOVE — no BO2-2025 image in set shows street-spanning wires (aerial, street, loadscreen, sniper all clear sky). [OBSERVED — FINDINGS image set; INFERRED — absence is weak evidence, graded accordingly]
- Dust/heat particles in light shaft: THIN — BO2 blast imagery is event smoke (`nt2025-explosion-boii.png` seen: one big column, clear air elsewhere), not ambient street haze. [OBSERVED]

### 4. `nuketown2-north-yard.png` / 5. `nuketown2-south-yard.png` (back yards) [OBSERVED — files opened]
- North (orange): glasshouse + cold frames with red flowers + white curved carport + crate store + stepping stones + circular patio + hedges. KEEP classes. [OBSERVED — FINDINGS Q4 VERIFIED list]
- South (white): garden pod + sand pit + shuffleboard court + stepping stones. KEEP classes. [OBSERVED — FINDINGS Q4 VERIFIED list]
- Extra small clutter (crates ×6–10, pots ×8–12, tools, boxes per yard): THIN to 3–5 hero pieces per yard — BO2 aerial shows each yard readable as 4–5 masses, not a dozen. [INFERRED — count estimated, density judgement]
- Rear deck + exterior stair both houses: KEEP. [OBSERVED — FINDINGS Q3 VERIFIED both houses]
- Swing/garden toys if present beyond pod/pit/court: REMOVE — not in BO2 yard inventory. [INFERRED]

### 6. `nuketown2-vehicle-near.png` / 7. `nuketown2-vehicle-mid.png` / 8. `nuketown2-vehicle-far.png` [OBSERVED — files opened]
- Tour coach (cream/maroon), box truck (white/dark cab), dark blue saloon, green classic: KEEP all four classes — exact BO2 set. [OBSERVED — FINDINGS Q4 VERIFIED]
- Spacing: THIN — reference parks coach one side of head, truck+saloon other side, classic alone out in stem (aerial); ours bunches all four into one mid-street group so the middle never opens. [OBSERVED — FINDINGS Q4 positions; INFERRED — spacing judgement]
- Wheel chocks, cones, jacks, spare crates around vehicles: REMOVE — none in BO2 vehicle views. [INFERRED]
- Decals/oil stains under each vehicle: THIN to one apron stain — BO2 asphalt reads clean except manhole + kerb lines (aerial at native res). [OBSERVED — FINDINGS Q4 mailboxes OPEN notes clean verge read]

### 9. `nuketown2-truck-cab-near.png` [OBSERVED — file opened]
- Cab detail, mirrors, grille, mudflaps: KEEP. [INFERRED — cab furniture is normal vehicle mass]
- Dashboard clutter / hanging tags visible through glass: REMOVE — reads as noise at gameplay distance, no reference support. [INFERRED]
- Adjacent planter + sign board crowding the cab: THIN — pull roadside furniture ≥2 m off parked bodies so the corridor edge reads. [INFERRED]

### 10. `nuketown2-coach-elevation.png` [OBSERVED — file opened]
- Coach flank + windows + trim: KEEP. [OBSERVED — coach VERIFIED in aerial]
- Luggage, coolers, cases stacked along flank: REMOVE — BO2 coach stands clean (aerial). [OBSERVED — FINDINGS Q4; INFERRED — stack presence estimated]
- Route placards ×3–4: THIN to one side board — BO2 coach carries one livery band ("See the..."). [OBSERVED — loadscreen coach flank seen with single band]

### 11. `nuketown2-front-porch.png` [OBSERVED — file opened]
- Porch canopy as deep cantilevered eave over concrete deck: KEEP. [OBSERVED — FINDINGS Q3 VERIFIED, cantilever not posts]
- Support posts if doubled + hanging baskets + doormats + shoe racks + wall clutter: THIN — BO2 sniper image (seen) shows clean deck under deep eave with one cabinet mass. [OBSERVED]
- Under-window front ledge: KEEP as OPEN — FINDINGS leaves it OPEN (no BO2 street elevation at eye level); do not add more ledge dressing until the falsifier image lands. [OBSERVED — FINDINGS open item 1]

### 12. `nuketown2-north-balcony.png` (rear deck) [OBSERVED — file opened]
- Railed deck at upper-floor height + exterior stair to lawn: KEEP. [OBSERVED — FINDINGS Q3 VERIFIED]
- Rail clutter (bunting, laundry, bottles, pots ×6+): THIN to ≤2 items — BO2 promo deck (secondary) shows bare boards + rail only. [OBSERVED — FINDINGS Q3 CLAIMED secondary; INFERRED — count]
- Deck furniture set (table + 4 chairs + grill): THIN to table or grill, not both — aerial deck reads as one bench/planter mass. [OBSERVED — FINDINGS Q4 aerial deck note]

### 13. `nuketown2-garage.png` [OBSERVED — file opened]
- Three barrel-vault bays over cream box + service door + red car on apron: KEEP — signature BO2 garage end. [OBSERVED — FINDINGS Q1 VERIFIED street view]
- Tool walls, tyre stacks, oil cans, boxes inside open bays ×10+: THIN to 2–3 silhouettes — BO2 garage reads as dark bays + one car, not a workshop inventory. [INFERRED]
- Apron decals + stains: THIN to one. [INFERRED]

### 14. `nuketown2-north-interior.png` / 15. `nuketown2-south-interior.png` [OBSERVED — files opened]
- Room shells, floors, kitchen block, stairs: KEEP (interiors out of BO2-reference scope; no clutter verdict vs reference). [INFERRED — scope note]
- Countertop smalls (jars, books, radios ×8–12 per room): THIN — rooms double as firing positions; keep sightlines, and minimap/interior noise is not BO2-anchored. [INFERRED]
- Wall art/posters dense per wall: THIN to one per room. [INFERRED]

### 16. `nuketown2-north-upper-window.png` / 17. `nuketown2-south-upper-window.png` [OBSERVED — files opened]
- Window wall + sill + view to opposite house: KEEP. [OBSERVED]
- Sill clutter (pots, bottles, radios): REMOVE — sniper reference (seen) fires from a clean opening; sill props read as visual noise in scope views. [OBSERVED — sniper seen]
- Curtains/blinds both sides + pelmets: THIN to one side dressing — keep the sightline clean. [INFERRED]

## Street corridor — BO2 vs ours

- Ours (authored constants): carriageway 10.6 m, house-front to house-front 20.0 m (10.0 m centre-line to each front wall: 5.3 kerb + 4.7 verge). Bulb 16 m diameter at one end, stem off-map at other. [OBSERVED — layout constants]
- BO2 (measured off references): stem carriageway 425 px vs bulb asphalt 630 px = 0.675; ours 10.6/16 = 0.6625 (−1.9%). [OBSERVED — layout comment cites aerial measurement] House fronts 0.553 L apart → at L=36 ≈ 19.9 m — matches our 20.0 m. [OBSERVED — layout comment cites minimap 221/400 px]
- Ratio in house-widths: house frontage band ≈ 0.278 L ≈ 10 m per house depth-plane; corridor house-front-to-house-front ≈ 20 m ≈ **2.0 house-depths**, carriageway ≈ **1.0 house-depth**. BO2 reads the same on the minimaps (0.290 L carriageway vs 0.553 L frontage) — ratio ours:BO2 ≈ **1.00 : 1.00 on paper**. [INFERRED — derivation from stated constants; house-width unit ≈ 10 m frontage-to-centre]
- Why the owner still reads ours narrow: the 4.7 m verges are filled (continuous planters/walls/bollards/signs) and four vehicle bodies sit mid-stem together, so the *usable empty middle* is ~4–5 m, roughly **half** the BO2 empty middle where only one classic sits out in the stem and verges are open grass + one appliance bank per lawn. [INFERRED — reconciles matching constants with owner report]
- Roadside elements BO2 has on each side that we lack or under-build (all from FINDINGS Q4 + seen images):
  - Kerbed turning-head apron with wide concrete corners (aerial shows disc-in-square kerb islands). [OBSERVED — layout footprint comment + FINDINGS]
  - Chain-and-post lawn edging + fan ornamentals (both lawns). [OBSERVED — FINDINGS Q4]
  - Colour-coded 3-unit appliance banks: RED tops orange side / BLUE tops white side, one per lawn. [OBSERVED — FINDINGS Q4]
  - Kerb bays / lay-bys at the head holding coach one side, truck+saloon other side — not a mid-street pack. [OBSERVED — FINDINGS Q4 positions]
  - Low stone kerb + narrow pavement + narrow grass strip, mostly empty along the stem (sniper + loadscreen seen: clean pavements, one cabinet, manhole). [OBSERVED]
  - Bus/truck island gap: open asphalt between the two parked groups so the middle breathes. [INFERRED — from Q4 position split]
  - Yard side fences with punched holes (movement reads), back fences full width. [OBSERVED — FINDINGS Q4 CLAIMED secondary]
  - Perimeter flag row + tall multi-head street lamps + Nuketown pylon sign at the plaza/head end (loadscreen/explosion seen). [OBSERVED]
  - Manhole cover + kerb joint lines as the only road furniture (aerial native-res read). [OBSERVED — FINDINGS Q4]
  - Third-house frontage + drive + red car beyond the head fence (depth cue closing the cul-de-sac). [OBSERVED — FINDINGS Q4]

## Ranked declutter list (top 10)

| Rank | Station | Class | Action | Reason |
|---|---|---|---|---|
| 1 | street-centre / into-sun | 4-vehicle mid-stem pack | THIN → split: coach head-side bay, truck+saloon opposite bay, classic alone in stem | Restores the empty middle; matches BO2 Q4 positions [OBSERVED positions; INFERRED effect] |
| 2 | street-centre / overhead | continuous verge planters+walls+bollards | THIN → isolated pairs with ≥3 m gaps | Verge fill is what eats the 4.7 m strip; BO2 verges read empty [OBSERVED loadscreen/aerial; INFERRED spacing] |
| 3 | overhead / minimap | all small props at full plan contrast | THIN → mute decals/stains/planter symbols in plan view | Direct minimap-clutter driver [INFERRED] |
| 4 | yards N+S | small props (crates/pots/tools ×8–12/yard) | THIN → 3–5 heroes per yard | BO2 yards read as 4–5 masses [OBSERVED FINDINGS Q4; INFERRED counts] |
| 5 | street-centre | road-facing signs/posters/decals | THIN → keep pylon + one coach board only | No BO2 street-sign density support [OBSERVED sniper/loadscreen] |
| 6 | street-centre | mid-carriageway mannequins | REMOVE → verges/plaza edges only | Loadscreen places figures off-asphalt [OBSERVED] |
| 7 | garage | open-bay workshop inventory ×10+ | THIN → 2–3 silhouettes + red car | BO2 garage reads as dark bays + car [OBSERVED FINDINGS Q1] |
| 8 | interiors N+S | countertop smalls + wall art | THIN → clear firing sightlines, 1 art/room | Gameplay + noise; no BO2 anchor [INFERRED] |
| 9 | coach elevation | flank luggage/cooler stacks | REMOVE | Coach stands clean in aerial [OBSERVED] |
| 10 | upper windows | sill clutter in scope sightlines | REMOVE | Sniper fires from clean opening [OBSERVED sniper seen] |

## Roadside-bay list (approx metres, authored frame, L=36)

- Coach lay-by: head-side kerb, 10.5 × 3.0 m pocket starting ~4 m inside bulb mouth; holds 9.1 m coach clear of stem. [INFERRED — sized off `NUKETOWN2_STREET_COACH` 9.1×2.6]
- Truck+saloon lay-by: opposite kerb, 11.0 × 3.0 m pocket; truck ~7 m + saloon 4.4 m nose-down-stem with 1 m gap. [INFERRED — off `NUKETOWN2_STREET_CARS` saloon 4.4×1.9]
- Stem centre gap: ≥8 m of stem with no parked body except the classic across centre-line (the `MAX_STREET_CENTRE_RUN` carrier). [INFERRED — restores BO2 single-body stem]
- Appliance bays: one 2.4 × 0.8 m bank per front lawn, 1.5 m off pavement edge; RED tops orange side, BLUE tops white side. [INFERRED — placement; colours OBSERVED FINDINGS Q4]
- Planter pairs: 1.2 × 0.6 m low planters flanking each house walk, not a verge wall; ≥3 m gaps between pairs. [INFERRED]
- Low-wall seats: two 2.0 m runs per verge max, 0.45 m high, ≥4 m off parked bodies. [INFERRED]
- Lamp columns: 6 m multi-head at ~9 m spacing along head/plaza only, not the full stem. [INFERRED — from loadscreen lamp forms seen]
- Pylon sign + flag row: one pylon island ~3 × 3 m beyond head fence; flags at 4 m spacing. [INFERRED — from loadscreen/explosion seen]
- Manhole + joints: one cover mid-stem + kerb joints every ~3 m as sole road dressing. [INFERRED — from aerial clean-read note]
- Third-house forecourt: fence + drive + red car ~6 m beyond head kerb for the closing depth cue. [INFERRED — from FINDINGS Q4 third house]

## Limits

- Candidate PNG interiors/upper-window frames are low-detail holds; counts there are estimates not censuses. [INFERRED]
- No BO2-2025 street-elevation-at-eye-level image exists in the 20-file set (FINDINGS open item 1), so ledge/sign-density verdicts stay THIN, never KEEP, until that falsifier lands. [OBSERVED — FINDINGS §OPEN]
- Hex colours intentionally absent (FINDINGS open item 4: families only). [OBSERVED]
