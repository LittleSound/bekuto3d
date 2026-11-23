# SVG gradient import

## Behavior

The editor previews the same solid colors that the 3MF exporter uses. Import linear and radial gradients as an approximate solid color, retain their source definitions, and show a warning on each affected shape. Choosing a color (including explicitly accepting the approximation) makes that shape a solid-color override and dismisses its warning. Batch color edits follow the existing selection behavior.

## Key locations

- `src/svg/paint.ts` — paint resolution, gradient provenance and representative colors
- `src/svg/expandStrokes.ts` — stroke expansion and paint-order clipping
- `src/composables/useSvgLoader.ts` — shared import path for uploads and pasted SVG
- `src/types/three-types.ts` — shape color and original gradient data
- `src/components/SvgTo3D.vue` — warning, color picker and batch edits
- `src/components/ModelRenderer.vue` and `ModelExporter.vue` — consume the same solid material color
- `test/svgGradients.test.ts` and `test/gradientEditing.test.ts` — import, export and editing regressions

## Decisions

Keep the printable color in `ShapeWithColor.color`. Keep the original paint reference, referenced gradient definitions (including href chains), and resolved stops in `sourceGradient`. A separate `colorOverridden` flag distinguishes an automatic approximation from an explicit color choice without destroying the source data. No exporter-specific material mutation is necessary.

Compute an interval-weighted average over the gradient ramp in sRGB, weighting colors by stop opacity so invisible colors do not dominate. Include the constant-color intervals before the first stop and after the last stop. This is a deterministic approximation of the ramp, not a spatial average over the shape: gradient transforms, radial area, clipping and spread do not alter the approximation. Preserve those parameters in the source definitions for future use. The approximation is opaque, matching solid filament; original stop opacity remains available for paint-order decisions and provenance.

Resolve local `href` and `xlink:href` chains with cycle protection. Honor percentage offsets, nondecreasing stop order, inline stop styles and inherited `currentColor`. Missing references use an explicit SVG fallback color or the import default instead of passing `url(...)` to Three.js Color. External paint servers and arbitrary stylesheet rules are outside this implementation's scope.

Gradient references must survive stroke expansion. Do not cut away underlying geometry when any foreground gradient stop is translucent. Keep the original fill/stroke opacity separate from stop opacity while generating paths, avoiding double application. Manual solid overrides retain source data but no longer need a gradient warning.

The [SVG paint-server specification](https://www.w3.org/TR/SVG2/pservers.html) defines gradient references, stop inheritance and offset behavior. Read definitions from the source DOM: the current Three.js gradient parser does not correctly normalize percentage stop offsets or inline style precedence.
