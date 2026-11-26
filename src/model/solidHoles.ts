import type { CrossSection, Manifold, ManifoldToplevel, MeshOptions, Vec2 } from 'manifold-3d'
import type { SolidHole } from '../types/three-types'

type Resource = CrossSection | Manifold

/** Manifold objects own WASM memory, including the intermediate results of boolean operations. */
export function withGeometryScope<R>(run: (keep: <T extends Resource>(value: T) => T) => R): R {
  const resources: Resource[] = []
  try {
    return run((value) => {
      resources.push(value)
      return value
    })
  }
  finally {
    for (const resource of resources.reverse())
      resource.delete()
  }
}

export function meshData(solid: Manifold): MeshOptions {
  const { numProp, vertProperties, triVerts, mergeFromVert, mergeToVert, tolerance } = solid.getMesh()
  return { numProp, vertProperties, triVerts, mergeFromVert, mergeToVert, tolerance }
}

function clockwise(points: Vec2[]) {
  let area = 0
  let prev = points[points.length - 1]
  for (const point of points) {
    area += (prev[0] - point[0]) * (prev[1] + point[1])
    prev = point
  }
  return area < 0
}

/** Extruded SVG solids change horizontal section only at horizontal faces. Connect bounded voids across those levels. */
export function solidHoles(solid: Manifold, mesh: MeshOptions, engine: ManifoldToplevel): SolidHole[] {
  const levels = new Set<number>()
  const { vertProperties, triVerts, numProp } = mesh
  for (let i = 0; i < triVerts.length; i += 3) {
    const z = vertProperties[triVerts[i] * numProp + 2]
    if (z === vertProperties[triVerts[i + 1] * numProp + 2] && z === vertProperties[triVerts[i + 2] * numProp + 2])
      levels.add(z)
  }

  const heights = [...levels].sort((a, b) => a - b)
  return withGeometryScope((keep) => {
    const slabs: Manifold[] = []
    for (let i = 1; i < heights.length; i++) {
      const low = heights[i - 1]
      const high = heights[i]
      withGeometryScope((temporary) => {
        const section = temporary(solid.slice((low + high) / 2))
        const holes = section.toPolygons().filter(clockwise).map(ring => ring.reverse())
        if (!holes.length)
          return
        const outlines = temporary(new engine.CrossSection(holes, 'Positive'))
        const empty = temporary(outlines.subtract(section))
        const contours = temporary(empty.simplify(solid.tolerance()))
        const slab = temporary(contours.extrude(high - low))
        slabs.push(keep(slab.translate([0, 0, low])))
      })
    }
    if (!slabs.length)
      return []
    const joined = keep(engine.Manifold.union(slabs))
    return joined.decompose().map(keep).map(region => ({
      solid: meshData(region),
      outline: keep(region.project()).toPolygons(),
    }))
  })
}
