# SVG gradient import

## Behavior

The 3D preview uses the same solid colors that the 3MF exporter uses. Import linear and radial gradients as an approximate solid color, retain their source definitions, and show a warning on each affected shape. The shape-list swatch displays the saved gradient's colors, stop positions and opacity, using a horizontal linear ramp or a centered radial ramp. This compact swatch identifies the source paint; it does not reproduce the gradient's spatial mapping over the shape. Choosing a color (including explicitly accepting the approximation) switches the swatch to that solid color and dismisses its warning. Batch color edits follow the existing selection behavior.

Keep the warning badge larger than its icon, with visible space around the icon and separation from the shape number. Its disclosure describes the solid color used by the 3D preview and export. The color picker starts from that printable approximation even while its swatch shows the original gradient.

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

## Cross-platform component tests

Keep root-relative public asset URLs as browser URLs during component tests. Turning `/logo-dark.svg` into a module import makes Vitest attempt to load a drive-less file URL on Windows before the editor tests can run. Configure this in `vite.config.ts` for Vitest only, preserving relative asset imports, TresJS template options and production asset handling. The editor regression suite must run on both Windows and Ubuntu.
