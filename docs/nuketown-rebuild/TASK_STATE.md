# Lane AU — Task State (HF-426)

## Overview
- **Branch**: `contrib/dave-gaming-pc/claude/nuketown2-accurate`
- **Goal**: Reconcile Nuke Town rebuild (`nuketown2`) to authentic Black Ops 2 Nuketown 2025 spatial layout, then layer on approved visual styles from older layout (`atomic-acres.ts` look, lawn, forest surround, mountain ring, materials).
- **Date**: 2026-09-03

## Job Status

### Job 1: Proper Reference Research
- **State**: COMPLETED
- **Deliverable**: `docs/nuketown-rebuild/REFERENCE_SCHEMATIC.md`
- **Contents**:
  - Full ASCII schematic with houses, garages, doors, windows, backyards, spawns, fences/gaps, street, central bus & moving truck, driveway cars, kerb props, sheds, 3 lanes.
  - Dimensions recorded as ratios to street length ($L_{\text{street}} = 44.0\text{ m}$).
  - Cited source URLs.
  - Source disagreement analysis and reconciled decisions.
  - Element-by-element diff table against current `src/nuketown2-layout.ts`.

### Job 2: Layout Code Adjustment
- **State**: IN PROGRESS
- **Targets**: `src/nuketown2-layout.ts`, `src/nuketown2-arena.ts`, `src/nuketown2-fidelity.test.ts`.
- **Items**:
  - Adjust bounds to $52 \times 48\text{ m}$ ($X \in [-26, 26], Z \in [-24, 24]$).
  - Update `NUKETOWN2_HOUSE_LAYOUT` and garage footprints to fit accurate cul-de-sac frontage.
  - Place central moving truck adjacent to central bus in midfield; remove fictional outer cul-de-sac trucks.
  - Re-seat driveway cars in front of garages on driveway aprons.
  - Re-derive spawn layout and shed placements in backyards.
  - Maintain 2x overdrive core on bus roof at $\{0, 3.75, 0\}$ and rare gun sites in upper front bedroom window seats.
  - Update `src/nuketown2-fidelity.test.ts` to assert the authentic reference schematic.

### Job 3: Layer On Approved Visual Styles
- **State**: PENDING
- **Targets**: `src/rendering/arenas/nuketown2.ts`, shaders/materials, lighting, surround.
- **Items**:
  - Bring in approved visual style from older layout (`atomic-acres.ts`, lawn field, forest surround, mountain ring).
  - Maintain art-direction distinctiveness floor against shipped map.
  - Capture review cameras.
