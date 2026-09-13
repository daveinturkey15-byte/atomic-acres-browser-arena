# Volumetric opening shafts

## Reusable recipe

Use a small authored opening table as the source of truth, transform it with
the arena's existing handedness/pair rule, and attach a bounded set of
camera-facing additive quads. The graph uses `MeshBasicNodeMaterial` and TSL
UV falloff only: edge feathering, height falloff, and a squared sun/view phase.
There is no texture sampler, raymarch, render target, or second post pass.

The Nuke Town adapter currently derives six presentation anchors from the
existing doorway/window exports. The lowest presentation tier selects zero;
the low tier selects at most three; the high tier selects at most six. The
system is presentation-only and has no collider, projectile, or gameplay
authority.

## Source and version note

This recipe follows the installed Three.js `0.185.1` WebGPU/TSL surface and
was checked against the current upstream NodeMaterial documentation:

- https://threejs.org/docs/llms.txt
- https://threejs.org/docs/llms-full.txt
- https://github.com/mrdoob/three.js/blob/dev/docs/pages/NodeMaterial.html.md

Method observed in StarKnightt/morning-diner (Claude Fable, 2026), shared by
the owner via https://x.com/prasenx/status/2095537643182563778; re-implemented
from first principles. No source, shader or prose was copied.

## Failure mode and verification

If the opening normal faces away from the sun, the anchor is hidden before
draw. If the requested tier is `off`, all shafts are hidden. The focused test
covers paired-anchor parity, the sun-facing gate, forward/back phase ordering,
NodeMaterial use, and the six-instance ceiling. Browser/GPU cost measurement
is intentionally deferred to the coordinator-owned exact measurement command
because this lane's upgrade ruling permits only cheap headless gates.
