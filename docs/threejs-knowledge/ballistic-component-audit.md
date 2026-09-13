# Ballistic component audit (2026-09-12)

The shared chrome draw contains 37,176 vertices in 231 disconnected triangle
components. Per-vehicle ownership fixes the space between cars, but it still
combines bumpers, wheel faces, mirrors and roof rails into an imaginary solid
volume around each car. None of the 231 disconnected components independently
meets the existing height and width thresholds for substantial cover.

Gunfire measurement now uses physical pieces within each validated vehicle
anchor. It accounts for every source vertex, retains the owning-vehicle metadata,
and reports the component index for findings. Movement still uses the owning
envelope. Unanchored/unsupported meshes retain the previous fail-closed route.
Malformed ownership and non-finite source geometry remain errors. Source meshes,
materials, collision and shot authority are unchanged.

An independent root falsifier found that connectivity alone was insufficient:
two short solid pieces with touching faces but no coincident corners could form
a tall wall and disappear below the per-piece threshold. The implementation
therefore conservatively joins touching original component bounds (10 micrometre
Float32 slack). A merged envelope does not create new adjacency through empty
space. This conservative step must not be removed to make a remaining row green.

Verified synthetic cases: disconnected small trim is not a wall; an actual tall
panel still fails; a low base cannot explain that panel; matching full-height
authority passes; two missing-coverage bodies remain two findings; and touching
short pieces forming tall cover remain a finding. The previous malformed and
per-owner checks remain in place.

The four saloon/coupe chrome warnings are resolved as measurement errors. The
strict contact variant exposes one new truck rear-frame finding at approximately
(14.87, 1.70, 2.75), size (0.01, 2.11, 1.84). This is the rear cargo-door frame,
not permission to fill the open cargo entrance with a shot blocker. Its authored
surface/authority relationship remains OPEN. The permanent Direction C gate
correctly remains red on that row. No ceiling, overlap share, height threshold,
flush tolerance or accepted shoot-through ledger entry was changed.

Root verification: 23 focused cases pass and the one remaining Direction C case
fails with that exact truck row. This is an audit repair, not full game acceptance.
