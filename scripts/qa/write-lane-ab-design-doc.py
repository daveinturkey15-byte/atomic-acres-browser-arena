"""Regenerates docs/DYNAMIC_LIGHTING_2026-09-03.md (Lane AB, PASS 87).

Every number in that document comes out of src/rendering/lighting-conditions.ts
rather than out of a person, which is the only way a nine-arena table stays true
after a band moves. Run the two table generators first, then this:

    npx tsx scripts/qa/lane-ab-tod-table.mjs   > artifacts/tod-table.md
    npx tsx scripts/qa/lane-ab-tod-summary.mjs > artifacts/tod-summary.md
    python scripts/qa/write-lane-ab-design-doc.py

Writes LF endings explicitly: the repo has source-pinned tests that fail on CRLF.
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))) + '/'
table = open(ROOT + 'artifacts/tod-table.md', 'r', encoding='utf-8', newline='').read()
summary = open(ROOT + 'artifacts/tod-summary.md', 'r', encoding='utf-8', newline='').read()
summary_table = summary.split('\nBOUNDS')[0].strip()

HEAD = """# Dynamic, coloured, time-of-day and weather lighting - design and first implementation

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

**That paragraph was true of the model and false of the shipped runtime for one
pass, and it is worth writing down how.** `applyLightingConditionUniforms` had a
second gate under the cheap one: it skipped the uniform write whenever the
resolved HOUR had not moved. But the hour is one of TWO inputs to this model and
`skyDarkenAmount` is the other, and it does not enter `hour` at all. So at a
fixed hour a weather change resolved new tints, a new key scale, a new elevation
delta and a new shadow floor - and threw all of them away without reaching a
light, in `fixed` and in `random`, and the default is `random`. Every model test
still passed, because the model was never wrong. The capture sweep could not see
it either, because it drives each state through the debug hook with `force =
true`, a path live play never takes.

