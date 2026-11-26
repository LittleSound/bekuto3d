import type { GeometryOptions, MergeInput } from './mergeGeometry'
import { getManifoldModule, setWasmUrl } from 'manifold-3d/lib/wasm'
import wasmUrl from 'manifold-3d/manifold.wasm?url'
import { mergeGeometry } from './mergeGeometry'

setWasmUrl(wasmUrl)

globalThis.onmessage = async ({ data }: MessageEvent<{ parts: MergeInput[], curveSegments: number, options: GeometryOptions }>) => {
  try {
    const result = mergeGeometry(data.parts, data.curveSegments, await getManifoldModule(), data.options)
    const transfer = new Set<ArrayBuffer>()
    for (const value of [result.normals, ...Object.values(result.solid), ...result.holes.flatMap(hole => Object.values(hole.solid))]) {
      if (ArrayBuffer.isView(value))
        transfer.add(value.buffer as ArrayBuffer)
    }
    globalThis.postMessage(result, { transfer: [...transfer] })
  }
  catch (error) {
    globalThis.postMessage({ error: error instanceof Error ? error.message : 'Could not compute the result.' })
  }
}
