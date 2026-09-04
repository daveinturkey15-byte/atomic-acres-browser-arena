# Nuke Town Rebuild (nuketown2) - Reference-Grounded Render Critic Review: Candidate 3

- **Critic Agent:** GEM-4 (Gemini 3.8 Flash reference critic via OMP)
- **Target Specification:** Call of Duty: Black Ops II - *Nuketown 2025* (**BO2-2025**) as documented in `docs/references/nuketown-2025/FINDINGS.md` and `manifest.json`.
- **Primary Reference Images:** `img/nt2025-street-boii.jpg`, `img/nt2025-aerial-boii.jpg`, `img/nt2025-sniper-boii.jpg`, `img/nt2025-hero-boii.png`, `img/nt2025-loadscreen-boii.png`, `img/nt2025-minimap-boii.png`.
- **Candidate Captures Directory:** `C:/Users/david/projects/aa-claude-hitl/docs/evidence/pass94/candidate/nuketown2/` (Pass 94 candidate, commit `7ec0be01`).
- **Date:** 2026-09-04

---

## 1. Human Verification Receipts (Prominent Colours & House Counts)

*OBSERVED: Evaluated across all 17 non-duplicate capture stations in candidate nuketown2.*

| Station ID | Two Most Prominent Colours | Number of Houses Visible | Verification Confirmation |
|---|---|:---:|---|
| `nuketown2-overhead` | Yellow, Slate Blue | 2 | OBSERVED: Full aerial plan framing North yellow house, South blue house, and roadway. |
| `nuketown2-north-yard` | Cyan / Sky Blue, Lawn Green | 2 | OBSERVED: Blue house yard framing with small sliver of yellow house across street. |
| `nuketown2-south-yard` | Bright Yellow, Lawn Green | 2 | OBSERVED: Yellow house rear yard with sliver of blue house visible far left. |
| `nuketown2-street-centre` | Yellow, Asphalt Charcoal | 2 | OBSERVED: Centre roadway view framing yellow house (left) and blue house (right). |
| `nuketown2-north-upper-window` | Cyan / Sky Blue, Pure White | 2 | OBSERVED: Framed inside blue upper window looking at yellow house opposite. |
| `nuketown2-south-upper-window` | Bright Yellow, Pure White | 2 | OBSERVED: Framed inside yellow upper window looking at blue house opposite. |
| `nuketown2-into-sun-street` | Sky Blue, Warm White | 2 | OBSERVED: Facing sun down street; yellow house on left, blue house on right. |
| `nuketown2-north-interior` | Warm Cream, Timber Brown | 1 | OBSERVED: Ground floor interior of North house looking toward kitchen counter. |
| `nuketown2-south-interior` | Warm Cream, Timber Brown | 1 | OBSERVED: Ground floor interior of South house looking toward kitchen counter. |
| `nuketown2-garage` | Brick Orange-Red, Off-White | 2 | OBSERVED: Inside garage bay looking out at driveway; yellow house visible across street. |
| `nuketown2-north-balcony` | Sky Blue, Concrete White | 1 | OBSERVED: Elevated balcony landing view looking at rear yard and perimeter wall. |
| `nuketown2-front-porch` | Sky Blue, Crisp White | 1 | OBSERVED: Tight front entry angle on blue house under cantilevered canopy. |
| `nuketown2-vehicle-near` | Off-White / Cream, Dark Charcoal | 1 | OBSERVED: Street view centered on white sedan and boxes; yellow house on right. |
| `nuketown2-vehicle-mid` | Off-White / Cream, Dark Charcoal | 1 | OBSERVED: Three-quarter view of white tour coach; corner of yellow house visible. |
| `nuketown2-vehicle-far` | Bright Yellow, Sky Blue | 2 | OBSERVED: Looking down street toward fence; yellow house left, blue house right. |
| `nuketown2-coach-elevation` | Off-White / Cream, Dark Charcoal | 1 | OBSERVED: Side profile of coach; blue house upper storey visible behind roofline. |
| `nuketown2-truck-cab-near` | Off-White / Cream, Bright Yellow | 1 | OBSERVED: Close-up on truck cab and crates; yellow house facade directly behind. |

---

## 2. Station-by-Station Detailed Evaluations

### Station 1: `nuketown2-overhead`
- **What You See:** [OBSERVED] An overhead orthographic plan view looking straight down at the entire arena. Two two-storey rectangular tract houses flank a straight asphalt street with a white coach and moving truck. The cul-de-sac turning circle is completely absent, ending abruptly in a straight perimeter fence surrounded by low-poly pine trees.
- **House Colour & Material:** [P0 wrong vs reference] [OBSERVED] North house is bright primary yellow siding; South house is bright cyan/sky blue siding. In BO2-2025 reference (`nt2025-aerial-boii.jpg`, `nt2025-street-boii.jpg`), House A is terracotta/burnt orange on the upper floor with cream ground floor, and House B is off-white/cream modernist capsules with blue trim. Neither house is yellow or full-blue tract siding. *Fix hint: Recolor North house upper floor to terracotta/burnt orange (`#C85A32`) over a cream ground floor (`#F4E8D8`); recolor South house to off-white/cream with subtle pale blue-grey glazing and accents.*
- **Garage Side From Spawn:** [P0 wrong vs reference] [OBSERVED] Seen from each backyard facing the house, garages are positioned on the right, but the garage structure on the yellow house is rendered as an open red brick carport rather than the reference's 3 dark barrel-vault bays over a cream box. *Fix hint: Model the garage wing as a cream solid box with three dark barrel-vault curved roof bays (`nt2025-aerial-boii.jpg`).*
- **Roofline & Porch/Eave:** [P0 wrong vs reference] [OBSERVED] Both houses have flat rectangular asphalt roofs with slight parapets. BO2-2025 House A features an iconic pale swooping butterfly roof carrying 6 dark solar panels; House B features rounded modernist capsule roofs with pale blue-grey glazing. *Fix hint: Replace the flat asphalt slab roofs with the swooping butterfly wing roof and solar array on the North house, and rounded capsule contours on the South house.*
- **Balcony/Deck & Exterior Stair:** [P2 weak] [OBSERVED] Basic rear balconies and straight exterior stairs are present on both houses. However, they lack the reference's wooden deck planking and circular concrete patio landing at the foot of the stair. *Fix hint: Add circular concrete patio discs at the stair bases and refine the wooden balustrades.*
- **Street Shape & Vehicles:** [P0 wrong vs reference] [OBSERVED] The street is a dead-straight rectangular strip with no cul-de-sac turning head. In BO2-2025 (`nt2025-aerial-boii.jpg`), the road forms a prominent circular lollipop cul-de-sac with a third house beyond the fence. Vehicles lack the retro-futuristic styling and cream/maroon livery of the Nuketown tour coach. *Fix hint: Add the circular turning head at the cul-de-sac end, model the third house beyond the head, and texture the coach with rounded streamlining and cream-and-maroon livery.*
- **Lawn Props & Appliance Banks:** [P1 missing] [OBSERVED] Front lawns are plain green planes with basic hedges. The signature color-coded 3-unit appliance banks (red tops on North lawn, blue tops on South lawn) are absent. *Fix hint: Place a 3-unit kitchen appliance bank with red lids on the North front lawn and blue lids on the South front lawn.*
- **Fences/Yards:** [P0 wrong vs reference] [OBSERVED] Backyards contain generic green block dividers and flat turf. Reference shows glasshouse, cold frames, and curved carport in North yard; garden pod dome, sand pit, and shuffleboard court in South yard. *Fix hint: Replace generic yard props with the specific BO2-2025 assets: glasshouse and curved carport in North yard, white futuristic garden pod and shuffleboard court in South yard.*
- **Lighting & Time of Day:** [P2 weak] [OBSERVED] Clear overhead lighting with hard geometric drop shadows; feels sterile and clinical compared to the warm, hazy Nevada desert sun of BO2-2025. *Fix hint: Warm directional sun color to slight peach/gold and introduce soft atmospheric distance haze.*
- **Overall Photoreal Read:** [P0 wrong vs reference] [OBSERVED] Reads as a low-poly stylized blockout rather than a high-fidelity retro-futuristic test site. *Fix hint: Introduce PBR surface textures, normal maps on siding and asphalt, and replace low-poly conical backdrop trees.*

