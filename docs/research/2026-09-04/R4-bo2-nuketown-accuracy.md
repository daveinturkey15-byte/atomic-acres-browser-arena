# R4 — Black Ops 2 Nuketown 2025 accuracy for the Rebuild (`nuketown2`)

**Lane:** R4, research only, 2026-09-04. **Owner rows:** HF-461 (mirror / garages on the
wrong side), HF-465 (missing balconies), touching HF-464 (breakable upstairs glass) and
HF-466 (Nuke Town Rebuild is the focus arena).
**Nothing in this document is copied.** No image, texture, geometry or block of source text
from any third party is reproduced. Published descriptions are read, then restated in this
lane's own words with the URL that carries them.

## Claim-state key

| State | Means |
|---|---|
| **VERIFIED** | I read the file or ran the command in this repo, on this machine, this session. |
| **CLAIMED** | A source I actually opened says it. The URL is given. It is not independently confirmed. |
| **OPEN** | Not known. The falsifier that would settle it is written down. |

---

## 0. What I could and could not open, and why it matters

`WebFetch` on `callofduty.fandom.com` returns **HTTP 402** from this harness's fetch proxy,
and `web.archive.org` is blocked outright; `www.callofduty.com` returns `ECONNRESET`
direct and `callofdutymaps.com` returns 403. The previous lane hit the same wall
(`docs/nuketown-rebuild/TASK_STATE.md`). What *does* work is the public reader proxy
`r.jina.ai/<url>`, which returned the Fandom articles and both Activision-authored pages
as text. Every source below was opened that way or directly.

**I did not download any image.** So, unlike the HF-426 lane, I have **no pixel
measurements of my own**. This document therefore does two different jobs and keeps them
apart: it *re-checks the HF-426 pixel work against independent prose*, and it *adds the
architecture and orientation facts that prose can carry and a minimap cannot* (balconies,
routes, colours, what stands at each end of the street).

That split is what makes the mirror answer honest: see §3.

---

## 1. Sources actually opened

| # | Source | What it is | Worth |
|---|---|---|---|
| **A1** | `https://blog.playstation.com/2020/11/24/tips-for-dominating-nuketown-84-in-black-ops-cold-war-live-now/` (via `r.jina.ai`) | Activision's own Nuketown '84 tactical map intel, republished on PlayStation.Blog | **The single best source in this document.** First-party, prose, and it uses *compass directions and interior room names*. Same text also reachable at `callofduty.com/blog/2020/11/Black-Ops-Cold-War-Tactical-Map-Intel-Nuketown-84`. |
| **A2** | `https://callofduty.fandom.com/wiki/Nuketown_%2784` (via `r.jina.ai`) | CoD Wiki, Nuketown '84 | Establishes that '84 is a re-skin: same place, same layout as the original. This is what lets A1 be used as a description of the shared Nuketown floor plan. |
| **A3** | `https://callofduty.fandom.com/wiki/Nuketown_(map)` (via `r.jina.ai`) | CoD Wiki, original Nuketown | Independent statement of spawn location and of the **three** routes to the upper floor. |
| **A4** | `https://callofduty.fandom.com/wiki/Nuketown_2025` (via `r.jina.ai`) | CoD Wiki, Nuketown 2025 — the actual reference for this arena | House numbers/colours, the two letterboxes, which house's *interior* the trivia describes, the RC-XD passage outside the map, the garden pod. |
| **A5** | `https://www.callofduty.com/guides/blackops7/multiplayer-maps/nuketown-2025` (via `r.jina.ai`) | Activision's own Nuketown 2025 map guide | Power positions, the Garage's sightlines, the moving truck in the Cul De Sac, fence holes and the **north** border path. Returned as an editorial summary, so treat as CLAIMED. |
| **A6** | `https://callofduty.fandom.com/wiki/Nukehouse` (via `r.jina.ai`) | CoD Wiki, the single-house map | Corroborates the house's **second-floor balcony**, and states that unlike on Nuketown you cannot climb in through its window — i.e. on Nuketown you can. |
| **A7** | `https://en.wikipedia.org/wiki/Nuketown` | Wikipedia | Two symmetrical sides split by a road, two-storey house + backyard per side, school bus and moving van on the road. |
| **A8** | `https://www.gamesatlas.com/cod-black-ops-6/maps/nuketown` (via `r.jina.ai`) | Map database | Only useful fact: the BO6 Hardpoint rotation names **Street** and **Cul De Sac** as *different* zones. |
| **A9** | `https://callofduty.fandom.com/wiki/Nuketown_Zombies` (via `r.jina.ai`) + `https://steamcommunity.com/sharedfiles/filedetails/?id=1105643975` | Nuketown Zombies (original-Nuketown geometry) | The fallout-shelter door is in the **yellow house's** backyard, and the shed is in that backyard too. |

