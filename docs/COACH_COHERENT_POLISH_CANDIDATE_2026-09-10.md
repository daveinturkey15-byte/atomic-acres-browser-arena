# Coach coherent polish candidate — inspection only

VERIFIED source parent `287050d905b5d86256164e8aa365b2b4e4a0419c`; its 9,854-triangle coach remains the fallback. This candidate is local, not published or owner accepted.

Changes: coach wheel radius 0.42 to 0.47 m (other families unchanged), existing grille backing moved from chrome to lining while retaining chrome bars, low maroon sweep between arches, narrow shared-chrome rub rail, and coach-only low-amplitude glass opacity/roughness variation. The glass change is noise variation, not a verified sky-reflection improvement.

VERIFIED independent actual-arena differential census: the initial full-surface new bands cost 52 + 420 triangles at radius0.47 and produced 10,318 coach triangles. At radius0.42 they cost52 +464 and produced10,370. Both use104stations; the radius change is not a station-count increase. The candidate reauthors only the new narrow rub rail with the existing position/normal-bounded strip path (84 triangles), keeping the new lower sweep52. Final actual coach9,982/10,000; truck8,280/6,000, street saloons9,026/9,000 each, driveway saloons9,502/9,000 each. Total55,318 triangles,15 shared draw meshes. The actual-arena global census correctly remains FAIL for the other five vehicles.

VERIFIED focused 27 tests passed before the added full-coach normal check; all five coach-polish tests subsequently passed, including every nondegenerate face against its averaged vertex normals and mixed coach/noncoach flags after actual arena merge. The added rub-rail comparison uses the existing bidirectional triangle-interior position/normal comparator and its unchanged 0.15mm position /0.01 normal-component bounds. TypeScript noEmit and diff whitespace checks pass.

OPEN existing detail-visibility skirt pin expects2.25..6.85m but the enlarged wheel derives2.30..6.80m. The old test is unchanged and remains FAIL; the count remains two existing skirt pieces. Older exact geometry snapshots are not refreshed. New actual artifact rendering, matched front/side pixels, performance, broader vehicle budgets/normals, collider/provenance and multiplayer acceptance remain separate required gates. No assertion tolerance/cap was raised.

Attribution: exact meta-contributor/muse-spark-1.3-contributor HIGH read-only proposal `coach-coherent-polish02`, SHA6b5d23606e5fa0de1197c7b557db0b4e5365c2757446896b62ff4860d6f634c6. Host-authored/reviewed application; provider estimated triangle overhead was disproved by the actual census and corrected before freezing. Previous failed results remain historical evidence.
