# SVG stroke import

File uploads and pasted SVG share the loader in `src/composables/useSvgLoader.ts`. Expand strokes there so the editor and every exporter receive ordinary extrudable shapes.

Expand each element in its local coordinate system, before path winding normalization and SVG transforms. Open paths need their original ends for caps and joins. A closed stroke can produce holes. Keep the stroke as a separately editable part with its own paint. For opaque strokes, subtract the covered area from the same element's fill so adjacent materials meet at a common boundary.

Use the geometry operations from `unstroke` per element. Keep SVGLoader responsible for resolving paint and placing the generated paths. Fill-only drawings should continue through the existing import pipeline. Check the colored circle from issue #3, open polylines, inherited styles, transforms and extrusion in the loader regression tests.

The outline builder lives in `src/svg/expandStrokes.ts`. It samples the same Three.js paths used for extrusion, unions the stroke polygons and keeps holes in the resulting regions. Three.js r186 scales the parsed stroke width by the square root of the absolute transform determinant. Recover the local width before expanding so the final SVG transform applies the scale once. Referenced elements are expanded per instance so inherited widths and colors stay independent. This covers solid-color, continuous strokes. Dash patterns, paint servers and non-scaling strokes require separate handling.
