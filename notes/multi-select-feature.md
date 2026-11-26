# Multi-Select Feature

## Overview

This feature allows users to select multiple shapes simultaneously and batch edit their properties (color, startZ, depth).

## Key Files

- `src/components/SvgTo3D.vue` - Main selection logic and UI
- `src/components/ModelRenderer.vue` - 3D visual feedback for selection

## Selection Modes

| Mode          | Trigger          | Behavior                                            |
| ------------- | ---------------- | --------------------------------------------------- |
| Single select | Click            | Replaces selection with clicked item                |
| Toggle select | Ctrl/Cmd + Click | Adds/removes item from selection                    |
| Range select  | Shift + Click    | Selects all items between last selected and clicked |
| Checkbox      | Click or Space   | Toggles one part while preserving other selections  |

## Delete and merge

The Parts toolbar operates on the selected editor rows, including on touch screens. Delete removes the selected rows and resets selection. Removing the last part returns to standby. Merge requires at least two parts with positive depth and replaces them at the first selected row, retaining that row's material. The result stays selected for recoloring.

In `src/model/mergeParts.ts`, union the solids at their edited Z positions and depths, using the same curve resolution as the preview. Preserve holes, separate islands and steps between heights. Load the boolean engine on first merge. Keep a merged mesh in local coordinates so the same depth and Z controls also work on a previously merged part.

Render one Three.js mesh with one material per visible part in `src/components/ModelRenderer.vue`. The existing exporter maps this to one 3MF mesh object and one slicer part. STL carries triangles only. Structural edits invalidate prepared downloads. Test the actual 3MF model and slicer settings, including a repeated merge and geometrically disjoint inputs.

### Path operations and holes

Keep Operation visible throughout part editing. Selection changes enable or disable its controls in place. Difference settings stay visible while Difference is selected.

Use the geometry worker for union, difference, intersection and symmetric difference. Difference has an explicit base part. Its through-cut mode extrudes the other parts' XY footprints through the base. Turning it off uses the cutters' actual Z spans. Intersection and XOR work on the edited solids. Use the result's actual vertical bounds for its position and depth controls. Empty results and cuts that miss the base leave the operands available.

Show enclosed voids nested under their owning part with a transparent swatch and a Fill button. SVG contours already identify these holes. For boolean results, all source solids are vertical extrusions. Sample between horizontal faces to identify bounded empty areas, extrude those areas within each slab, and join connected slabs into individually fillable voids. This includes blind pockets and preserves solid islands. An opening connected to the exterior in its horizontal section is an open notch. Fill adds material to the owning part and keeps its color. Retain its original contours or mesh and the chosen hole indices so Reopen can restore just one hole after further edits. Hole rows are editor controls and contribute no printable mesh of their own. Boolean edits and individual fills each record one undo step.

### Independent hole fills

In `PartHoles.vue`, **Fill as part** creates a separate insert in an open hole. **Split fill** extracts just the chosen fill from its owner. Place the insert immediately after its owner and select it for recoloring. Copy the owning material and fit the insert to the original hole at the current Z and depth. SVG holes keep their curves. Solid pockets use their stored 3D volume, including blind bottoms and islands. Commit the owner and insert together as one undo step.

Use the source geometry ID and original hole index to link a hole row to its independent part while it exists. The row then selects that part. Deleting the insert makes the hole available again. Export each part as an ordinary single-material mesh.

## Undo and background computation

Keep up to 40 edits for the current document. Record successful merges, deletions, and edits to color, Z, depth or scale. A continuous input gesture or a batch edit takes one undo step. Restore part order, properties, selection, file name and scale. Share immutable contours and mesh buffers across history entries. Deleting the last part keeps Undo available in standby. Opening or explicitly closing a document clears its history.

The synchronous merge benchmark in local Chrome took 128–144 ms for 32 overlapping circles and 646–658 ms for 128, with three repeating extrusion depths and 64 curve segments. Run contour sampling, extrusion, union and normal generation in a dedicated module worker. Pass shape descriptions or plain mesh data across the worker boundary and transfer output buffers. Keep input buffers intact for rendering and undo. End the job when the model or selection changes and release worker memory after completion. Selection, history and the Three.js scene stay on the main thread.

## Key Design Decisions

### 1. Index Mapping Between svgShapes and shownShapes

The UI displays `shownShapes` (filtered shapes with depth > 0), but selection state is stored using `svgShapes` indices. The `mapIndices()` function handles conversion between these two index spaces.

**Why**: This ensures selection state is consistent even when shapes are filtered out of the display.

### 2. Delta-Based Batch Editing

When editing numeric properties (startZ, depth) with multiple items selected, changes are applied as deltas rather than absolute values.

**Why**: This preserves the relative differences between shapes. For example, if shapes have depths [1, 2, 3] and you increase one by 0.5, they become [1.5, 2.5, 3.5] instead of all becoming the same value.

### 3. Separate Hover and Selection States

`hoverShapeIndex` and `selectedShapeIndices` are separate states. Hovering highlights a shape but doesn't affect selection.

**Why**: This provides visual feedback during hover without disrupting multi-selection workflows.

### 4. Input Area Click Handling

Clicking on input areas (color picker, number inputs) has special handling:

- Without modifiers: Selects unselected items, preserves selection for already selected items
- With modifiers: Performs normal multi-select logic

**Why**: Users expect clicking an input to start editing, not lose their multi-selection.

### 5. Auto-Focus After Selection

After selection changes, the position input of an appropriate item is focused:

- If clicked item is selected → focus it
- Otherwise → focus the first selected item

**Why**: Provides keyboard accessibility and quick editing workflow.

## Watch Out For

- When adding new selection-related features, remember to handle both `svgShapes` and `shownShapes` index spaces
- The `shouldBatchEdit()` check requires both: item is in selection AND multiple items selected
- Always use `new Set()` to trigger Vue reactivity when modifying selection state
- Shift range selection should update `lastSelectedIndex` to the clicked item so subsequent Shift+click uses the latest anchor
- Batch editing numeric inputs should respect UI constraints (e.g. clamp `startZ` to `[-10, 10]`, `depth` to `[0, 10]`) because delta-based edits can push other selected items out of range
