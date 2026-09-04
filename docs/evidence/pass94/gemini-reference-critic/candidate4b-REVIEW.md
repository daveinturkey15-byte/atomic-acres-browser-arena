# Nuke Town Rebuild (nuketown2) - Reference-Grounded Render Critic Review: Candidate 4b [OBSERVED]

- **Critic Agent:** GEM-5 (Gemini 3.8 Flash reference critic via OMP) [OBSERVED]
- **Target Specification:** Call of Duty: Black Ops II - *Nuketown 2025* (**BO2-2025**) as documented in `docs/references/nuketown-2025/FINDINGS.md` and `manifest.json`. [OBSERVED]
- **Primary Reference Images:** `img/nt2025-street-boii.jpg`, `img/nt2025-aerial-boii.jpg`, `img/nt2025-sniper-boii.jpg`, `img/nt2025-hero-boii.png`, `img/nt2025-loadscreen-boii.png`, `img/nt2025-minimap-boii.png`. [OBSERVED]
- **Candidate Captures Directory:** `C:/Users/david/projects/aa-claude-hitl/docs/evidence/pass94/candidate4b/captures/nuketown2/` (Pass 94 candidate 4b). [OBSERVED]
- **Evaluation Date:** 2026-09-04 [OBSERVED]

---

## 1. Human Verification Receipts (Prominent Colours & House Counts) [OBSERVED]

*Evaluated across all 26 captures (12 primary stations and 14 detail captures) in candidate 4b.* [OBSERVED]

| Capture / Station File | Two Most Prominent Colours | Number of Houses Visible | Verification Confirmation |
|---|---|:---:|---|
| `nuketown2-overhead.png` | Lawn Green, Terracotta Orange | 3 | [OBSERVED] Orthographic aerial showing North orange house, South off-white house, and Third House beyond fence. |
| `nuketown2-street-centre.png` | Terracotta Orange, Off-White / Cream | 2 | [OBSERVED] Road centerline view showing orange house (right), off-white house (left), and coach bus. |
| `nuketown2-into-sun-street.png` | Warm Gold / Yellow, Sky Blue | 2 | [OBSERVED] Backlit street perspective looking into sun; orange house right, off-white house left. |
| `nuketown2-front-porch.png` | Terracotta Orange, Crisp White | 1 | [OBSERVED] Tight perspective under orange house cantilevered canopy, parked white sedan in driveway. |
| `nuketown2-north-yard.png` | Off-White / Cream, Lawn Green | 2 | [OBSERVED] North yard camera facing rear of off-white house; orange house corner visible across street. |
| `nuketown2-south-yard.png` | Terracotta Orange, Lawn Green | 2 | [OBSERVED] South yard camera facing rear of orange house; off-white house roofline visible across street. |
| `nuketown2-north-upper-window.png` | Terracotta Orange, Crisp White | 2 | [OBSERVED] Framed inside orange upper window looking across street at off-white house facade. |
| `nuketown2-south-upper-window.png` | Crisp White, Terracotta Orange | 2 | [OBSERVED] Framed inside off-white upper window looking across street at orange house facade. |
| `nuketown2-garage.png` | Orange-Red, Off-White / Cream | 2 | [OBSERVED] Interior of orange garage looking out at white sedan and off-white house across street. |
| `nuketown2-north-balcony.png` | Terracotta Orange, Timber Brown | 1 | [OBSERVED] Close elevated framing on rear balcony deck, floating stairs, and orange upper facade. |
| `nuketown2-south-interior.png` | Warm Cream / Beige, Timber Brown | 1 | [OBSERVED] Ground-floor interior with wood flooring, beige walls, and kitchen counter opening. |
| `nuketown2-north-interior.png` | Warm Cream / Beige, Timber Brown | 1 | [OBSERVED] Ground-floor interior of opposite house with matching wood flooring and kitchen island. |
| `nuketown2-coach-elevation.png` | Off-White / Cream, Dark Charcoal | 1 | [OBSERVED] Elevation profile of coach bus with orange house upper facade and roof visible above. |
| `nuketown2-truck-cab-near.png` | Off-White / Cream, Terracotta Orange | 1 | [OBSERVED] Close perspective on coach front, red lawn appliance bank, and orange house entrance. |
| `nuketown2-vehicle-near.png` | Off-White / Cream, Asphalt Grey | 1 | [OBSERVED] Street view focused on parked white sedans, truck cargo box, and off-white house facade. |
| `nuketown2-vehicle-mid.png` | Off-White / Cream, Asphalt Grey | 1 | [OBSERVED] Mid street framing of white sedans, coach bus, truck trailer, and off-white house. |
| `nuketown2-vehicle-far.png` | Terracotta Orange, Off-White / Cream | 2 | [OBSERVED] Street view looking toward fence; orange house right with red appliance bank, off-white house left. |
| `nuketown2-appliance-bank-north-close.png` | Bright Red, Crisp White | 1 | [OBSERVED] Close macro capture of red 3-unit kitchen appliance console on orange house front lawn. |
| `nuketown2-appliance-bank-south-close.png` | Sky Blue, Crisp White | 1 | [OBSERVED] Close macro capture of blue 3-unit kitchen appliance console on off-white house front lawn. |
| `nuketown2-glasshouse-north-close.png` | Lawn Green, Timber Red-Brown | 1 | [OBSERVED] Backyard perspective with circular stepping stones, vertical wooden fence, and white shed corner. |
| `nuketown2-garden-pod-north-close.png` | Lawn Green, Timber Red-Brown | 0 | [OBSERVED] Close framing of sand pit box, shuffleboard lines on lawn, and open doorway hole in fence. |
| `nuketown2-sand-pit-north-close.png` | Concrete Cream, Timber Red-Brown | 0 | [OBSERVED] Perspective down paved boundary path showing retaining wall and vertical timber perimeter. |
| `nuketown2-driveway-apron-close.png` | Crisp White, Vibrant Orange | 1 | [OBSERVED] Driveway apron shot showing white sedan parked in front of open orange garage bay. |
| `nuketown2-border-path-close.png` | Timber Red-Brown, Lawn Green | 0 | [OBSERVED] Boundary turf strip along perimeter timber fence with sharp diagonal sunlight shadow. |
| `nuketown2-perimeter-wall-long-close.png` | Timber Red-Brown, Forest Green | 0 | [OBSERVED] Long view along the vertical timber fence line toward background low-poly pines. |
| `nuketown2-perimeter-wall-end-close.png` | Concrete Cream, Timber Red-Brown | 0 | [OBSERVED] Paved perimeter pathway terminating at corner of vertical timber privacy fence. |

