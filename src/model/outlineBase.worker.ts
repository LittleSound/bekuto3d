import type { OutlineRequest } from './outlineBase'
import { getManifoldModule, setWasmUrl } from 'manifold-3d/lib/wasm'
import wasmUrl from 'manifold-3d/manifold.wasm?url'
import { outlineBase } from './outlineBase'

setWasmUrl(wasmUrl)
globalThis.onmessage = async ({ data }: MessageEvent<OutlineRequest>) => {
  try {
    globalThis.postMessage({ rings: outlineBase(data, await getManifoldModule()) })
  }
  catch {
    globalThis.postMessage({ error: 'Could not build the outline. Try another base shape.' })
  }
}
