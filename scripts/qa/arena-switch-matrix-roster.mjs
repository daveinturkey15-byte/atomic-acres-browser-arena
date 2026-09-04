// What: pure ES module (no CLI) exporting the two arena switch-matrix gate decisions - the selectable arena roster derived from src/map-selection.ts source (selectableArenaIdsFromSource), and the ordered arena-pair walk the browser probe must sweep (eulerianPairWalk).
// Usage: node scripts/qa/arena-switch-matrix-roster.mjs   (module only; loading it runs no top-level code and exits 0 - import it, e.g. from src/arena-switch-matrix-roster.test.ts, rather than running it)
// Flags / env: none - reads no process.argv, process.env, or --flags.
// Writes: nothing - pure functions; no files or directories produced.
// Exit codes: none - no process.exit(); bad derivations throw Error instead of exiting.
//
// The two pure decisions the arena switch-matrix gate rests on: WHICH arenas
// it must cover, and WHICH ordered pairs it must walk. They live here, apart
// from the browser probe, so `src/arena-switch-matrix-roster.test.ts` can hold
// them to the real arena registry without launching anything.
//
// Both exist because a gate that quietly covers less than it claims is this
// repo's most expensive recurring defect: a hardcoded six-id roster once let
// two shipped arenas go untested, and on 2026-09-02 a DOM-timing race in this
// very probe swept 42 of the 56 ordered pairs and still reported success.

/**
 * The arenas the menu offers, derived from `src/map-selection.ts` source.
 * An arena joins the matrix by existing in that file without `selectable:
 * false`, never by being named here.
 */
export function selectableArenaIdsFromSource(source) {
  const entries = [...source.matchAll(/id: '([a-z0-9-]+)' as const,/gu)];
  // Floors, so a derivation that stops matching fails LOUD instead of running
  // an empty sweep and reporting a green matrix over nothing.
  if (entries.length < 8) throw new Error(`ARENA_SELECTIONS derivation collapsed to ${entries.length} entries`);
  const selectable = [];
  for (let index = 0; index < entries.length; index += 1) {
    const start = entries[index].index;
    const end = index + 1 < entries.length ? entries[index + 1].index : source.length;
    if (!source.slice(start, end).includes('selectable: false,')) selectable.push(entries[index][1]);
  }
  if (selectable.length < 6) throw new Error(`selectable-arena derivation collapsed to ${selectable.length} ids`);
  return selectable;
}

/**
 * Hierholzer over the COMPLETE digraph on `nodes`: every ordered pair appears
 * exactly once, and consecutive pairs share an endpoint so the result is one
 * continuous chain of map switches rather than N independent sessions. K_n has
 * in-degree = out-degree = n-1 at every node, so the circuit always exists.
 */
export function eulerianPairWalk(nodes) {
  if (nodes.length < 2) return [];
  const outgoing = new Map(nodes.map((node) => [node, nodes.filter((other) => other !== node)]));
  const stack = [nodes[0]];
  const trail = [];
  while (stack.length > 0) {
    const node = stack[stack.length - 1];
    const edges = outgoing.get(node);
    if (edges.length > 0) stack.push(edges.shift());
    else trail.push(stack.pop());
  }
  trail.reverse();
  const pairs = [];
  for (let index = 1; index < trail.length; index += 1) pairs.push([trail[index - 1], trail[index]]);
  return pairs;
}