---

## 2. Station-by-Station Detailed Evaluations (12 Primary Stations) [OBSERVED]

### Station 1: `nuketown2-overhead` [OBSERVED]
- **What You See:** [OBSERVED] A full top-down orthographic plan view framing the entire playable arena and surrounding boundary fences. The North house is finished in terracotta orange upper walls over a white ground floor, while the South house is rendered in off-white. The third house landmark is clearly visible beyond the cul-de-sac boundary fence with its private driveway and parked vehicle.
- **House Colour & Material:** [P2 weak] [OBSERVED] Major improvement over Candidate 3: North house displays terracotta orange upper siding over a white lower storey, and South house is off-white, properly moving away from the BO1 yellow/cyan tract palette. However, both houses still use uniform horizontal lap siding rather than BO2-2025's smooth architectural panels, stucco ground floor, and rounded modernist capsule volumes. *Fix hint: Refine North house upper floor into vertical grooved terracotta panels (`#C85A32`) over a smooth cream stucco base, and model South house as dual rounded modernist capsule volumes (`nt2025-aerial-boii.jpg`).* [INFERRED]
- **Garage Side From Spawn:** [P2 weak] [OBSERVED] Chirality is correct: facing each house from its own backyard spawn, the garage wing sits on the right. However, the garage roof geometry is rendered as flat or simple pitched roofs rather than the iconic dark barrel-vault curved bays. *Fix hint: Replace generic garage roofs with two dark ribbed barrel-vault / wave roof caps over a solid cream masonry box (`nt2025-street-boii.jpg`).* [INFERRED]
- **Roofline & Porch/Eave:** [P0 wrong vs reference] [OBSERVED] Both houses exhibit predominantly flat rectangular roof planes with dark trim. In BO2-2025 (`nt2025-street-boii.jpg`, `nt2025-aerial-boii.jpg`), the North house features an iconic swooping butterfly / ski-jump roof carrying six dark solar panels, while the South house features rounded capsule roofs with pale blue-grey glazing. *Fix hint: Model the upward-raked butterfly roof sweep with 6 solar panels on the North house, and curved capsule roofs with blue-grey solar glazing on the South house.* [INFERRED]
- **Balcony/Deck & Exterior Stair:** [P2 weak] [OBSERVED] Rear balconies with wooden decking are present on both houses. The circular stepping stones and patio areas are roughed in, but the stair flight lacks structural stringers and balustrades. *Fix hint: Add wooden handrails, stringers, and a circular concrete patio disc at the stair foot (`nt2025-street-boii.jpg`).* [INFERRED]
- **Street Shape & Vehicles:** [P0 wrong vs reference] [OBSERVED] The third house landmark beyond the cul-de-sac fence is a major positive addition. However, the roadway remains a rectangular corridor without the circular kerbed turning circle that forms the lollipop cul-de-sac. *Fix hint: Construct the circular turning head kerb around the coach parking area and add the curved kerb return into the road stem (`nt2025-aerial-boii.jpg`).* [INFERRED]
- **Lawn Props & Appliance Banks:** [P2 weak] [OBSERVED] Both red and blue appliance banks are now placed on their respective front lawns, properly anchoring team chirality. However, front lawns lack the fan-shaped ornamental desert shrubs, chain-and-post verge stanchions, and manhole covers visible in the reference aerial. *Fix hint: Add white chain-and-post lawn perimeter stanchions and fan-shaped desert succulents along the sidewalk.* [INFERRED]
- **Fences/Yards:** [P2 weak] [OBSERVED] Backyards now feature the garden pod, sand pit box, shuffleboard markings, and glasshouse outline. The perimeter fence is uniform vertical timber boards rather than retro-futuristic boundary walls with atomic motif panels. *Fix hint: Replace raw vertical timber planks with retro horizontal slatted fences and add atomic-era boundary walls.* [INFERRED]
- **Lighting & Time of Day:** [P2 weak] [OBSERVED] Clear overhead lighting provides crisp shadows, but the scene lacks warm atmospheric scattering and ambient fill in shaded crevices. *Fix hint: Warm directional sun color slightly toward pale amber and add soft sky ambient bounce.* [INFERRED]
- **Overall Photoreal Read:** [P2 weak] [OBSERVED] Substantial layout and color progress over Candidate 3, but the planar roofs and boxy vehicles still read as a blockout. *Fix hint: Integrate curved architectural roof geometry and PBR surface normal maps on asphalt and turf.* [INFERRED]

---

