import type { ManifoldToplevel, Vec2 } from 'manifold-3d'
import type { BaseplateSettings } from './baseplate'
import type { MergeInput } from './mergeGeometry'
import { Shape } from 'three'
import { withGeometryScope } from './solidHoles'

export interface OutlineRequest {
  parts: MergeInput[]
  segments: number
  center: Vec2
  scale: number
  border: number
  join: BaseplateSettings['join']
}

// Bevel joins adapted from LitoMore/si-website (MIT), copyright (c) LitoMore.
/** Offset each corner to the endpoints of its two translated edges. Positive fill resolves concave turns. */
function bevelRing(ring: Vec2[], width: number) {
  const edges = ring.map(([x, y], i): Vec2 => {
    const [nx, ny] = ring[(i + 1) % ring.length]
    const length = Math.hypot(nx - x, ny - y)
    return length ? [(ny - y) * width / length, (x - nx) * width / length] : [0, 0]
  })
  return ring.flatMap(([x, y], i): Vec2[] => {
    const a = edges[(i + ring.length - 1) % ring.length]
    const b = edges[i]
    const corner: Vec2[] = [[x + a[0], y + a[1]]]
    if (a[0] * b[1] < a[1] * b[0])
      corner.push([x, y])
    corner.push([x + b[0], y + b[1]])
    return corner
  })
}

export function outlineBase(request: OutlineRequest, engine: ManifoldToplevel): Vec2[][] {
  return withGeometryScope((keep) => {
    const sections = request.parts.map((part) => {
      if ('solid' in part)
        return keep(keep(new engine.Manifold(new engine.Mesh(part.solid))).project())
      const points = new Shape().fromJSON(part.shape).extractPoints(request.segments)
      const rings = [points.shape, ...points.holes].map(ring => ring.map(({ x, y }): Vec2 => [x, y]))
      return keep(new engine.CrossSection(rings, 'EvenOdd'))
    })
    const union = keep(engine.CrossSection.union(sections))
    const centered = keep(union.translate([-request.center[0], -request.center[1]]))
    const scaled = keep(centered.scale(request.scale))
    const contour = request.join === 'Round' ? scaled : keep(scaled.simplify(0.005))
    const expanded = request.join === 'Bevel'
      ? keep(new engine.CrossSection(contour.toPolygons().map(ring => bevelRing(ring, request.border)), 'Positive'))
      : keep(contour.offset(request.border, request.join, 4, 96))
    const outer = expanded.toPolygons().filter(ring => ring.reduce((area, [x, y], i) => {
      const next = ring[(i + 1) % ring.length]
      return area + x * next[1] - y * next[0]
    }, 0) > 0)
    return keep(new engine.CrossSection(outer, 'Positive')).toPolygons()
  })
}
