# Task: convert remaining headed QA scripts to the headless launch policy

You are working in the Atomic Acres repo checkout at C:\Users\david\projects\aa-omp-pass84
(branch contrib/dave-gaming-pc/omp/pass84-overnight). Work ONLY in scripts/qa/.

## Background
The owner requires that QA browser automation never opens visible windows on his
primary display and never takes pointer lock. The canonical policy and reusable
launch args live in scripts/qa/lib/browser-launch-flags.mjs - READ IT FIRST and
follow it exactly. scripts/qa/installed-browser-lanes.mjs contains the two
DELIBERATE presentation-lane exceptions (cross-engine stall lanes and the HF-331
fps ceiling probe) - those files are OUT OF SCOPE and must not be modified.

## Scope
1. Run: grep -rln "headless: false\|headless:  false" scripts/qa/ (and inspect any
   script that launches chromium.launch / firefox / msedge without headless:true).
2. For every script found launching a browser headed (excluding the exception
   files above and their own contract tests), convert it to the documented
   headless policy: headless true + the shared flag set from
   browser-launch-flags.mjs (mute audio, d3d11 angle, unsafe-webgpu where the
   script boots WebGPU, occlusion/backgrounding disables).
3. If a script's OUTPUT depends on being visible/uncomposited (it samples real
   compositor presentation, vsync, or foreground-window state), DO NOT convert it;
   instead add it to the exceptions list you report, with one sentence why.
4. Do not change any test semantics, assertions, selectors, or timing thresholds.
   Launch flags and window placement only. Do not touch src/, tests/, docs/, or
   any file outside scripts/qa/.
5. Do not run full test suites. Do not git commit. Do not modify package.json.

## Verify before finishing
- node --check <file> passes for every file you edited.
- grep -rn "headless: false" scripts/qa/ returns only the documented exception
  lanes (or nothing).
- Every edited file still imports the shared flags helper where the policy says
  to use it.

## Report back (final message)
- List of files converted, with the one-line change each.
- List of exceptions kept headed, with reasons.
- The node --check results.
