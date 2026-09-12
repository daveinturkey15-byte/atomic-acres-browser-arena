# Instanced grass must stay anchored across camera motion

VERIFIED 2026-09-10 against installed Three.js 0.185.1 and candidate base
`ce85ca80b14f5f297f9940f556c4bfd04e940af1`.

Symptom: camera-local moving grass can include long triangles across the lawn.
The owner-visible symptom still needs a fresh native-WebGPU capture; the source
defect and its geometric consequence are independently reproducible without a GPU.

Cause: `NodeMaterial.setupPosition()` runs `instancedMesh(object)` before assigning
`positionNode`. Thus `positionLocal` includes the instance translation. The retired
grass graph multiplied this position by a per-vertex 32m camera-distance mask.
Vertices just outside that radius collapsed to the field origin while neighbouring
vertices stayed planted. A 5cm edge at (20, 0, 12) became longer than 20m when its
vertices straddled the cutoff. The boundary moved with the camera.

Correction: preserve the placed vertex plus wind displacement. Keep region mesh
frustum culling with computed instance bounds. Do not multiply placed vertices by
a per-vertex visibility mask. A future distance LOD must make a coherent whole-tuft
decision and preserve its instance anchor; it also needs measured performance and
camera-motion evidence before adoption.

Verify: `src/rendering/instanced-grass-field.test.ts` checks the actual material
position graph for camera dependence, proves the guard detects the retired graph,
and reproduces the stretched edge. Existing crush/upload tests remain required.
The repair changes no instance count, placement, collider, shot authority or wind
clock. It can increase distant blade fragment work versus the old cutoff; exact
candidate native-WebGPU timing and camera-motion checks remain OPEN.

Source orientation: [current Three.js documentation index](https://threejs.org/docs/llms.txt).
Installed authoritative details: `three/src/materials/nodes/NodeMaterial.js`
(`setupPosition`) and `three/src/nodes/accessors/Position.js` (`positionLocal`,
`positionGeometry`). Current upstream is newer than this project's pinned r185.1;
do not copy a current API into this project without checking the installed source.
