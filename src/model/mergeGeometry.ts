import type { Manifold, ManifoldToplevel, MeshOptions, Vec2 } from 'manifold-3d'
import type { SolidHole } from '../types/three-types'
import { BufferAttribute, BufferGeometry, Shape } from 'three'
import { meshData, solidHoles, withGeometryScope } from './solidHoles'

export type MergeInput = { startZ: number, depth: number } & (
  { shape: ReturnType<Shape['toJSON']> } | { solid: MeshOptions }
)

export type BooleanOperation = 'union' | 'difference' | 'intersection' | 'xor'

export interface OperationOptions {
  operation: BooleanOperation
  through?: boolean
}

export type GeometryOptions = OperationOptions | { operation: 'extract' }

export interface MergeResult {
  holes: SolidHole[]
  startZ: number
  depth: number
  solid: MeshOptions
  normals: Float32Array
}

/** Store the result at unit height so later depth edits and repeated merges apply the same transform. */
export function mergeGeometry(parts: MergeInput[], curveSegments: number, engine: ManifoldToplevel, options: GeometryOptions = { operation: 'union' }): MergeResult {
  if (options.operation === 'extract' && (parts.length !== 1 || !('solid' in parts[0])))
    throw new Error('Choose one hole to extract.')
  if (options.operation !== 'extract' && (parts.length < 2 || parts.some(part => part.depth <= 0)))
    throw new Error('Select at least two parts with positive depth.')

  const originZ = parts[0].startZ
  return withGeometryScope((keep) => {
    const solids = parts.map((part, index) => {
      let solid: Manifold
      if ('shape' in part) {
        const { shape, holes } = new Shape().fromJSON(part.shape).extractPoints(curveSegments)
        const contours = [shape, ...holes].map(ring => ring.map(({ x, y }): Vec2 => [x, y]))
        const section = keep(new engine.CrossSection(contours, 'EvenOdd'))
        if (section.isEmpty())
          throw new Error('A selected part has an empty outline.')
        solid = keep(section.extrude(part.depth))
      }
      else {
        const original = keep(new engine.Manifold(new engine.Mesh(part.solid)))
        solid = keep(original.scale([1, 1, part.depth]))
      }
      if (options.operation === 'difference' && options.through && index > 0)
        return keep(keep(solid.project()).extrude(parts[0].depth))
      return keep(solid.translate([0, 0, part.startZ - originZ]))
    })
    let result: Manifold
    switch (options.operation) {
      case 'extract':
        result = solids[0]
        break
      case 'difference':
        result = keep(engine.Manifold.difference(solids))
        if (result.volume() >= solids[0].volume() * (1 - 1e-12))
          throw new Error('The cutters do not remove any material from the base part.')
        break
      case 'intersection':
        result = keep(engine.Manifold.intersection(solids))
        break
      case 'xor':
        result = solids.reduce((left, right) => {
          const a = keep(left.subtract(right))
          const b = keep(right.subtract(left))
          return keep(a.add(b))
        })
        break
      case 'union':
        result = keep(engine.Manifold.union(solids))
        break
    }
    if (result.status() !== 'NoError')
      throw new Error('The selected shapes could not form a solid.')
    if (result.isEmpty() || result.volume() <= 0)
      throw new Error('The result is empty. Try a different selection or adjust the part heights.')

    const { min, max } = result.boundingBox()
    const startZ = originZ + min[2]
    const depth = max[2] - min[2]
    const local = keep(result.translate([0, 0, -min[2]]))
    const normalized = keep(local.scale([1, 1, 1 / depth]))
    const solid = meshData(normalized)
    const stored = keep(new engine.Manifold(new engine.Mesh(solid)))
    const holes = solidHoles(stored, solid, engine)
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(solid.vertProperties, 3))
    geometry.setIndex(new BufferAttribute(solid.triVerts, 1))
    geometry.computeVertexNormals()

    return { startZ, depth, solid, holes, normals: geometry.getAttribute('normal').array as Float32Array }
  })
}