Sources the previous lane used that I could **not** re-open, and therefore inherit as
CLAIMED rather than re-verify: the two Treyarch minimap PNGs (S2/S3) and the aerial still
(S5). Every pixel ratio in `docs/nuketown-rebuild/REFERENCE_SCHEMATIC.md` §3 rests on those.

Repo state read this session (all **VERIFIED**): `AGENTS.md`,
`docs/nuketown-rebuild/REFERENCE_SCHEMATIC.md`, `docs/nuketown-rebuild/TASK_STATE.md`,
`src/nuketown2-layout.ts` (223 lines, whole), `src/nuketown2-arena.ts` (1,568 lines on
`HEAD`; 2,446 on `origin/contrib/dave-gaming-pc/claude/nuketown2-tiptop`),
`src/nuketown2-fidelity.test.ts` (1,358 lines, structure + the two gates this work
touches), `src/gameplay.ts` fall-damage curve, `src/physics.ts` gravity,
`docs/PASS84_OWNER_FEEDBACK_2026-09-02.md` HF-460..468.

---

## 2. What the repo already established, re-checked against prose

The HF-426 correction — *the map's long axis runs **across** the street, not along it, and
both teams spawn in their own back yard* — is the thing the owner rejected the previous
layout for, and it is the thing this lane most needed to either confirm or overturn. It
**stands, and now has independent non-pixel corroboration**:

- Activision's own intel says each home's backyard garden **is the initial spawn point in
  team modes**, and describes the two homes as facing one another across the cul-de-sac,
  a teal one on the **west** and a yellow one on the **east** (A1). Spawn-to-spawn is
  therefore the west–east axis and the street runs north–south between the houses.
  → **CLAIMED, first-party.**
- The CoD Wiki says the same in its own words: both teams spawn in a garden area in the
  backyard, and from there you can take a road to the centre **on either side of the
  house**, or go through the lower floor, or go upstairs (A3). → **CLAIMED.**
- Wikipedia: two symmetrical sides split down the middle by a road, a two-storey house
  with a backyard on each side (A7). → **CLAIMED.**

Three sources, none of them the minimap, all agreeing with the HF-426 aspect. The
schematic's own internal arithmetic also closes on the same reading — its measured bands
sum across the long axis as 233 (back lot) + 145 (house) + 221 (front-wall to front-wall) +
145 (house) + 201 (back lot) = 945 px against a measured 944 px polygon. The alternative
reading (street as the long axis) leaves the two houses no yard at all. **The aspect is not
the mirror.** Whatever HF-461 is about, it is not this.

One correction to the schematic, from prose it did not have:

> §7 records "Bunker / shelter — **not in the reference**". That is right *for Nuketown
> 2025* and wrong as a statement about Nuketown in general: the fallout-shelter door is a
> real feature of the **original** map's yellow-house backyard (A9). It belongs to the
> arena HF-466 just parked, not to this one.

---

## 3. HF-461, the mirror: the actual answer

> Owner: *"maybe the garages are on the wrong side, almost like you've created the mirror
> of the map."*

**The finding: our layout has no chirality at all, so the owner cannot be wrong.**
**VERIFIED**, by reading the constants:

- `NUKETOWN2_BOUNDS` is symmetric in both axes; the perimeter wall closes **both** ends of
  the street identically (`perimeter wall end`, built through `pair()` at `x = ±17.8`).
- `TURNING_HEAD_HALF = 8` and the head is centred on the world origin, so **both** ends of
  the street look the same.
- `pair()` negates **x and z together** — every solid is 180°-rotationally partnered.
- The one authored landmark that could tell the two ends apart, `verge sign board` at
  `x = -14.0`, is itself built through `pair()`, so there are **two** signs, one at each
  end, on opposite verges.

There is therefore nothing in the built map that says which end is the cul-de-sac end and
which house is which. Under a global mirror the arena is *identical to itself*: the same
constants, relabelled. A player who knows the real map will read it as mirrored roughly
half the time, at random, depending on which landmark they anchor on — and right now there
are no landmarks to anchor on, which is why it reads as wrong and cannot be argued with.

