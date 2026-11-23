# SVG gradient import

## Behavior

The 3D preview uses the same solid colors that the 3MF exporter uses. Import linear and radial gradients as an approximate solid color and retain their source definitions. The shape-list swatch always displays the saved gradient's colors, stop positions and opacity, using a horizontal linear ramp or a centered radial ramp. This compact swatch identifies the source paint; it does not reproduce the gradient's spatial mapping over the shape.

Use the selected C design: a quiet `Prints as` disclosure under the shape controls shows the solid print color, its hex value and a chevron. Opening it reveals the original gradient as a native range input, a brief explanation of the printing limitation, an automatic-color reset and a Done action. Expand within the list rather than covering adjacent controls with a popover. Keep this disclosure and the source swatch after every edit, so users can repeatedly choose a color. The swatch's native color picker remains available for arbitrary custom colors.

Dragging the slider updates the material immediately. Store the normalized position in `gradientPosition`, separate from the original definition and printable `color`. A closed/reopened editor retains the position. Always show a clearly outlined thumb, including before hovering or focusing and after resetting. Use a white ring with a dark outer edge so it stays visible over light, dark and saturated stops. An automatic average need not occur anywhere on a multi-stop ramp, so retain the `Auto` mode and use the midpoint only as the initial drag position; opening the editor must not change the print color. Custom colors likewise have no committed ramp position. Clicking the range at its initial midpoint must still select that color. Reset restores the automatic approximation without deleting source data.

Color selection applies the same solid color to the existing selection. Retain the chosen ramp position only for selected shapes using the same source gradient. Reset restores each selected gradient's own average, leaving shapes without gradients unchanged.

## Key locations

- `src/svg/paint.ts` — paint resolution, gradient provenance and representative colors
- `src/svg/gradient.ts` — sRGB ramp sampling, averaging and CSS swatches
- `src/svg/expandStrokes.ts` — stroke expansion and paint-order clipping
- `src/composables/useSvgLoader.ts` — shared import path for uploads and pasted SVG
- `src/types/three-types.ts` — shape color and original gradient data
- `src/components/SvgTo3D.vue` — warning, color picker and batch edits
- `src/components/GradientPrintColor.vue` — persistent print-color disclosure and gradient slider
- `src/components/ModelRenderer.vue` and `ModelExporter.vue` — consume the same solid material color
- `test/svgGradients.test.ts` and `test/gradientEditing.test.ts` — import, export and editing regressions

## Decisions

Keep the printable color in `ShapeWithColor.color`. Keep the original paint reference, referenced gradient definitions (including href chains), and resolved stops in `sourceGradient`. A separate `colorOverridden` flag distinguishes an automatic approximation from an explicit color choice; `gradientPosition` distinguishes a point on the ramp from an arbitrary custom color. No exporter-specific material mutation is necessary.

Compute an interval-weighted average over the gradient ramp in sRGB, weighting colors by stop opacity so invisible colors do not dominate. Include the constant-color intervals before the first stop and after the last stop. This is a deterministic approximation of the ramp, not a spatial average over the shape: gradient transforms, radial area, clipping and spread do not alter the approximation. Preserve those parameters in the source definitions for future use. The approximation is opaque, matching solid filament; original stop opacity remains available for paint-order decisions and provenance.

Resolve local `href` and `xlink:href` chains with cycle protection. Honor percentage offsets, nondecreasing stop order, inline stop styles and inherited `currentColor`. Missing references use an explicit SVG fallback color or the import default instead of passing `url(...)` to Three.js Color. External paint servers and arbitrary stylesheet rules are outside this implementation's scope.

Sampling follows the saved stop offsets, holds the first and last colors outside the stop range, and uses the last coincident stop at a hard transition. Interpolate premultiplied sRGB to avoid tinting opaque filament with invisible colors. If the sampled interval is fully transparent, use its unweighted RGB colors so the slider still produces a finite, selectable solid color.

Gradient references must survive stroke expansion. Do not cut away underlying geometry when any foreground gradient stop is translucent. Keep the original fill/stroke opacity separate from stop opacity while generating paths, avoiding double application. Both slider and custom solid overrides retain source data and access to the print-color editor.

The [SVG paint-server specification](https://www.w3.org/TR/SVG2/pservers.html) defines gradient references, stop inheritance and offset behavior. Read definitions from the source DOM: the current Three.js gradient parser does not correctly normalize percentage stop offsets or inline style precedence.

## Cross-platform component tests

Keep root-relative public asset URLs as browser URLs during component tests. Turning `/logo-dark.svg` into a module import makes Vitest attempt to load a drive-less file URL on Windows before the editor tests can run. Configure this in `vite.config.ts` for Vitest only, preserving relative asset imports, TresJS template options and production asset handling. The editor regression suite must run on both Windows and Ubuntu.
