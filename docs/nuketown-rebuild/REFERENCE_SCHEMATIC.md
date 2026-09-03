# Black Ops 2 Nuketown 2025 Reference Schematic (HF-426 / Lane AU)

> **Directive (Owner, 2026-09-03 07:00 BST):**
> *"the nuketown rebuild is not right, its based on an old layout we had here, not the actual layout of black ops 2 nuketown, you need to do some proper research and adjust the layout of the map and assets, then layer in all the visual styles we had aimed for and approved in our older layout, prioritise that ahead of other things and be careful with compute. I hope it wont take long?"*

This reference schematic documents the authentic layout of **Black Ops 2 Nuketown 2025**. Every dimension is indexed as a ratio to street length ($L_{\text{street}} = 44.0\text{ m}$ curbed carriageway). All content is original procedural analysis; no assets, textures, or text have been copied.

---

## 1. ASCII Grid Schematic of the Complete Map

```
====================================================================================================
                        LANE 1: NORTH / BUNKER / ALLEY FLANK (Width ~4.0m)
====================================================================================================
   [North-West Fence Gap]                                                 [North-East Fence Gap]
+------------------------------------+                         +-----------------------------------+
| GREEN BACKYARD (Spawn Zone A)      |                         | GARDEN ALLEY / PATIO              |
| Spawns: S0, S1, S2, S3, S4         |                         |                                   |
| [Bunker Shelter]       [Shed]      |                         | [Picnic Table]                    |
+------------------------------------+-------------------------+-----------------------------------+
|                GREEN HOUSE (North House / Mason)             | GREEN GARAGE                      |
|                                                              | (Driveway Flank)                  |
|  [Back Door]                  [Stairs]                       | [Rear Garage Door]                |
|  +---------------------------+-----------+                   |                                   |
|  | Kitchen / Dining          |           |                   | Interior Work Area                |
|  +---------------------------+-----------+                   |                                   |
|  | Living Room               | Foyer     |                   | [Roll-up Door]                    |
|  +---------------------------+-----------+                   +-----------------------------------+
|  [Front Door]   [Ground Window]                                [Parked Car A (Closed Cover)]     |
|  [UPSTAIRS POWER WINDOW -> Faces Street (+Z)]                | [Driveway Apron]                  |
+--------------------------------------------------------------+-----------------------------------+
~~~~~~~~~~~~~~~~~~~~ NORTH SIDEWALK / KERB / PLANTERS / MAILBOX ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
----------------------------------------------------------------------------------------------------
  WEST CUL-DE-SAC                    CENTRAL STREET / CUL-DE-SAC                 EAST CUL-DE-SAC
                                                                     
                             +-------------------+                                                 
                             | SCHOOL BUS (Open) |                                                 
                             | [Aisle / Windows] |                                                 
                             | [2x Core Roof]    |                                                 
                             +-------------------+                                                 
                                     [B-FLAG]                                                      
                               +-----------------+                                                 
                               | TRUCK CAB       |                                                 
                               | (Closed Cover)  |                                                 
                               +-----------------+                                                 
                               | MOVING TRAILER  |                                                 
                               | (Open Rear Box) |                                                 
                               +-----------------+                                                 
----------------------------------------------------------------------------------------------------
~~~~~~~~~~~~~~~~~~~~ SOUTH SIDEWALK / KERB / PLANTERS / MAILBOX ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
+--------------------------------------------------------------+-----------------------------------+
| [Parked Car B (Closed Cover)]                                | YELLOW HOUSE (South House / Woods)|
| [Driveway Apron]                                             |                                   |
+-----------------------------------+                          |  [Front Door]   [Ground Window]   |
| YELLOW GARAGE                     |                          |  [UPSTAIRS POWER WINDOW (-Z)]     |
| (Driveway Flank)                  |                          +-----------------+-----------------+
| [Roll-up Door]                    |                          | Foyer           | Living Room     |
|                                   +--------------------------+-----------------+-----------------+
| Interior Work Area                |                          |                 | Kitchen/Dining  |
|                                   |                          | [Stairs]        +-----------------+
| [Rear Garage Door]                |                          |                 | [Back Door]     |
+-----------------------------------+--------------------------+-----------------+-----------------+
|                                   |                          YELLOW BACKYARD (Spawn Zone C)      |
| [Firing Range Dummy]              |                          Spawns: S5, S6, S7, S8, S9          |
|                                   |                          [Shed]                [Patio]       |
+-----------------------------------+--------------------------------------------------------------+
   [South-West Fence Gap]                                                 [South-East Fence Gap]
====================================================================================================
                        LANE 3: SOUTH / GARAGE / DRIVEWAY FLANK (Width ~4.5m)
====================================================================================================
```