### Station 2: `nuketown2-street-centre` [OBSERVED]
- **What You See:** [OBSERVED] Looking down the street centerline between the two houses toward the rear fence. The orange house with its white lower floor, porch canopy, and red appliance bank is prominent on the right. The off-white house sits on the left, with the white coach bus and moving truck parked in the center road.
- **House Colour & Material:** [P2 weak] [OBSERVED] The terracotta orange upper floor over white lower floor provides a convincing primary read for House A. However, the horizontal lap siding looks like rustic wood siding rather than retro-futuristic composite architectural panels. *Fix hint: Replace clapboard siding with smooth architectural composite panels and large ribbon picture windows with aluminum mullions.* [INFERRED]
- **Garage Side From Spawn:** [P2 weak] [OBSERVED] Garage wing is positioned on the correct flank, but its exterior finish lacks architectural distinction from the main house. *Fix hint: Clad the garage wing in cream stucco with two roll-up doors and utility meter boxes on the apron.* [INFERRED]
- **Roofline & Porch/Eave:** [P0 wrong vs reference] [OBSERVED] Rooflines over both houses are flat parapet edges against the sky. BO2-2025 requires the dramatic forward-raked roof overhang and solar panel array. *Fix hint: Extend the roof eaves outward over the front facade and pitch the North roof into its characteristic ski-jump curve.* [INFERRED]
- **Balcony/Deck & Exterior Stair:** [P2 weak] [OBSERVED] Rear stairs and balconies are occluded from this central street view, which is consistent with reference sightlines. *Fix hint: Ensure upper front windows provide clear, readable mantle perches for street sightlines.* [INFERRED]
- **Street Shape & Vehicles:** [P0 wrong vs reference] [OBSERVED] The street asphalt is a clean, featureless grey plane with no lane striping, crosswalks, oil stains, or kerb drainage. The coach bus is a boxy white asset with a purple bumper rather than the streamlined cream-and-maroon Nuketown tour bus. *Fix hint: Add painted street markings, round the coach roof corners, and texture the coach in two-tone cream and maroon with chrome trim (`nt2025-loadscreen-boii.png`).* [INFERRED]
- **Lawn Props & Appliance Banks:** [P2 weak] [OBSERVED] The red-topped appliance bank is clearly visible on the right lawn, which is a major positive addition. However, it lacks the detailed stainless steel control dials and digital displays visible in reference `nt2025-sniper-boii.jpg`. *Fix hint: Apply an emissive/metallic front texture to the appliance bank representing oven dials, digital timer, and stove controls.* [INFERRED]
- **Fences/Yards:** [P0 wrong vs reference] [OBSERVED] The backdrop behind the street fence consists of low-poly conical pine trees and generic mountains. BO2-2025 features the "City of the Future" retro-futuristic skyline: geodesic dome, space needle / saucer spire, and futuristic pavilion (`nt2025-loadscreen-boii.png`). *Fix hint: Replace backdrop pine trees with distant 3D/billboard retro-futuristic landmarks (geodesic dome, spire tower, flying saucer).* [INFERRED]
- **Lighting & Time of Day:** [P2 weak] [OBSERVED] Direct sun casts clean shadows, but the asphalt lacks specular roughness variation and road reflections. *Fix hint: Add a specular/roughness map to the asphalt to catch sun glint at shallow grazing angles.* [INFERRED]
- **Overall Photoreal Read:** [P2 weak] [OBSERVED] Color-coding and prop placement have dramatically improved, but untextured vehicle hulls and flat roofs prevent a photoreal read. *Fix hint: Apply authentic PBR materials to the coach bus, passenger cars, and house facades.* [INFERRED]

---

### Station 3: `nuketown2-into-sun-street` [OBSERVED]
- **What You See:** [OBSERVED] Looking directly down the roadway into the sun, which hangs low above the distant mountains. The orange house facade and red appliance bank on the right catch warm direct sunlight and cast elongated diagonal shadows. The off-white house on the left is partially shaded, while the coach bus dominates the central vista.
- **House Colour & Material:** [P2 weak] [OBSERVED] The warm amber sunlight highlights the terracotta orange upper siding nicely. The lower floor white siding reflects warm bounce light, but the materials remain matte and diffuse without PBR sheen. *Fix hint: Add subtle gloss and normal mapping to facade panels to catch directional sun highlights.* [INFERRED]
- **Garage Side From Spawn:** [P2 weak] [OBSERVED] Right-hand garage placement is consistent with rotational layout requirements. *Fix hint: Add an exterior light fixture above the garage door lintel.* [INFERRED]
- **Roofline & Porch/Eave:** [P0 wrong vs reference] [OBSERVED] The front porch canopy on the orange house is a clean cantilevered slab, which correctly eliminates the unrealistic posts from Candidate 3. However, the main roofline remains a flat horizontal edge. *Fix hint: Pitch the roof upward toward the front eave to create the iconic cantilevered butterfly prow.* [INFERRED]
- **Balcony/Deck & Exterior Stair:** [P2 weak] [OBSERVED] Front second-story windows have simple white frames, but lack the pronounced architectural window hoods and deep sills seen in `nt2025-sniper-boii.jpg`. *Fix hint: Recess window glass 0.25 m into the wall and add an architectural overhang hood above the upper window.* [INFERRED]
- **Street Shape & Vehicles:** [P0 wrong vs reference] [OBSERVED] The coach bus has a simple flat windshield and rectangular passenger windows with purple lower body trim. In BO2-2025, the tour coach has panoramic curved wrap-around glass, chrome bumpers, and fluted lower aluminum cladding. *Fix hint: Model curved windshield glass, chrome side mirrors, and fluted chrome lower panels on the coach.* [INFERRED]
- **Lawn Props & Appliance Banks:** [P2 weak] [OBSERVED] The red appliance bank on the right lawn is prominent in the foreground. It sits on the turf behind a low masonry retaining wall, matching reference positioning. *Fix hint: Add chrome stove burner rings to the red top surface and model front cabinet seams.* [INFERRED]
- **Fences/Yards:** [P0 wrong vs reference] [OBSERVED] Background mountains are low-polygon geometric meshes with visible faceted edges. *Fix hint: Smooth background mountain normal shading and apply a warm atmospheric haze layer to obscure geometric faceting.* [INFERRED]
- **Lighting & Time of Day:** [P2 weak] [OBSERVED] The golden hour sun direction provides good dramatic mood, but there is zero lens flare or bloom around the sun disc and vehicle rooflines. *Fix hint: Add subtle bloom and lens flare on high-luminance specular highlights.* [INFERRED]
- **Overall Photoreal Read:** [P2 weak] [OBSERVED] The lighting direction is effective, but faceted backdrop mountains and primitive vehicle meshes break visual immersion. *Fix hint: Subdivide background mountain geometry and refine vehicle curved silhouettes.* [INFERRED]

---

