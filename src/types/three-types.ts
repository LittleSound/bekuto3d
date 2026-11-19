import type { MeshOptions, Vec2 } from 'manifold-3d'
import type { BufferGeometry, Color, Shape } from 'three'

interface PartProperties {
  color: Color
  opacity: number
  depth: number
  startZ: number
  insertFor?: { owner: string, hole: number }
  holeEdit?: { original: PartSource, filled: number[] }
  polygonOffset: number
}

export interface ShapeWithColor extends PartProperties {
  shape: Shape
}

export interface SolidHole {
  solid: MeshOptions
  outline: Vec2[][]
}

interface MeshSource {
  holes: SolidHole[]
  solid: MeshOptions
  geometry: BufferGeometry
  maxDepth: number
  maxStartZ: number
}

export type PartSource = { shape: Shape } | MeshSource
export type MergedPart = PartProperties & MeshSource

export type ModelPart = ShapeWithColor | MergedPart

export function partKey(part: PartSource) {
  return 'shape' in part ? part.shape.uuid : part.geometry.uuid
}

export function depthLimit(part: ModelPart) {
  return 'maxDepth' in part ? part.maxDepth : 10
}

export function startZLimit(part: ModelPart) {
  return 'maxStartZ' in part ? part.maxStartZ : 10
}