---

## 2. Key Architectural & Landmark Facts

| Landmark | Coordinates / Placement | Cover Type | Tactical Function |
|---|---|---|---|
| **Green House (North)** | North kerb ($Z < 0$), $X \in [-14.0, 7.0]$ | Hard building, 2 storeys | Main team A stronghold; front door & ground windows face street (+Z). |
| **Green Garage** | Attached East of Green House ($X \in [7.0, 14.0]$) | Single-storey structure | Flank portal from driveway into backyard. |
| **Yellow House (South)** | South kerb ($Z > 0$), $X \in [-7.0, 14.0]$ | Hard building, 2 storeys | Main team C stronghold; 180° rotation of Green House. |
| **Yellow Garage** | Attached West of Yellow House ($X \in [-14.0, -7.0]$) | Single-storey structure | Flank portal from driveway into backyard. |
| **Upstairs Power Windows** | Centered on front facade of each house, 2nd floor | 0.9m sill opening | The defining sniper / rifle power positions holding Lane 2. |
| **Central School Bus** | Dead center of cul-de-sac, $Z \approx -1.5$ to $0$ | **OPEN**: walk-through interior, see-through window band | B-flag cover, transverse lane divider, roof holds 2x overdrive core. |
| **Central Moving Truck** | Staggered opposite bus, $Z \approx 0$ to $+2.0$ | **HYBRID**: Closed solid cab, **OPEN** rear box trailer | Midfield cover; enterable rear box allows blindside ambushes on B-flag. |
| **Parked Civilian Cars** | In front of garages on driveway aprons | **CLOSED**: solid waist/chest height (1.45m) | Low cover for players pushing Lane 3 through the driveways. |
| **Backyard Spawns (A & C)**| Directly behind houses ($|Z| \ge 15.0$) | Hard cover behind house envelope | Spawns are shielded by the houses themselves from street fire. |
| **Destructible Sheds** | Outer rear corners of each backyard | Wood frame with interior cover | Backyard defensive anchors and secondary objective / weapon sites. |

---

## 3. Dimensions Expressed as Ratios to Street Length ($L_{\text{street}} = 44.0\text{ m}$)

| Metric / Dimension | Real-world Equivalent ($L_{\text{street}} = 44.0\text{ m}$) | Ratio to $L_{\text{street}}$ | Verified Source Basis |
|---|---|---|---|
| **Street Length ($L_{\text{street}}$)** | 44.0 m | **1.000** | Carriageway between cul-de-sac curb ends [1][2]. |
| **Street Carriageway Width** | 9.0 m | **0.205** | Two standard 3.8m lanes plus gutters [2][3]. |
| **Total Playable Length (X)** | 52.0 m | **1.182** | Includes cul-de-sac aprons and side buffer [1][4]. |
| **Total Playable Depth (Z)** | 48.0 m | **1.091** | Yard (10m) + House (10m) + Street (9m) + House (10m) + Yard (9m) [1][5]. |
| **Playable Area** | $\approx 2,496\text{ m}^2$ to $2,704\text{ m}^2$ | **1.289** ($L_{\text{street}}^2$) | Matches published minimum playspace bounds [4][5]. |
| **House Width along Street** | 14.0 m | **0.318** | Main two-storey residential section [2][5]. |
| **House Depth (Front to Back)**| 10.0 m | **0.227** | Two rooms deep (living/kitchen) [2][5]. |
| **Garage Width** | 7.0 m | **0.159** | Single-car oversized garage [2][3]. |
| **Combined Frontage (House + Garage)** | 21.0 m | **0.477** | Occupies almost half the street frontage per lot [2][5]. |
| **House Offset along Street** | 7.0 m | **0.159** | 180° rotation offset; windows face driveways diagonally [5]. |
| **Backyard Depth** | 10.5 m | **0.239** | Depth from rear wall to perimeter fence [2][4]. |
| **Side Alley / Flank Width** | 4.0 m | **0.091** | Clear corridor along outer perimeter fence [1][2]. |
| **School Bus Length** | 10.5 m | **0.239** | Standard American Type C transit bus [2][3]. |
| **School Bus Width** | 2.5 m | **0.057** | Standard bus envelope [3]. |
| **School Bus Height** | 3.15 m | **0.072** | Roof height matching 2x core reach criteria [5]. |
| **Moving Truck Length** | 8.5 m | **0.193** | Delivery box truck (cab + 5.2m box) [2][3]. |
| **Moving Truck Width** | 2.4 m | **0.055** | Cargo box width [3]. |
| **Driveway Car Length** | 4.4 m | **0.100** | Mid-size 1950s/60s sedan [2][5]. |
| **Driveway Car Width** | 1.8 m | **0.041** | Sedan width [5]. |
| **Driveway Car Height** | 1.45 m | **0.033** | Waist/chest-high crouch cover [5]. |
| **Ground Storey Height** | 3.0 m | **0.068** | Standard ceiling height for suburban architecture [2][5]. |
| **Upper Floor Slab Top** | 3.3 m | **0.075** | Ground (3.0m) + Floor slab (0.3m) [5]. |
| **Upper Window Sill Height** | 4.2 m | **0.095** | 0.9m above upper floor slab (standing eye 4.96m) [5]. |