---

### Station 2: `nuketown2-street-centre`
- **What You See:** [OBSERVED] Ground-level view down the centreline of the street standing between the coach and the moving truck. The yellow house sits on the left with an open carport, and the blue house sits on the right. In the distance, a plain vertical wooden fence terminates the street under a hazy sky with low-poly pine trees.
- **House Colour & Material:** [P0 wrong vs reference] [OBSERVED] Monolithic yellow and cyan horizontal lap siding gives the impression of 1950s tract housing (BO1 style). Reference BO2-2025 features mixed-material modernist facades: stucco, composite panels, and large glass ribbon windows. *Fix hint: Break up facades into distinct materials—stucco base, terracotta cladding panels on upper floor, and horizontal window ribbons.*
- **Garage Side From Spawn:** [P2 weak] [OBSERVED] Yellow house garage is visible on the far left as a red brick alcove with white sedan. *Fix hint: Align garage wing height and facade material with the cream base structure.*
- **Roofline & Porch/Eave:** [P0 wrong vs reference] [OBSERVED] Rooflines are strictly horizontal boxes. The distinctive forward cantilevered roof eaves and angular rake of BO2-2025 are missing. *Fix hint: Add the cantilevered overhang projection above the front entries and angle the roof planes.*
- **Balcony/Deck & Exterior Stair:** [P1 missing] [OBSERVED] Occluded by house frontages from this street angle. *Fix hint: Ensure upper front balconies/ledges provide readable sniper perches matching reference lines.*
- **Street Shape & Vehicles:** [P0 wrong vs reference] [OBSERVED] Asphalt roadway is flat, black, and devoid of painted road markings, turning head kerbs, or manholes. The coach bus rear is a flat white box with two circular red dots. *Fix hint: Paint retro lane dashes and kerb radiuses; texture the coach rear with chrome bumper, maroon lower accent, and aerodynamic contouring.*
- **Lawn Props & Appliance Banks:** [P1 missing] [OBSERVED] Front verges lack the iconic futuristic appliance banks, chain-and-post verge fencing, and fan-shaped ornamental desert shrubs. *Fix hint: Populate the sidewalk verge with white chain-and-post stanchions and retro display appliances.*
- **Fences/Yards:** [P0 wrong vs reference] [OBSERVED] Street end fence is an unpainted cedar vertical slat fence backed by generic pine trees. Reference BO2-2025 features retro modern boundary walls with atomic age decorative panels and distant futuristic city structures (geodesic dome, spire). *Fix hint: Replace pine trees and raw cedar fence with the retro-futuristic City of the Future perimeter backdrop.*
- **Lighting & Time of Day:** [P2 weak] [OBSERVED] Flat lighting on street asphalt with minimal specular sheen or ambient occlusion around tyres and kerbs. *Fix hint: Increase road specular roughness variation and contact AO under vehicle wheels.*
- **Overall Photoreal Read:** [P0 wrong vs reference] [OBSERVED] Untextured vehicle hulls and matte house siding create a blocky prototype appearance. *Fix hint: Apply proper PBR metalness/roughness maps to vehicle panels and add weathering to road asphalt.*

---

### Station 3: `nuketown2-into-sun-street`
- **What You See:** [OBSERVED] Looking down the street toward the sun glinting over the low-poly mountains. The blue house entry, sidewalk bollards, and coach flanks are lit by strong backlighting. Long dark cast shadows stretch across the asphalt from vehicles and kerbs.
- **House Colour & Material:** [P0 wrong vs reference] [OBSERVED] Blue house siding reflects light with a plastic sheen; yellow house opposite is visible in shade. *Fix hint: Re-skin the blue house with off-white modernist composite panels and subtle blue trim ribbons.*
- **Garage Side From Spawn:** [P2 weak] [OBSERVED] South house garage structure is on the right side of the street, consistent with rotational symmetry. *Fix hint: Add detailed garage door segmentation and metallic trim.*
- **Roofline & Porch/Eave:** [P0 wrong vs reference] [OBSERVED] Blue house front porch is a minimal flat white plank on two thin posts. In `nt2025-sniper-boii.jpg`, the porch is a massive cantilevered architectural slab projecting over the patio without flimsy stilts. *Fix hint: Remove thin support stilts and make the porch eave a deep architectural cantilever tied into the main facade.*
- **Balcony/Deck & Exterior Stair:** [P2 weak] [OBSERVED] Upper front windows show basic white frames but lack exterior sniper perches or architectural depth. *Fix hint: Recess window glass 0.2 m behind facade and add architectural window framing.*
- **Street Shape & Vehicles:** [P0 wrong vs reference] [OBSERVED] White coach bus has flat, untextured side walls with a faint beige stripe; wheels lack rims or hubcaps. *Fix hint: Add chrome hubcaps, wheel arches, recessed tinted window glass, and Nuketown 2025 tour livery.*
- **Lawn Props & Appliance Banks:** [P1 missing] [OBSERVED] Lawns contain simplistic green rectangular boxes (abstract hedges) and single tufts of grass; no appliance displays. *Fix hint: Replace box hedges with contoured shrubs and install the blue-topped appliance bank.*
- **Fences/Yards:** [P2 weak] [OBSERVED] Distant perimeter fence is stark and unshaded; backdrop mountains are sharp low-poly facets. *Fix hint: Soften background mountain meshes with atmospheric scattering and haze.*
- **Lighting & Time of Day:** [P2 weak] [OBSERVED] Strong sun direction creates dramatic shadows, but sky dome is washed out with no lens flare or bloom around the roof edges. *Fix hint: Add subtle lens bloom at high-luminance sun intersections.*
- **Overall Photoreal Read:** [P0 wrong vs reference] [OBSERVED] Primitives and boxy hedges dominate the foreground, breaking immersion. *Fix hint: Add micro-detail: kerb bevelling, painted asphalt stop lines, and detailed hedge foliage.*

