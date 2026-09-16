# Atomic Acres — Reference-Image Shot Matrix

**Total shots: 231** = 168 weapon shots (21 weapons × 8) + 24 per-map base views (12 maps × 2) + 2 street-axis views + 37 landmark views.

- Source registry: `src/combat/weapon-catalog.ts` + `src/protocol.ts` WEAPON_IDS (21 weapons) + `src/ads-sight-profile.ts` (21 sight signatures). Maps: `src/arena-identity.ts` ARENA_IDS (12) with display names from `src/map-selection.ts`. Frozen Build 19, commit `82677da2c`; repo read-only.
- **Slug contract:** every row's slug is its output filename (`.png`/`.jpg` appended by the capture tool). Weapon slugs are `<weapon-id>__<shot>`; map slugs are `<map-id>__map-<shot>`. Slugs are unique across the whole matrix.
- **Sight markers** (one authored ADS signature per weapon, from `ADS_SIGHT_PROFILES`): `reflex`, `aperture`, `posts`, `bead`, `diamond`, `chevron`, `cross`, `compact-optic`, `scope`. There are no swappable sight attachments in this build; `scope` = full-screen optic (sniper 4x, M14 EBR thermal 2.5x, railgun thermal special-authority), `compact-optic` = on-weapon 2.5x glass (crossbow).

## 1. Weapon shots

Per weapon: POV idle (hip), POV ADS at its sight, side profile neutral, side profile at its sight, one detail callout, and three in-world hero placements.

### carbine — HK416 (sight: reflex)

| Slug | View | Notes |
| --- | --- | --- |
| carbine__pov-hip | POV idle (hip) | Default carry, optic ring readable |
| carbine__pov-ads-reflex | POV ADS | Red reflex ring + centre dot centred |
| carbine__side-neutral | Side profile neutral | Weapon only, neutral lighting |
| carbine__side-ads-reflex | Side profile ADS | Optic frame/lens profile |
| carbine__detail-callout | Detail callout | Receiver, gas block, magazine ribs, charging handle |
| carbine__world-nuketown-central-bus | In-world hero spot 1 | Nuke Town central bus, broadside |
| carbine__world-nuketown2-central-truck | In-world hero spot 2 | Nuketown central truck cargo box |
| carbine__world-gun-range-lane-200 | In-world hero spot 3 | Gun Range 200-point lane |

### smg — FN P90 (sight: aperture)

| Slug | View | Notes |
| --- | --- | --- |
| smg__pov-hip | POV idle (hip) | Bullpup silhouette at hip |
| smg__pov-ads-aperture | POV ADS | Teal aperture ring + dot |
| smg__side-neutral | Side profile neutral | Full top-mounted magazine read |
| smg__side-ads-aperture | Side profile ADS | Rear aperture aligned through front post |
| smg__detail-callout | Detail callout | Magazine housing, shroud, sight post |
| smg__world-nuketown-central-bus | In-world hero spot 1 | Nuke Town central bus |
| smg__world-nuketown2-central-truck | In-world hero spot 2 | Nuketown central truck |
| smg__world-gun-range-lane-200 | In-world hero spot 3 | Gun Range 200-point lane |

### lmg — M249 SAW (sight: posts)

| Slug | View | Notes |
| --- | --- | --- |
| lmg__pov-hip | POV idle (hip) | Belt box read at hip |
| lmg__pov-ads-posts | POV ADS | Amber front/rear posts |
| lmg__side-neutral | Side profile neutral | Bipod folded, belt box |
| lmg__side-ads-posts | Side profile ADS | Post pair aligned |
| lmg__detail-callout | Detail callout | Feed tray, barrel, carry handle |
| lmg__world-nuketown-central-bus | In-world hero spot 1 | Nuke Town central bus |
| lmg__world-nuketown2-central-truck | In-world hero spot 2 | Nuketown central truck |
| lmg__world-gun-range-lane-200 | In-world hero spot 3 | Gun Range 200-point lane |