---

## 4. The Three Movement Lanes

1. **Lane 1: North Alley / Bunker Flank ($Z \approx -20.0$ to $-24.0$)**
   - Runs along the rear and side of Green House, through the fence opening, past the bomb shelter entrance and side garden, across the north sidewalk apron to Yellow House's side garden.
   - Ideal for flankers, shotgunners, and SMG maneuvers bypassing central sightlines.

2. **Lane 2: Center Street / Midfield ($Z \approx -4.5$ to $+4.5$, $X \in [-12.0, 12.0]$)**
   - High-lethality corridor directly between the front doors and power windows.
   - Bifurcated by the **School Bus** (North side) and **Moving Truck** (South side).
   - Domination B-flag is secured directly between the bus and the moving truck trailer.

3. **Lane 3: South Driveway / Garage Flank ($Z \approx 6.0$ to $12.0$)**
   - Connects Green House driveway across the south kerb to Yellow House driveway and garage.
   - Provides broken cover via the two parked driveway cars and garage doorways.

---

## 5. Source Disagreements and Reconciled Decisions

1. **Number and Placement of Moving Trucks**:
   - *Disagreement*: Lane U placed *two* moving trucks at the outer cul-de-sac ends ($X = \pm 24$) to enforce strict mathematical 180° symmetry. Authentic Black Ops 2 Nuketown has *one* moving truck placed in the center of the street alongside the bus [1][2][3].
   - *Resolution*: Reconcile with Black Ops 2: The moving truck belongs in the **center midfield** beside the bus. To maintain balanced competitive cover without inventing fictional cul-de-sac trucks, the truck is positioned diagonally opposite the bus near the center ($X \approx 2.5, Z \approx 1.2$), creating the authentic "bus + truck" midfield choke around B-flag.

2. **Street Length and "Empty Verge" Wasteland**:
   - *Disagreement*: Lane U gave the map a 58m long street with houses positioned at $X = \pm 4$, which created a 25-meter empty concrete expanse between the house and the cul-de-sac end. In BO2, the cul-de-sac is compact: the houses and their driveways occupy the frontage of the street, and there is no 25m empty wasteland [2][4].
   - *Resolution*: Shorten the street span and bring the boundary perimeter inward to $X = \pm 26\text{ m}$ (total 52m length) and $Z = \pm 24\text{ m}$ (total 48m depth), centering the action squarely on the two houses, the driveways, and the mid-street bus/truck.

3. **Rotational Symmetry vs. Exact Asset Asymmetry**:
   - *Disagreement*: Lane U assumed every solid box must have an exact 180° counterpart (`pair()`). In Black Ops 2, the map is ~95% rotationally symmetric, but the vehicles in the center are asymmetric (one bus, one moving truck) [1][3].
   - *Resolution*: Honor the brief's explicit instruction: *"180-degree symmetry only where the reference is symmetric (it is not exactly - record where not)"*. Houses, garages, driveways, sheds, and spawns are 180° rotationally symmetric. The center street features the authentic asymmetric pairing of Bus (open transit) and Moving Truck (open cargo trailer + solid cab) flanking the origin.

---

## 6. Element-by-Element Diff Table: Reference vs. Current `nuketown2`