---

### Station 4: `nuketown2-front-porch`
- **What You See:** [OBSERVED] A close-up camera angle looking at the front entry porch of the Blue house. The white front porch canopy sits over a white concrete slab doorstep, flanked by a box hedge and a white sedan in the driveway. The white coach bus rear is visible on the left.
- **House Colour & Material:** [P0 wrong vs reference] [OBSERVED] Siding is uniform cyan clapboard; door and window trims are stark, untextured pure white. Reference shows smooth architectural cladding with futuristic clean seams. *Fix hint: Switch from rustic horizontal lap siding to large architectural panel cladding.*
- **Garage Side From Spawn:** [P2 weak] [OBSERVED] The driveway and parked white car are to the right of the front door, consistent with layout. *Fix hint: Add driveway pavement scoring and tyre wear marks.*
- **Roofline & Porch/Eave:** [P0 wrong vs reference] [OBSERVED] Porch canopy consists of two thin horizontal white planks supported by slender wooden posts. Reference `nt2025-sniper-boii.jpg` demonstrates a thick, structural cantilevered canopy with integrated recessed lighting. *Fix hint: Replace thin planks with a single thick cantilevered slab featuring recessed soffit spotlights.*
- **Balcony/Deck & Exterior Stair:** [P2 weak] [OBSERVED] Upper floor window sill sits directly above the porch canopy, but lacks the ledge geometry needed for intuitive mantle gameplay. *Fix hint: Deepen the under-window sill ledge to 0.4 m to read as an explicit gameplay climb surface.*
- **Street Shape & Vehicles:** [P2 weak] [OBSERVED] Rear corner of coach is visible with flat red taillight stickers. *Fix hint: Model 3D lens geometry for taillights with reflective chrome housings.*
- **Lawn Props & Appliance Banks:** [P1 missing] [OBSERVED] Only a single solid green hedge cube is present by the porch. The front lawn appliance console with blue dials/cooktop is completely missing. *Fix hint: Place the blue-topped 3-unit kitchen appliance console on the grass adjacent to the porch pathway.*
- **Fences/Yards:** [P2 weak] [OBSERVED] Sidewalk kerb is a sharp 90-degree untextured extrusion. *Fix hint: Add bevelled kerb edges and sidewalk expansion joints.*
- **Lighting & Time of Day:** [P2 weak] [OBSERVED] Direct sun casts hard diagonal shadows under the canopy, but ambient bounce into the porch alcove is overly dark and flat. *Fix hint: Increase diffuse ambient bounce fill in sheltered porch undercroft.*
- **Overall Photoreal Read:** [P0 wrong vs reference] [OBSERVED] Clean, untextured geometric primitives look like an architectural sketch rather than an in-game combat space. *Fix hint: Apply subtle surface roughness variations, ambient occlusion dirt in corners, and textured front door hardware.*

---

### Station 5: `nuketown2-north-yard`
- **What You See:** [OBSERVED] Standing in the North backyard looking toward the rear facade of the Blue house. An exterior wooden staircase rises along the wall to an upper railed balcony landing. Across the street in the gap between houses, the coach bus and a corner of the yellow house are visible.
- **House Colour & Material:** [P0 wrong vs reference] [OBSERVED] North yard camera is actually facing the Blue house (which is placed in the North position or camera is mislabelled; layout pairing shows blue house here). Material is cyan siding with white window surrounds. *Fix hint: Apply the terracotta/orange upper and cream lower palette if this is House A, or off-white if House B.*
- **Garage Side From Spawn:** [P0 wrong vs reference] [OBSERVED] Facing the rear of the house, the exterior staircase is on the left, which places the garage wing on the right as required by rotational symmetry. However, the garage wing itself is barely articulated from the rear. *Fix hint: Articulate the garage rear volume with a service door and exterior utility meters.*
- **Roofline & Porch/Eave:** [P0 wrong vs reference] [OBSERVED] Rear roofline is a flat edge. Reference BO2-2025 rear facade features a sweeping angled roof overhang sheltering the upper balcony deck. *Fix hint: Extend the roof sweep outward to overhang and shelter the rear balcony.*
- **Balcony/Deck & Exterior Stair:** [P0 wrong vs reference] [OBSERVED] Staircase is a simple open-stringer wooden flight with vertical balusters. In `nt2025-street-boii.jpg`, the rear deck is a substantial timber outdoor terrace with horizontal safety rails, resting over a recessed ground-floor patio. *Fix hint: Widen the balcony into a playable deck platform with horizontal safety railings and an undercroft patio.*
- **Street Shape & Vehicles:** [P2 weak] [OBSERVED] Sightline through the side yard reveals coach bus in the street. *Fix hint: Ensure side alley sightlines match competitive engagement angles from BO2-2025.*
- **Lawn Props & Appliance Banks:** [P1 missing] [OBSERVED] Backyard is a bare grass rectangle with a solitary green box hedge. Reference BO2-2025 North yard features an arched glasshouse, cold frames with red flora, and a white curved-roof carport. *Fix hint: Model and place the glasshouse greenhouse and white curved carport in the North backyard.*
- **Fences/Yards:** [P0 wrong vs reference] [OBSERVED] Backyard fence is standard brown vertical timber slats. Reference shows white painted fences with decorative retro post caps and tactical fence cutouts/holes. *Fix hint: Paint fences white with rounded slat tops and include a tactical mantle hole in the back fence.*
- **Lighting & Time of Day:** [P2 weak] [OBSERVED] Uniform daylight across the lawn with no dappled shadow or foliage shadows. *Fix hint: Add soft contact shadows beneath yard props and stairs.*
- **Overall Photoreal Read:** [P0 wrong vs reference] [OBSERVED] The yard feels completely empty and unlived-in compared to the dense set-dressing of BO2-2025. *Fix hint: Populate the yard with stepping stones, flower beds, patio furniture, and garden tools.*

---