Meanwhile the **relation** the real map does have, we do have: the two garages are at
**opposite** ends of their houses (`GARAGE_X0 = HOUSE_X1` plus `pair()`'s negation), which
is a 180° rotation, not a mirror. That matches every published description — each Garage
overlooks the Cul De Sac and the rear Yard (A5), and the garages let you shoot at the
*opposite* house, which only reads as a diagonal if they are at opposite ends.

**What is still OPEN:** which end, in reference terms, each garage is on. No source I could
open states it, and it cannot be recovered from prose — it is a fact only an overhead image
or the game carries.

**So the fix is not "flip the map". It is: anchor the chirality to visible landmarks, make
the flip one constant, and let one look settle the flag.**

### 3.1 The reference-anchored world frame to adopt

Define it once, in `src/nuketown2-layout.ts`, and derive everything handed from it:

| Arena axis | Reference meaning | Evidence |
|---|---|---|
| `+x` end of the street | the **cul-de-sac** end: turning circle, a third house's lawn beyond the fence, an old wreck parked on it | A1 (the cul-de-sac end is north; a rust-bucket sits on a third home's lawn there) |
| `−x` end of the street | the **closed-off entrance**: a short apron of tarmac, sandbags and a 4×4, then a shut gate | A1 |
| `−z` house (`team 0`, currently blue) | the house with the **Nuketown sign out front** | A1 (the teal/west house carries the sign) |
| `+z` house (`team 1`) | the other house | A1 |

Two of those four are landmarks we can build cheaply and that a player reads instantly. The
moment they exist, "is it mirrored?" becomes a question with an answer.

### 3.2 The one-constant flip

```ts
/**
 * Which end of its own house the north house's garage is attached to.
 * +1 = the cul-de-sac (+x) end. Flipping this mirrors every handed feature at
 * once: garages, driveways, mailboxes, the blind stair wall and the balcony.
 * OPEN against the reference (R4 §3); see the falsifier in that section.
 */
export const NUKETOWN2_HANDEDNESS: 1 | -1 = 1;
```

Everything currently hard-handed must read it:
`GARAGE_X0` (today `HOUSE_X1`), the garage doors and driveway apron, `verge mailbox` /
`verge mailbox post` (today `GARAGE_X1 + 0.6`), `NUKETOWN2_HOUSE_STAIR.x0` (today
`HOUSE_X0 + WALL_T`, the blind wall — which is only blind *because* the garage is on the
other end), and the new balcony offset (§5). Then one new fidelity assertion — *every
handed feature agrees with the flag* — so nobody can half-mirror the map later.

### 3.3 The falsifier (ten seconds, no download)

Once §3.1's landmarks exist, put our overhead
(`docs/evidence/pass92/nuketown2/nuketown2/nuketown2-overhead.png`, **VERIFIED** to exist)
beside any published Nuketown 2025 overhead the owner opens himself, and answer exactly one
question:

> Standing in the **sign house's** back yard, looking at the street: is that house's garage
> on the side **towards the cul-de-sac**, or **away from it**?

"Towards" → `NUKETOWN2_HANDEDNESS = 1`. "Away" → `-1`. Record the answer in the constant's
comment with its date and who read it, and the row closes. Until then the flag's comment
says OPEN, which is the truthful state.

---

## 4. Side by side: the real map vs our layout constants

Our column is **VERIFIED** throughout (read from `src/nuketown2-layout.ts` and
`src/nuketown2-arena.ts` this session). The reference column carries its source letter.

