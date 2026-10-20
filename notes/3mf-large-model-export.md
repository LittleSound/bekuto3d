# 3MF exporter: very large models

Issue: https://github.com/LittleSound/bekuto3d/issues/19

## Key locations

- `packages/three-3mf-exporter/src/index.ts` — `exportTo3MF`, mesh collection and `3D/3dmodel.model` serialization
- `packages/three-3mf-exporter/test/output-compat.test.ts` — snapshot that pins the exact XML layout
- `packages/three-3mf-exporter/test/large-model.stress.test.ts` — opt-in (`THREE_3MF_STRESS=1`) ~8M triangle export

## Problem

`3D/3dmodel.model` used to be built as one JS string (`Array.join` + template literal).
V8 caps strings at `2^29 - 24` UTF-16 units (~512 MiB), so a mesh with roughly 7M+ triangles
(a ~400 MB binary STL) threw `RangeError: Invalid string length`. Memory use was also high:
every vertex/triangle was a JS object, vertex de-duplication used a `Map` with string keys
(which additionally caps at 2^24 entries), and the bounding box was computed from a cloned
`Vector3` per vertex.

## Design

- Mesh data is kept in typed arrays (`Float64Array` positions, `Uint32Array` indices).
- Vertex de-duplication uses an open-addressing hash table over the exact coordinate values.
  Equality must match the previous `${x},${y},${z}` string key semantics: `-0` equals `0`
  and all NaNs are equal.
  Storage starts from an estimate (triangle soups such as STLLoader output share each vertex
  ~6 times, so `corners / 6`) and doubles on demand; the table rehashes to stay ≤ 50% full.
  Do not size it from `positionAttr.count` for soups: that is ~6x the real vertex count.
- The bounding box is accumulated vertex by vertex, applying the same chain of matrices in the
  same order as before, without materializing world-space vertices.
- The model XML is UTF-8 encoded with `TextEncoder.encodeInto` in ~64K character batches into a
  single buffer, preallocated from an upper bound of the final size (`meshXmlByteBound`), and
  JSZip receives a view of it. The XML is therefore held once; never encode into separate chunks
  and concatenate them, which holds it twice. The over-estimated tail is never written, so its
  pages are not committed. The buffer grows only if the bound is wrong.
- The textual output is byte-identical to the previous implementation (pinned by snapshot).

## Remaining limits

- JSZip has no ZIP64 support, so a single entry or the archive must stay below 4 GiB.
- Peak memory is still roughly: input geometry + typed copies + XML bytes + zip output.

## XML escaping

- Every user-provided string interpolated into XML (object/part names, metadata keys and values)
  must go through `escapeXml`, which escapes markup characters and drops characters XML 1.0
  forbids. Unescaped names such as `Tom & Jerry` produce a 3MF that slicers reject.
  `test/xml-escape.test.ts` parses every XML part strictly to catch new interpolation points.