### Station 6: `nuketown2-south-yard`
- **What You See:** [OBSERVED] Standing in the South backyard looking directly at the rear facade of the Yellow house. A straight exterior flight of stairs climbs to an upper-level railed wooden balcony. In the far left distance, the blue house and white coach can be glimpsed through the side passage.
- **House Colour & Material:** [P0 wrong vs reference] [OBSERVED] Rear elevation is uniform lemon yellow siding. Siding lacks ambient occlusion between planks or nail/seam markings. *Fix hint: Replace yellow siding with off-white/cream modernist composite panels and pale blue-grey trim.*
- **Garage Side From Spawn:** [P0 wrong vs reference] [OBSERVED] Facing the rear elevation, the stair is on the left, making the garage wing on the right. However, the garage is an open-sided carport structure with exposed beams. *Fix hint: Enclose the garage structure into a solid architectural volume.*
- **Roofline & Porch/Eave:** [P0 wrong vs reference] [OBSERVED] Roof edge is an unbroken horizontal line with zero overhang. *Fix hint: Create the modernist curved capsule roof profile characteristic of House B.*
- **Balcony/Deck & Exterior Stair:** [P2 weak] [OBSERVED] Straight wooden staircase with simple railing. Lacks the circular concrete patio at the base seen in `nt2025-street-boii.jpg`. *Fix hint: Add a circular concrete patio slab at the foot of the staircase and bench seating on the deck.*
- **Street Shape & Vehicles:** [P2 weak] [OBSERVED] Street visible through side alley shows blank rear of coach. *Fix hint: Add roadside clutter to frame the alleyway sightline.*
- **Lawn Props & Appliance Banks:** [P0 wrong vs reference] [OBSERVED] Yard is vacant grass with a couple of green geometric blocks. Reference BO2-2025 South yard features the futuristic geodesic garden pod, sand pit, and shuffleboard court (`nt2025-aerial-boii.jpg`). *Fix hint: Construct the white spherical/domed garden pod, sand pit with wooden surround, and painted concrete shuffleboard court.*
- **Fences/Yards:** [P0 wrong vs reference] [OBSERVED] Enclosed by unweathered brown timber fence planks. *Fix hint: Update fence texture to painted off-white with age weathering and wood grain normal maps.*
- **Lighting & Time of Day:** [P2 weak] [OBSERVED] Sharp stair shadows fall on yellow wall; sky is overcast/milky. *Fix hint: Introduce warm sunlight highlights and subtle blue ambient sky fill in shadows.*
- **Overall Photoreal Read:** [P0 wrong vs reference] [OBSERVED] Barren yard geometry looks like a greybox layout test rather than a finished arena. *Fix hint: Add ground scatter: grass foliage clumps, decorative patio pavers, and garden pod interior dressing.*

---

### Station 7: `nuketown2-north-balcony`
- **What You See:** [OBSERVED] Elevated perspective standing on the North upper balcony looking down across the backyard lawn toward the perimeter boundary. A concrete dividing wall and simple railing are visible in the foreground, with flat green grass below and pine trees in the distance.
- **House Colour & Material:** [P0 wrong vs reference] [OBSERVED] Balcony connects to cyan/blue siding. Trim around upper doorway is flat untextured white. *Fix hint: Change wall material to cream stucco with bronze anodized window frame finishes.*
- **Garage Side From Spawn:** [P2 weak] [OBSERVED] Garage wing sits opposite the balcony end, consistent with layout rules. *Fix hint: Add roof dressing to garage wing visible from balcony (e.g., barrel vault detailing).*
- **Roofline & Porch/Eave:** [P0 wrong vs reference] [OBSERVED] The balcony is completely exposed to the sky with a flat roof edge above. In reference, the upper deck is tucked under the expressive roof canopy overhang. *Fix hint: Extend the roof overhang over the balcony landing to provide an authentic covered firing perch.*
- **Balcony/Deck & Exterior Stair:** [P2 weak] [OBSERVED] Balcony railing is composed of simple white rectangular posts and top rail. Deck floor is plain grey concrete with no plank texture. *Fix hint: Texture the deck surface with weathered cedar decking boards and add an orange-accented top rail.*
- **Street Shape & Vehicles:** [P2 weak] [OBSERVED] Looking into the backyard; street is not in primary view. *Fix hint: Ensure sightlines from this balcony across the side alley toward enemy spawn are clear.*
- **Lawn Props & Appliance Banks:** [P1 missing] [OBSERVED] The lawn below is a featureless green plane. None of the greenhouse or carport structures are visible. *Fix hint: Install the greenhouse structure in the lawn area directly visible below this balcony.*
- **Fences/Yards:** [P0 wrong vs reference] [OBSERVED] Perimeter wall is a mix of brown wood fence and a plain grey concrete retaining wall. *Fix hint: Unify perimeter fencing to match BO2-2025 styled wooden fence with retro post caps.*
- **Lighting & Time of Day:** [P2 weak] [OBSERVED] Direct harsh light on balcony floor; lack of contact ambient occlusion where balusters meet the deck. *Fix hint: Bake or enable screen-space ambient occlusion (SSAO) on railing geometry.*
- **Overall Photoreal Read:** [P0 wrong vs reference] [OBSERVED] Foreground surfaces lack micro-roughness, making surfaces look like untextured CAD models. *Fix hint: Apply PBR roughness and normal maps to balcony floor and railings.*

---

### Station 8: `nuketown2-garage`
- **What You See:** [OBSERVED] Looking out from inside the garage bay toward the driveway and street. The interior garage walls are clad in bright reddish-orange horizontal planks. Outside on the driveway apron, a white sedan is parked, with the moving truck and yellow house visible across the street.
- **House Colour & Material:** [P0 wrong vs reference] [OBSERVED] Garage interior walls are saturated brick red/orange, while the outer house is blue. In BO2-2025 (`nt2025-street-boii.jpg`), the garage wing is a clean, modern cream box with smooth interior finishes. *Fix hint: Repaint garage interior walls in neutral off-white/light grey drywall with exposed structural studs or tool racks.*
- **Garage Side From Spawn:** [P2 weak] [OBSERVED] Garage opens directly onto the driveway apron facing the street, matching the correct handedness. *Fix hint: Add garage door track runners and overhead torsion spring details.*
- **Roofline & Porch/Eave:** [P0 wrong vs reference] [OBSERVED] Garage ceiling is a flat slab. Reference features iconic three barrel-vault curved roof bays. *Fix hint: Curve the garage ceiling profile to reflect the exterior barrel-vault bays.*
- **Balcony/Deck & Exterior Stair:** [P1 missing] [OBSERVED] Not visible from inside garage bay. *Fix hint: Ensure garage side service door opens cleanly toward rear yard passage.*
- **Street Shape & Vehicles:** [P2 weak] [OBSERVED] White sedan on driveway has rudimentary geometry (cuboid body with cutouts); moving truck across street is a blank white box. *Fix hint: Replace car with detailed 1960s-retro bubble-car model and add moving company logo/livery to truck.*
- **Lawn Props & Appliance Banks:** [P1 missing] [OBSERVED] Grass verge visible outside lacks appliance bank or sidewalk props. *Fix hint: Place red/blue appliance bank visible on the verge just past the garage apron.*
- **Fences/Yards:** [P2 weak] [OBSERVED] Driveway connects smoothly to street asphalt, but lacks expansion joints or oil staining. *Fix hint: Add concrete expansion cuts and localized oil drip decals on the garage floor.*
- **Lighting & Time of Day:** [P2 weak] [OBSERVED] Interior is evenly lit despite being an enclosed bay; light doesn't drop off naturally into the interior corners. *Fix hint: Increase interior shadow occlusion and add interior fluorescent tube light fixtures.*
- **Overall Photoreal Read:** [P0 wrong vs reference] [OBSERVED] Neon red interior walls and blocky car model give a strong unpolished prototype feel. *Fix hint: Neutralize wall colors and detail the garage interior with workbenches, shelves, and tool props.*

