# SVG stroke import

File uploads and pasted SVG share the loader in `src/composables/useSvgLoader.ts`. Expand strokes there so the editor and every exporter receive ordinary extrudable shapes.

Expand each element in its local coordinate system, before path winding normalization and SVG transforms. Open paths need their original ends for caps and joins. A closed stroke can produce holes. Keep the stroke as a separately editable part with its own paint. Apply the element's paint order: an opaque foreground paint cuts its footprint out of the background paint, so adjacent materials meet at a common boundary. A translucent foreground must retain the underlying geometry. Only paints enabled by the import options participate in clipping.

Use the geometry operations from `unstroke` per element. Keep SVGLoader responsible for resolving paint and placing the generated paths. Fill-only drawings should continue through the existing import pipeline. Check the colored circle from issue #3, open polylines, inherited styles, transforms and extrusion in the loader regression tests.

The outline builder lives in `src/svg/expandStrokes.ts`. It samples the same Three.js paths used for extrusion, unions the stroke polygons and keeps holes in the resulting regions. Three.js r186 scales the parsed stroke width by the square root of the absolute transform determinant. Recover the local width before expanding so the final SVG transform applies the scale once. Referenced elements are expanded per instance so inherited widths and colors stay independent. This covers continuous strokes with solid colors or [gradient approximations](./svg-gradients.md). Dash patterns, pattern paint servers and non-scaling strokes require separate handling.

Instance positions can contain length units, unlike SVG transform arguments. Resolve them through SVGLoader with the same unit and DPI settings as the source geometry before constructing a translation; preserve the order of the instance's transform and translation.

Resolve currentColor before separating a paint's color and alpha. Use CSS color normalization for RGB/HSL and hex alpha syntax, then multiply the alpha by the paint and element opacity. Three.js Color discards alpha, so pass only the color into generated paths and carry opacity separately. Invisible strokes must leave the original fill intact.

Resolve paint-order from presentation attributes and inline styles, including ancestor inheritance and abbreviated orders such as `stroke`. Inline declarations override presentation attributes, while `normal` resets an inherited order. Keep these semantics covered in `test/svgStrokes.test.ts`, alongside unit-bearing instances and transparent/translucent colors. See the [SVG painting specification](https://www.w3.org/TR/SVG2/painting.html#PaintOrder).