### Station 4: `nuketown2-front-porch` [OBSERVED]
- **What You See:** [OBSERVED] A close-up camera angle positioned near the front porch entrance of the orange house. The cantilevered porch canopy extends over a concrete entrance slab, flanked by trimmed green hedges and a low cinder block retaining wall. A white sedan is parked in the driveway on the right, and the coach bus is visible on the left.
- **House Colour & Material:** [P2 weak] [OBSERVED] The two-tone palette is clearly evident: terracotta orange horizontal siding on the upper storey, crisp white siding on the ground floor. However, the siding texture is flat and lacks real mortar joints, wood grain, or panel seam depth. *Fix hint: Introduce high-resolution PBR normal maps for the siding seams and add a natural stone veneer base around the ground floor foundation.* [INFERRED]
- **Garage Side From Spawn:** [P2 weak] [OBSERVED] Driveway and parked car sit to the right of the porch, correctly reflecting the right-hand garage orientation. *Fix hint: Add concrete expansion joint scoring and tyre scuff marks to the driveway slab.* [INFERRED]
- **Roofline & Porch/Eave:** [P2 weak] [OBSERVED] The cantilevered porch canopy is a substantial improvement, extending without support posts. However, it lacks the soffit recessed lighting fixtures and deep under-eave articulation seen in `nt2025-sniper-boii.jpg`. *Fix hint: Embed two circular recessed canister downlights into the underside of the porch canopy.* [INFERRED]
- **Balcony/Deck & Exterior Stair:** [P2 weak] [OBSERVED] Upper front window sill sits directly above the porch canopy roof, providing an intuitive mantle surface. *Fix hint: Ensure the sill has a bevelled concrete profile with 0.35 m depth to ensure consistent mantle reading.* [INFERRED]
- **Street Shape & Vehicles:** [P2 weak] [OBSERVED] The white car in the driveway has angular geometric body lines and dark glass. In BO2-2025, the vehicle beside the apron is a vintage red classic car with chrome tailfins (`nt2025-street-boii.jpg`). *Fix hint: Replace the boxy white sedan with a 1950s/1960s retro coupe in cherry red with chrome bumpers and white-wall tyres.* [INFERRED]
- **Lawn Props & Appliance Banks:** [P2 weak] [OBSERVED] Manicured green hedges flank the entrance path, but the ground beneath is flat green turf without garden soil, mulch, or decorative river pebbles. *Fix hint: Add a dark mulch bed with stone border kerbing beneath the porch hedge.* [INFERRED]
- **Fences/Yards:** [P2 weak] [OBSERVED] Low cinder block wall separates lawn from sidewalk; block texture is repetitive. *Fix hint: Add weather staining and edge bevels to the cinder block wall caps.* [INFERRED]
- **Lighting & Time of Day:** [P2 weak] [OBSERVED] Strong direct sunlight illuminates the porch canopy, but ambient bounce light into the sheltered porch doorway is somewhat flat. *Fix hint: Increase diffuse indirect bounce light under the porch canopy.* [INFERRED]
- **Overall Photoreal Read:** [P2 weak] [OBSERVED] Architectural framing is solid, but smooth unweathered textures give it a clean architectural rendering feel rather than a lived-in combat environment. *Fix hint: Apply subtle surface imperfections, ambient occlusion contact dirt, and door handle hardware.* [INFERRED]

---

### Station 5: `nuketown2-north-yard` [OBSERVED]
- **What You See:** [OBSERVED] Standing in the North backyard looking toward the rear elevation of the off-white house. An exterior staircase rises along the rear wall to an upper-level wooden balcony deck. In the backyard lawn, circular stepping stones, a green pedestal box, and a white garden pod structure are positioned across the turf.
- **House Colour & Material:** [P2 weak] [OBSERVED] House facade is rendered in uniform off-white horizontal siding. While correct in hue for House B (`nt2025-aerial-boii.jpg`), it lacks the rounded capsule geometry, panoramic curved glazing, and pale blue accent trim characteristic of the modernist show-home. *Fix hint: Replace flat siding with rounded capsule wall segments and add powder-blue horizontal trim bands (`nt2025-aerial-boii.jpg`).* [INFERRED]
- **Garage Side From Spawn:** [P2 weak] [OBSERVED] Facing the rear of the house from this spawn, the staircase is on the left, placing the garage wing on the right as required by rotational symmetry. The garage wing is rendered in brick on the right. *Fix hint: Finish the garage exterior in off-white stucco to match the main house body rather than raw red brick.* [INFERRED]
- **Roofline & Porch/Eave:** [P0 wrong vs reference] [OBSERVED] The rear roofline is a flat horizontal edge. In BO2-2025, the rear roofline features rounded capsule silhouettes and a projecting rear eave that shelters the upper deck. *Fix hint: Extend the upper roof eave 0.8 m over the balcony and round the roof perimeter edges.* [INFERRED]
- **Balcony/Deck & Exterior Stair:** [P0 wrong vs reference] [OBSERVED] The balcony floor is now proper wooden planking, and the railing is white painted timber. However, the staircase consists of floating white rectangular blocks emerging from the wall with NO stringers, risers, or handrails. In `nt2025-street-boii.jpg`, the stair is a solid wooden flight with structural stringers and railings. *Fix hint: Model structural wooden stringers, closed risers, and handrails for the exterior staircase, and anchor the base onto a circular concrete patio slab.* [INFERRED]
- **Street Shape & Vehicles:** [P2 weak] [OBSERVED] Between the house and side boundary, sightlines open onto the street where the white coach bus is visible. *Fix hint: Maintain clear tactical sightlines beneath the bus undercarriage.* [INFERRED]
- **Lawn Props & Appliance Banks:** [P2 weak] [OBSERVED] Circular stepping stones and the white garden pod dome are present in the yard. The shuffleboard court lines and sand pit are also placed on the turf. *Fix hint: Texture the sand pit with granular sand and add colored cue markings to the shuffleboard court.* [INFERRED]
- **Fences/Yards:** [P2 weak] [OBSERVED] The backyard boundary is enclosed by a tall vertical timber fence with an open tactical doorway cutout. Reference shows white painted fences with rounded pickets. *Fix hint: Paint the vertical fence white and add rounded post finials matching the retro atomic styling.* [INFERRED]
- **Lighting & Time of Day:** [P2 weak] [OBSERVED] Sunlight illuminates the rear yard with clean shadows, but the grass texture looks uniform and flat. *Fix hint: Add procedural grass blade density or detail normal map to break up uniform green turf.* [INFERRED]
- **Overall Photoreal Read:** [P2 weak] [OBSERVED] Good set-dressing density with the garden pod and sand pit, but floating staircase steps severely detract from structural realism. *Fix hint: Rebuild the staircase with realistic carpentry (stringers, posts, balusters).* [INFERRED]