---

### Station 9: `nuketown2-south-upper-window`
- **What You See:** [OBSERVED] First-person sniper viewpoint looking out of the upper front window of the Yellow house. The yellow siding and white window sill frame the view, looking directly across the street at the upper window and facade of the Blue house. The white coach bus roof is visible below.
- **House Colour & Material:** [P0 wrong vs reference] [OBSERVED] Window jambs are bright yellow clapboard; opposing house is bright cyan siding. Reference sniper perch frames modernist cream/terracotta architecture. *Fix hint: Recolor foreground window jambs to cream modernist trim and opposing house to off-white.*
- **Garage Side From Spawn:** [P2 weak] [OBSERVED] Cross-street view accurately captures opposing garage on the left side of the enemy facade. *Fix hint: Maintain cross-street competitive sightline balance.*
- **Roofline & Porch/Eave:** [P0 wrong vs reference] [OBSERVED] Opposing house roofline is flat and featureless. In BO2-2025, sniper perches look out under sloping eaves at opposing butterfly/capsule rooflines. *Fix hint: Add the angled roof overhang to frame the sniper view realistically.*
- **Balcony/Deck & Exterior Stair:** [P2 weak] [OBSERVED] Opposing front facade has a small white ledge under its window, but it appears paper-thin. *Fix hint: Deepen opposing under-window sill so players can mantle onto it.*
- **Street Shape & Vehicles:** [P0 wrong vs reference] [OBSERVED] The roof of the coach below is a flat, unadorned white surface. Reference coach has roof AC pods, chrome fluting, and streamlined curved contours. *Fix hint: Detail the bus roof with aerodynamic vents, AC units, and skylight panels.*
- **Lawn Props & Appliance Banks:** [P1 missing] [OBSERVED] Front verges seen below are bare green strips. *Fix hint: Position the color-coded appliance banks clearly visible in the street-level sightline.*
- **Fences/Yards:** [P2 weak] [OBSERVED] Distant perimeter fence and mountains are visible around the opposing house. *Fix hint: Add retro-futuristic backdrop spires and atomic billboards into the distant view.*
- **Lighting & Time of Day:** [P2 weak] [OBSERVED] Window interior is cleanly lit with no specular reflection on window glass pane (glass is completely absent). *Fix hint: Add transparent glass material with subtle Fresnel reflection and dirt smudges.*
- **Overall Photoreal Read:** [P0 wrong vs reference] [OBSERVED] Primary-colored siding directly against pure white frames creates an unmistakable toy-like aesthetic. *Fix hint: Tone down color saturation, add weathered PBR textures, and introduce window glass shaders.*

---

### Station 10: `nuketown2-north-upper-window`
- **What You See:** [OBSERVED] Counterpart sniper perspective looking out from the upper front window of the Blue house across the street to the Yellow house. Siding frames the shot in cyan, looking over the moving truck and car at the yellow second-floor window opposite.
- **House Colour & Material:** [P0 wrong vs reference] [OBSERVED] Foreground jambs are cyan siding; target house is bright yellow. This replicates the BO1 palette rather than BO2-2025. *Fix hint: Reskin foreground to terracotta/orange upper framing and target house to off-white/cream.*
- **Garage Side From Spawn:** [P2 weak] [OBSERVED] Correctly mirrors the south window viewpoint, preserving rotational layout. *Fix hint: Maintain this exact competitive window-to-window angle.*
- **Roofline & Porch/Eave:** [P0 wrong vs reference] [OBSERVED] Target yellow house roof is a flat black slab; lacks the butterfly roofline with solar panels (`nt2025-aerial-boii.jpg`). *Fix hint: Install the butterfly roof with solar panels on the North house.*
- **Balcony/Deck & Exterior Stair:** [P2 weak] [OBSERVED] Target window has a flat white sill but no architectural trim depth. *Fix hint: Add architectural molding and window header details.*
- **Street Shape & Vehicles:** [P0 wrong vs reference] [OBSERVED] Moving truck below is a plain open white container; car beside it is blocky. *Fix hint: Add rolled-up shutter door, taillights, and moving company logo to the truck.*
- **Lawn Props & Appliance Banks:** [P1 missing] [OBSERVED] Front lawns below lack display props and chain-link stanchions. *Fix hint: Place front lawn props to provide visual interest and low cover for grounded players.*
- **Fences/Yards:** [P2 weak] [OBSERVED] Wooden fence visible at the end of the street has repetitive tiling. *Fix hint: Add board variation and weathering to fence slats.*
- **Lighting & Time of Day:** [P2 weak] [OBSERVED] Strong direct illumination on the opposing yellow facade, causing color blowout and clipping. *Fix hint: Adjust tone mapping/exposure to prevent yellow channel clipping on sunlit facades.*
- **Overall Photoreal Read:** [P0 wrong vs reference] [OBSERVED] High saturation and lack of surface detail make this look like an untextured mobile game render. *Fix hint: Apply PBR material maps and realistic environmental reflections.*

---

### Station 11: `nuketown2-south-interior`
- **What You See:** [OBSERVED] Ground-floor interior view of the South house looking through a doorway into a kitchen/living area. Features flat beige walls, a dark brown wood-plank floor, an open ceiling light panel, and a white kitchen counter island. A window at the rear looks out into the sunlit yard.
- **House Colour & Material:** [P2 weak] [OBSERVED] Interior walls are plain, uniform beige drywall; floor is repeating brown planks. Reference interiors in Nuketown 2025 feature sleek retro-futuristic rounded counters, pastel accent walls, and linoleum/terrazzo floors. *Fix hint: Replace generic wood planks with polished retro terrazzo or diamond linoleum tiling; add pastel accent wall paint.*
- **Garage Side From Spawn:** [P2 weak] [OBSERVED] Interior doorway connects to garage breezeway on the appropriate flank. *Fix hint: Add interior door frames and door hardware.*
- **Roofline & Porch/Eave:** [P1 missing] [OBSERVED] Ceiling is a plain flat surface with a square recessed light. *Fix hint: Add modernist ceiling cove lighting or recessed radial light fixtures.*
- **Balcony/Deck & Exterior Stair:** [P1 missing] [OBSERVED] Interior stairwell leading up to second floor is out of view. *Fix hint: Ensure interior staircase has sleek chrome or timber balustrades matching 1960s futurism.*
- **Street Shape & Vehicles:** [P1 missing] [OBSERVED] Exterior view through window is washed out white. *Fix hint: Ensure windows look clearly onto the street/yard with realistic glass tinting.*
- **Lawn Props & Appliance Banks:** [P1 missing] [OBSERVED] Interior kitchen has a single plain white block counter. Lacks kitchen appliances (retro fridge, atomic-age microwave/oven). *Fix hint: Populate kitchen with 1960s futuristic curved refrigerator, oven range, and bar stools.*
- **Fences/Yards:** [P1 missing] [OBSERVED] Yard visible through window shows plain green plane. *Fix hint: Frame garden pod or greenhouse through interior window views.*
- **Lighting & Time of Day:** [P2 weak] [OBSERVED] Interior is illuminated by an unnatural ambient glow; no realistic bounce light from sunny exterior. *Fix hint: Enhance interior indirect GI bounce from sunlit exterior doorways and windows.*
- **Overall Photoreal Read:** [P0 wrong vs reference] [OBSERVED] Interior is sterile and hollow, lacking furniture, props, and lived-in set-dressing. *Fix hint: Add atomic-era living room furniture (boomerang coffee table, retro sofa, TV console).*