### scattergun — Remington 870 (sight: bead)

| Slug | View | Notes |
| --- | --- | --- |
| scattergun__pov-hip | POV idle (hip) | Pump gun at hip |
| scattergun__pov-ads-bead | POV ADS | Cream bead over receiver |
| scattergun__side-neutral | Side profile neutral | Barrel/tube pair, pump, stock |
| scattergun__side-ads-bead | Side profile ADS | Bead sight line |
| scattergun__detail-callout | Detail callout | Loading port, trigger guard, shell ejection |
| scattergun__world-nuketown-central-bus | In-world hero spot 1 | Nuke Town central bus |
| scattergun__world-nuketown2-central-truck | In-world hero spot 2 | Nuketown central truck |
| scattergun__world-gun-range-lane-200 | In-world hero spot 3 | Gun Range 200-point lane |

### sniper — M40A5 (sight: scope, 4x)

| Slug | View | Notes |
| --- | --- | --- |
| sniper__pov-hip | POV idle (hip) | Scoped rifle at hip |
| sniper__pov-ads-scope | POV ADS | Full-screen 4x scope overlay |
| sniper__side-neutral | Side profile neutral | Scope, bolt, stock line |
| sniper__side-ads-scope | Side profile ADS | Cheek weld, scope axis |
| sniper__detail-callout | Detail callout | Scope turret, bolt, five-round magazine |
| sniper__world-nuketown-central-bus | In-world hero spot 1 | Nuke Town central bus |
| sniper__world-nuketown2-central-truck | In-world hero spot 2 | Nuketown central truck |
| sniper__world-gun-range-lane-200 | In-world hero spot 3 | Gun Range 200-point lane |

### railgun — EMRG Railgun (sight: scope, thermal special-authority)

| Slug | View | Notes |
| --- | --- | --- |
| railgun__pov-hip | POV idle (hip) | Coils and capacitor visible |
| railgun__pov-ads-scope | POV ADS | Blue thermal full-screen overlay |
| railgun__side-neutral | Side profile neutral | Receiver + twin coils |
| railgun__side-ads-scope | Side profile ADS | Thermal scope axis |
| railgun__detail-callout | Detail callout | Coils, capacitor, thermal scope |
| railgun__world-nuketown2-rare-gun-site-upper-room-north | In-world hero spot 1 | Nuketown upper-room rare gun site (north) |
| railgun__world-nuketown2-rare-gun-site-upper-room-south | In-world hero spot 2 | Nuketown upper-room rare gun site (south) |
| railgun__world-nuketown-central-bus | In-world hero spot 3 | Nuke Town central bus |

### pistol — Glock 17 (sight: posts)

| Slug | View | Notes |
| --- | --- | --- |
| pistol__pov-hip | POV idle (hip) | Sidearm carry |
| pistol__pov-ads-posts | POV ADS | Cyan post pair |
| pistol__side-neutral | Side profile neutral | Slide, frame, magazine base |
| pistol__side-ads-posts | Side profile ADS | Front/rear post alignment |
| pistol__detail-callout | Detail callout | Front sight, trigger, ejection port |
| pistol__world-nuketown-central-bus | In-world hero spot 1 | Nuke Town central bus |
| pistol__world-nuketown2-central-truck | In-world hero spot 2 | Nuketown central truck |
| pistol__world-gun-range-lane-200 | In-world hero spot 3 | Gun Range 200-point lane |

### magnum — Desert Eagle .50 AE (sight: diamond)