---

### Station 6: `nuketown2-south-yard` [OBSERVED]
- **What You See:** [OBSERVED] Standing in the South backyard looking directly at the rear facade of the orange house. The terracotta orange upper floor and white lower floor are clearly separated, with an exterior wooden staircase climbing to an upper railed balcony. In the yard, circular stepping stones, a green pedestal box, and a white storage shed sit on the lawn.
- **House Colour & Material:** [P2 weak] [OBSERVED] The two-tone terracotta orange upper floor over white lower floor matches the reference color blocking of House A (`nt2025-street-boii.jpg`). Siding remains basic horizontal boards. *Fix hint: Replace horizontal lap siding with vertical ribbed orange panels on the upper floor and smooth cream stucco on the lower floor.* [INFERRED]
- **Garage Side From Spawn:** [P2 weak] [OBSERVED] Looking at the rear of the house, the exterior stair is on the left and the garage wing is on the right, maintaining verified chirality. Garage wing is constructed in red brick. *Fix hint: Update garage exterior walls to cream stucco matching the main ground floor.* [INFERRED]
- **Roofline & Porch/Eave:** [P0 wrong vs reference] [OBSERVED] The rear roofline is a flat edge. In `nt2025-street-boii.jpg`, the sweeping ski-jump roof swoops dramatically over this rear facade, sheltering the upper deck under its pale under-eave. *Fix hint: Sculpt the upward-curving butterfly roof overhang to canopy over the upper rear balcony.* [INFERRED]
- **Balcony/Deck & Exterior Stair:** [P0 wrong vs reference] [OBSERVED] Like Station 5, the balcony features wooden decking and white railings, but the staircase consists of floating white blocks protruding from the wall without stringers or balustrades. *Fix hint: Replace floating steps with a complete timber staircase featuring stringers, balusters, and a circular concrete patio base.* [INFERRED]
- **Street Shape & Vehicles:** [P2 weak] [OBSERVED] Looking through the side alley, the white moving truck and a corner of the off-white house are visible. *Fix hint: Ensure side alley sightlines preserve classic sniper lane geometry.* [INFERRED]
- **Lawn Props & Appliance Banks:** [P2 weak] [OBSERVED] Circular concrete stepping stones cross the lawn to the stair base. In BO2-2025, this yard contains the glasshouse greenhouse and white curved-roof carport. *Fix hint: Replace the generic white shed box with the curved-roof potting shed / carport and glasshouse cold frames (`nt2025-aerial-boii.jpg`).* [INFERRED]
- **Fences/Yards:** [P2 weak] [OBSERVED] The rear perimeter fence is vertical dark timber slats. *Fix hint: Add weathering and subtle moss staining to lower fence boards where they meet the turf.* [INFERRED]
- **Lighting & Time of Day:** [P2 weak] [OBSERVED] Bright afternoon sun casts hard diagonal shadows from the house across the lawn; contact shadow under balcony deck is effective. *Fix hint: Soften shadow edge penumbra slightly for distant sun realism.* [INFERRED]
- **Overall Photoreal Read:** [P2 weak] [OBSERVED] House color scheme is authentic, but the floating stair treads and generic storage shed look unfinished. *Fix hint: Model proper stair carpentry and replace the storage shed with the reference glasshouse/carport.* [INFERRED]

---

### Station 7: `nuketown2-north-upper-window` [OBSERVED]
- **What You See:** [OBSERVED] Looking out from inside the second-story front bedroom window of the orange house across the street. The window frame displays the terracotta orange exterior wall on the right and a deep white mantlable window sill below. Across the street, the off-white house facade, coach bus, moving truck, and background mountains are clearly framed.
- **House Colour & Material:** [P2 weak] [OBSERVED] The orange siding on the interior window jamb and the off-white house opposite corroborate the corrected two-tone team colors. Siding texture remains flat diffuse color. *Fix hint: Add ambient occlusion shading inside window frame corners and apply subtle wood grain to trim.* [INFERRED]
- **Garage Side From Spawn:** [P2 weak] [OBSERVED] The off-white house garage is visible on the far left across the street, consistent with 180-degree rotational symmetry. *Fix hint: Detail the off-white garage door with horizontal panelling.* [INFERRED]
- **Roofline & Porch/Eave:** [P0 wrong vs reference] [OBSERVED] The off-white house opposite has a flat roofline. In reference `nt2025-aerial-boii.jpg`, the white house roof consists of rounded capsule contours and solar glazing. *Fix hint: Add rounded capsule contours to the opposite house roofline to break up the flat silhouette.* [INFERRED]
- **Balcony/Deck & Exterior Stair:** [P2 weak] [OBSERVED] The window sill in the foreground provides a solid mantlable surface. *Fix hint: Add an exterior metal grab rail or reinforced sill trim to read as an intentional sniper perch.* [INFERRED]
- **Street Shape & Vehicles:** [P0 wrong vs reference] [OBSERVED] Looking down at the street, the coach bus and moving truck provide good central cover, but the bus roof is a flat white box with no vents, A/C pods, or aerodynamic curvature. *Fix hint: Model rooftop A/C pods and chrome luggage rails on the coach bus.* [INFERRED]
- **Lawn Props & Appliance Banks:** [P2 weak] [OBSERVED] Across the street on the off-white house lawn, the blue appliance bank and fire hydrant are visible behind the hedge. *Fix hint: Ensure the blue appliance console has readable control dials from this elevated sniper angle.* [INFERRED]
- **Fences/Yards:** [P2 weak] [OBSERVED] Background mountains and distant pine trees are visible beyond the opposite house roof. *Fix hint: Replace pine trees with the atomic spire / geodesic dome silhouette.* [INFERRED]
- **Lighting & Time of Day:** [P2 weak] [OBSERVED] Interior framing is in shadow while exterior street is brightly lit, creating natural high-contrast exposure. *Fix hint: Add subtle bloom to the exterior window aperture.* [INFERRED]
- **Overall Photoreal Read:** [P2 weak] [OBSERVED] Tactical framing is excellent and matches the classic Nuketown sniper standoff, but flat vehicle roofs and simple window geometry limit realism. *Fix hint: Add vehicle rooftop detailing and window frame bevels.* [INFERRED]