---

### Station 12: `nuketown2-north-interior`
- **What You See:** [OBSERVED] Ground-floor interior of the North house, nearly identical to the South interior. Beige walls, wood plank floor, white counter island, and an open doorway into the kitchen. A blue crown molding strip runs along the ceiling of the adjacent room.
- **House Colour & Material:** [P2 weak] [OBSERVED] Identical beige walls and dark plank floor as the South house. Lacks unique interior identity. *Fix hint: Differentiate North house interior with warm orange/terracotta accent walls and atomic-era wallpaper.*
- **Garage Side From Spawn:** [P2 weak] [OBSERVED] Doorway leads to the North garage wing. *Fix hint: Add garage access door with brass handle.*
- **Roofline & Porch/Eave:** [P1 missing] [OBSERVED] Flat ceiling with basic blue molding strip. *Fix hint: Replace generic molding with modernist recessed light coves.*
- **Balcony/Deck & Exterior Stair:** [P1 missing] [OBSERVED] Stair to upper floor is not visible. *Fix hint: Add visible architectural staircase with open risers.*
- **Street Shape & Vehicles:** [P1 missing] [OBSERVED] Window views are blown out to white. *Fix hint: Balance interior/exterior exposure with tone mapping.*
- **Lawn Props & Appliance Banks:** [P1 missing] [OBSERVED] Kitchen counter is a featureless white box. *Fix hint: Add retro sink fixtures, stainless steel appliances, and cupboards.*
- **Fences/Yards:** [P1 missing] [OBSERVED] Yard view through rear door is barren. *Fix hint: Frame backyard greenhouse through rear door.*
- **Lighting & Time of Day:** [P2 weak] [OBSERVED] Flat interior lighting with minimal shadow contrast under counters. *Fix hint: Bake contact shadows under cabinets and furniture.*
- **Overall Photoreal Read:** [P0 wrong vs reference] [OBSERVED] Empty architectural shell that feels unfinished. *Fix hint: Dress the interior with atomic-age set props: rotary phone, wall clock, dishes, and lounge seating.*

---

### Station 13: `nuketown2-coach-elevation`
- **What You See:** [OBSERVED] Eye-level elevation view looking across the street at the side profile of the tour coach bus. In the foreground, the rear of the moving truck sits on the left, a street signpost stands in the center, and a green hedge box sits on the right. The blue house upper floor is visible behind the coach.
- **House Colour & Material:** [P0 wrong vs reference] [OBSERVED] Background blue house has bright cyan siding and plain rectangular windows. *Fix hint: Update house facade to off-white/cream paneling.*
- **Garage Side From Spawn:** [P2 weak] [OBSERVED] Garage wing visible in background behind fence. *Fix hint: Detail garage fascia board.*
- **Roofline & Porch/Eave:** [P0 wrong vs reference] [OBSERVED] House roofline behind coach is a flat line with no eaves. *Fix hint: Add characteristic modernist sloping roofline.*
- **Balcony/Deck & Exterior Stair:** [P1 missing] [OBSERVED] Balcony is occluded by coach body. *Fix hint: Ensure roofline geometry reads clearly over vehicle silhouettes.*
- **Street Shape & Vehicles:** [P0 wrong vs reference] [OBSERVED] The coach is an untextured off-white boxy bus with a continuous dark tinted window band and a purple bumper. It lacks the distinctive cream-and-maroon two-tone paint scheme, streamlined aerodynamic curves, front overhang, and retro lettering of the BO2-2025 Nuketown tour bus (`nt2025-aerial-boii.jpg`, `nt2025-loadscreen-boii.png`). *Fix hint: Resculpt coach body with aerodynamic rounded roof, chrome side trim, two-tone cream and maroon livery, and "Nuketown 2025" side graphics.*
- **Lawn Props & Appliance Banks:** [P1 missing] [OBSERVED] Foreground features a plain white signpost with no text and a solid green block hedge. *Fix hint: Texture signpost with retro street names (e.g., "Trinity Ave") and replace block hedge with foliage mesh.*
- **Fences/Yards:** [P0 wrong vs reference] [OBSERVED] Brown vertical plank fence in background looks like standard residential privacy fence. *Fix hint: Replace with white retro picket or horizontal louvred fencing.*
- **Lighting & Time of Day:** [P2 weak] [OBSERVED] Hard shadow cast by truck trailer onto ground and coach side, but vehicle paint lacks glossy clearcoat reflections. *Fix hint: Increase vehicle paint metallic/specular reflectivity to reflect sky and ground.*
- **Overall Photoreal Read:** [P0 wrong vs reference] [OBSERVED] Coach appears as an untextured CAD asset rather than an in-world vehicle. *Fix hint: Add PBR vehicle materials: glass reflection/refraction, rubber tyres, chrome bumpers, and paint coat.*

---