| Slug | View | Notes |
| --- | --- | --- |
| magnum__pov-hip | POV idle (hip) | Heavy pistol carry |
| magnum__pov-ads-diamond | POV ADS | Gold diamond reticle, 45° rotation |
| magnum__side-neutral | Side profile neutral | Heavy barrel + cylinder read |
| magnum__side-ads-diamond | Side profile ADS | Diamond sight line |
| magnum__detail-callout | Detail callout | Cylinder, heavy barrel, topstrap |
| magnum__world-nuketown-central-bus | In-world hero spot 1 | Nuke Town central bus |
| magnum__world-nuketown2-central-truck | In-world hero spot 2 | Nuketown central truck |
| magnum__world-gun-range-lane-200 | In-world hero spot 3 | Gun Range 200-point lane |

### machine-pistol — Glock 18 (sight: reflex)

| Slug | View | Notes |
| --- | --- | --- |
| machine-pistol__pov-hip | POV idle (hip) | Extended-mag machine pistol |
| machine-pistol__pov-ads-reflex | POV ADS | Pink reflex ring + dot |
| machine-pistol__side-neutral | Side profile neutral | Extended magazine, auto selector |
| machine-pistol__side-ads-reflex | Side profile ADS | Reflex frame on slide |
| machine-pistol__detail-callout | Detail callout | Auto selector, extended magazine, front sight |
| machine-pistol__world-nuketown-central-bus | In-world hero spot 1 | Nuke Town central bus |
| machine-pistol__world-nuketown2-central-truck | In-world hero spot 2 | Nuketown central truck |
| machine-pistol__world-gun-range-lane-200 | In-world hero spot 3 | Gun Range 200-point lane |

### mini-uzi — Mini Uzi (sight: aperture)

| Slug | View | Notes |
| --- | --- | --- |
| mini-uzi__pov-hip | POV idle (hip) | Compact SMG at hip |
| mini-uzi__pov-ads-aperture | POV ADS | Blue aperture ring |
| mini-uzi__side-neutral | Side profile neutral | Folding stock, magazine well |
| mini-uzi__side-ads-aperture | Side profile ADS | Aperture to post line |
| mini-uzi__detail-callout | Detail callout | Bolting handle, grip, magazine |
| mini-uzi__world-nuketown-central-bus | In-world hero spot 1 | Nuke Town central bus |
| mini-uzi__world-nuketown2-central-truck | In-world hero spot 2 | Nuketown central truck |
| mini-uzi__world-gun-range-lane-200 | In-world hero spot 3 | Gun Range 200-point lane |

### mp5 — MP5 (sight: aperture, 1.2x optic)

| Slug | View | Notes |
| --- | --- | --- |
| mp5__pov-hip | POV idle (hip) | SMG carry |
| mp5__pov-ads-aperture | POV ADS | Green aperture ring + dot |
| mp5__side-neutral | Side profile neutral | Curved magazine, stock line |
| mp5__side-ads-aperture | Side profile ADS | Aperture alignment |
| mp5__detail-callout | Detail callout | Cocking tube, curved magazine, optic |
| mp5__world-nuketown-central-bus | In-world hero spot 1 | Nuke Town central bus |
| mp5__world-nuketown2-central-truck | In-world hero spot 2 | Nuketown central truck |
| mp5__world-gun-range-lane-200 | In-world hero spot 3 | Gun Range 200-point lane |

### m4a1 — M4A1 (sight: reflex, 1.25x optic)

| Slug | View | Notes |
| --- | --- | --- |
| m4a1__pov-hip | POV idle (hip) | Carbine carry |
| m4a1__pov-ads-reflex | POV ADS | Orange reflex ring |
| m4a1__side-neutral | Side profile neutral | Rail, stock, magazine |
| m4a1__side-ads-reflex | Side profile ADS | Reflex optic profile |
| m4a1__detail-callout | Detail callout | Rail, charging handle, flash hider |
| m4a1__world-nuketown-central-bus | In-world hero spot 1 | Nuke Town central bus |
| m4a1__world-nuketown2-central-truck | In-world hero spot 2 | Nuketown central truck |
| m4a1__world-gun-range-lane-200 | In-world hero spot 3 | Gun Range 200-point lane |

### ak-47 — AK-47 (sight: chevron, 1.15x optic)