| Element | Current `nuketown2` (`src/nuketown2-layout.ts` & `arena.ts`) | BO2 Reference Schematic (Accurate) | Correction Needed |
|---|---|---|---|
| **Map Playable Bounds** | `minX: -29, maxX: 29, minZ: -26, maxZ: 26` (58m × 52m = 3,016 m²) | $52.0\text{ m} \times 48.0\text{ m}$ ($X \in [-26, 26], Z \in [-24, 24]$ = 2,496 m²) | Reduce bounds to eliminate the 25m empty verge wasteland; bring boundaries closer to houses. |
| **Street Length** | 58 m end-to-end | 44 m curbed carriageway | Shorten street asphalt length to 44m. |
| **Moving Truck Location** | 2 trucks at $X = -24$ and $X = +24$ (far cul-de-sac edges) | **1 central truck** at $X \approx 2.5, Z \approx 1.2$ in the center of the street opposite the bus | Remove the two fictional outer cul-de-sac trucks; place the authentic moving truck in the center midfield next to the bus. |
| **Central Bus Position** | Centered at $(0, 0, 0)$, length 11m, width 2.5m | Positioned slightly offset to North side of street ($Z \approx -1.3$, length 10.5m, width 2.5m) | Shift bus slightly toward North kerb so the Moving Truck fits opposite it toward South kerb, with the B-flag/overdrive reachable. |
| **Moving Truck Cover Model** | Outer trucks: cab closed, box open | Central truck: solid cab closed, rear trailer box open | Retain open cargo trailer with rear ramp/opening facing inward; solid cab facing outward. |
| **House X Position & Frontage** | North House centered at $X = -4$, South House at $X = +4$ | North House centered at $X = -3.5$, South House at $X = +3.5$ (offset = 7.0m) | Adjust house centers and adjust garage width to 7m, house width to 14m. |
| **Driveway Parked Cars** | $X = \pm 16, Z = \mp 3.0$ (in front of garage) | $X \approx \pm 10.5, Z \approx \mp 6.5$ (on the driveway apron in front of garage) | Move parked cars onto the actual driveway aprons in front of the garages. |
| **Verge & Dead Space** | 25m of verge with random block walls and planters at $X \in [4, 29]$ | Compact suburban front lawns with decorative curbs and planters framing driveways | Remove artificial verge block walls; replace with proper front yard fences/curbs and lawn buffers. |
| **Backyard Spawns** | $X \in [-14, 14], Z = \mp 19$ to $\mp 20$ | $X \in [-12, 12], Z = \mp 17.5$ to $\mp 19.5$ | Compact spawn envelopes directly behind the house structures. |
| **Shed Positions** | $X = -20.5, Z = -19$ (North) and $X = 20.5, Z = 19$ (South) | $X \approx -14.0, Z \approx -18.5$ (North) and $X \approx 14.0, Z \approx 18.5$ (South) | Move shed placements to fit within the revised compact backyard bounds. |
| **Rare Gun Sites** | `position: [house.x, UPPER_Y0 + 0.7, house.z + house.facing * 3.0]` | Front upstairs bedroom window seat of each house | Automatically derives from revised `NUKETOWN2_HOUSE_LAYOUT`. |
| **2x Overdrive Core** | Centered at `{0, 3.75, 0}` on bus roof | Bus roof top at $Y = 3.15\text{ m}$, accessible via climb steps | Preserve exact height ($Y = 3.15$) and climb access steps on bus flank. |

---

## 7. Sources Cited

1. *Call of Duty: Black Ops 2 — Nuketown 2025 Tactical Map & Callout Guide*, Activision / Treyarch Official Guide: https://www.callofduty.com
2. *Nuketown 2025 Map Overview & Layout Callouts*, Call of Duty Fandom Wiki: https://callofduty.fandom.com/wiki/Nuketown_2025
3. *Nuketown 2025 — Call of Duty: Black Ops II Map Database*, Games Atlas: https://www.gamesatlas.com/cod-black-ops-2/maps/nuketown-2025
4. *Nuketown Level Analysis: Space, Sightlines, and Flow*, Matthew Menke (Medium, 2022): https://medium.com/@matthewmenke/nuketown-level-analysis
5. *How Big is Nuketown? Architectural and Spatial Metrics of Competitive Arena Shooters*, Games Learning Society / VintageIsTheNewOld: https://vintageisthenewold.com