---

### Station 8: `nuketown2-south-upper-window` [OBSERVED]
- **What You See:** [OBSERVED] Looking out from inside the second-story front bedroom window of the off-white house across the street toward the orange house. The foreground window frame is finished in crisp white trim with a wide sill. Across the street, the orange house facade, cantilevered porch canopy, red appliance bank, and parked white sedan are in clear view.
- **House Colour & Material:** [P2 weak] [OBSERVED] The orange house across the street is instantly readable as the enemy target building. The burnt orange upper floor and white ground floor create strong visual contrast. *Fix hint: Add high-contrast white trim bands around the orange house upper window array.* [INFERRED]
- **Garage Side From Spawn:** [P2 weak] [OBSERVED] Orange house garage sits on the far right of the street, matching verified symmetry. *Fix hint: Model the garage door header and exterior lighting fixture.* [INFERRED]
- **Roofline & Porch/Eave:** [P0 wrong vs reference] [OBSERVED] The orange house roofline is flat. In `nt2025-street-boii.jpg`, this elevation is crowned by the sweeping butterfly roof with dark solar panel rectangles visible along the ridge. *Fix hint: Construct the butterfly roof sweep and install the 6 dark solar panel arrays on the orange house roof.* [INFERRED]
- **Balcony/Deck & Exterior Stair:** [P2 weak] [OBSERVED] The wide window opening provides the classic sniper duel posture. *Fix hint: Ensure window frame collision permits smooth player mantling onto the porch canopy below.* [INFERRED]
- **Street Shape & Vehicles:** [P0 wrong vs reference] [OBSERVED] Coach bus rear and moving truck cab are visible in the street. The coach bus rear is a flat white panel with circular red taillights and purple bumper. *Fix hint: Model recessed taillight assemblies, chrome bumper, and authentic maroon lower paint.* [INFERRED]
- **Lawn Props & Appliance Banks:** [P2 weak] [OBSERVED] The red-topped appliance bank is clearly visible on the front lawn opposite. *Fix hint: Maintain bright red lid color for clear team identification.* [INFERRED]
- **Fences/Yards:** [P2 weak] [OBSERVED] Street perimeter fence and background low-poly pines are visible beyond the garage. *Fix hint: Add futuristic billboard or dome graphics to distant perimeter.* [INFERRED]
- **Lighting & Time of Day:** [P2 weak] [OBSERVED] Direct sunlight illuminates the orange house facade, highlighting the two-tone color transition. *Fix hint: Increase specular reflection on upper window panes of the opposite house.* [INFERRED]
- **Overall Photoreal Read:** [P2 weak] [OBSERVED] Classic competitive sightline is fully functional and color identity is resolved, but flat rooflines and untextured vehicles remain noticeable. *Fix hint: Implement butterfly roof geometry and textured vehicle models.* [INFERRED]

---

### Station 9: `nuketown2-garage` [OBSERVED]
- **What You See:** [OBSERVED] Positioned inside the open garage of the orange house looking out across the driveway toward the street. The interior garage walls are finished in orange-red siding, with a wooden workbench along the right wall. Parked directly outside on the concrete apron is a white sedan with blue lower bumper, with the off-white house visible across the street.
- **House Colour & Material:** [P2 weak] [OBSERVED] Garage interior walls are warm orange-red horizontal siding. Exterior of the house across the street is off-white. *Fix hint: Line garage interior with drywall / pegboard textures and tool racks rather than exterior siding.* [INFERRED]
- **Garage Side From Spawn:** [P2 weak] [OBSERVED] Camera is situated in the garage wing on the appropriate flank of the house. *Fix hint: Add an interior doorway leading into the house kitchen/breezeway.* [INFERRED]
- **Roofline & Porch/Eave:** [P2 weak] [OBSERVED] Garage ceiling shows exposed white joists and roll-up door tracks. *Fix hint: Add a coiled roll-up door cylinder and ceiling light fixture.* [INFERRED]
- **Balcony/Deck & Exterior Stair:** [P1 missing] [OBSERVED] Rear stairs and balconies are outside this garage perspective. *Fix hint: Ensure garage side service door provides clean routing to backyard stair.* [INFERRED]
- **Street Shape & Vehicles:** [P0 wrong vs reference] [OBSERVED] The white sedan parked in the driveway has angular, low-poly geometry and two circular red taillights on a purple bumper. In `nt2025-street-boii.jpg`, the vehicle parked by the garage apron is a sleek vintage red classic car. *Fix hint: Replace the white sedan with a classic red coupe featuring chrome bumpers, retro tailfins, and detailed taillight lenses.* [INFERRED]
- **Lawn Props & Appliance Banks:** [P1 missing] [OBSERVED] Front lawn appliance bank is occluded by the garage entrance pillar. *Fix hint: Add garage clutter props (tool chest, cardboard boxes, oil cans, tyres) along the workbench.* [INFERRED]
- **Fences/Yards:** [P2 weak] [OBSERVED] Side fence and hedges are visible beyond the driveway apron. *Fix hint: Add expansion joints and oil drip stains to the driveway concrete.* [INFERRED]
- **Lighting & Time of Day:** [P2 weak] [OBSERVED] Bright daylight streams in through the open garage bay door, casting sharp shadows on the floor. Interior corners are somewhat evenly lit. *Fix hint: Bake ambient occlusion into interior garage wall corners and beneath the workbench.* [INFERRED]
- **Overall Photoreal Read:** [P2 weak] [OBSERVED] Garage interior volume feels believable, but the wooden workbench is a simple box and the parked car is low-poly. *Fix hint: Populate workbench with detailed 3D tools and replace car mesh with a high-fidelity retro asset.* [INFERRED]

---

