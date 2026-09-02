# Dynamic, coloured, time-of-day and weather lighting - design and first implementation

Lane AB, PASS 87. Owner direction on record since 2026-08-31 ("dynamic /
coloured / time-of-day / weather lighting everywhere"), 2026-09-02 17:05
("lighting feels a bit off"), and "weather can wait" until the overnight build,
which this is.

Every number in this document is generated from
`src/rendering/lighting-conditions.ts` by `artifacts/tod-table.mjs` and
`artifacts/tod-summary.mjs`, not typed by hand. Regenerate with
`npx tsx artifacts/tod-summary.mjs`.

---

## 1. What already existed, and what did not

This is the half of the brief that decides the whole design, so it is stated
first, and it was checked in the source rather than assumed.

**Weather already shipped, and it is good.** Pass 76-79 built
`src/weather/weather-state.ts`: a five-rung severity ladder
(clear -> overcast -> light-rain -> heavy-rain -> storm) derived as a PURE
FUNCTION of `(arenaId, matchSeed, elapsedSeconds)`, with a per-arena
availability table, closed-form wetness integration so a late joiner agrees
exactly, and lightning scheduled O(1) from the same seed. It travels over ZERO
bytes of network traffic. `src/weather/rain-presentation.ts` draws it in exactly
two instanced draws at every density, with a hard readability budget (opacity
capped at 0.34, an ADS exclusion cylinder, a near-lens cull), and Pass 79 closed
the routing gap the 2026-08-31 note describes: `fogDensityMultiplier` now pulls
the fog FAR plane in (never the near plane, so weather adds provably zero
attenuation inside it) and `skyDarkenAmount` drives an overcast hemisphere fill
that can only ADD light.

**Time of day did not exist at all.** Every arena has always been lit at exactly
one hour. `blender-lighting.ts` has one `sunPosition` per profile;
`ArenaVisualDefinition.lighting` has one `sunColor`/`sunIntensity` per arena;
nothing anywhere reads a clock. That is the gap this lane fills, and it is why
the implementation is a new module shaped like the weather model rather than a
change to the weather model.

**Therefore the design decision:** build time of day as weather's twin, compose
the two, and do not touch the weather model. Same purity rules, same derivation
contract, same "fail closed over a sweep" safety proof.

---

## 2. The hard constraint, and what it forces

Three's WebGPU light set is part of every material's cache key. Adding,
removing or toggling a light at runtime invalidates every pipeline and freezes
the game - the PASS 82 root cause. So:

- The light SET is frozen before the coverage fence. `buildSky()` constructs the
  hemisphere, ambient, sun and fill lights once at module scope; the viewmodel
  fill is the fifth and last. Five lights, all built at boot.
- Time of day and weather are **uniform writes** over that frozen set: colour,
  intensity, direction, fog colour, exposure. Nothing else.
- `src/rendering/lighting-conditions.ts` therefore never returns a light. It
  returns numbers. `src/rendering/lighting-conditions-light-set.test.ts` pins
  that as a SOURCE property of the `// LIGHTING:` region in `legacy-main.ts`,
  because the failure it guards against is invisible to a behaviour test: the
  code is correct, the scene is correct, and the game still freezes.

A second cost the constraint does not cover but the owner does: moving the sun
invalidates the static shadow map. So the sun is re-aimed only when it has moved
at least **0.35 degrees**. In `authored`, `early`, `midday`, `late` and `random`
the hour is constant for the match, so the sun moves **exactly zero times** after
the arena applies. Only `cycle` moves it, at most once per 0.004 h step.

---

## 3. The model

### Everything is a delta from the authored hour

Each arena declares the hour its shipped lighting was authored at. At that hour,
in clear weather, every scale is exactly 1, every tint exactly [1,1,1] and both
sun-direction deltas exactly 0 - the resolved writes are the **identity**. A
build pinned to the anchor is the PASS 85 look bit-for-bit, which makes the
whole feature a bounded excursion from a known-good look rather than a repaint,
and makes the A/B free: `?tod=authored` on the same bundle IS the before frame.

### Combat safety: the shadow floor can only rise

The fastest way to hide a player is to darken the shadow they are standing in,
and "it is night now" is not an excuse. The model buys its dusk by HUE, ANGLE and
SKY, never by taking light off the shadow side:

> as the key light falls by `d`, the ambient, hemisphere and fill are all
> multiplied by `1 + 1.15 d`.

The gain is above 1 because ambient light reaching a shadowed surface is a
fraction of what the key contributes to a lit one, so a like-for-like return
would still leave the shadow darker than the shipped arena. The consequence is
`shadowFloorScale >= 1` at every hour of every arena's band in every weather -
arithmetic, not tuning. RustRig's authored night shadow mass (15/255) is the
datum this protects, which is also why RustRig has the narrowest outdoor band in
the game (2.0 h).

### Weather shrinks this model, it never fights it

A storm has no golden hour. Every excursion - key, tints, both sun angles - is
lerped back toward the authored identity in proportion to `skyDarkenAmount`, so
composing weather can only ever REDUCE the time-of-day deviation. The safety
envelope proved for clear weather therefore bounds every weather, and at
`skyDarkenAmount = 1` the writes are exactly the identity again.

### The hue story

- **Direct sun** warms as it drops (long atmospheric path: red survives, blue
  does not), from [1.20 0.84 0.60] at 2 deg to [0.97 1.00 1.06] at 80 deg.
- **Skylight** does the opposite: the lower the sun, the more of the dome is
  scattered blue, so the shadow side goes COOL exactly as the lit side goes warm.
  That opposition is most of what makes a dusk read as a dusk instead of as an
  orange filter. The knee is at 45 deg elevation - it was 30, and at 30 five of
  the seven outdoor arenas had bands entirely above the knee and got a
  mathematically real but invisible sky shift (High Seas moved 0.000 on every
  channel at 07:30).
- **Hemisphere ground** follows the SUN's colour, not the sky's - it is bounce
  off the arena's own floor.
- **Fog** takes the skylight tint at half strength; fog that swings as hard as
  the dome reads as coloured smoke rather than as air. Fog NEAR and FAR are not
  this lane's to touch: near is the whole basis of the weather-fog safety
  argument, and far belongs to weather.
- **Exposure** rises with the key drop (dark adaptation), capped at 1.12x.

### The safety envelope, as enforced numbers

```
sunIntensityScale       [0.55, 1.15]
shadowFloorScale        [1.00, 1.60]   <- minimum of exactly 1 IS the argument
tintChannel             [0.72, 1.30]
exposureScale           [1.00, 1.12]
sunElevationDegrees     [6, 78]        <- never at the horizon: infinite shadows
sunAzimuthDeltaDegrees  [-70, 70]
fogTintChannel          [0.80, 1.25]
```

`assertLightingConditionSafety()` sweeps 9 arenas x 97 hours x 5 weather rungs
at module import and throws on the first escape. It is not advisory.

---

## 4. Per-arena table

Bands are chosen to stay inside each arena's authored identity as
`src/rendering/art-direction.ts` states it; a band that left it would make the
art direction a lie. Weather sets are the ones the arena already authors in
`ARENA_WEATHER_PROFILES` - this lane adds no weather state to any arena.

| arena | identity | band | anchor | weather set | key x (min..max) | shadow floor x (max) | exposure x (max) | sun elev delta (deg) | sun azim delta (deg) |
|---|---|---|---|---|---|---|---|---|---|
| Nuke Town | suburban-afternoon-into-dusk | 15:00-19:00 | 17:30 | clear, overcast, light-rain, heavy-rain | 0.572..1.150 | 1.492 | 1.103 | -16.7..19.9 | -8.2..4.9 |
| Terminal | apron-dawn-to-midmorning | 05:48-10:30 | 07:00 | clear, overcast, light-rain, heavy-rain | 0.570..1.150 | 1.495 | 1.103 | -13.0..26.0 | -3.6..10.5 |
| RustRig | north-sea-rig-dusk-into-night | 20:00-22:00 | 21:00 | clear, overcast, light-rain, heavy-rain, storm | 0.715..1.150 | 1.328 | 1.068 | -7.5..7.0 | -1.6..1.6 |
| Gun Range | indoor-range-no-sky **(pinned)** | 12:00-12:00 | 12:00 | clear | 1.000..1.000 | 1.000 | 1.000 | 0.0..0.0 | 0.0..0.0 |
| Farcrysis | tropical-midmorning-to-late-afternoon | 09:00-17:00 | 12:30 | clear, overcast, light-rain, heavy-rain, storm | 0.575..1.001 | 1.488 | 1.102 | -40.3..0.1 | -15.1..19.4 |
| High Seas | open-ocean-morning-through-dusk | 07:30-19:00 | 13:00 | clear, overcast, light-rain, heavy-rain, storm | 0.550..1.000 | 1.518 | 1.108 | -40.1..0.0 | -21.3..23.2 |
| Firing Range | dry-range-hard-morning-sun | 09:00-13:00 | 10:30 | clear | 0.804..1.048 | 1.226 | 1.047 | -17.6..6.3 | -5.1..8.5 |
| Raid | golden-hour-hillside | 16:00-18:30 | 17:00 | clear | 0.574..1.150 | 1.490 | 1.102 | -16.6..9.2 | -1.9..2.9 |
| Map 3 | open-scrub-midmorning-preview-pinned **(pinned)** | 10:00-10:00 | 10:00 | clear, overcast | 1.000..1.000 | 1.000 | 1.000 | 0.0..0.0 | 0.0..0.0 |

Two arenas are **pinned** to the identity at every choice, so no consumer has to
remember they are special:

- **Gun Range** is indoors. Its weather profile is already `clear`-only for the
  same reason; its daylight profile matches.
- **Map 3** is PREVIEW and Lane V owns its look while it is being built. A second
  lane moving its sun underneath it would be a merge conflict rendered on screen.
  Its row is the template below, filled in with a zero-width band.

### Preset template (for Nuke Town Rebuild, Map 3 and any new arena)

A lane adding an arena adds one row to `ARENA_DAYLIGHT_PROFILES`:

```ts
'<arena-id>': profile(
  '<arena-id>',
  '<unique-authoring-identity>',   // the tests pin uniqueness
  false,                           // pinned: true while your lane owns the look
  <authoredHour>,                  // the hour your SHIPPED lighting was made at
  [<bandStart>, <bandEnd>],        // must contain authoredHour
  [<arcDawn>, <arcDusk>],          // must contain the band; TIGHT for a narrow band
  [<minElevationDeg>, <maxElevationDeg>],
  <azimuthSwingDeg>,               // end-to-end sun swing across the arc
  <cycleMatchMinutes>,             // full traversal time in `cycle` mode
),
```

Rules the tests enforce for you: the authored hour lies inside the band, the band
lies inside the arc, the identity string is unique, and every resolved write
across the band in every weather stays inside the envelope above. If the arc is
much wider than the band, your arena will barely move - that was the measured
defect on Firing Range, whose 06:00-19:00 arc left its 09:00-13:00 band within
four degrees of the peak and moved the key light 5% end to end. Start with an arc
about 2.5x your band and check `artifacts/tod-summary.mjs`.

---

## 5. Per-arena state table, with the actual writes

Generated. `+ heavy` rows show the same hour composed with
`skyDarkenAmount = 0.45` (the heavy-rain rung) to show weather pulling the
excursion back toward the authored identity.

### Nuke Town (`atomic-acres`) — suburban-afternoon-into-dusk
anchor 17:30 | band 15:00-19:00 | arc 06:00-20:00 | elev 8-62 deg | az swing 46 deg | cycle 6 min
| state | hour | sun x | elev d | azim d | shadow floor x | exposure x | sun tint RGB | sky tint RGB |
|---|---|---|---|---|---|---|---|---|
| authored | 17:30 | 1.000 | 0.0 | 0.0 | 1.000 | 1.000 | 1.000 1.000 1.000 | 1.000 1.000 1.000 |
| authored + heavy | 17:30 | 1.000 | 0.0 | 0.0 | 1.000 | 1.000 | 1.000 1.000 1.000 | 1.000 1.000 1.000 |
| early | 15:00 | 1.150 | 19.9 | -8.2 | 1.000 | 1.000 | 0.974 1.000 1.050 | 1.030 1.015 0.974 |
| early + heavy | 15:00 | 1.150 | 11.0 | -4.5 | 1.000 | 1.000 | 0.992 1.000 1.016 | 1.016 1.008 0.986 |
| midday | 17:00 | 1.112 | 4.9 | -1.6 | 1.000 | 1.000 | 0.993 1.000 1.013 | 1.018 1.009 0.984 |
| midday + heavy | 17:00 | 1.062 | 2.7 | -0.9 | 1.000 | 1.000 | 0.998 1.000 1.004 | 1.005 1.003 0.995 |
| late | 19:00 | 0.572 | -16.7 | 4.9 | 1.492 | 1.103 | 1.053 0.967 0.881 | 0.940 0.970 1.053 |
| late + heavy | 19:00 | 0.773 | -9.2 | 2.7 | 1.261 | 1.054 | 1.011 0.995 0.977 | 0.982 0.991 1.016 |

### Terminal (`skyline-terminal`) — apron-dawn-to-midmorning
anchor 07:00 | band 05:48-10:30 | arc 05:00-19:00 | elev 7-58 deg | az swing 42 deg | cycle 6 min
| state | hour | sun x | elev d | azim d | shadow floor x | exposure x | sun tint RGB | sky tint RGB |
|---|---|---|---|---|---|---|---|---|
| authored | 07:00 | 1.000 | 0.0 | 0.0 | 1.000 | 1.000 | 1.000 1.000 1.000 | 1.000 1.000 1.000 |
| authored + heavy | 07:00 | 1.000 | 0.0 | 0.0 | 1.000 | 1.000 | 1.000 1.000 1.000 | 1.000 1.000 1.000 |
| early | 05:48 | 0.570 | -13.0 | -3.6 | 1.495 | 1.103 | 1.057 0.956 0.865 | 0.952 0.977 1.040 |
| early + heavy | 05:48 | 0.768 | -7.2 | -2.0 | 1.266 | 1.056 | 1.017 0.987 0.959 | 0.985 0.993 1.012 |
| midday | 08:09 | 1.150 | 11.0 | 3.5 | 1.000 | 1.000 | 0.982 1.003 1.036 | 1.041 1.020 0.966 |
| midday + heavy | 08:09 | 1.150 | 6.0 | 1.9 | 1.000 | 1.000 | 0.994 1.002 1.013 | 1.012 1.006 0.990 |
| late | 10:30 | 1.150 | 26.0 | 10.5 | 1.000 | 1.000 | 0.962 1.003 1.077 | 1.059 1.029 0.951 |
| late + heavy | 10:30 | 1.150 | 14.3 | 5.8 | 1.000 | 1.000 | 0.988 1.002 1.025 | 1.029 1.014 0.976 |

### RustRig (`rustworks-1v1`) — north-sea-rig-dusk-into-night
anchor 21:00 | band 20:00-22:00 | arc 04:30-23:30 | elev 6-54 deg | az swing 30 deg | cycle 8 min
| state | hour | sun x | elev d | azim d | shadow floor x | exposure x | sun tint RGB | sky tint RGB |
|---|---|---|---|---|---|---|---|---|
| authored | 21:00 | 1.000 | 0.0 | 0.0 | 1.000 | 1.000 | 1.000 1.000 1.000 | 1.000 1.000 1.000 |
| authored + heavy | 21:00 | 1.000 | 0.0 | 0.0 | 1.000 | 1.000 | 1.000 1.000 1.000 | 1.000 1.000 1.000 |
| early | 20:00 | 1.150 | 7.0 | -1.6 | 1.000 | 1.000 | 0.977 1.016 1.057 | 1.026 1.013 0.979 |
| early + heavy | 20:00 | 1.139 | 3.8 | -0.9 | 1.000 | 1.000 | 0.991 1.007 1.023 | 1.008 1.004 0.994 |
| midday | 21:00 | 1.000 | 0.0 | 0.0 | 1.000 | 1.000 | 1.000 1.000 1.000 | 1.000 1.000 1.000 |
| midday + heavy | 21:00 | 1.000 | 0.0 | 0.0 | 1.000 | 1.000 | 1.000 1.000 1.000 | 1.000 1.000 1.000 |
| late | 22:00 | 0.715 | -7.5 | 1.6 | 1.328 | 1.068 | 1.032 0.975 0.919 | 0.972 0.986 1.023 |
| late + heavy | 22:00 | 0.845 | -4.1 | 0.9 | 1.178 | 1.037 | 1.010 0.992 0.975 | 0.991 0.996 1.007 |

### Gun Range (`gun-range`) — indoor-range-no-sky — PINNED
anchor 12:00 | band 12:00-12:00 | arc 06:00-18:00 | elev 40-40 deg | az swing 0 deg | cycle 6 min
| state | hour | sun x | elev d | azim d | shadow floor x | exposure x | sun tint RGB | sky tint RGB |
|---|---|---|---|---|---|---|---|---|
| authored | 12:00 | 1.000 | 0.0 | 0.0 | 1.000 | 1.000 | 1.000 1.000 1.000 | 1.000 1.000 1.000 |
| authored + heavy | 12:00 | 1.000 | 0.0 | 0.0 | 1.000 | 1.000 | 1.000 1.000 1.000 | 1.000 1.000 1.000 |
| early | 12:00 | 1.000 | 0.0 | 0.0 | 1.000 | 1.000 | 1.000 1.000 1.000 | 1.000 1.000 1.000 |
| early + heavy | 12:00 | 1.000 | 0.0 | 0.0 | 1.000 | 1.000 | 1.000 1.000 1.000 | 1.000 1.000 1.000 |
| midday | 12:00 | 1.000 | 0.0 | 0.0 | 1.000 | 1.000 | 1.000 1.000 1.000 | 1.000 1.000 1.000 |
| midday + heavy | 12:00 | 1.000 | 0.0 | 0.0 | 1.000 | 1.000 | 1.000 1.000 1.000 | 1.000 1.000 1.000 |
| late | 12:00 | 1.000 | 0.0 | 0.0 | 1.000 | 1.000 | 1.000 1.000 1.000 | 1.000 1.000 1.000 |
| late + heavy | 12:00 | 1.000 | 0.0 | 0.0 | 1.000 | 1.000 | 1.000 1.000 1.000 | 1.000 1.000 1.000 |

### Farcrysis (`farcrysis`) — tropical-midmorning-to-late-afternoon
anchor 12:30 | band 09:00-17:00 | arc 06:00-18:30 | elev 10-74 deg | az swing 54 deg | cycle 7 min
| state | hour | sun x | elev d | azim d | shadow floor x | exposure x | sun tint RGB | sky tint RGB |
|---|---|---|---|---|---|---|---|---|
| authored | 12:30 | 1.000 | 0.0 | 0.0 | 1.000 | 1.000 | 1.000 1.000 1.000 | 1.000 1.000 1.000 |
| authored + heavy | 12:30 | 1.000 | 0.0 | 0.0 | 1.000 | 1.000 | 1.000 1.000 1.000 | 1.000 1.000 1.000 |
| early | 09:00 | 0.840 | -20.1 | -15.1 | 1.184 | 1.038 | 1.013 1.000 0.979 | 1.000 1.000 1.000 |
| early + heavy | 09:00 | 0.926 | -11.0 | -8.3 | 1.085 | 1.018 | 1.004 1.000 0.994 | 1.000 1.000 1.000 |
| midday | 13:00 | 0.995 | -1.0 | 2.2 | 1.006 | 1.001 | 1.001 1.000 0.999 | 1.000 1.000 1.000 |
| midday + heavy | 13:00 | 0.997 | -0.6 | 1.2 | 1.003 | 1.001 | 1.000 1.000 1.000 | 1.000 1.000 1.000 |
| late | 17:00 | 0.575 | -40.3 | 19.4 | 1.488 | 1.102 | 1.042 1.000 0.929 | 0.960 0.980 1.037 |
| late + heavy | 17:00 | 0.817 | -22.2 | 10.7 | 1.211 | 1.044 | 1.009 1.000 0.986 | 1.000 1.000 1.000 |

### High Seas (`high-seas`) — open-ocean-morning-through-dusk
anchor 13:00 | band 07:30-19:00 | arc 05:30-20:30 | elev 8-66 deg | az swing 58 deg | cycle 7 min
| state | hour | sun x | elev d | azim d | shadow floor x | exposure x | sun tint RGB | sky tint RGB |
|---|---|---|---|---|---|---|---|---|
| authored | 13:00 | 1.000 | 0.0 | 0.0 | 1.000 | 1.000 | 1.000 1.000 1.000 | 1.000 1.000 1.000 |
| authored + heavy | 13:00 | 1.000 | 0.0 | 0.0 | 1.000 | 1.000 | 1.000 1.000 1.000 | 1.000 1.000 1.000 |
| early | 07:30 | 0.573 | -34.4 | -21.3 | 1.491 | 1.102 | 1.040 1.000 0.931 | 0.953 0.977 1.044 |
| early + heavy | 07:30 | 0.802 | -18.9 | -11.7 | 1.228 | 1.048 | 1.010 1.000 0.983 | 1.000 1.000 1.000 |
| midday | 13:15 | 0.999 | -0.1 | 1.0 | 1.001 | 1.000 | 1.000 1.000 1.000 | 1.000 1.000 1.000 |
| midday + heavy | 13:15 | 1.000 | -0.0 | 0.5 | 1.000 | 1.000 | 1.000 1.000 1.000 | 1.000 1.000 1.000 |
| late | 19:00 | 0.550 | -40.1 | 23.2 | 1.518 | 1.108 | 1.061 0.986 0.888 | 0.933 0.967 1.062 |
| late + heavy | 19:00 | 0.760 | -22.0 | 12.8 | 1.276 | 1.058 | 1.012 1.000 0.979 | 0.998 0.999 1.002 |

### Firing Range (`test1`) — dry-range-hard-morning-sun
anchor 10:30 | band 09:00-13:00 | arc 07:00-17:00 | elev 12-70 deg | az swing 34 deg | cycle 6 min
| state | hour | sun x | elev d | azim d | shadow floor x | exposure x | sun tint RGB | sky tint RGB |
|---|---|---|---|---|---|---|---|---|
| authored | 10:30 | 1.000 | 0.0 | 0.0 | 1.000 | 1.000 | 1.000 1.000 1.000 | 1.000 1.000 1.000 |
| authored + heavy | 10:30 | 1.000 | 0.0 | 0.0 | 1.000 | 1.000 | 1.000 1.000 1.000 | 1.000 1.000 1.000 |
| early | 09:00 | 0.804 | -17.6 | -5.1 | 1.226 | 1.047 | 1.018 1.000 0.969 | 1.000 1.000 1.000 |
| early + heavy | 09:00 | 0.903 | -9.7 | -2.8 | 1.112 | 1.023 | 1.004 1.000 0.994 | 1.000 1.000 1.000 |
| midday | 11:00 | 1.028 | 3.5 | 1.7 | 1.000 | 1.000 | 0.998 1.000 1.003 | 1.000 1.000 1.000 |
| midday + heavy | 11:00 | 1.016 | 1.9 | 0.9 | 1.000 | 1.000 | 0.999 1.000 1.001 | 1.000 1.000 1.000 |
| late | 13:00 | 1.028 | 3.5 | 8.5 | 1.000 | 1.000 | 0.998 1.000 1.003 | 1.000 1.000 1.000 |
| late + heavy | 13:00 | 1.016 | 1.9 | 4.7 | 1.000 | 1.000 | 0.999 1.000 1.001 | 1.000 1.000 1.000 |

### Raid (`test2`) — golden-hour-hillside
anchor 17:00 | band 16:00-18:30 | arc 06:00-19:30 | elev 8-60 deg | az swing 26 deg | cycle 6 min
| state | hour | sun x | elev d | azim d | shadow floor x | exposure x | sun tint RGB | sky tint RGB |
|---|---|---|---|---|---|---|---|---|
| authored | 17:00 | 1.000 | 0.0 | 0.0 | 1.000 | 1.000 | 1.000 1.000 1.000 | 1.000 1.000 1.000 |
| authored + heavy | 17:00 | 1.000 | 0.0 | 0.0 | 1.000 | 1.000 | 1.000 1.000 1.000 | 1.000 1.000 1.000 |
| early | 16:00 | 1.150 | 9.2 | -1.9 | 1.000 | 1.000 | 0.987 1.000 1.024 | 1.030 1.015 0.973 |
| early + heavy | 16:00 | 1.116 | 5.1 | -1.1 | 1.000 | 1.000 | 0.996 1.000 1.007 | 1.010 1.005 0.991 |
| midday | 17:15 | 0.938 | -2.6 | 0.5 | 1.071 | 1.015 | 1.004 1.000 0.993 | 0.991 0.995 1.008 |
| midday + heavy | 17:15 | 0.966 | -1.4 | 0.3 | 1.039 | 1.008 | 1.001 1.000 0.998 | 0.997 0.999 1.002 |
| late | 18:30 | 0.574 | -16.6 | 2.9 | 1.490 | 1.102 | 1.053 0.967 0.881 | 0.940 0.971 1.052 |
| late + heavy | 18:30 | 0.774 | -9.1 | 1.6 | 1.260 | 1.054 | 1.011 0.995 0.976 | 0.982 0.991 1.016 |

### Map 3 (`map3`) — open-scrub-midmorning-preview-pinned — PINNED
anchor 10:00 | band 10:00-10:00 | arc 06:00-19:00 | elev 12-66 deg | az swing 0 deg | cycle 6 min
| state | hour | sun x | elev d | azim d | shadow floor x | exposure x | sun tint RGB | sky tint RGB |
|---|---|---|---|---|---|---|---|---|
| authored | 10:00 | 1.000 | 0.0 | 0.0 | 1.000 | 1.000 | 1.000 1.000 1.000 | 1.000 1.000 1.000 |
| authored + heavy | 10:00 | 1.000 | 0.0 | 0.0 | 1.000 | 1.000 | 1.000 1.000 1.000 | 1.000 1.000 1.000 |
| early | 10:00 | 1.000 | 0.0 | 0.0 | 1.000 | 1.000 | 1.000 1.000 1.000 | 1.000 1.000 1.000 |
| early + heavy | 10:00 | 1.000 | 0.0 | 0.0 | 1.000 | 1.000 | 1.000 1.000 1.000 | 1.000 1.000 1.000 |
| midday | 10:00 | 1.000 | 0.0 | 0.0 | 1.000 | 1.000 | 1.000 1.000 1.000 | 1.000 1.000 1.000 |
| midday + heavy | 10:00 | 1.000 | 0.0 | 0.0 | 1.000 | 1.000 | 1.000 1.000 1.000 | 1.000 1.000 1.000 |
| late | 10:00 | 1.000 | 0.0 | 0.0 | 1.000 | 1.000 | 1.000 1.000 1.000 | 1.000 1.000 1.000 |
| late + heavy | 10:00 | 1.000 | 0.0 | 0.0 | 1.000 | 1.000 | 1.000 1.000 1.000 | 1.000 1.000 1.000 |

---

## 6. Replication

Weather's model is the precedent and it is followed exactly: the hour is
DERIVED, not sent.

- `weatherMatchSeed = deriveWeatherMatchSeed(hostId, matchEpochMs)` already
  exists and is peer-agreed. Time of day reuses it. No new seed, no new channel.
- The elapsed clock is the same `matchState.phaseStartedAt` delta weather uses.
- The only replicated NEW value is the host's MODE, which rides
  `PrivateMatchConfig.timeOfDay` beside the HF-377 time and kill limits. It is
  optional and tolerant (like `skinId`/`stanceId`), so pre-PASS-87 checkpoints,
  rejoin envelopes and saved lobbies still validate; absent means the default.
- Cost: one short string per lobby snapshot, zero bytes per frame.

**Why it is not a graphics option.** `weatherIntensity` is a local setting
because it is a presentation CLAMP: it can only show less of a sky every peer
already agrees on. The hour is not a clamp, it is the sky. Two peers on
different hours are arguing about a different match.

**The lobby row** `#lobby-time-of-day` mirrors the host's choice for guests and
is read-only to them, the same shape the two limits already use. It disables
itself on Gun Range and Map 3 rather than offering a choice that provably
resolves to the identity. Labels are arena-relative on purpose
(EARLY / MIDDAY / LATE / RANDOM / CYCLE OVER MATCH): LATE is dusk on Nuke Town
and night on RustRig, and a menu promising "20:00" would be lying on one of them.

**Solo** is the host, so the solo player's own choice applies; the default is
`random`, which picks a seeded hour inside the arena's band - the variety the
owner asked for - and `authored` pins the PASS 85 look for anyone who wants it.

**Bots and remotes** are unaffected: nothing in this lane touches simulation,
authority, perception or hit registration. It writes lights.

---

## 7. What this lane deliberately did NOT do

- **No new weather states, and no change to the weather model.** It is good, it
  is proved, and the gap was time of day.
- **No wet-surface response changes.** `WETNESS_RESPONSE` already exists and is
  driven by the weather model; time of day has no business in it.
- **No sky-dome repaint.** `buildSky()` sets `skyMaterial = null` on both
  backends - the arena's equirectangular backdrop is the one sky owner. Tinting
  the backdrop is an arena-asset change and belongs to the arena lanes.
- **No light added for a "moon".** The obvious way to sell night is a second
  directional light. That is exactly the PASS 82 freeze. Night is bought with
  the four lights that already exist.
- **Nuke Town Rebuild (HF-407) and Map 3 internals** are untouched, per the lane
  boundary. Map 3 is pinned; the template above is how its lane adds a row.

---

## 8. Where the next pass should go

1. **Sky backdrop tint.** The strongest remaining lever is the equirectangular
   backdrop, which does not move with the hour. Tinting it is one uniform if the
   backdrop is sampled through a TSL node the arena owns - but it is an arena
   asset, so it needs the arena lanes' agreement, not this lane's.
2. **`cycle` as a default.** It is implemented and safe, but it is not the
   default because it re-aims the sun and refreshes the static shadow map; that
   cadence's frame-time cost should be measured on the owner's box first.
3. **Lane AL composition.** Baked indirect probes are baked at ONE hour. The
   preset table is the shared file: an arena's band tells Lane AL how far its
   bake has to stay valid, and a wide band (High Seas 11.5 h, Farcrysis 8 h) is a
   reason either to bake more than one hour there or to keep the probe
   contribution low.
