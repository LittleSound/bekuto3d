import { BufferAttribute, BufferGeometry, Group, Mesh } from 'three'

/** STL bakes the mirrored SVG coordinate frame into vertices, so reverse reflected faces before serialization. */
export function stlGroup(source: Group) {
  source.updateWorldMatrix(true, true)
  const group = new Group()
  source.traverse((object) => {
    if (!(object instanceof Mesh))
      return
    let geometry = object.geometry
    if (object.matrixWorld.determinant() < 0) {
      const positions = geometry.getAttribute('position')
      const index = geometry.getIndex()
      const indices = new Uint32Array(index?.count ?? positions.count)
      for (let i = 0; i < indices.length; i += 3) {
        indices[i] = index?.getX(i) ?? i
        indices[i + 1] = index?.getX(i + 2) ?? i + 2
        indices[i + 2] = index?.getX(i + 1) ?? i + 1
      }
      geometry = new BufferGeometry().setAttribute('position', positions).setIndex(new BufferAttribute(indices, 1))
    }
    const mesh = new Mesh(geometry, object.material)
    mesh.matrixAutoUpdate = false
    mesh.matrix.copy(object.matrixWorld)
    group.add(mesh)
  })
  group.updateMatrixWorld(true)
  return group
}
