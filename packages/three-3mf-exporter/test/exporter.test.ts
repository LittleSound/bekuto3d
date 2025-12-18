/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { BoxGeometry, Mesh, MeshStandardMaterial } from 'three'
import JSZip from 'jszip'
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
})
