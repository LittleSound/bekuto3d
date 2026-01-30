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