| Slug | View | Notes |
| --- | --- | --- |
| ak-47__pov-hip | POV idle (hip) | Rifle carry |
| ak-47__pov-ads-chevron | POV ADS | Gold chevron reticle |
| ak-47__side-neutral | Side profile neutral | Curved magazine, gas tube |
| ak-47__side-ads-chevron | Side profile ADS | Chevron sight line |
| ak-47__detail-callout | Detail callout | Gas block, dust cover, slant brake |
| ak-47__world-nuketown-central-bus | In-world hero spot 1 | Nuke Town central bus |
| ak-47__world-nuketown2-central-truck | In-world hero spot 2 | Nuketown central truck |
| ak-47__world-gun-range-lane-200 | In-world hero spot 3 | Gun Range 200-point lane |

### minigun — M134 Minigun (sight: cross)

| Slug | View | Notes |
| --- | --- | --- |
| minigun__pov-hip | POV idle (hip) | Spin-up pose at hip |
| minigun__pov-ads-cross | POV ADS | Amber cross reticle |
| minigun__side-neutral | Side profile neutral | Barrel cluster, ammo path |
| minigun__side-ads-cross | Side profile ADS | Cross sight line |
| minigun__detail-callout | Detail callout | Rotating barrels, drive housing |
| minigun__world-nuketown-central-bus | In-world hero spot 1 | Nuke Town central bus |
| minigun__world-nuketown2-central-truck | In-world hero spot 2 | Nuketown central truck |
| minigun__world-gun-range-lane-200 | In-world hero spot 3 | Gun Range 200-point lane |

### m14-ebr — M14 EBR (sight: scope, thermal-smoke-only 2.5x)

| Slug | View | Notes |
| --- | --- | --- |
| m14-ebr__pov-hip | POV idle (hip) | Marksman carry |
| m14-ebr__pov-ads-scope | POV ADS | Orange thermal full-screen overlay |
| m14-ebr__side-neutral | Side profile neutral | Chassis, scope, magazine |
| m14-ebr__side-ads-scope | Side profile ADS | Thermal optic axis |
| m14-ebr__detail-callout | Detail callout | Chassis rail, scope, muzzle device |
| m14-ebr__world-nuketown-central-bus | In-world hero spot 1 | Nuke Town central bus |
| m14-ebr__world-nuketown2-central-truck | In-world hero spot 2 | Nuketown central truck |
| m14-ebr__world-gun-range-lane-200 | In-world hero spot 3 | Gun Range 200-point lane |

### slug-shotgun — Benelli M4 Slug (sight: bead, 1.35x optic)

| Slug | View | Notes |
| --- | --- | --- |
| slug-shotgun__pov-hip | POV idle (hip) | Semi-auto shotgun carry |
| slug-shotgun__pov-ads-bead | POV ADS | Pale blue bead |
| slug-shotgun__side-neutral | Side profile neutral | Tube, receiver, pistol grip |
| slug-shotgun__side-ads-bead | Side profile ADS | Bead sight line |
| slug-shotgun__detail-callout | Detail callout | Loading port, barrel, ghost-ring rear |
| slug-shotgun__world-nuketown-central-bus | In-world hero spot 1 | Nuke Town central bus |
| slug-shotgun__world-nuketown2-central-truck | In-world hero spot 2 | Nuketown central truck |
| slug-shotgun__world-gun-range-lane-200 | In-world hero spot 3 | Gun Range 200-point lane |

### flashlight-pistol — HK USP .45 Tactical (sight: posts; attachment: always-on flashlight)