### Station 14: `nuketown2-truck-cab-near`
- **What You See:** [OBSERVED] Tight close-up on the cab of the moving truck and a stack of cargo boxes in the street. A white sedan is parked on the left, the coach bus is behind it, and the bright yellow house facade towers on the right behind a low concrete wall and red fire hydrant.
- **House Colour & Material:** [P0 wrong vs reference] [OBSERVED] Yellow house facade is blindingly bright with uniform lap siding. White trim bands are flat. *Fix hint: Convert yellow facade to burnt orange upper and cream stucco lower.*
- **Garage Side From Spawn:** [P2 weak] [OBSERVED] Yellow house garage is adjacent to the driveway apron. *Fix hint: Add garage entrance frame and apron texture.*
- **Roofline & Porch/Eave:** [P0 wrong vs reference] [OBSERVED] Yellow house roof edge has a dark coping but no overhang or solar panels. *Fix hint: Add solar panel array visible along the roofline.*
- **Balcony/Deck & Exterior Stair:** [P2 weak] [OBSERVED] Upper front window has a simple ledge; lacks architectural mantle depth. *Fix hint: Ensure window sill depth complies with mantle height constants.*
- **Street Shape & Vehicles:** [P0 wrong vs reference] [OBSERVED] Moving truck cab has an angular, faceted geometric shape with circular headlights and flat windshield, completely untextured white with a purple bumper. In BO2-2025, the truck is a detailed retro-futuristic box van with dark cab and chrome grille. *Fix hint: Model retro cab curves, chrome grille, windshield wipers, and two-tone cab paint.*
- **Lawn Props & Appliance Banks:** [P2 weak] [OBSERVED] A red fire hydrant stands by a low white wall, but appliance banks are absent. *Fix hint: Add the red appliance console on the grass verge behind the low wall.*
- **Fences/Yards:** [P2 weak] [OBSERVED] Low white retaining wall separates street from lawn; edge is sharp and untextured. *Fix hint: Add concrete texture with bevelled top chamfer.*
- **Lighting & Time of Day:** [P2 weak] [OBSERVED] Bright sun on truck cab creates harsh contrast; cargo boxes have hard sharp shadows. *Fix hint: Soften shadow penumbra for distant sun simulation.*
- **Overall Photoreal Read:** [P0 wrong vs reference] [OBSERVED] Faceted low-poly vehicle cab and untextured cargo boxes severely degrade scene photorealism. *Fix hint: Increase polygon count on truck cab curves and apply textured cardboard/wood grain to cargo boxes.*

---

### Station 15: `nuketown2-vehicle-near`
- **What You See:** [OBSERVED] Medium shot focusing on the white 4-door sedan parked between the moving truck and the coach bus. Stacked geometric boxes sit beside the car, with the yellow house in the background right and the wooden fence and trees in the background left.
- **House Colour & Material:** [P0 wrong vs reference] [OBSERVED] Yellow house siding is visible on the upper right; flat color with no ambient shading. *Fix hint: Apply terracotta orange texture map to upper siding.*
- **Garage Side From Spawn:** [P2 weak] [OBSERVED] Positioned correctly relative to yellow house driveway. *Fix hint: Retain vehicle spacing for competitive cover.*
- **Roofline & Porch/Eave:** [P0 wrong vs reference] [OBSERVED] Flat roofline visible against sky. *Fix hint: Incorporate butterfly roof profile.*
- **Balcony/Deck & Exterior Stair:** [P1 missing] [OBSERVED] Occluded by vehicle bodies. *Fix hint: Maintain vehicle cover heights.*
- **Street Shape & Vehicles:** [P0 wrong vs reference] [OBSERVED] The car is a boxy white sedan with simple circular headlights and dark glass. In BO2-2025 reference (`nt2025-aerial-boii.jpg`), the vehicle parked beside the moving truck is a sleek dark blue saloon with chrome accents and bubble-glass cabin. *Fix hint: Resculpt car into a 1960s retro-futuristic bubble saloon and paint it dark metallic blue with chrome bumpers and white-wall tyres.*
- **Lawn Props & Appliance Banks:** [P1 missing] [OBSERVED] Sidewalk verge props are out of frame or missing. *Fix hint: Ensure sidewalk curb is clearly defined with painted white curb line.*
- **Fences/Yards:** [P2 weak] [OBSERVED] Background wooden fence has repetitive planks. *Fix hint: Add variation in plank height and stain.*
- **Lighting & Time of Day:** [P2 weak] [OBSERVED] Strong under-car shadow grounding the vehicle, but tyres lack tread texture and wheel rims are flat beige discs. *Fix hint: Model 3D wheel rims, tyre tread geometry, and add ambient occlusion in wheel wells.*
- **Overall Photoreal Read:** [P0 wrong vs reference] [OBSERVED] Primitive car geometry and untextured cargo blocks look like placeholder test meshes. *Fix hint: Replace car model with production-grade retro-futuristic vehicle asset.*

---

### Station 16: `nuketown2-vehicle-mid`
- **What You See:** [OBSERVED] Front three-quarter view of the coach bus parked on the street. The corrugated wall of the moving truck trailer is on the right, and the sidewalk with grass verge, bollards, red hydrant, and wooden fence is on the left. The front windshield of the coach reflects dark glass.
- **House Colour & Material:** [P2 weak] [OBSERVED] Sliver of yellow house siding peeks over the truck trailer on the far right. *Fix hint: Update siding color to terracotta.*
- **Garage Side From Spawn:** [P2 weak] [OBSERVED] Sits on the right flank as expected. *Fix hint: Maintain layout alignment.*
- **Roofline & Porch/Eave:** [P1 missing] [OBSERVED] Rooflines obscured by vehicle volume. *Fix hint: Ensure vehicle heights do not exceed reference sightlines.*
- **Balcony/Deck & Exterior Stair:** [P1 missing] [OBSERVED] Not visible from this camera angle. *Fix hint: Ensure sightlines beneath coach windows maintain head-glitch parity.*
- **Street Shape & Vehicles:** [P0 wrong vs reference] [OBSERVED] Front of coach has a strange pinched windshield geometry and two circular headlight indentations on a blank white nose. It lacks the chrome grille, front destination sign, wipers, and iconic cream/maroon styling of BO2-2025. *Fix hint: Rebuild coach front with retro chrome grille, illuminated destination marquee ("NUKETOWN"), chrome mirrors, and curved panoramic windshield.*
- **Lawn Props & Appliance Banks:** [P2 weak] [OBSERVED] Concrete bollards and red hydrant on left lawn verge are simple extrusions. *Fix hint: Detail hydrant with side nozzles and valve nuts; round off bollard tops.*
- **Fences/Yards:** [P2 weak] [OBSERVED] Wooden fence runs along sidewalk edge. *Fix hint: Add post caps and weathered texture.*
- **Lighting & Time of Day:** [P2 weak] [OBSERVED] Deep shadow cast across the street by the coach, but the shadow edge is razor-sharp with no contact penumbra softening. *Fix hint: Enable soft shadow filtering for directional sun light.*
- **Overall Photoreal Read:** [P0 wrong vs reference] [OBSERVED] Coach nose looks like an unfinished polygonal sculpt. *Fix hint: Smooth vertex normals on coach nose and apply automotive PBR shader.*

---