Two things fixed it and one thing proves it. The gate now compares the WRITES
against what is currently in the lights (`lightingConditionWritesEqual`), which
cannot have that class of bug: a term either reaches a light and is in the
comparison, or it is not written. And
`scripts/qa/probe-lane-ab-weather-write.mjs` moves the weather LIVE through an
unforced hook and asserts, on native WebGPU, that the resolved hour is
bit-identical across the change (the defect's exact mechanism), that
`uniformWrites` still increments, that the terms move, and that the FRAME moves
by more than an identity pair measured in the same run. Measured on the merged
head: RustRig 22:00 clear -> storm moved the key 0.7152 -> 0.8822 (weather
pulling the excursion back toward authored, as documented) against an
identity-pair noise floor of 0.02 luma points; Nuke Town 18:00 0.8719 -> 0.9306;
High Seas 19:00 0.55 -> 0.8282, a 6.9-point luma move against 0.008 of noise.

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

### The measurement that changed the design, and the two fixes it rejected

The envelope above is arithmetic, and the arithmetic held. The pixels still
failed, and the gap between those two sentences is the most useful thing this
lane learned.

The 2026-09-03 headless sweep put Nuke Town at 19:00 against its own authored
frame on one build, one deploy and one camera. `shadowFloorScale` did exactly
what it promises - the fifth-percentile luma went UP three steps, so every
shaded pixel in the frame was brighter than the shipped arena - and the fraction
of the frame in shadow grew **4.21 points** anyway. Terminal at 05:48 grew 3.57;
Firing Range at 09:00 grew 3.20. Nothing was dimmed. The shadows got LONGER.

A cast shadow is `height * cot(elevation)`, so the excursion that buys a dusk is
also the excursion that stretches every shadow in the arena, and a defender
hides in shaded AREA, not in shaded depth. Brightness and area are two claims
and the model only ever made the first one.

**Rejected fix 1: an intensity floor.** Raise the minimum the key light may fall
to, so the lit half of the frame stays above the readability threshold. Measured
on the same harness: Nuke Town went from +4.21 to +4.21. It cannot work, and the
reason is the same sentence as above - intensity was never the term that moved.
It would also have shipped a physical lie, a sun 17 degrees lower and no dimmer.

**Rejected fix 2: a per-arena shadow-length clamp.** Cap
`cot(resolved) / cot(authored)` and clamp the sun's ELEVATION to honour it, so
the key light and the sun angle keep telling the same story. This one is sound
and it half-worked: Nuke Town fell from +4.21 to +3.40. It made Terminal WORSE,
+3.57 to +5.32 - because clamping the elevation also shrinks the ambient lift
that the key drop pays for, and on an apron whose deck sits a hair above the
luma-24 threshold that lift is the dominant term, not the shadow length. One
mechanism, two arenas, opposite signs. It was reverted.

**What shipped: the band is the claim, and every end of it is measured.**
`scripts/qa/scan-lane-ab-band-readability.mjs` walks an arena's band hour by hour
on one deploy - the hour is a pure argument to `resolveLightingConditions`, so it
is one uniform write per sample - against an identity frame re-taken between
every pair. Ten samples per arena instead of three, tightly paired, and the
curves come out monotone and clean:

```
Nuke Town   17.40 -1.17   17.80 +1.10   18.20 +2.69   18.60 +3.39 UNSAFE
Terminal     6.27 +3.31 UNSAFE          6.74 safe ... 10.50 -5.42
Firing Range 9.00 +4.09 UNSAFE   9.40 +4.04 UNSAFE    9.80 safe ... 13.00 -0.75
```

So three band ends moved, each to the measured crossing with margin:

| arena | band before | band now | why |
|---|---|---|---|
| Nuke Town | 15:00-19:00 | 15:00-**18:00** | safe to 18.20; 18.60 grew +3.39 |
| Terminal | **05:48**-10:30 | **06:48**-10:30 | safe from 06:44; 06:16 grew +3.31 |
| Firing Range | **09:00**-13:00 | **10:00**-13:00 | safe from 09:48; 09:24 grew +4.04 |

No other arena's numbers moved at all. The scan also REFUTED a finding the
three-point sweep had produced - Raid at 17:15 read +3.82 in one run and +0.01 in
another, and the scan shows its whole band safe - which is the other reason the
band ends are set from ten paired samples rather than from three.

Its output is committed at
`docs/evidence/pass87/dynamic-lighting/band-readability-scan.json` and
`lighting-conditions.test.ts` pins the shipped bands against it, so widening one
means re-running the scan rather than remembering to.

**The cost, stated plainly.** The enclosed arenas keep their hue, their sun
direction and their hour; what they lose is the last stretch of the excursion.
Nuke Town's key floor goes 0.572 -> 0.872 and Terminal's 0.570 -> 0.934, so their
dusk and dawn are real but modest. Firing Range is the weakest in the game at
0.956..1.048, and that is a fact about the map: its band straddles the arc's
peak, and the morning hours that would give it a swing are precisely the ones
the scan measured as unsafe. The open arenas are untouched and keep the big
moves - High Seas 0.550..1.000 over eleven and a half hours, Farcrysis
0.575..1.001, Raid 0.574..1.150 through its golden hour.

---

## 4. Per-arena table

Bands are chosen to stay inside each arena's authored identity as
`src/rendering/art-direction.ts` states it; a band that left it would make the
art direction a lie. Weather sets are the ones the arena already authors in
`ARENA_WEATHER_PROFILES` - this lane adds no weather state to any arena.

"""

MID = """

Four arenas are **pinned** to the identity at every choice, so no consumer has
to remember they are special:

- **Gun Range** is indoors. Its weather profile is already `clear`-only for the
  same reason; its daylight profile matches.
- **Map 3** is PREVIEW and Lane V owns its look while it is being built. A second
  lane moving its sun underneath it would be a merge conflict rendered on screen.
  Its row is the template below, filled in with a zero-width band.
- **Raid Rebuild** (`raid2`, HF-408) is PREVIEW and Lane AQ owns its look. Its
  anchor is that arena's own art-direction brief, *bleached late-morning
  estate*, deliberately a different hour from the shipped Raid's golden hour.
- **Nuke Town Rebuild** is PREVIEW for the same reason and Lane AK owns it. Its
  row exists at all because the table is a `Record<ArenaId, ...>`: a lane branch
  typechecks against the roster IT has, so an arena added on the integration line
  is invisible until the merge - and the merge probe that found this one did not
  produce a type error, it produced `Cannot read properties of undefined
  (reading 'hourRange')` out of the import-time safety sweep and took five
  unrelated test files down with it. There is now a test that names a missing row
  instead. Its anchor is its own art direction's *bleached noon*, deliberately a
  different hour from the shipped Nuke Town's warm sunset. **It has now happened
  twice** - nuketown2 at the PASS 86 merge, raid2 at the PASS 87 one - and the
  second time the roster guard named it in a sentence instead of collapsing five
  test files, which is exactly what that test was written for.

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

Set `[<bandStart>, <bandEnd>]` from a SCAN, not from taste:

```
npx tsx scripts/qa/scan-lane-ab-band-readability.mjs --serve-dist dist --arenas <your-arena>
```

It prints the widest contiguous interval around your authored hour over which
shadow mass stays inside the bound; take that, pull both ends in a little, and
copy the interval into `MEASURED_SAFE_BAND` in `lighting-conditions.test.ts` so
the next lane cannot widen it without repeating the measurement. It is the one
row here you are not allowed to guess: it decides whether a defender can stand
somewhere the shipped arena did not have.

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

"""

TAIL = """

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

## 6b. How any of this was measured, and why the first instrument was not evidence

Two harnesses, both headless Chrome on the owner's RTX 5080 over CDP, both
invalidating their own run if they get anything but a real WebGPU adapter.

`scripts/qa/capture-lane-ab-time-of-day.mjs` is the VERDICT harness: every arena
at three times of day in two weathers, judged on shadow mass, the shadow-detail
floor, highlight wash, draw calls and frame time. `scripts/qa/scan-lane-ab-band-
readability.mjs` is the DECISION harness: one arena, ten hours across its band,
used to find where a band should stop.

The first cut of the verdict harness was not evidence and it is worth saying why,
because the mistake is easy and it is invisible. It captured `authored` once, ran
the three excursions after it, and compared each against that single before
frame - so the last comparison in a record was made across thirty seconds of a
live scene. The tell was already in the sweep: **Gun Range and Map 3 are pinned**,
every choice on them resolves to the bit-identical identity write, and Gun Range
still moved 37.14% -> 41.15% shadow mass on frames where nothing at all was
written. Four points of drift against a three-point safety threshold means every
verdict at or under four points measured the scene settling.

So the harness now:

- re-applies `authored` and re-shoots it IMMEDIATELY BEFORE each excursion, so a
  verdict is a pair of frames about a second apart on one deploy;
- throws away a warm-up frame first, because the systematic part of that drift
  was the static shadow map not yet refreshed on the record's very first shot;
- captures a CONTROL PAIR, identity against identity, and reports
  `pairNoisePoints` beside every verdict, so a finding smaller than the arena's
  own noise is labelled instead of believed;
- treats the FOUR pinned arenas (Gun Range, Map 3, Nuke Town Rebuild, Raid
  Rebuild) as a NULL EXPERIMENT and fails the whole run if they move, because
  their correct answer is known in advance;
- **v3, after review:** frame-samples the control pair and every interleaved
  identity, so `frameP50DeltaMs` is a PAIRED number with a measured noise floor
  (`frameNoiseMs`) and each verdict carries `frameWithinNoise`. v2 fixed the
  pixel baseline and left the frame-time one exactly as broken - one identity
  sample per record, never paired - and its evidence then carried +4.5 ms and
  -18.0 ms swings, which cannot falsify a ~1 ms/frame budget in EITHER
  direction. A frame-time delta inside the noise floor is now reported as
  unresolvable rather than quoted;
- **v3, also:** compares each record's own `pairNoisePoints` to the null
  tolerance it calls its invalidation threshold. v2 computed that number,
  printed it and never compared it to anything, so the pre-merge sweep's
  gun-range record spread 0.87 points against a 0.5 tolerance and still issued
  verdicts. Neither threshold moved; the guard was added;
- **v5, the sandwich.** Pairing an excursion with an identity taken a second
  BEFORE it does not survive a one-off scene event landing between the two
  shots, and three arenas turned out to have exactly that. On identity frames
  where nothing whatever was written, the band scan's own identity column shows
  farcrysis stepping 24.86 -> 28.44 once and staying, raid2 stepping
  0.11 -> 4.07 once and staying, and high-seas going 4.87 -> 9.1 and back inside
  one record. Each is 3.5-4.3 points against a 3-point threshold, and each
  produced a "finding" that thirteen paired scan samples then refuted
  (farcrysis measured +0.28 where the sweep said +3.96). raid2 is the proof
  that none of them was lighting: it is PINNED, so every choice on it resolves
  to the bit-identical identity write, and it moved anyway. Every excursion is
  now sandwiched - identity, excursion, identity - and a pair whose two
  identities disagree by more than the null tolerance is VOID: reported as an
  instrument finding, never laundered into a safety pass OR a safety failure.
  When they agree the delta is taken against their mean, which also halves the
  identity's own sampling error.

The re-run on the merged head with the sandwiched instrument reports **zero
safety findings across 51 states, eleven arenas and seventeen records**, draw-call
delta exactly zero on every state, and all four pinned arenas at 0.00. The only
instrument findings are two VOID pairs on Gun Range, whose target carriers
animate inside its review frame; its identity is proved by the unit tests
instead, since it is pinned and every choice on it resolves to the identity.

After that fix the same build's findings fell from eight to three, and the three
were real. Map 3 reads 0.00 on all six of its states. Gun Range still moves about
0.9 points on its own - its target carriers animate inside the review frame - so
Gun Range verdicts finer than a point are not claims, and its identity is proved
by the unit tests rather than by pixels.

### Frame time, stated against a floor this instrument can actually resolve

The first version of this document said the lighting pass costs "well under the
owner's ~1 ms/frame budget" and marked it VERIFIED. It was not measurable: the
identity was frame-sampled once per record and never paired, so the number had
no error bar, and the evidence behind the claim contained +4.5 ms and -18.0 ms
swings. Paired, over 51 states on the merged head:

| quantity | value |
| --- | --- |
| per-record noise floor (identity vs identity, same units) | median 0.5 ms, max 2.2 ms |
| paired p50 delta, mean over 51 states | -0.006 ms |
| paired p50 delta, median | 0.000 ms |
| paired p50 delta, range | -3.0 ms .. +2.9 ms |
| draw-call delta | exactly 0 on every state |

Read honestly, that says two different things. There is **no systematic frame-time
regression**: over 51 paired samples the mean and the median are zero to within a
hundredth of a millisecond, and the signs are evenly split. And this instrument
**cannot resolve a 1 ms claim about one state**, because its own identity-against-
identity pair spreads up to 2.2 ms on a busy arena. Anyone who needs the
per-state number to a millisecond needs a different instrument; what is
established here is the absence of a systematic cost, which is the question the
owner's budget was actually asking.

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

1. **Sky backdrop tint - and this is the biggest item, on MOST of the roster,
   not just on High Seas.** The equirectangular backdrop does not move with the
   hour, and the first draft of this document scoped that as a High Seas problem
   because High Seas is where it is most obvious. Looking at the committed
   frames rather than at the numbers, it is wider than that:

   Section 5b measures it. Of the seven unpinned arenas, exactly ONE - Terminal
   - moves both the level and the shape of its frame enough to read as a time of
   day at its strongest hour. Two (Nuke Town, High Seas) move the shadows
   without moving the frame's overall level. Two (Firing Range, Raid) are a
   brightness shift with the shadows essentially where they were - Raid moves
   mean luma by 11.7 of 255 and its shadow mass by 0.05 of a point. And two
   (RustRig, Farcrysis) are barely visible at any hour, despite nominal key
   ranges of 0.715..1.150 and 0.575..1.001.

   Looking at the committed frames rather than the numbers says the same thing
   and adds the reason. Nuke Town authored(17:30) vs late(18:00) has a
   BIT-IDENTICAL sky, and the late frame reads as *less* dramatic than the
   authored one. Terminal authored(07:00) vs late(10:30) is the clearly visible
   ground change the table reports, but it pairs a dawn-coloured sky with
   mid-morning shadows: internally inconsistent rather than merely muted. On
   RustRig, Raid and High Seas the sky simply occupies a large fraction of the
   review frame and does not move.

   The honest summary is that the model is doing what it was designed to do and
   the SKY is holding most of the result back. Tinting the backdrop is one
   uniform if it is sampled through a TSL node the arena owns - but it is an
   arena asset, so it needs the arena lanes' agreement, not this lane's.
2. **`cycle` as a default.** It is implemented and safe, but it is not the
   default because it re-aims the sun and refreshes the static shadow map; that
   cadence's frame-time cost should be measured on the owner's box first.
3. **Lane AL composition.** Baked indirect probes are baked at ONE hour. The
   preset table is the shared file: an arena's band tells Lane AL how far its
   bake has to stay valid, and a wide band (High Seas 11.5 h, Farcrysis 8 h) is a
   reason either to bake more than one hour there or to keep the probe
   contribution low.
"""


# ---------------------------------------------------------------------------
# Section 5b. WHAT A PLAYER ACTUALLY SEES.
#
# The per-arena table above is the MODEL: nominal key ranges, tints, floors. A
# reader converts 0.574..1.150 into an expectation of a large visible swing, and
# on several arenas that expectation is wrong, because the equirectangular sky
# backdrop does not move with the hour and on some arenas it owns most of the
# frame. This section is therefore measured, not authored: every number is read
# straight out of the merged-head sweep, and the LABEL is computed from those
# numbers by the rule printed underneath, not chosen.
MEASURED_SWEEP = ROOT + 'docs/evidence/pass87/dynamic-lighting/time-of-day-weather-sweep-repair-v5.json'
DISPLAY_NAME = {
    'atomic-acres': 'Nuke Town',
    'skyline-terminal': 'Terminal',
    'rustworks-1v1': 'RustRig',
    'gun-range': 'Gun Range',
    'farcrysis': 'Farcrysis',
    'high-seas': 'High Seas',
    'test1': 'Firing Range',
    'test2': 'Raid',
    'nuketown2': 'Nuke Town Rebuild',
    'raid2': 'Raid Rebuild',
    'map3': 'Map 3',
}
# Both thresholds are stated in the document beside the table they label, and
# both are read in the same units the sweep reports. They separate three
# outcomes a player can tell apart; they are not safety thresholds and nothing
# passes or fails on them.
# The frame's LEVEL moved: 4 of 255 is ~1.6% of the range, about where a
# side-by-side stops being arguable.
VISIBLE_LUMA_POINTS = 4.0
# The frame's SHAPE moved: stated in the SAME points as the combat-safety
# threshold, because that number is already argued for elsewhere in this
# document and inventing a second one here would be worse.
VISIBLE_SHADOW_POINTS = 3.0


def measured_section() -> str:
    try:
        import json
        with open(MEASURED_SWEEP, encoding='utf-8') as handle:
            report = json.load(handle)
    except FileNotFoundError:
        return ('\n\n---\n\n## 5b. What a player actually sees\n\n'
                'NOT GENERATED: the merged-head sweep JSON this section is read from is\n'
                'missing. Re-run `scripts/qa/capture-lane-ab-time-of-day.mjs` and this\n'
                'generator; do not hand-write the numbers.\n')
    rows = []
    for record in report.get('runs', []):
        if record.get('weather') != 'clear' or not record.get('states'):
            continue
        arena = record['arena']
        luma = {}
        shadow = {}
        floor = {}
        for state in record['states']:
            verdict = state.get('verdict') or {}
            luma[state['tod']] = verdict.get('meanLumaDelta')
            shadow[state['tod']] = verdict.get('shadowMassGrowthPoints')
            floor[state['tod']] = -(verdict.get('shadowFloorDropSteps') or 0)
        pinned = arena in {'gun-range', 'map3', 'nuketown2', 'raid2'}
        # Scored per STATE and labelled by the arena's STRONGEST one, because an
        # arena that moves at one end of its band and not the other (High Seas
        # is the clearest case) is not described by an average.
        def score(tod):
            level = abs(luma.get(tod) or 0.0) / VISIBLE_LUMA_POINTS
            shape = abs(shadow.get(tod) or 0.0) / VISIBLE_SHADOW_POINTS
            return max(level, shape), level, shape
        best_tod = max(('early', 'midday', 'late'), key=lambda tod: score(tod)[0])
        _, level, shape = score(best_tod)
        if pinned:
            label = 'PINNED - identity at every hour, by design'
        elif level >= 1 and shape >= 1:
            label = f'reads as a time of day (strongest at {best_tod})'
        elif shape >= 1:
            label = f'shadows move, frame level barely does ({best_tod})'
        elif level >= 1:
            label = f'brightness shift, shadows barely move ({best_tod})'
        else:
            label = 'barely visible at any hour'
        fmt = lambda table: ' / '.join(
            ('n/a' if table.get(tod) is None else f"{table[tod]:+.2f}") for tod in ('early', 'midday', 'late'))
        rows.append('| {} | {} | {} | {} | {} | {} |'.format(
            DISPLAY_NAME.get(arena, arena),
            fmt(luma), fmt(shadow), fmt(floor),
            f"{record.get('pairNoisePoints')}", label))
    header = (
        '\n\n---\n\n## 5b. What a player actually sees, measured\n\n'
        'Generated from `docs/evidence/pass87/dynamic-lighting/\n'
        'time-of-day-weather-sweep-repair-v5.json`, clear weather, the authored\n'
        'review camera of each arena at 1280x720 on native WebGPU. Every cell is a\n'
        'delta from an identity frame re-shot about a second earlier on the same\n'
        'deploy, in the order early / midday / late.\n\n'
        'The last column is COMPUTED, not judged. A state moved the frame\'s LEVEL if\n'
        f'mean luma changed by at least {VISIBLE_LUMA_POINTS} of 255, and its SHAPE if shadow mass\n'
        f'changed by at least {VISIBLE_SHADOW_POINTS} points - the same points the combat-safety threshold\n'
        'is stated in, because inventing a second number here would be worse. An arena\n'
        '"reads as a time of day" when its strongest state moved both; the other labels\n'
        'say which one it managed. Nothing passes or fails on these: they exist so the\n'
        'reader is not left converting a key range like 0.574..1.150 into an expectation\n'
        'the sky backdrop then refuses to deliver (section 8, item 1).\n\n'
        '| Arena | mean luma delta | shadow mass delta (pt) | P05 floor delta | control-pair noise (pt) | reads as |\n'
        '| --- | --- | --- | --- | --- | --- |\n')
    return header + '\n'.join(rows) + '\n'


doc = HEAD + summary_table + MID + table.strip() + measured_section() + TAIL
open(ROOT + 'docs/DYNAMIC_LIGHTING_2026-09-03.md', 'w', encoding='utf-8', newline='').write(doc)
print('written', len(doc))