| Slug | View | Notes |
| --- | --- | --- |
| flashlight-pistol__pov-hip | POV idle (hip) | Tactical sidearm, lamp lit |
| flashlight-pistol__pov-ads-posts | POV ADS | Ice-blue post pair |
| flashlight-pistol__side-neutral | Side profile neutral | Suppressor-ready slide, lamp body |
| flashlight-pistol__side-ads-posts | Side profile ADS | Post alignment + lamp cone |
| flashlight-pistol__detail-callout | Detail callout | Rail-mounted flashlight, sights, grip |
| flashlight-pistol__world-nuketown-central-bus | In-world hero spot 1 | Nuke Town central bus |
| flashlight-pistol__world-nuketown2-central-truck | In-world hero spot 2 | Nuketown central truck |
| flashlight-pistol__world-gun-range-lane-200 | In-world hero spot 3 | Gun Range 200-point lane |

### explosive-crossbow — TAC-15 Explosive Crossbow (sight: compact-optic 2.5x)

| Slug | View | Notes |
| --- | --- | --- |
| explosive-crossbow__pov-hip | POV idle (hip) | Crossbow carry, bolt loaded |
| explosive-crossbow__pov-ads-compact-optic | POV ADS | On-weapon 2.5x glass, orange reticle stays in frame |
| explosive-crossbow__side-neutral | Side profile neutral | Limbs, rail, bolt |
| explosive-crossbow__side-ads-compact-optic | Side profile ADS | Compact glass profile |
| explosive-crossbow__detail-callout | Detail callout | Limb bolts, rail, explosive bolt tip |
| explosive-crossbow__world-nuketown-central-bus | In-world hero spot 1 | Nuke Town central bus |
| explosive-crossbow__world-nuketown2-central-truck | In-world hero spot 2 | Nuketown central truck |
| explosive-crossbow__world-gun-range-lane-200 | In-world hero spot 3 | Gun Range 200-point lane |

### flamethrower — M2 Flamethrower (sight: cross)

| Slug | View | Notes |
| --- | --- | --- |
| flamethrower__pov-hip | POV idle (hip) | Wand + fuel pack at hip, pilot lit |
| flamethrower__pov-ads-cross | POV ADS | Orange cross reticle, 45° rotation |
| flamethrower__side-neutral | Side profile neutral | Wand, hose, fuel tank |
| flamethrower__side-ads-cross | Side profile ADS | Cross sight line along wand |
| flamethrower__detail-callout | Detail callout | Nozzle, valve wheel, tank seams |
| flamethrower__world-nuketown-central-bus | In-world hero spot 1 | Nuke Town central bus (map pickup weapon) |
| flamethrower__world-nuketown2-street-coach | In-world hero spot 2 | Nuketown street coach |
| flamethrower__world-skyline-terminal-apron | In-world hero spot 3 | Terminal apron |

### flare-gun — Orion Flare Pistol (sight: bead, 1.1x optic)

| Slug | View | Notes |
| --- | --- | --- |
| flare-gun__pov-hip | POV idle (hip) | Flare pistol carry |
| flare-gun__pov-ads-bead | POV ADS | Red bead sight |
| flare-gun__side-neutral | Side profile neutral | Breezed barrel, hinge frame |
| flare-gun__side-ads-bead | Side profile ADS | Bead sight line |
| flare-gun__detail-callout | Detail callout | Breech, hinge, flare casing |
| flare-gun__world-nuketown-central-bus | In-world hero spot 1 | Nuke Town central bus (map pickup weapon) |
| flare-gun__world-rustworks-central-tower | In-world hero spot 2 | RustRig central tower |
| flare-gun__world-farcrysis-ruined-core | In-world hero spot 3 | Farcrysis ruined core |

### crimson-flamethrower — Crimson Flamethrower (sight: cross)

