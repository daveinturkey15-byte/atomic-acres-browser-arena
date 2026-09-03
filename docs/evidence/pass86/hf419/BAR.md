# HF-419 — the bar, frozen before a line of art was written

Lane AP (GTA-style art trial), Map 3 corridor 3 street cell.
Frozen 2026-09-03 01:32 BST, after the baseline capture and before the first
build commit. Nothing below was edited after the first art commit; the git
history of this file is the proof.

## What the bar is, and why it is this

Skill `open-world-city-art-loop` §3: the bar must be something we may lawfully
hold. It is therefore **not** a frame from any commercial open-world game, and
no such frame was fetched, stored, shown to a critic, or committed at any point
in this lane.

The bar is two things, both lawfully held:

1. **The floor** — this lane's own before capture, `artifacts/hf419/before/`,
   committed to `docs/evidence/pass86/hf419/before/`. Four views; the two
   street-cell poses stand on bare scrub at the far end of the grammar corridor.
   Nothing in the after set may be worse than this on any scorecard row.
2. **The written scorecard** below — seven inspectable rows describing a real
   British/European kerbside street from ordinary observation. A written
   description of a real street is not anyone's intellectual property, and it
   is the better bar anyway (skill §3): "worn, dirty, slightly misaligned lane
   paint" is inspectable; "looks like that game" is not.

The reference thread that started HF-419 published a 31-second video and four
sentences. It published no prompt, no repository and no asset (technique
register row 47, study `gta-style-city-art.md`). It is therefore **not** used
as a bar here at all, in either direction — not as an image to match and not as
a source to copy. Its only contribution to this lane is the ordering in skill
§4 (screen area) and the warning in §4 about its grade.

**The grade is explicitly out of scope.** The reference look leans on a flat
overcast ambient-dominant grade that hides weak procedural materials. This lane
changes surfaces only. Map 3's sun, sky, fog, hemisphere light and tone mapping
are untouched, and no `ART_DIRECTION_SAFETY_BOUNDS` value is read or written by
anything this lane adds. A critic that asks for a grade change is refused in
writing (skill §9), and the refusal is recorded in `RESULT.md`.

## The frame-rate bar the reference itself fails

The reference's own on-screen telemetry reads `151 ms · 20 fps` and
`197 ms · 18 fps` (study, two readings). This lane's floor, measured in the same
session as the after run, is **180 fps / 5.6 ms** at both street poses. The
target is the reference's *density and surface detail* at 30x its frame rate.
A scorecard row is only won if the frame-time gate is also held.

## Scorecard — seven rows, each inspectable on a capture

Judged blind A/B on the PNGs at the two street poses, with `hud.json` supplied
alongside so "looks good" cannot outvote the numbers.

| # | Row | How it is judged |
| --- | --- | --- |
| 1 | **Road surface reads as worn asphalt, not a tone.** Aggregate speckle, cold-patch repairs with a visible edge, longitudinal tar seams and a crack network are each separately identifiable at ~5 m. | Name each of the four at a pixel location, or the row is not improved. |
| 2 | **Lane paint is worn, dirty and slightly misaligned.** Crisp, clean, perfectly straight paint fails this row — it reads as a racing game (skill §4.1). | Paint edge must vary along its length and the surface must show through it in places. |
| 3 | **Kerb and pavement are built, not implied.** Kerb top and face are separate surfaces at different values; paving-slab joint grid present; slab-to-slab tonal variance; a darker damp band where pavement meets frontage. | All four nameable, or not improved. |
| 4 | **Frontages read as repeated bays with real depth.** A bay = window opening with an actual recess, sill, lintel, spandrel; a ground floor distinct from the upper storeys; a parapet or cornice terminal. A flat plane with a window pattern fails. | Recess must be visible as self-shadowing/parallax at the near frontage. |
| 5 | **Street furniture density.** At least ten correct-scale objects visible from the `corridor-3-street-cell` pose, placed on the kerb line, none floating and none intersecting the carriageway. Density beats individual quality (skill §4.4). | Count them on the PNG. |
| 6 | **Parked vehicles read as scenery flush to the kerb**, with dark glass, emissive tail lamps and contact darkening under the sills — and are usable as chest-height cover. | Sill gap under 0.25 m from the kerb face; contact darkening visible. |
| 7 | **Is the player silhouette at least as findable against the new frontage as before?** | MEASURED, not asserted: `scripts/qa/measure-silhouette-findability.mjs` computes, for the same pose before and after, the fraction of frame pixels whose Weber contrast against a fixed operator-value proxy falls below the visibility threshold. The after fraction must be **≤** the before fraction. A row that is only argued is a failed row. |

## Stop rule, declared up front

Two critic rounds maximum, 45 minutes wall clock, whichever comes first
(skill §9). Per round the critic receives the PNGs and `hud.json` together and
returns exactly one thing: the single biggest remaining gap. There is always
another gap; the loop does not end on its own.

## Refusals the critic does not get to make

Recorded here so a refusal later is not an improvisation:

- a new material family, or any widening of the cold-compile fence;
- any `ART_DIRECTION_SAFETY_BOUNDS` value, in or out of bounds;
- an imported mesh, image, font or LUT;
- a shipped commercial game frame as a comparison;
- `Math.random`, a per-frame allocation, or anything created after construction.

If the only way to close a gap is one of those, the correct output is
"gap not closable within contract" and it is escalated, not complied with.
