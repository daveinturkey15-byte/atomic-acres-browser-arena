# Actual arena vehicle budgets — OPEN

VERIFIED on H1 source c93eed84afcddd5274ef9b0ccd79399b007dabc4:
the older 9988/5900/8288 figures describe the smaller test dressings. They do
not prove the actual authored arena fits the same limits.

| Actual vehicle | Triangles | Existing limit | Excess |
| --- | ---: | ---: | ---: |
| Coach | 11114 | 10000 | 1114 |
| Truck cab plus separate bogie | 8280 | 6000 | 2280 |
| Street saloon, each of two | 9026 | 9000 | 26 |
| Driveway coupe, each of two | 9502 | 9000 | 502 |

VERIFIED: 15 distinct merged mesh objects and 15 distinct geometries, no
instances; every triangle's three vertex anchors agree. Seven actual authored
builds reconcile to six unique vehicle anchors and 56450 merged triangles.
The truck is cab 6374 + separate wheel-set/bogie 1906 at the same anchor, not
an accidental duplicate. The test wraps the original builders and returns
their exact objects; no substituted dressing or geometry.

OPEN: The new actual-build census gate fails on all six over-budget vehicles.
Do not raise limits or hide these rows behind the fixture-only gate. Prioritize
coach reallocation; truck/car overages remain separately OPEN.

VERIFIED: The uncommitted F2 experiment moving coach top-glass start 0.18 to
0.62 was reverted after measurement, without a build or pixel acceptance.
It kept 106 stations, shifted 16 body/glass triangles between buckets, and
added 4 chrome stripe triangles because the moved station entered the stripe
span. Fixture count became 9992; actual coach became 11118. The exact-allocation
test correctly failed. No expected count or threshold was changed.

VERIFIED: H1 normal-only captures retain seats/luggage/no-blue glass but leave
the malformed cream/black front form and flat coach body. Source correctness
is not substantial visual acceptance. The three remaining normal-orientation
failures and two inherited collider parity failures remain OPEN.
