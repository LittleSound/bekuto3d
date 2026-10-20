import JSZip from 'jszip'
import { BufferAttribute, BufferGeometry, Mesh } from 'three'
/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { exportTo3MF } from '../src/index'

/** V8's maximum string length (2^29 - 24 UTF-16 units on 64-bit platforms). */
const V8_MAX_STRING_LENGTH = 2 ** 29 - 24

/**
 * Builds an indexed height-field grid with roughly `triangleCount` triangles,
 * i.e. about the shape of a large scanned/STL model (each vertex is shared by ~6 triangles).
 */
function createGridMesh(triangleCount: number) {
  const w = Math.ceil(Math.sqrt(triangleCount / 2))
  const h = Math.ceil(triangleCount / 2 / w)
  const positions = new Float32Array((w + 1) * (h + 1) * 3)
  let p = 0
  for (let j = 0; j <= h; j++) {
    for (let i = 0; i <= w; i++) {
      positions[p++] = i * 0.0731 + 0.123456
      positions[p++] = j * 0.0731 + 0.654321
      positions[p++] = Math.sin(i * 0.01) * Math.cos(j * 0.01) * 10 + 20
    }
  }
  const index = new Uint32Array(w * h * 6)
  let k = 0
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const a = j * (w + 1) + i
      const c = a + w + 1
      index.set([a, c, a + 1, a + 1, c, c + 1], k)
      k += 6
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setIndex(new BufferAttribute(index, 1))
  return { mesh: new Mesh(geometry), vertexCount: (w + 1) * (h + 1), triangleCount: w * h * 2 }
}

/**
 * Opt-in stress test for https://github.com/LittleSound/bekuto3d/issues/19.
 * An ~8M triangle model (about a 400 MB binary STL) produces a 3dmodel.model file larger
 * than V8's max string length, which used to throw `RangeError: Invalid string length`.
 * It needs several GB of memory, so run it explicitly with `THREE_3MF_STRESS=1`.
 */
describe.runIf(process.env.THREE_3MF_STRESS)('large model export (stress)', () => {
  it('exports a model whose XML is larger than the max JS string length', async () => {
    const { mesh, vertexCount, triangleCount } = createGridMesh(8_000_000)

    const blob = await exportTo3MF(mesh, { compression: 'none' })

    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    const model = await zip.file('3D/3dmodel.model')!.async('uint8array')
    expect(model.byteLength).toBeGreaterThan(V8_MAX_STRING_LENGTH)

    const decoder = new TextDecoder()
    expect(decoder.decode(model.subarray(0, 4096))).toContain('<vertex x="0.12346" y="0.65432" z="20.00000" />')
    expect(decoder.decode(model.subarray(model.byteLength - 4096)).trimEnd().endsWith('</model>')).toBe(true)

    const countTags = (tag: string) => {
      const bytes = new TextEncoder().encode(tag)
      let count = 0
      for (let i = model.indexOf(bytes[0]); i !== -1; i = model.indexOf(bytes[0], i + 1)) {
        if (bytes.every((b, n) => model[i + n] === b))
          count++
      }
      return count
    }
    expect(countTags('<vertex ')).toBe(vertexCount)
    expect(countTags('<triangle ')).toBe(triangleCount)
  }, 600_000)
})
