# Shader graph audit traversal

VERIFIED 2026-09-12: Windows CI34681068137 timed out the existing output-transform
order test at its unchanged20-second limit. On source450134666, root measured
8,674,935 callbacks from Three0.185.1 `Node.traverse` for567 unique nodes and676
direct child edges. Original traversal took4235.3ms locally; a visited-node walk
took0.385ms and produced exactly the same reachable node set.

The test now walks the installed public `Node.getChildren()` relation once per
distinct node, retaining first-visit order. An active-path check rejects cycles.
Every original output-transform count and upstream/downstream uniform assertion
is retained. No renderer behavior, timeout, shader stage, threshold or expected
value changes. A real shared TSL subgraph verifies identity and order against the
original public traversal; a cyclic graph must fail.

Source: installed `node_modules/three/src/nodes/core/Node.js` lines319-357;
upstream reference: https://github.com/mrdoob/three.js/blob/r185/src/nodes/core/Node.js
Local diagnostic: `artifacts/pipeline/completion-node-walk-diagnostic.mts` and
its JSON receipt. These measurements describe this machine, not a CI timing guarantee.