| Slug | View | Notes |
| --- | --- | --- |
| crimson-flamethrower__pov-hip | POV idle (hip) | Red-livery wand + tank at hip |
| crimson-flamethrower__pov-ads-cross | POV ADS | Red cross reticle, 45° rotation |
| crimson-flamethrower__side-neutral | Side profile neutral | Red livery wand, hose, tank |
| crimson-flamethrower__side-ads-cross | Side profile ADS | Cross sight line along wand |
| crimson-flamethrower__detail-callout | Detail callout | Crimson nozzle, valve, tank badge |
| crimson-flamethrower__world-nuketown-central-bus | In-world hero spot 1 | Nuke Town central bus (care-package reward weapon) |
| crimson-flamethrower__world-nuketown2-central-truck | In-world hero spot 2 | Nuketown central truck |
| crimson-flamethrower__world-high-seas-bow-deck | In-world hero spot 3 | High Seas bow deck |

## 2. Map-view shots

### 2.1 Per-map base views (every registered arena)

| Slug | View | Notes |
| --- | --- | --- |
| world-studio__map-top-down | Top-down | Full orthographic board |
| world-studio__map-angled-hero | Angled hero | Street-facing 3/4 hero |
| nuketown2__map-top-down | Top-down | Full board, preview build |
| nuketown2__map-angled-hero | Angled hero | 58 m street, two houses, bus centre |
| raid2__map-top-down | Top-down | Courtyard + pool terrace board |
| raid2__map-angled-hero | Angled hero | Open-to-sky courtyard hero |
| atomic-acres__map-top-down | Top-down | Shipped Nuke Town board |
| atomic-acres__map-angled-hero | Angled hero | Street + bus hero |
| skyline-terminal__map-top-down | Top-down | Concourse + apron board |
| skyline-terminal__map-angled-hero | Angled hero | Apron approach hero |
| rustworks-1v1__map-top-down | Top-down | Offshore rig board |
| rustworks-1v1__map-angled-hero | Angled hero | Tower hero orbit |
| gun-range__map-top-down | Top-down | Indoor range board |
| gun-range__map-angled-hero | Angled hero | Downrange hero |
| farcrysis__map-top-down | Top-down | Jungle island board |
| farcrysis__map-angled-hero | Angled hero | Beach approach, golden hour |
| high-seas__map-top-down | Top-down | Superyacht board |
| high-seas__map-angled-hero | Angled hero | Bow-to-stern deck hero |
| test1__map-top-down | Top-down | Range training ground board |
| test1__map-angled-hero | Angled hero | Tower + container yard hero |
| test2__map-top-down | Top-down | Hillside estate board |
| test2__map-angled-hero | Angled hero | Pool deck descent hero |
| map3__map-top-down | Top-down | Corridor showcase board |
| map3__map-angled-hero | Angled hero | Hub-first corridor hero |

### 2.2 Street-axis views (street maps)

| Slug | View | Notes |
| --- | --- | --- |
| atomic-acres__map-street-axis | Street axis | Down the road centre, bus broadside |
| nuketown2__map-street-axis | Street axis | 58 m road centre, truck + coach flanks |

### 2.3 Landmark views

**atomic-acres (Nuke Town)**

| Slug | View | Notes |
| --- | --- | --- |
| atomic-acres__map-landmark-central-bus | Landmark | Central transit bus, walkable interior |
| atomic-acres__map-landmark-house-west | Landmark | West house front |
| atomic-acres__map-landmark-house-east | Landmark | East house front |
| atomic-acres__map-landmark-shed-west | Landmark | West destructible field shed |
| atomic-acres__map-landmark-shed-east | Landmark | East destructible field shed |

**nuketown2 (Nuketown)**

| Slug | View | Notes |
| --- | --- | --- |
| nuketown2__map-landmark-central-truck | Landmark | Central truck, cargo box + cab, 2x core seat |
| nuketown2__map-landmark-street-coach | Landmark | Street coach in the turning head |
| nuketown2__map-landmark-house-north | Landmark | North two-storey house + garage |
| nuketown2__map-landmark-house-south | Landmark | South two-storey house + garage |

**raid2 (Raid Rebuild)**

| Slug | View | Notes |
| --- | --- | --- |
| raid2__map-landmark-pool-terrace | Landmark | 52 m pool terrace lane |
| raid2__map-landmark-courtyard | Landmark | Open-to-sky courtyard |