### Station 17: `nuketown2-vehicle-far`
- **What You See:** [OBSERVED] Wide establishing shot from the street centreline looking between the two houses toward the rear of the coach bus and the cul-de-sac fence. The Yellow house with its red carport is on the left; the Blue house with its front canopy and white sedan is on the right. Green hedges and lawn tufts flank the roadway.
- **House Colour & Material:** [P0 wrong vs reference] [OBSERVED] The primary Yellow and Cyan house colors dominate the entire frame, firmly anchoring the visual presentation in BO1 tract aesthetics rather than BO2-2025 retro-futurism. *Fix hint: Completely restyle both house exteriors: North house to terracotta orange upper over cream base; South house to off-white/cream modernist capsules with subtle blue accents.*
- **Garage Side From Spawn:** [P0 wrong vs reference] [OBSERVED] Yellow house garage on left is an open red brick carport; blue house garage on right is a white carport alcove with parked car. Reference requires solid cream garage wings with 3 dark barrel-vault bays. *Fix hint: Replace open carports with enclosed cream garage wings featuring three dark barrel-vault roof bays.*
- **Roofline & Porch/Eave:** [P0 wrong vs reference] [OBSERVED] Both houses exhibit flat asphalt roofs. BO2-2025's dramatic architectural skyline—butterfly roof with solar array on North house, capsule roof on South house—is completely absent. *Fix hint: Construct the butterfly roof and solar panels on the North house and capsule roofs on the South house.*
- **Balcony/Deck & Exterior Stair:** [P2 weak] [OBSERVED] Upper front windows and small ledges are visible, but lack architectural framing and depth. *Fix hint: Add pronounced window hoods and mantlable ledges.*
- **Street Shape & Vehicles:** [P0 wrong vs reference] [OBSERVED] Road is a straight asphalt strip ending at a flat fence. No circular turning head, no third house beyond the fence, and vehicles are plain white boxes. *Fix hint: Add the circular cul-de-sac turning head, place the third house beyond the rear fence, and skin vehicles with authentic BO2-2025 liveries.*
- **Lawn Props & Appliance Banks:** [P1 missing] [OBSERVED] Front lawns feature green block hedges and grass tufts, but neither color-coded appliance console is present. *Fix hint: Install the red-topped appliance console on the left lawn and the blue-topped console on the right lawn.*
- **Fences/Yards:** [P0 wrong vs reference] [OBSERVED] Straight wooden fence seals off the cul-de-sac end; low-poly conical pine trees sit on sand dunes behind it. Reference features retro perimeter walls with views of futuristic dome and saucer tower. *Fix hint: Replace pine trees with the retro-futuristic backdrop: geodesic dome, futuristic needle tower, and atomic billboards.*
- **Lighting & Time of Day:** [P2 weak] [OBSERVED] Sun glints off the top of the bus rear, but environmental lighting lacks the warm atmospheric dust/haze of the Nevada test site. *Fix hint: Add atmospheric warm desert haze and subtle bloom on sunlit vehicle surfaces.*
- **Overall Photoreal Read:** [P0 wrong vs reference] [OBSERVED] The scene reads as a colorful low-poly blockout rather than a faithful rebuild of BO2 Nuketown 2025. *Fix hint: Execute a systematic material and asset replacement pass to bring geometry, PBR textures, and dressing up to BO2-2025 reference standards.*

---

## 3. Reference Scorecard (Against BO2-2025 Reference Target)

| Category | Score | Max | Justification (One Line) |
|---|:---:|:---:|---|
| **Layout Fidelity** | **11** | 25 | [OBSERVED] Rotational house orientation and vehicle positions are correct, but the road is a straight strip lacking the circular turning head and the third house beyond the cul-de-sac. |
| **Material & Texture Read** | **7** | 25 | [OBSERVED] Houses use flat primary yellow and cyan lap siding (BO1 style) rather than BO2-2025's terracotta/cream modernist panels, while vehicles and interiors are flat untextured white/beige. |
| **Lighting & Atmosphere** | **10** | 20 | [OBSERVED] Directional sun and hard shadows are functional, but the lighting is sterile and cold, lacking the warm hazy Nevada desert sunlight, soft penumbra, and PBR specular bounce. |
| **Dressing Density** | **4** | 15 | [OBSERVED] Missing all signature BO2-2025 props: color-coded lawn appliance banks, greenhouse, curved carport, garden pod dome, shuffleboard court, sand pit, and retro skyline. |
| **Technical Hygiene** | **11** | 15 | [OBSERVED] Clean geometric meshes with zero visible Z-fighting or coplanar tearing, and consistent collision hulls, but compromised by low-poly pine trees and untextured placeholder boxes. |
| **TOTAL** | **43** | **100** | **Critical divergence from BO2-2025 target; currently reflects an early blockout of BO1 tract housing rather than the retro-futuristic Nuketown 2025 show-town.** |

---

## 4. Top Three Changes to Move the Score Most

1. **Repaint and Reskin Both Houses to BO2-2025 Modernist Architecture (+22 pts)**
   - *OBSERVED Defect:* The houses currently use bright yellow and cyan horizontal siding with flat asphalt roofs, copying the original 1950s Black Ops 1 tract houses.
   - *Reference Grounding:* In BO2-2025 (`nt2025-aerial-boii.jpg`, `nt2025-street-boii.jpg`), House A is terracotta/burnt orange upper siding over a cream ground floor under a pale butterfly roof with 6 dark solar panels and a cream 3-barrel-vault garage; House B is off-white/cream modernist rounded capsules with pale blue-grey glazing.
   - *Actionable Fix:* Reskin the North house with terracotta orange (`#C85A32`) upper siding and cream base, and install the butterfly roof with solar panels; reskin the South house in off-white/cream with rounded capsule roof geometry; rebuild garage wings as cream boxes with dark barrel-vault roofs.

2. **Construct the Lollipop Cul-de-Sac Turning Head & Third House Beyond Fence (+16 pts)**
   - *OBSERVED Defect:* The street is currently a dead-straight rectangular asphalt corridor ending abruptly at a plain wooden fence with generic pine trees.
   - *Reference Grounding:* BO2-2025 reference (`nt2025-aerial-boii.jpg`, `nt2025-minimap-boii.png`) verifies a circular kerbed turning head terminating the street, with a prominent dark-roofed third house, private driveway, and red car sitting beyond the cul-de-sac fence.
   - *Actionable Fix:* Model the circular turning head at the end of the street, position the tour coach on the North house side of the head, and add the exterior third house landmark with its driveway and red vehicle beyond the boundary fence.

3. **Deploy the Signature Chirality & Backyard Dressing Props (+12 pts)**
   - *OBSERVED Defect:* Lawns and backyards are empty green expanses with abstract green box hedges, missing all thematic set-dressing.
   - *Reference Grounding:* BO2-2025 reference establishes specific non-interchangeable props: color-coded 3-unit kitchen appliance banks on front lawns (red tops on North lawn, blue tops on South lawn), an arched greenhouse and curved-roof carport in the North yard, and a white garden pod dome, sand pit, and shuffleboard court in the South yard.
   - *Actionable Fix:* Model and place the red and blue appliance banks on their respective front verges; populate the North backyard with the greenhouse and curved carport; populate the South backyard with the white garden pod, sand pit, and shuffleboard court.

---
*End of Reference Critic Review - Candidate 3*
