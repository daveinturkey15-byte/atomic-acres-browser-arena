VERIFIED - Pass 93 Luna owner-fix report for Nuke Town P0 floor z-fighting and P1 stair traversal.
VERIFIED - Scope was C:\Users\david\projects\aa-claude-luna-fix on contrib/dave-gaming-pc/claude/nuketown2-tiptop-fix, with the parent ref contrib/dave-gaming-pc/claude/nuketown2-tiptop.
VERIFIED - BEFORE coplanar summary at parent head 759fa6de: boxes=576; pairs<=0.03m=92; FINDINGS (different materials, no offset)=0; FENCED (material offset)=39; SAME-MATERIAL (benign)=53.
VERIFIED - BEFORE UNAUDITED count was 16: eight nuketown2 lawn regions, five forest instanced meshes, and three non-box mountain meshes.
VERIFIED - AFTER HOUSE-INTERIOR pairs<=0.03m (offsets ignored): 0.
VERIFIED - AFTER coplanar summary at fix head b350fda8: boxes=610; pairs<=0.03m=104; FINDINGS (different materials, no offset)=0; FENCED (material offset)=77; SAME-MATERIAL (benign)=27.
VERIFIED - AFTER UNAUDITED count remains 16 with the same list: nuketown2-lawn-region-0 through nuketown2-lawn-region-7, forest-conifers, forest-broadleaf-trunks, forest-broadleaf-canopies, forest-understory, forest-contact-skirts, nuketown-mountain-foothills, nuketown-mountain-ridge, nuketown-mountain-far-range.
VERIFIED - The coplanar instrument exits 0; its new house-interior class ignores polygon offsets and is zero, while the legacy FINDINGS class remains zero.
VERIFIED - Each of two house floors and two garage floors uses a 0.16m slab with top +0.08m above the outdoor ground plane, satisfying the requested +0.06m minimum and the fidelity gate +0.05m minimum.
VERIFIED - The outdoor ground is emitted as exact footprint-cut tiles; the fidelity test finds zero plan overlap for ground tiles, authored dressing boxes, and all canonical instanced lawn regions against all four house/garage footprints.
VERIFIED - Ground walls, partitions, and baseboard skirting extend through the +0.08m floor datum, so no visible lower-edge gap is introduced; the old kitchen floor pad was removed rather than left as a second interior plane.
VERIFIED - Depth math uses the HF-434/HF-443 camera context near=0.02m and far=180m, with the established quantum about 0.0107m at 60m and 0.0190m at 80m.
VERIFIED - At the map diagonal sqrt(36^2 + 84^2)=91.3893m, the quoted z^2 scaling gives q91=0.0190*(91.3893/80)^2=0.0248m and 3q91=0.0744m.
VERIFIED - The +0.0800m floor rise exceeds 3q91 by 0.0056m, and the stronger result is that the ground slab, lawn field, and dressing are absent from the footprint, leaving no remaining near-coplanar floor pair there.
VERIFIED - Each flight now has one solid Rapier collision-only ramp, material-visible=false but scene-graph-visible=true for parity; presentation treads are non-solid and non-shot-rated.
VERIFIED - Ramp geometry is run=4.4400m, rise=3.2200m, angle=35.9506 degrees, bottom=+0.08m, top=3.30m, with +0.12m overlap at both landings.
VERIFIED - North stair probe: up=804 frames, waypoints=[34,115,369,502,594,804], slope-adjusted=795, max consecutive ungrounded=1; down=341 frames, waypoints=[37,111,261,341], slope-adjusted=339, max consecutive ungrounded=1.
VERIFIED - South stair probe: up=804 frames, waypoints=[34,115,369,502,594,804], slope-adjusted=796, max consecutive ungrounded=1; down=341 frames, waypoints=[37,111,261,341], slope-adjusted=340, max consecutive ungrounded=1.
VERIFIED - The stair traversal fixed budget is 2400 frames in both directions, and the collider/visual parity gate remains green with nuketown2 walk-through budget 0.
VERIFIED - Post-rebase npx tsc --noEmit exits 0.
VERIFIED - Post-rebase npx vitest run src/nuketown2-fidelity.test.ts src/collider-visual-parity-gate.test.ts src/arena-factory-registry.test.ts src/map-selection.test.ts passes 4 files and 47 tests.
VERIFIED - Post-rebase targeted stair telemetry run passes 21 tests in src/nuketown2-fidelity.test.ts.
VERIFIED - git fetch origin contrib/dave-gaming-pc/claude/nuketown2-tiptop and git rebase origin/contrib/dave-gaming-pc/claude/nuketown2-tiptop completed without conflicts.
VERIFIED - Fix ref push with force-with-lease completed, and parent ref push completed as a fast-forward from 759fa6de to b350fda8.
VERIFIED - Optional capture precondition check found queue_running=[] and queue_pending=[], lock=false, but GPU free memory was only 1181 MiB versus the required >=3000 MiB.
OPEN - Capture, npm run build, Vite preview, and browser review were not run because the required GPU guard was not met; no PNG visual claim is made.
OPEN - The owner has not yet subjectively replayed the immutable post-fix build in this run.
CLAIMED - The owner should feel a stable, non-shimmering house and garage floor instead of broad floor/ground flicker.
CLAIMED - The owner should feel a continuous capsule glide up and down each house flight instead of catching individual tread edges or losing ground contact.
OPEN - HF-448 through HF-451 were not present in this worktree copy of docs/PASS84_OWNER_FEEDBACK_2026-09-02.md, so no claims are made about those absent sections.