### Station 10: `nuketown2-north-balcony` [OBSERVED]
- **What You See:** [OBSERVED] An elevated perspective from the rear yard looking up at the rear balcony deck and exterior staircase of the orange house. The terracotta orange upper siding and white lower siding form a clean horizontal divide. A wooden plank deck floor rests on a cinder block support pier, with floating white stair treads ascending the wall.
- **House Colour & Material:** [P2 weak] [OBSERVED] Terracotta orange upper floor siding and white lower floor siding are cleanly defined. Siding textures lack micro-detail and edge wear. *Fix hint: Add subtle dirt streaks beneath window sills and ambient occlusion shading where siding meets trim.* [INFERRED]
- **Garage Side From Spawn:** [P2 weak] [OBSERVED] Balcony is correctly situated at the opposite end of the house from the garage wing. *Fix hint: Ensure rear service access around the balcony pier connects cleanly to the side alley.* [INFERRED]
- **Roofline & Porch/Eave:** [P0 wrong vs reference] [OBSERVED] The roofline above the balcony is a simple horizontal trim board. In `nt2025-street-boii.jpg`, the sweeping ski-jump roof overhang extends directly above this balcony, sheltering the standing platform. *Fix hint: Extend the roof sweep upward and outward to form a protective canopy over the rear balcony deck.* [INFERRED]
- **Balcony/Deck & Exterior Stair:** [P0 wrong vs reference] [OBSERVED] The balcony platform has authentic timber deck planks and a white railing. However, the staircase treads are floating white rectangular slabs with no stringers, risers, or handrails. In BO2-2025, the stair is an integrated wooden flight with railings and a circular concrete landing. *Fix hint: Build structural wooden stringers, risers, and handrails connecting the balcony to a circular concrete ground pad.* [INFERRED]
- **Street Shape & Vehicles:** [P1 missing] [OBSERVED] Street and vehicles are occluded by the house mass from this rear yard angle. *Fix hint: Maintain clear firing lanes through the side passage toward the street.* [INFERRED]
- **Lawn Props & Appliance Banks:** [P2 weak] [OBSERVED] Stepping stones are visible on the lawn below. *Fix hint: Add patio chairs or a small table on the balcony platform matching `nt2025-promo2-bo7.png`.* [INFERRED]
- **Fences/Yards:** [P2 weak] [OBSERVED] Backyard perimeter fence is tall vertical timber boards. *Fix hint: Add horizontal fence support rails and post caps.* [INFERRED]
- **Lighting & Time of Day:** [P2 weak] [OBSERVED] Sunlight strikes the upper orange wall at an angle, highlighting the siding texture; deep shadow forms under the balcony deck. *Fix hint: Increase ambient bounce light into the undercroft beneath the balcony.* [INFERRED]
- **Overall Photoreal Read:** [P2 weak] [OBSERVED] Balcony decking is a significant step forward, but the floating stair treads appear unphysical and break game-world plausibility. *Fix hint: Model full carpentry on the exterior stair.* [INFERRED]

---

### Station 11: `nuketown2-south-interior` [OBSERVED]
- **What You See:** [OBSERVED] Ground-floor interior view of the orange house looking through a central doorway toward the kitchen area. The floor is surfaced in warm polished wood planks, and the walls are painted in neutral beige plaster. A white kitchen counter island with dark surface sits in the adjacent room under a square ceiling light panel.
- **House Colour & Material:** [P2 weak] [OBSERVED] Interior walls are smooth beige plaster; floor has a warm wood-plank texture. Colors are neutral and modern, but lack distinctive 1960s retro-futuristic styling. *Fix hint: Add atomic-age retro wallpaper (starburst or geometric patterns) on accent walls and checkboard linoleum in the kitchen.* [INFERRED]
- **Garage Side From Spawn:** [P2 weak] [OBSERVED] Doorway connects to side passage leading toward garage wing. *Fix hint: Add interior door frames and brass door knobs.* [INFERRED]
- **Roofline & Porch/Eave:** [P1 missing] [OBSERVED] Ceiling is a plain flat white surface with a simple square light panel. *Fix hint: Add modernist recessed cove lighting or a Sputnik-style atomic chandelier.* [INFERRED]
- **Balcony/Deck & Exterior Stair:** [P1 missing] [OBSERVED] Interior stairs to the second floor are outside this camera cone. *Fix hint: Ensure interior staircase has sleek chrome or timber railings.* [INFERRED]
- **Street Shape & Vehicles:** [P1 missing] [OBSERVED] Exterior view through the front window is washed out white. *Fix hint: Adjust window material transparency to show street vehicles and the house opposite.* [INFERRED]
- **Lawn Props & Appliance Banks:** [P1 missing] [OBSERVED] Kitchen area has a single plain rectangular counter island. Lacks retro kitchen appliances (rounded refrigerator, atomic range, bar stools). *Fix hint: Add a 1960s rounded pastel refrigerator, chrome bar stools, and kitchen cabinetry.* [INFERRED]
- **Fences/Yards:** [P1 missing] [OBSERVED] Rear door view is obscured. *Fix hint: Frame backyard greenhouse or garden pod through rear windows.* [INFERRED]
- **Lighting & Time of Day:** [P2 weak] [OBSERVED] Ambient light is evenly distributed throughout the interior, lacking realistic sunlight streaming through exterior doorways. *Fix hint: Add volumetric sun shafts through open exterior doors and bake contact shadows under counters.* [INFERRED]
- **Overall Photoreal Read:** [P2 weak] [OBSERVED] Clean architectural blockout with nice wood flooring, but the interior feels hollow and unpopulated without furniture or props. *Fix hint: Dress the living space with mid-century furniture (curved sofa, coffee table, retro television console).* [INFERRED]

---

