import type { MergedPart, ModelPart, PartSource } from '../types/three-types'
import type { GeometryOptions, MergeInput, MergeResult, OperationOptions } from './mergeGeometry'
import { BufferAttribute, BufferGeometry, Shape } from 'three'
import { markRaw, toRaw } from 'vue'
import { partKey } from '../types/three-types'

export function serializePart(part: ModelPart): MergeInput {
  const { startZ, depth } = part
  return 'shape' in part
    ? { startZ, depth, shape: part.shape.toJSON() }
    : { startZ, depth, solid: toRaw(part.solid) }
}

export function createMergedPart({ startZ, depth, solid, normals, holes }: MergeResult, material: ModelPart): MergedPart {
  const geometry = markRaw(new BufferGeometry())
  geometry.setAttribute('position', new BufferAttribute(solid.vertProperties, 3))
  geometry.setIndex(new BufferAttribute(solid.triVerts, 1))
  geometry.setAttribute('normal', new BufferAttribute(normals, 3))
  const { color, opacity, polygonOffset } = material
  return { startZ, depth, geometry, holes: markRaw(holes), solid: markRaw(solid), color, opacity, polygonOffset, maxDepth: Math.max(10, depth), maxStartZ: Math.max(10, startZ) }
}

export function partSource(part: ModelPart): PartSource {
  if (part.holeEdit)
    return part.holeEdit.original
  if ('shape' in part)
    return { shape: part.shape }
  const { geometry, solid, holes, maxDepth, maxStartZ } = part
  return { geometry, solid, holes, maxDepth, maxStartZ }
}

/** Rebuild from the unfilled source so each hole can be reopened independently, including after resizing. */
export async function toggleHole(part: ModelPart, index: number, curveSegments: number, signal: AbortSignal): Promise<ModelPart> {
  const source = partSource(part)
  const filled = new Set(part.holeEdit?.filled)
  if (filled.has(index))
    filled.delete(index)
  else
    filled.add(index)
  const original = { ...part, ...source, holeEdit: undefined }
  if (!filled.size)
    return original
  const holeEdit = markRaw({ original: source, filled: [...filled] })
  if ('shape' in source) {
    const shape = source.shape.clone()
    shape.holes = shape.holes.filter((_, i) => !filled.has(i))
    return { ...original, shape: markRaw(shape), holeEdit }
  }

  const plugs = [...filled].map(i => ({ startZ: 0, depth: 1, solid: source.holes[i].solid }))
  const result = await runWorker([{ startZ: 0, depth: 1, solid: source.solid }, ...plugs], curveSegments, signal, { operation: 'union' })
  return { ...createMergedPart(result, part), insertFor: part.insertFor, startZ: part.startZ, depth: part.depth, holeEdit, maxDepth: source.maxDepth, maxStartZ: source.maxStartZ }
}

/** Keep the plug at its actual Z span inside the owner, including after a pocket is resized. */
export async function splitHole(part: ModelPart, index: number, curveSegments: number, signal: AbortSignal): Promise<[ModelPart, ModelPart]> {
  const source = partSource(part)
  const owner = part.holeEdit?.filled.includes(index) ? await toggleHole(part, index, curveSegments, signal) : part
  const { opacity, polygonOffset, startZ, depth } = part
  const color = part.color.clone()
  const insertFor = { owner: partKey(source), hole: index }
  if ('shape' in source) {
    const path = source.shape.holes[index]
    const shape = new Shape()
    shape.curves = path.curves.slice()
    shape.autoClose = path.autoClose
    shape.currentPoint.copy(path.currentPoint)
    return [owner, { shape: markRaw(shape), color, opacity, polygonOffset, startZ, depth, insertFor }]
  }

  const hole = source.holes[index]
  const result = await runWorker([{ solid: hole.solid, startZ: 0, depth: 1 }], curveSegments, signal, { operation: 'extract' })
  result.startZ = startZ + depth * result.startZ
  result.depth *= depth
  return [owner, { ...createMergedPart(result, part), color, insertFor }]
}

export async function mergeParts(parts: ModelPart[], curveSegments: number, signal: AbortSignal, options: OperationOptions) {
  const result = await runWorker(parts.map(serializePart), curveSegments, signal, options)
  return createMergedPart(result, parts[0])
}

async function runWorker(parts: MergeInput[], curveSegments: number, signal: AbortSignal, options: GeometryOptions) {
  signal.throwIfAborted()
  const worker = new Worker(new URL('./merge.worker.ts', import.meta.url), { type: 'module' })
  let abort: (() => void) | undefined
  try {
    return await new Promise<MergeResult>((resolve, reject) => {
      abort = () => reject(signal.reason)
      signal.addEventListener('abort', abort, { once: true })
      worker.onerror = event => reject(new Error(event.message))
      worker.onmessageerror = () => reject(new Error('Invalid merge result'))
      worker.onmessage = ({ data }: MessageEvent<MergeResult | { error: string }>) => {
        if ('error' in data)
          reject(new Error(data.error))
        else
          resolve(data)
      }
      worker.postMessage({ parts, curveSegments, options })
    })
  }
  finally {
    if (abort)
      signal.removeEventListener('abort', abort)
    worker.terminate()
  }
}