**skyline-terminal (Terminal)**

| Slug | View | Notes |
| --- | --- | --- |
| skyline-terminal__map-landmark-concourse-security | Landmark | Security choke inside the concourse |
| skyline-terminal__map-landmark-gangway | Landmark | Narrow jetliner gangway |
| skyline-terminal__map-landmark-apron | Landmark | Open tarmac apron |

**rustworks-1v1 (RustRig)**

| Slug | View | Notes |
| --- | --- | --- |
| rustworks-1v1__map-landmark-central-tower | Landmark | Climbable central plant/tower |
| rustworks-1v1__map-landmark-yard-cover | Landmark | Industrial yard cover |

**gun-range (Gun Range)**

| Slug | View | Notes |
| --- | --- | --- |
| gun-range__map-landmark-armory-bench | Landmark | Indoor armory weapon bench |
| gun-range__map-landmark-lane-100 | Landmark | 100-point lane |
| gun-range__map-landmark-lane-200 | Landmark | 200-point lane |
| gun-range__map-landmark-lane-300 | Landmark | 300-point lane |

**farcrysis**

| Slug | View | Notes |
| --- | --- | --- |
| farcrysis__map-landmark-ruined-core | Landmark | Ruined research core |
| farcrysis__map-landmark-beach | Landmark | Flooded beach approach |

**high-seas**

| Slug | View | Notes |
| --- | --- | --- |
| high-seas__map-landmark-bow-deck | Landmark | Bow deck, stacked decks behind |
| high-seas__map-landmark-stern | Landmark | Stern lanes |

**test1 (Firing Range)**

| Slug | View | Notes |
| --- | --- | --- |
| test1__map-landmark-sandbag-lanes | Landmark | Sandbag firing lanes |
| test1__map-landmark-range-tower | Landmark | Two-storey range tower |
| test1__map-landmark-container-yard | Landmark | Container yard flank |

**test2 (Raid)**

| Slug | View | Notes |
| --- | --- | --- |
| test2__map-landmark-pool-deck | Landmark | Pool deck above |
| test2__map-landmark-sunken-court | Landmark | Sunken court below |
| test2__map-landmark-garden-terraces | Landmark | Garden terraces between |

**map3 (Map 3)**

| Slug | View | Notes |
| --- | --- | --- |
| map3__map-landmark-corridor-hub | Landmark | Paved hub all corridors run off |
| map3__map-landmark-shoreline-corridor | Landmark | Shoreline corridor |
| map3__map-landmark-skyline-corridor | Landmark | Skyline corridor |
| map3__map-landmark-forest-corridor | Landmark | Forest corridor |
| map3__map-landmark-colonnade-corridor | Landmark | Colonnade corridor |

**world-studio (Nuke Town · New World)**

| Slug | View | Notes |
| --- | --- | --- |
| world-studio__map-landmark-house-west | Landmark | West two-storey home + upper rooms |
| world-studio__map-landmark-house-east | Landmark | East two-storey home + upper rooms |

---

### Reconciliation

- Weapon rows: 21 × 8 = 168. Map base rows: 12 × 2 = 24. Street-axis rows: 2. Landmark rows: 5+4+2+3+2+4+2+2+3+3+5+2 = 37. **Total 231.**
- All weapon ids, sight markers, map ids and display names are transcribed from `src/combat/weapon-catalog.ts`, `src/ads-sight-profile.ts`, `src/arena-identity.ts` and `src/map-selection.ts` of frozen Build 19 (`82677da2c`). Landmark names are descriptive slugs for capture placement, anchored to named exports/arena copy where one exists (CENTRAL_BUS, atomic-shed-west/east, nuketown2 sheds, NUKETOWN2_CENTRAL_TRUCK, NUKETOWN2_STREET_COACH, NUKETOWN2_RARE_GUN_SITES, lane labels from the Gun Range menu lede).
