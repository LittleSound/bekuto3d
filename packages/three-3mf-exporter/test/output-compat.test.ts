import JSZip from 'jszip'
import { BoxGeometry, BufferAttribute, BufferGeometry, Group, Mesh, MeshStandardMaterial, Scene } from 'three'
/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { exportTo3MF } from '../src/index'

/**
 * Exports `object` and returns the text of every file in the archive, with the
 * non-deterministic CreationDate masked so the output can be snapshotted.
 */
async function exportFiles(object: Parameters<typeof exportTo3MF>[0], config?: Parameters<typeof exportTo3MF>[1]) {
  const blob = await exportTo3MF(object, config)
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  const files: Record<string, string> = {}
  for (const name of Object.keys(zip.files).filter(n => !zip.files[n].dir).sort()) {
    const text = await zip.file(name)!.async('string')
    files[name] = text.replace(/<metadata name="CreationDate">[^<]*<\/metadata>/, '<metadata name="CreationDate">DATE</metadata>')
  }
  return files
}

describe('3MF output compatibility', () => {
  it('keeps the exact XML layout for a scene with meshes, assemblies and transforms', async () => {
    const scene = new Scene()

    const indexed = new Mesh(new BoxGeometry(1, 2, 3), new MeshStandardMaterial({ color: 0xFF0000 }))
    indexed.name = 'Indexed'
    indexed.position.set(1.5, -2.25, 3)
    indexed.rotation.set(0.1, 0.2, 0.3)
    scene.add(indexed)

    const group = new Group()
    group.name = 'Assembly'
    group.position.set(10, 0, 0)
    group.rotation.z = Math.PI / 4
    const nonIndexed = new Mesh(new BoxGeometry(1, 1, 1).toNonIndexed(), new MeshStandardMaterial({ color: 0x00FF00 }))
    nonIndexed.name = 'NonIndexed'
    nonIndexed.position.set(0, 5, 0)
    nonIndexed.scale.set(2, 1, 1)
    group.add(nonIndexed)
    const nested = new Group()
    nested.position.set(0, 0, 7)
    const plain = new Mesh(new BoxGeometry(0.5, 0.5, 0.5))
    nested.add(plain)
    group.add(nested)
    scene.add(group)

    const files = await exportFiles(scene)
    expect(files).toMatchSnapshot()
  })

  it('merges vertices that only differ by the sign of zero', async () => {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array([
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      1,
      0,
      -0,
      -0,
      -0,
      0,
      1,
      0,
      0,
      0,
      1,
    ]), 3))
    const files = await exportFiles(new Mesh(geometry))
    const model = files['3D/3dmodel.model']
    expect(model.match(/<vertex /g)).toHaveLength(4)
    expect(model).toContain('<triangle v1="0" v2="1" v3="2" /> <triangle v1="0" v2="2" v3="3" />')
  })

  it('exports an uncompressed archive with identical model content', async () => {
    const mesh = new Mesh(new BoxGeometry(1, 1, 1))
    const deflated = await exportFiles(mesh)
    const stored = await exportFiles(mesh, { compression: 'none' })
    expect(stored['3D/3dmodel.model']).toBe(deflated['3D/3dmodel.model'])
  })
})
