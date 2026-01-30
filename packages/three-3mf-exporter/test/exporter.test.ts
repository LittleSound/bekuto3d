import JSZip from 'jszip'
import * as THREE from 'three'
import { BoxGeometry, Mesh, MeshStandardMaterial } from 'three'
/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import { exportTo3MF } from '../src/index'

async function getZip(blob: Blob) {
  const reader = new FileReader()
  const bufferPromise = new Promise<ArrayBuffer>((resolve) => {
    reader.onload = () => resolve(reader.result as ArrayBuffer)
  })
  reader.readAsArrayBuffer(blob)
  const buffer = await bufferPromise
  return await JSZip.loadAsync(buffer)
}

describe('three-3mf-exporter', () => {
  it('should export a single Mesh as a single object', async () => {
    const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ color: 0xFF0000 }))
    const blob = await exportTo3MF(mesh)
    const zip = await getZip(blob)
    const modelXml = await zip.file('3D/3dmodel.model')!.async('string')

    // Should have one object with a mesh
    expect(modelXml).toContain('<object id="1" type="model"')
    expect(modelXml).toContain('<mesh>')
    expect(modelXml).toContain('<item objectid="1"')
  })

  it('should export a Group as an assembly with sub-components', async () => {
    const group = new THREE.Group()
    const mesh1 = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ color: 0xFF0000 }))
    const mesh2 = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ color: 0x00FF00 }))
    mesh1.name = 'Part1'
    mesh2.name = 'Part2'
    group.add(mesh1)
    group.add(mesh2)

    const blob = await exportTo3MF(group)
    const zip = await getZip(blob)
    const modelXml = await zip.file('3D/3dmodel.model')!.async('string')

    // Mesh 1 -> ID 1, Mesh 2 -> ID 2, Assembly -> ID 3
    expect(modelXml).toContain('<object id="1" type="model" name="Part1">')
    expect(modelXml).toContain('<object id="2" type="model" name="Part2">')
    expect(modelXml).toContain('<object id="3" type="model"')
    expect(modelXml).toContain('<components>')
    expect(modelXml).toContain('<component objectid="1" transform="')
    expect(modelXml).toContain('<component objectid="2" transform="')

    expect(modelXml).toContain('<item objectid="3"')
  })

  it('should export nested groups as nested assemblies', async () => {
    const scene = new THREE.Scene()
    const groupA = new THREE.Group()
    groupA.name = 'GroupA'
    const groupB = new THREE.Group()
    groupB.name = 'GroupB'

    const meshA1 = new Mesh(new BoxGeometry(1, 1, 1))
    meshA1.name = 'MeshA1'
    groupA.add(meshA1)

    const meshB1 = new Mesh(new BoxGeometry(1, 1, 1))
    meshB1.name = 'MeshB1'
    groupB.add(meshB1)

    scene.add(groupA)
    scene.add(groupB)

    const blob = await exportTo3MF(scene)
    const zip = await getZip(blob)
    const modelXml = await zip.file('3D/3dmodel.model')!.async('string')

    // MeshA1 -> 1, GroupA -> 2, MeshB1 -> 3, GroupB -> 4
    expect(modelXml).toContain('<object id="2" type="model" name="GroupA">')
    expect(modelXml).toContain('<object id="4" type="model" name="GroupB">')

    const groupAObj = modelXml.match(/<object id="2"[^>]*>([\s\S]*?)<\/object>/)![1]
    expect(groupAObj).toContain('objectid="1"')

    expect(modelXml).toContain('<item objectid="2"')
    expect(modelXml).toContain('<item objectid="4"')
  })

  it('should export a Scene with a single mesh as a single top-level object', async () => {
    const scene = new THREE.Scene()
    const mesh = new Mesh(new BoxGeometry(1, 1, 1))
    mesh.name = 'SceneMesh'
    scene.add(mesh)

    const blob = await exportTo3MF(scene)
    const zip = await getZip(blob)
    const modelXml = await zip.file('3D/3dmodel.model')!.async('string')

    expect(modelXml).toContain('<object id="1" type="model" name="SceneMesh">')
    expect(modelXml).toContain('<item objectid="1"')
  })

  it('should export a Scene with a single group as a single top-level assembly', async () => {
    const scene = new THREE.Scene()
    const group = new THREE.Group()
    group.name = 'SceneGroup'
    group.add(new Mesh(new BoxGeometry(1, 1, 1)))
    scene.add(group)

    const blob = await exportTo3MF(scene)
    const zip = await getZip(blob)
    const modelXml = await zip.file('3D/3dmodel.model')!.async('string')

    // Mesh -> 1, Group -> 2
    expect(modelXml).toContain('<object id="2" type="model" name="SceneGroup">')
    expect(modelXml).toContain('<item objectid="2"')
  })

  it('should export a Scene with mixed content correctly (multiple meshes and groups)', async () => {
    const scene = new THREE.Scene()

    // 1. A single mesh
    const soloMesh = new Mesh(new BoxGeometry(1, 1, 1))
    soloMesh.name = 'SoloMesh'
    scene.add(soloMesh)

    // 2. A group
    const group = new THREE.Group()
    group.name = 'GroupObj'
    group.add(new Mesh(new BoxGeometry(1, 1, 1)))
    group.add(new Mesh(new BoxGeometry(1, 1, 1)))
    scene.add(group)

    // 3. Another mesh
    const secondSoloMesh = new Mesh(new BoxGeometry(1, 1, 1))
    secondSoloMesh.name = 'SecondSolo'
    scene.add(secondSoloMesh)

    const blob = await exportTo3MF(scene)
    const zip = await getZip(blob)
    const modelXml = await zip.file('3D/3dmodel.model')!.async('string')

    // SoloMesh -> 1
    // GroupMesh1 -> 2, GroupMesh2 -> 3, GroupObj -> 4
    // SecondSolo -> 5

    expect(modelXml).toContain('<object id="1" type="model" name="SoloMesh">')
    expect(modelXml).toContain('<object id="4" type="model" name="GroupObj">')
    expect(modelXml).toContain('<object id="5" type="model" name="SecondSolo">')

    expect(modelXml).toContain('<item objectid="1"')
    expect(modelXml).toContain('<item objectid="4"')
    expect(modelXml).toContain('<item objectid="5"')
  })
})
