# Trailer frame physical coverage

VERIFIED 2026-09-12: the actual arena's rear chrome frame had no matching
gunfire authority. Its hollow connected envelope also pulled isolated lock and
hinge trim into one component through empty space. The original failed gate
and intermediate diagnostics remain in the completion artifacts.

The arena now registers four explicit thin-metal raycast boxes for the four
visible rails, with the same final placement and handedness as the forge.
These hidden proxies add no draw or movement collider and leave the cargo
aperture clear. Full-width horizontal rails own the corners; upright ends
previously buried inside them have been removed from the visual boxes. The
occupied solid union is unchanged at floating-point authoring precision, with
four bars and 48 triangles. This is not a byte-identical geometry claim.

The partition avoids a measured finite-area corner defect: copying the old
overlapping boxes would charge two thin-metal entry costs (1.972 energy)
instead of one (0.986) for the same 12 mm layer in an independent runtime trace.
OPEN: rays exactly on the shared closed-box seam may still receive two hits.
No gap or global ballistic change was introduced to hide that limitation.

The audit retains all existing thresholds and conservative treatment of
touching small solids. Component contact now requires overlap between an
original pair of triangle bounds as well as component bounds. This cannot
miss real triangle contact, though it can conservatively over-report contact
for oblique triangles. Hollow envelope interiors alone cannot establish it.

When the coarse footprint heuristic cannot explain a measured component, an
additional exact coverage proof requires every complete original triangle to
fit inside one actual oriented shot box. Convexity then covers its interior.
Vertices split across separate boxes never qualify. Retained vertex counts,
complete triples, finite geometry and valid bounds are checked; empty or
invalid input cannot become proof. The 10 micrometre coordinate tolerance
handles Float32 authoring error rather than changing the old 5 cm flush rule.
Proof surface IDs and counts appear separately in the audit and CLI ledger.

VERIFIED: focused checks cover the actual arena's four rail centers, former
overlap corners, center/edge aperture rays, omit-each-rail failures, all 144
frame vertices, occupied-cell conservation, triangle bridges, rotated-box
false positives, retained unwelded contacts, malformed geometry and the full
ballistic census. The previously failing Direction C gate passes with its
original zero-extra-finding ceiling. Independent Astra review ran another
11 coverage probes and five contact/conservation probes.

The symmetry inventory explicitly adds the four new street-vehicle proxy
identities. Its original paired-geometry, plan-area and naming assertions
remain intact. New review cameras cover the garage exterior and the rear
frame from inside the cargo space. A CPU review verified clear camera eyes,
subject frustum coverage and intended first ray hits before browser capture.

Related portability repair (Symptom -> Cause -> Correction -> Verify): the
camera instrument's combined-invalid CLI test failed in this checkout because
it depended on two gitignored historical capture directories. It now creates
an explicitly synthetic temporary fixture containing the same two FAIL
verdicts and identical bundle identity. All three original rejection assertions
remain, all 23 instrument checks pass, and no historical capture is fabricated.

OPEN: final hardware WebGPU rendering, appearance approval, the true vehicle
triangle budgets, and multiplayer acceptance. Small lock/hinge trim inside
the mouth remains an existing visual support/semantics issue; correctly
separating it from the frame is not a claim that it looks physically supported.