| # | Feature | Reference | Ours today | Verdict | Change |
|---|---|---|---|---|---|
| 1 | Spawn axis | teams spawn in their own backyard garden (A1, A3) | six spawns/team at \|z\| 24–31, in the yards | **CORRECT** | none |
| 2 | Long axis | across the street (A1/A3/A7 + the schematic's own pixel sums) | `NUKETOWN2_BOUNDS` 36 × 84, long axis = z | **CORRECT** | none |
| 3 | Two houses facing across the street, slightly offset | A1, A7 | `NUKETOWN2_HOUSE_LAYOUT`, centres x ∓1.25, 2.5 m offset | **CORRECT** | none |
| 4 | Garage attached to one end, open, with a route through to the back | A1 (kitchen → garage → out to the back), A5 (Garage sees Cul De Sac + rear Yard) | 5 × 7 m wing, set back 6 m, link door to house + rear door to yard | **CORRECT** | none |
| 5 | Garages at **opposite** ends of the two houses | implied by A5's diagonal | `pair()` negates x and z | **CORRECT** | none |
| 6 | *Which* end each garage is on | not stated by any source I opened | unanchored (§3) | **UNKNOWN** | §3.2 flag + §3.1 landmarks |
| 7 | House colours (2025) | blue #11, yellow #12, orange #13 in the playable area; the **two letterboxes** are on two houses; trivia describes the **orange** house's second floor and (BO7) the **Blue House** bedroom (A4); Activision's own callouts name a **Blue** and an **Orange** yard/house (A5) | north `0x46809f` blue, south `0xf4be36` **yellow** | **WRONG (south)** | §6 |
| 8 | The Nuketown sign, out front of one house | A1 | `verge sign board` built through `pair()` → one at each end | **WRONG (doubled)** | §6 |
| 9 | Upper floor: landing → study → bedroom over the cul-de-sac | A1 | landing at the partition, front + back upper rooms | **CORRECT** | none |
| 10 | **Rear balcony on the upper floor, with a staircase down to the back lawn** | A1 (explicit); A3 (a second stair from the yard to a deck that leads inside); A6 (the house's second-floor balcony) | **absent** — grep for `balcon\|ledge` in both `HEAD` and `tiptop` returns nothing | **MISSING** | §5 |
| 11 | **A small ledge just under the second-storey window**, on both houses | A1 | absent; our upper window is an exit onto a 3.3 m drop | **MISSING** | §5 |
| 12 | Third route upstairs: climb in through the front window off objects outside | A3, A6 | impossible — nothing outside is climbable to 3.3 m | **MISSING** | §5 |
| 13 | Front porch / covered entry | A1 (living room welcomes you in through the front door) | front door + lintel, no canopy, no step | **PARTIAL** | §5 |
| 14 | Street vehicles mid-map: an open-cargo delivery truck + a bus/coach + a couple of cars | A1, A7, A5 (the moving truck is the Cul De Sac's island of cover) | truck **open** at the origin with the 2× core, coach **closed** beside it, one car per drive + one head car | **CORRECT** | none |
| 15 | **The two street ends are different**: cul-de-sac + third house + wreck at one end; tarmac, sandbags and a 4×4 before a shut entrance at the other | A1; A8 (Street and Cul De Sac are separate Hardpoint zones) | both ends are the same blank perimeter wall; the turning head is centred | **WRONG** | §7 item 1 |
| 16 | Letterboxes at the ends of the drives, one per house, named | A1/A4 | `verge mailbox` + post at each drive end | **CORRECT** (use our own names, not the reference's) | none |
| 17 | Small shed in each backyard | A1, A9 | `yard side store` / `yard far store` + shed registry rows | **CORRECT** | none |
| 18 | Back fences give cover from the air; **fence holes on the north side**; side paths along the **north** border; an out-of-map RC-XD passage | A5, A4 | fence at \|z\| = 36 with two gaps, then a 6 m border path — but `perimeter wall end` closes x = ±17.8, so the two border paths are **dead-end corridors that never meet** | **WRONG (topology)** | §7 item 2 |
| 19 | Fallout shelter | in the **original** map's yellow-house backyard (A9); nothing in any 2025 source | absent | **CORRECT for 2025** | leave out; offer to the parked original |
| 20 | Garden pod with a robot; microwave array with plaques | A4 | absent | missing dressing | §7 item 3 |
| 21 | Mannequins | everywhere (A4, A7) | deliberately deleted, owner HITL 2026-08-29 (`src/environment-assets.ts`) | **owner decision, not a defect** | none |

---

## 5. Balcony / porch / ledge spec (HF-465)

This is the highest-value row on the list: it is the owner's own words, it is *stated
first-party* rather than inferred from pixels, and it changes how the house plays.

What the reference actually has, in three parts (A1, A3, A6):

1. an upper-floor **rear balcony** overlooking the back yard, with an **exterior staircase
   down to the back lawn** — this is the second of the three routes to the upper floor;
2. a **small ledge** protruding just under the second-storey window on the street side of
   both houses;
3. the front window as a real **entry**, climbed from outside off objects.

No source gives dimensions. Everything below is **derived** from this arena's own numbers,
and the derivation is the contract — the same discipline `NUKETOWN2_HOUSE_STAIR` already
uses. House width `W` = 11 m, depth 13 m, `NUKETOWN2_UPPER_Y0` = 3.3, roof deck 6.2,
`HOUSE_BACK_Z` = −23, wall 0.3. Player: standing capsule 1.82 m, radius 0.38, autostep
0.42, jump apex 0.82 (so **1.24 m is the most you can climb in one move** — the arena file
states this itself), standing eye 1.65–1.70, crouched capsule 1.16.

### 5.1 Rear balcony

| Property | Value | Why that number |
|---|---|---|
| Width | **4.4 m = 0.40 W** | Two capsules abreast plus a rail either side; reads as a domestic deck, not a gallery. |
| Projection from the back wall | **2.0 m = 0.18 W** | 2.6 capsule diameters — you can turn on it and pass someone. Under 2 m it becomes a Juliet balcony and stops being a route. |
| Deck top | **y = 3.3 = `NUKETOWN2_UPPER_Y0`** | Flush with the upper floor, so you walk **out**, level, through a door — not step down. |
| Slab | 0.2 m thick, top at 3.3 | Same order as the 0.3 m floor slabs; keeps the soffit at 3.1 m, clear of a standing player below (1.82 + headroom). |
| Rail height | **1.1 m above the deck** (top at 4.4 m) | This arena's own cover classes: above `LOW_COVER` 0.95 so it breaks a crouched line, well under the 1.65 m standing eye so a standing player shoots over it. Do **not** exceed 1.65 (kills the position) or drop below 0.95 (stops being cover). |
| Rail thickness | 0.12 m, with a 0.1 m cap | Thin enough to read as a rail, thick enough to be a stable collider. |
| Posts | two, 0.16 × 0.16, from lawn to soffit, at the outboard corners | Architecturally correct for a deck **and** it answers the floating-geometry gate honestly rather than by regex. |
| Position along the house | centred **2.9–3.0 m toward the non-garage end** from the house centre — north house: centre x = −4.25, spanning x ∈ [−6.45, −2.05] | Puts the exterior flight in the open side yard instead of against the garage wing, and keeps the balcony off the axis of the back door. **Must be derived from `NUKETOWN2_HANDEDNESS`, not written as a literal.** |
| Doorway onto it | 1.8 m clear × 2.4 m head, in the upper back wall | The arena's own standing-door contract (HF-432 item 4). Reuse `doorRun`. |

### 5.2 Exterior stair, balcony → back lawn

Reuse the interior stair's proven numbers exactly — riser **0.30** (inside the 0.42
autostep), going **0.42** (over Rapier's 0.22 minimum), **11 risers** = 3.30 m = the upper
floor — so this flight is walkable by construction and the existing probe pattern covers it.

- Width **1.4 m**, no ceiling anywhere over it, so `STAIR_MAX_FEET_UNDER_CEILING` does not
  apply and the wedging failure HF-432 hit cannot recur.
- Run it **parallel to the back wall**, off the balcony's outboard end, in the strip
  z ∈ [−25.0, −23.6]: 10 goings × 0.42 = 4.2 m of run, landing on the lawn at the house's
  non-garage end. This keeps the yard's middle open; a perpendicular flight would drive a
  3.3 m-tall ramp 4.2 m into the yard and cut the spawn's own sightlines.
- The bottom tread must clear `YARD_FENCE_Z` and both shed registry rows by ≥ 1.5 m.

### 5.3 Front window ledge, and the climb chain

The ledge exists so the front window becomes a **two-way** opening, which is what the
reference has and what makes the power position contestable instead of a sniper's box.

| Body | Value |
|---|---|
| Ledge | top at **y = 3.3** (the upper floor level, i.e. *just under* the sill, exactly as described), projection **0.5 m**, thickness 0.2 m, width = upper-window width + 0.6 m |
| Porch canopy over the front door | top at **2.15 m**, 0.18 thick, 1.8 m projection, 4.0 m wide, on two 0.12 posts |
| Existing `verge low wall` | top **0.95 m**, already built |

Climb chain, each step inside the 1.24 m single-move ceiling:
ground → low wall **0.95** → canopy **1.20** → ledge **1.15** → sill top 4.2 **0.90**.
Every step is ≤ 1.24, so the route walks; nothing in the chain is a jump puzzle. Assert the
four gaps in the fidelity gate as arithmetic over the constants, not as literals.

### 5.4 Drop-out semantics (this is a gameplay contract, not decoration)

`src/physics.ts` gravity is **−22** and `src/gameplay.ts` has
`FALL_DAMAGE_SAFE_SPEED = 9.5`, lethal 22, multiplier 0.5 (**VERIFIED**). So the free-fall
height that costs nothing is v²/2g = 9.5² / 44 = **2.05 m**, and:

| Drop | Impact speed | Damage by `src/gameplay.ts`'s own curve |
|---|---|---|
| Vault the balcony rail → lawn (3.3 m) | 12.05 m/s | ≈ **6** |
| Step off the window ledge → verge (3.3 m) | 12.05 m/s | ≈ 6 |
| Ledge → canopy (1.15 m) → ground | — | **0** |
| Roof deck → ground (6.2 m) | 16.5 m/s | ≈ 23 |

That is the right shape: the exterior stair is the free route, the rail vault is a fast exit
that costs about 6 % of a health bar, and the canopy gives a no-damage way down for a
player who works for it. **Do not assert these numbers as literals** — the gate should call
`fallDamage()` from `src/gameplay.ts` on the derived heights, the way the overdrive test
calls `claimOverdrive` rather than restating its arithmetic.

### 5.5 Gates these bodies will hit

- **`leaves no floating solid geometry over the playable yards`** (`nuketown2-fidelity.test.ts`
  line 1157, **VERIFIED**): explains a floating body only if its node name matches
  `/roof|floor|upper|stair|lintel|head|sill|rail|cant|deck|end|wheel|sign|window|door|porch|butt|pier|partition|mailbox|bulkhead|cap|cabin/i`.
  `balcony deck`, `balcony rail`, `balcony post`, `window ledge sill`, `porch canopy` all
  already match on `deck`/`rail`/`sill`/`porch`. **Do not widen the regex to make a name
  fit** — name the parts truthfully and give the deck real posts.
- **180°-partner gate** (line 1024): everything here goes through `pair()`, so it stays
  green by construction. The **single** sign in §6 does not — it needs the enumerated
  exception the street vehicles already use, plus its own plan-area contribution checked
  against that test's 6 % cap (a 3.6 × 0.3 m board is ~0.04 % of 3,024 m²).
- **Standing eye-line ceiling** (line 1183, band 30 … 50.3 m): the balcony adds a 3.3 m
  firing position over the yard. Re-run and record; if the worst lane grows, the fix is a
  yard-side body, not a shorter rail.
- **Walkable-surface parity / collider-visual parity**: every new body is solid and visible;
  no decal tiers involved.

---

## 6. Colour and landmark corrections (exact changes)

All line references are `origin/contrib/dave-gaming-pc/claude/nuketown2-tiptop`, which is
where the siding became procedural (`src/nuketown2-facade-materials.ts`,
`createNuketown2LapSidingMaterial(baseColorHex, name)`).

| # | File | Now | Change to | Why |
|---|---|---|---|---|
| C1 | `src/nuketown2-arena.ts` | `const sidingB = createNuketown2LapSidingMaterial(0xf4be36, 'nuketown2-siding-south-yellow');` | an **orange** in the mid-century family, e.g. `0xc9662f`, named `'nuketown2-siding-south-orange'` | Nuketown 2025's two Woods/Mason homes are the **blue** and the **orange** house: the wiki's own trivia describes the *second floor* and the *upstairs bookshelf* of the orange house and (BO7) the Blue House bedroom, and Activision's callouts name a Blue and an Orange yard/house (A4, A5). Yellow is the third house, #12. Yellow+green belongs to the original; teal+yellow to '84. **CLAIMED, two sources.** |
| C2 | `src/nuketown2-arena.ts` | `garageSiding` = coral `0xac5644` on **both** wings | a neutral wing colour (the block/plaster family, e.g. `0xd8cdb6`), with the house colour kept for the house body only | With C1 the south house *is* orange; an orange wing on it erases the wing, and an orange wing on the blue house steals the other house's identity. |
| C3 | `src/nuketown2-arena.ts` (~line 1331) | `pair(builder, 'verge sign board', …)` → two signs | **one** sign, on the sign-house verge only, via the enumerated symmetry exception; add the small meter panel under it | The reference has one Nuketown sign, out front of one house (A1). It is the cheapest chirality anchor we can build (§3.1). |
| C4 | `src/nuketown2-layout.ts` | — | add `NUKETOWN2_HANDEDNESS` and derive `GARAGE_X0`, mailbox x, stair `x0`, balcony offset from it | §3.2. |
| C5 | `src/nuketown2-layout.ts` | — | add `NUKETOWN2_BALCONY`, `NUKETOWN2_YARD_STAIR`, `NUKETOWN2_WINDOW_LEDGE`, `NUKETOWN2_PORCH_CANOPY` | The layout module is the dependency-free source both the arena and the weapon layer read; new gameplay geometry belongs there, not inline in the builder. |

Letterbox names: the reference's two names are third-party character names. Keep our own
two names on the plates — the *feature* is a named letterbox at each drive, and that is
what we are reproducing.

---

## 7. What the reference has that we do not, ranked (beyond §5)

1. **The two ends of the street are different places.** Reference: one end is the
   cul-de-sac turning circle with a third house's lawn and an old wreck beyond it; the
   other is a short tarmac apron with sandbags and a 4×4 in front of a shut entrance (A1),
   and BO6's Hardpoint rotation treats *Street* and *Cul De Sac* as separate zones (A8).
   Ours: a centred 16 m turning head and two identical blank walls. This is the largest
   remaining accuracy gap and it is also the map's whole sense of place. **Not a 2–3 hour
   item**: moving the head to one end breaks the 180° gate the way the street vehicles do,
   and the spawn/eye-line solve has to be re-run. Size it as its own lane. The cheap 20 %
   of it — the third-house silhouette and wreck beyond the `+x` fence, the sandbags and
   4×4 apron inside the `−x` end — is dressing, is symmetric-exempt in the same way, and
   delivers most of the read.
2. **The outside path must join the two yards.** Reference: fence holes on the north side
   lead to a side path along the north border, which is the RC-XD passage and the classic
   outside flank (A4, A5). Ours: `perimeter wall end` closes x = ±17.8, so our two border
   paths are dead ends behind each team and connect to nothing (**VERIFIED**). Opening a
   gated 2 m gap at **one** end of each border path — or wrapping the path around the `+x`
   (cul-de-sac) end — restores the route. Check the escape gate and the spawn-sightline
   solve after.
3. **Yard identity.** The 2025 yards carry a garden pod with a robot and an array of
   microwaves with plaques (A4). We have crates, stores and a patio table. This is exactly
   the "whole beautiful scene" the owner is asking for and it is pure dressing — cheap, and
   it belongs to the asset-forge lane (HF-462/HF-468), not to a layout lane.

---

## 8. Falsifiers — what would overturn what is written here

| Claim | Falsifier |
|---|---|
| The two 2025 houses are blue and orange | An overhead or in-game capture showing the two **letterboxed** houses as blue and yellow. Then C1 reverts and yellow is right. |
| The rear balcony exists on **2025** specifically | Every source for the balcony (A1/A3/A6) is the original / '84 / Nukehouse. A4 does not mention it. A 2025 capture of a back wall with no balcony overturns §5.1–5.2. Weigh against: '84 is stated to be the identical layout (A2), and 2025 is the same floor plan re-skinned. |
| `NUKETOWN2_HANDEDNESS = 1` | §3.3, one look. This is why it is a flag and not a fact. |
| The aspect (long axis across the street) | Would need a first-party overhead read the opposite way. Three prose sources plus the schematic's own internal sums say no. |

---

## 9. Implementation plan for the post-reset lane

**Shape:** one Opus implementer, one isolated worktree, ~2–3 hours. **Scope: §5 + §6 only.**
§7 is explicitly *not* in it. Impact class: **runtime**. Base: whichever branch carries the
post-reset `src/nuketown2-layout.ts` + `src/nuketown2-arena.ts` (today that is
`origin/contrib/dave-gaming-pc/claude/nuketown2-tiptop`, which already has the procedural
facade/interior/street/vehicle material modules the colour change touches).

**Before writing anything:** read `docs/MULTI_AGENT_REPO_DISCIPLINE.md`, confirm the
worktree path and branch rather than inferring them, and run
`npm run pipeline:preflight -- --machine dave-gaming-pc --harness "Claude Code"`.

### Step 1 — constants (25 min) · `src/nuketown2-layout.ts`

1. Add `NUKETOWN2_HANDEDNESS` with the OPEN comment from §3.2 verbatim in spirit: what it
   means, that it is unsettled, and the §3.3 falsifier.
2. Add `NUKETOWN2_BALCONY`, `NUKETOWN2_YARD_STAIR`, `NUKETOWN2_WINDOW_LEDGE`,
   `NUKETOWN2_PORCH_CANOPY` with §5's numbers, each carrying its derivation in the comment
   (the 1.24 m climb ceiling, the 0.95/1.65 cover band, the 2.05 m free-fall height) —
   numbers without derivations are how the previous cuts drifted.
3. Move `GARAGE_X0` and the mailbox x off literals and onto `NUKETOWN2_HANDEDNESS`.

*Gate after this step:* `npx tsc --noEmit` clean; existing fidelity suite still green
(nothing should have moved yet — if a test moves, the refactor changed geometry and must be
undone).

### Step 2 — the balcony, its stair and the front climb chain (60 min) · `src/nuketown2-arena.ts`

Build through `pair()` so both houses get it and the symmetry gate stays green by
construction. Body names must be truthful **and** already explained by the floating-geometry
regex: `balcony deck`, `balcony rail <n>`, `balcony post <n>`, `balcony door lintel`,
`yard stair <i>`, `yard stair landing`, `window ledge sill`, `porch canopy`,
`porch canopy post <n>`.

Order matters — build the doorway before the deck, or the upper back wall's pier runs will
not split correctly:

1. Upper back wall: cut a 1.8 × 2.4 doorway with the existing `doorRun` machinery, at the
   balcony's centre x. The existing `house upper back sill` window run must not overlap it.
2. Deck slab, two posts, three rail runs (two returns + the outboard run), leaving the
   doorway's width clear.
3. Exterior flight: 10 stepped treads + landing, parallel to the wall, per §5.2.
4. Front: `porch canopy` (top 2.15) on two posts over the front door, and `window ledge sill`
   (top 3.3, 0.5 projection) under the upper front window.

*Gate after this step:* boot the arena — `buildNuketown2` in a node/vitest harness — and
assert collider counts changed by exactly the number of bodies added, per house.

### Step 3 — colours and the single sign (25 min)

C1, C2, C3 from §6. The sign needs a row in the fidelity gate's **enumerated** symmetry
exception (an exact-equality list, never a name filter — the previous cut's
`.filter(startsWith('truck'))` escape hatch is why that rule exists), and its plan area
checked against the 6 % cap.

### Step 4 — gates, added not weakened (30 min) · `src/nuketown2-fidelity.test.ts`

Four new cases:

1. **`gives every house three ways to its upper floor`** — walk a STANDING capsule on the
   real `CharacterPhysics`, gravity on, **no jump**, for both houses: (a) interior stair,
   (b) yard → exterior flight → balcony → through the door into the upper back room. Then a
   third case with the jump allowed: verge → low wall → canopy → ledge → through the front
   window. Model it on the existing `walks a STANDING player up each stair` probe.
2. **`the balcony is cover you shoot over and drop off`** — rail top is > `LOW_COVER` and
   < 1.65 above the deck; a rail vault's fall is computed from the constants and passed to
   `src/gameplay.ts`'s own fall-damage function, asserted non-zero and < 10.
3. **`every climb in the front chain is inside one move`** — the four gaps, each ≤
   `jump apex + autostep`, derived from `STANCE_SHAPES`/`CHARACTER_PHYSICS_CONFIG`, never
   literals.
4. **`every handed feature agrees with NUKETOWN2_HANDEDNESS`** — garage, driveway apron,
   mailbox, stair wall, balcony offset. This is the test that stops a future half-mirror.

Then re-run the existing suite. The two that will actually move are the standing eye-line
ceiling and the floating-geometry gate — **record the new worst lane in the PR body**; if it
leaves the 30 … 50.3 m band, fix it with a yard body, not by changing the band.

### Step 5 — evidence (20 min)

`npx tsc --noEmit`; the targeted gate set (`nuketown2-fidelity`, spawn quality, parity,
walkable, art direction, visual definition, shed registry); collider/visual parity 0/0;
review-camera capture on hardware WebGPU including the two yard frames and both upper-window
frames; a 60 s headless solo run on `nuketown2` with 0 page errors. Regenerate the overhead
panel with `npx tsx scripts/qa/nuketown2-overhead-panel.mts` and put it next to the previous
one in the PR.

### Step 6 — the paper trail (10 min)

Update `docs/nuketown-rebuild/REFERENCE_SCHEMATIC.md` §2 and §7 with the balcony, the
exterior stair, the window ledge, the canopy and the colour correction, each citing A1/A3/
A4/A5/A6 rather than a pixel. Correct §7's bunker row per §2 of this document. Add the
HF-461 and HF-465 rows to the ledger with the state they are actually in: **HF-465 closed**,
**HF-461 anchored but its flag OPEN**, with §3.3 as the closing condition. Do not report
HF-461 as fixed — it is not settled, it is made settleable, and saying otherwise is the
exact failure mode `AGENTS.md` was written about.

### Explicitly not in this lane

The cul-de-sac end relocation and the connected outside path (§7 items 1–2), yard dressing
(§7 item 3, → asset forge), breakable upstairs glass (HF-464), material penetration
(HF-467), street z-fighting (HF-463). If the balcony work finishes early, the next
highest-value hour is §7 item 2 — a 2 m gate at one end of each border path — because it is
a real route the reference has and we do not.
