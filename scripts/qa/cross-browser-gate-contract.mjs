// Cross-browser gate contract — pure function computing the gate's PASS/FAIL
// verdict from per-lane verdicts, so the rule "an uninstalled browser must
// never read as a pass" is checkable without launching a browser.
//
// Usage:
//   import { LANE_VERDICTS, computeMatrixVerdict } from
//     './scripts/qa/cross-browser-gate-contract.mjs';
//   (library module, no CLI entry point; consumed by cross-browser-gate-contract.test.mjs)
//
// Flags / environment variables: none (reads no process.argv, no process.env).
// Writes: nothing (no files, no directories).
// Exit codes: none (no process.exit calls).

// The verdict rule of the cross-browser gate, as a pure function so it can be
// tested without launching a browser.
//
// It is a separate module because the property the owner actually asked for -
// "an uninstalled browser must never read as a pass" - is a claim about
// arithmetic, not about browsers, and a claim that can only be checked by
// running the full two-hour matrix is a claim nobody re-checks. See
// cross-browser-gate-contract.test.mjs.

/** Lane verdicts, in order of severity. Only `pass` is a pass. */
export const LANE_VERDICTS = Object.freeze(['pass', 'fail', 'blocked', 'not-installed']);

/**
 * @param {{ lanes: Array<{ lane: string, verdict: string }>, required?: string[] }} input
 * @returns {{
 *   verdict: 'PASS' | 'FAIL',
 *   notInstalled: string[],
 *   failedLanes: string[],
 *   blockedLanes: string[],
 *   requiredMissingOrBlocked: string[],
 *   measured: string[],
 * }}
 */
export function computeMatrixVerdict({ lanes, required = [] }) {
  const withVerdict = (verdict) => lanes.filter((lane) => lane.verdict === verdict).map((lane) => lane.lane);
  const notInstalled = withVerdict('not-installed');
  const failedLanes = withVerdict('fail');
  const blockedLanes = withVerdict('blocked');
  // MEASURED means a number was actually produced by that browser. A lane that
  // was skipped or blocked is not measured, and calling it covered is the exact
  // mistake this gate exists to stop.
  const measured = lanes
    .filter((lane) => lane.verdict === 'pass' || lane.verdict === 'fail')
    .map((lane) => lane.lane);
  const requiredMissingOrBlocked = required
    .filter((lane) => notInstalled.includes(lane) || blockedLanes.includes(lane));

  // FAIL CLOSED. A blocked lane fails the gate whether or not anyone required
  // it: nothing was measured, so the browser is uncovered and saying otherwise
  // would be a lie. An uninstalled browser does NOT fail the gate on its own -
  // a gate that can never go green gets switched off - but it is never counted
  // as a pass, it is always printed as a coverage hole, and naming it in
  // `required` fails the gate immediately.
  const verdict = failedLanes.length === 0
    && blockedLanes.length === 0
    && requiredMissingOrBlocked.length === 0
    ? 'PASS'
    : 'FAIL';

  return { verdict, notInstalled, failedLanes, blockedLanes, requiredMissingOrBlocked, measured };
}
