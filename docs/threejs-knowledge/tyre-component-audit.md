# Tyre placement audit repair (2026-09-12)

The old audit assigned each vertex to a moving XZ centroid within 0.5m. Its
comment assumed tyres at most 0.84m across. The independently pinned coach wheel
is 0.94m across (`coach-polish.test.ts`), and that procedure split a complete tyre
into fragments. One fragment was incorrectly reported as elevated flat dressing.
The old radius check also omitted the authored 0.47m coach radius.

The audit now measures connected triangles, welding coincident Float32 seams at
10 micrometres in world space. The root diagnostic accounts for all 24,084 tyre
vertices as 26 whole wheels and six contact patches. Every wheel starts at y=0.035;
the six patches are at y=0.012. Reversing triangle/vertex order preserves the census.
Unsupported indexed input, missing positions and non-finite values fail explicitly.

Attachment still uses the independent authoritative body and truck axle locations.
The 0.6m attachment/axle tolerances, 0.45m maximum dressing height, 0.5m wheel
classification threshold and 0.05m wheel-centre tolerance are retained. Radius is
now selected by that body's identity: coach 0.47m, truck 0.42m, cars 0.34m. An
additional ground-contact check requires wheel bottoms between zero (Float32
slack 0.00001m) and 0.05m. The measured tyre shape itself is unchanged.

Root ran the actual placement gate against three modified real arenas. Displacing
the tyre geometry 30m, lifting it 0.2m and injecting NaN all fail at their intended
attachment, height and malformed-geometry assertions. Synthetic component tests
also retain displaced wheels and elevated stray patches as findings. No fixture
is repinned, no radius is changed and no gameplay/collision geometry is edited.

Separately, the corrected truck review camera exposed its authored roof-access
steps (`truck roof step`, `TRUCK_ROOF_STEPS`), rather than a duplicate cab. They
support access to the roof pickup. The close-up moves to the clear side; the steps
and their collision stay intact. Owner judgement of the truck's appearance remains
OPEN, as do actual vehicle triangle overages and the gunfire-coverage findings.