### Station 12: `nuketown2-north-interior` [OBSERVED]
- **What You See:** [OBSERVED] Ground-floor interior of the off-white house with a matching architectural layout. The living room features polished wood-plank flooring, beige plaster walls, and an open doorway into the kitchen. In the background, a white kitchen counter island stands under a square ceiling light fixture.
- **House Colour & Material:** [P2 weak] [OBSERVED] Identical beige walls and wood flooring as Station 11. The interior lacks a distinct visual identity differentiating House B from House A. *Fix hint: Differentiate this interior with cool turquoise/cyan accent walls and modernist terrazzo flooring.* [INFERRED]
- **Garage Side From Spawn:** [P2 weak] [OBSERVED] Doorway provides circulation toward the garage wing. *Fix hint: Add garage access door with retro door hardware.* [INFERRED]
- **Roofline & Porch/Eave:** [P1 missing] [OBSERVED] Plain flat ceiling with square panel light. *Fix hint: Install recessed circular downlights and decorative ceiling beams.* [INFERRED]
- **Balcony/Deck & Exterior Stair:** [P1 missing] [OBSERVED] Second-story stair flight is out of frame. *Fix hint: Ensure interior stair matches retro aesthetic.* [INFERRED]
- **Street Shape & Vehicles:** [P1 missing] [OBSERVED] Window opening to exterior is blown out. *Fix hint: Tone-map window transparency to display exterior coach bus.* [INFERRED]
- **Lawn Props & Appliance Banks:** [P1 missing] [OBSERVED] Kitchen counter is an untextured white box without sink, faucets, or appliances. *Fix hint: Model stainless steel sink, retro chrome faucets, and countertop appliances.* [INFERRED]
- **Fences/Yards:** [P1 missing] [OBSERVED] Exterior view through rear opening shows plain green. *Fix hint: Frame backyard garden pod and sand pit through rear doorway.* [INFERRED]
- **Lighting & Time of Day:** [P2 weak] [OBSERVED] Uniform interior ambient fill with minimal directional shadow contrast. *Fix hint: Add directional sun bounce light from exterior door and soft shadow under the island.* [INFERRED]
- **Overall Photoreal Read:** [P2 weak] [OBSERVED] Clean layout and nice wood flooring, but unfurnished rooms read as an unfinished construction shell. *Fix hint: Add mid-century furniture, wall art, and kitchen dressing.* [INFERRED]

---

## 3. Reference Scorecard (Against BO2-2025 Target) [OBSERVED]

| Category | Score | Max | Justification (One Line) |
|---|:---:|:---:|---|
| **Layout Fidelity** | **17** | 25 | [OBSERVED] Chirality is verified, the third house is added beyond the fence, and appliance banks anchor team spawns, but the cul-de-sac circular turning head is still not fully formed as a lollipop circle. |
| **Material & Texture Read** | **12** | 25 | [OBSERVED] House colors correctly transitioned from BO1 yellow/cyan to BO2 terracotta-orange and off-white/cream, but facades still use generic horizontal lap siding and vehicles remain untextured white/grey. |
| **Lighting & Atmosphere** | **12** | 20 | [OBSERVED] Warm sun angle and golden backlighting are effective, but lighting lacks soft penumbra filtering, atmospheric desert dust haze, and PBR clearcoat reflections. |
| **Dressing Density** | **9** | 15 | [OBSERVED] Major additions include red and blue lawn appliance banks, garden pod, sand pit, stepping stones, and fence mantle hole, but the retro-futuristic "City of the Future" skyline is missing. |
| **Technical Hygiene** | **12** | 15 | [OBSERVED] Clean geometry with zero coplanar tearing and solid collision, but penalized by floating exterior stair treads with no stringers and low-poly backdrop pine trees. |
| **TOTAL** | **62** | **100** | [OBSERVED] Substantial 19-point advancement from Candidate 3 (43/100); core layout, team color identity, and signature props are established, with architectural rooflines and vehicle PBR models remaining as the primary gaps. |

---

## 4. Top Three Changes to Move the Score Most [INFERRED]

1. **Sculpt Authentic Retro-Futuristic Rooflines on Both Houses (+16 pts)** [INFERRED]
   - *OBSERVED Defect:* Both houses currently feature flat horizontal asphalt roofs with basic parapet copings, completely missing BO2-2025's signature architectural skylines. [OBSERVED]
   - *Reference Grounding:* In `nt2025-street-boii.jpg` and `nt2025-aerial-boii.jpg`, House A features an upward-raking butterfly / ski-jump roof carrying six dark solar panels that canopies over the rear deck; House B features rounded modernist capsule roof volumes with pale blue-grey solar glazing. [OBSERVED]
   - *Actionable Fix:* Model the forward-sweeping butterfly roof with integrated solar panels on the North house, and model dual rounded capsule roofs with blue-grey glazing on the South house. [INFERRED]

2. **Rebuild Exterior Staircases with Structural Carpentry & Patio Slabs (+12 pts)** [INFERRED]
   - *OBSERVED Defect:* Exterior stairs currently consist of individual white rectangular treads floating unsupported in mid-air against the wall, lacking stringers, risers, balustrades, or handrails. [OBSERVED]
   - *Reference Grounding:* In `nt2025-street-boii.jpg`, the exterior stair is a substantial wooden architectural staircase with structural stringers, closed risers, and a protective railing, terminating at a circular concrete ground patio. [OBSERVED]
   - *Actionable Fix:* Rebuild both stair flights as proper timber stairs with diagonal stringers, risers, and handrails, and anchor the base onto a circular concrete ground patio disc. [INFERRED]

3. **Construct Circular Cul-de-Sac Turning Head & Streamlined Retro Vehicles (+10 pts)** [INFERRED]
   - *OBSERVED Defect:* The roadway remains a straight rectangular strip with no kerbed turning bulb, and vehicles are boxy untextured white meshes with purple bumpers. [OBSERVED]
   - *Reference Grounding:* `nt2025-aerial-boii.jpg` and `nt2025-loadscreen-boii.png` verify a circular kerbed turning head terminating the street, occupied by an aerodynamic cream-and-maroon Nuketown tour coach, dark box truck, and retro blue bubble saloon. [OBSERVED]
   - *Actionable Fix:* Curve the street kerbs into a circular turning head around the bus parking zone, and replace boxy vehicle meshes with streamlined models textured in authentic cream-and-maroon tour coach livery and dark blue vintage saloon paint. [INFERRED]

---
*End of Reference Critic Review - Candidate 4b (GEM-5)* [OBSERVED]
