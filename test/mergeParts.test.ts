import type { ModelPart } from '../src/types/three-types'
import JSZip from 'jszip'
import Module from 'manifold-3d'
import { Color, Group, Mesh, MeshPhongMaterial } from 'three'
import { exportTo3MF } from 'three-3mf-exporter'
import { expect, it } from 'vitest'
import { useSvgLoader } from '../src/composables/useSvgLoader'
import { mergeGeometry } from '../src/model/mergeGeometry'
import { createMergedPart, serializePart, toggleHole } from '../src/model/mergeParts'

it('preserves a stepped union, a hole and a separate island in one printable part', async () => {
  const engine = await Module()
  engine.setup()
  function merge(parts: ModelPart[]) {
    const inputs = structuredClone(parts.map(serializePart))
    return createMergedPart(structuredClone(mergeGeometry(inputs, 64, engine)), parts[0])
  }
  const [ring, block, island] = useSvgLoader().createShapesWithColor(`<svg xmlns="http://www.w3.org/2000/svg">
    <path fill="red" d="M0 0h10v10H0z M2 2v6h6V2z"/>
    <rect x="8" width="4" height="10" fill="blue"/>
    <rect x="20" width="2" height="2"/>
  </svg>`)
  ring.startZ = -1
  block.startZ = 0
  block.depth = 3
  const merged = merge([ring, block])
  expect(merged.color.getHexString()).toBe('ff0000')
  expect(merged.startZ).toBe(-1)
  expect(merged.depth).toBe(4)
  merged.depth = 8
  merged.startZ = -2
  const result = merge([merged, island])
  const solid = new engine.Manifold(new engine.Mesh(result.solid))
  try {
    expect(solid.volume() * result.depth).toBeCloseTo((64 * 2 + 40 * 3 - 20) * 2 + 4 * 2)
  }
  finally {
    solid.delete()
  }

  result.color = new Color('#123456')
  const mesh = new Mesh(result.geometry, new MeshPhongMaterial({ color: result.color }))
  mesh.position.z = result.startZ
  mesh.scale.z = result.depth
  const archive = await JSZip.loadAsync(await exportTo3MF(new Group().add(mesh)))
  const read = (path: string) => archive.file(path)!.async('string')
  const parser = new DOMParser()
  const model = parser.parseFromString(await read('3D/3dmodel.model'), 'application/xml')
  const settings = parser.parseFromString(await read('Metadata/model_settings.config'), 'application/xml')
  expect(model.querySelectorAll('object > mesh')).toHaveLength(1)
  expect(settings.querySelectorAll('part[subtype="normal_part"]')).toHaveLength(1)
  expect(JSON.parse(await read('Metadata/project_settings.config')).filament_colour[0]).toBe('#123456')
})

it('cuts a through-hole or a pocket at the cutter height and exports fillable voids', async () => {
  const engine = await Module()
  engine.setup()
  const [base, cutter] = useSvgLoader().createShapesWithColor(`<svg xmlns="http://www.w3.org/2000/svg">
    <rect width="10" height="10"/><rect x="2" y="2" width="3" height="4"/>
  </svg>`)
  base.startZ = 1
  base.depth = 6
  cutter.startZ = 5
  cutter.depth = 5
  const inputs = [base, cutter].map(serializePart)
  function volume(result: ReturnType<typeof mergeGeometry>) {
    const solid = new engine.Manifold(new engine.Mesh(result.solid))
    try {
      return solid.volume() * result.depth
    }
    finally {
      solid.delete()
    }
  }
  for (const through of [true, false]) {
    const cut = mergeGeometry(inputs, 64, engine, { operation: 'difference', through })
    expect(cut.holes).toHaveLength(1)
    expect(cut.startZ).toBe(1)
    expect(cut.depth).toBe(6)
    expect(volume(cut)).toBeCloseTo(600 - 12 * (through ? 6 : 2))
    const fill = mergeGeometry([cut, { ...cut, solid: cut.holes[0].solid }], 64, engine)
    expect(fill.holes).toHaveLength(0)
    expect(volume(fill)).toBeCloseTo(600)
  }
  const intersection = mergeGeometry(inputs, 64, engine, { operation: 'intersection' })
  expect([intersection.startZ, intersection.depth]).toEqual([5, 2])
  expect(volume(intersection)).toBeCloseTo(24)
  const xor = mergeGeometry(inputs, 64, engine, { operation: 'xor' })
  expect(volume(xor)).toBeCloseTo(600 + 60 - 2 * 24)
  const disjoint = [inputs[0], { ...inputs[1], startZ: 20 }]
  expect(() => mergeGeometry(disjoint, 64, engine, { operation: 'intersection' })).toThrow('empty')
  expect(() => mergeGeometry(disjoint, 64, engine, { operation: 'difference' })).toThrow('do not remove')
  expect(volume(mergeGeometry(disjoint, 64, engine, { operation: 'difference', through: true }))).toBeCloseTo(528)
  expect(() => mergeGeometry(inputs.toReversed(), 64, engine, { operation: 'difference', through: true })).toThrow('empty')
})

it('reopens individual imported holes after resizing and leaves undo snapshots intact', async () => {
  const [part] = useSvgLoader().createShapesWithColor(`<svg xmlns="http://www.w3.org/2000/svg">
    <path d="M0 0h20v20H0Z M2 2v3h3V2Z M10 10v5h5v-5Z"/>
  </svg>`)
  const signal = new AbortController().signal
  expect(part.shape.holes).toHaveLength(2)
  const first = await toggleHole(part, 0, 64, signal)
  const both = await toggleHole(first, 1, 64, signal)
  both.depth = 7
  const reopened = await toggleHole(both, 0, 64, signal)
  expect(reopened.depth).toBe(7)
  expect(reopened.holeEdit?.filled).toEqual([1])
  expect('shape' in reopened && reopened.shape.holes).toHaveLength(1)
  expect('shape' in both && both.shape.holes).toHaveLength(0)
  expect(part.shape.holes).toHaveLength(2)
})

it('seals a curved through-cut when its mesh and plug cross the worker boundary', async () => {
  const engine = await Module()
  engine.setup()
  const parts = useSvgLoader().createShapesWithColor(`<svg xmlns="http://www.w3.org/2000/svg">
    <rect width="20" height="20"/><circle cx="10" cy="10" r="4"/>
  </svg>`).map(serializePart)
  const cut = mergeGeometry(parts, 64, engine, { operation: 'difference', through: true })
  const filled = mergeGeometry([{ ...cut, depth: 1 }, { ...cut, depth: 1, solid: cut.holes[0].solid }], 64, engine)
  expect(filled.holes).toHaveLength(0)
  const body = new engine.Manifold(new engine.Mesh(filled.solid))
  try {
    expect(body.surfaceArea()).toBeCloseTo(880, 3)
  }
  finally {
    body.delete()
  }
})

it('normalizes an extracted pocket to its own editable height and preserves its footprint', async () => {
  const engine = await Module()
  engine.setup()
  const [base, cutter] = useSvgLoader().createShapesWithColor(`<svg xmlns="http://www.w3.org/2000/svg">
    <rect width="10" height="10"/><rect x="2" y="2" width="3" height="4"/>
  </svg>`)
  base.depth = 8
  cutter.startZ = 6
  cutter.depth = 3
  const pocket = mergeGeometry([base, cutter].map(serializePart), 64, engine, { operation: 'difference' })
  const insert = mergeGeometry([{ startZ: 0, depth: 1, solid: pocket.holes[0].solid }], 64, engine, { operation: 'extract' })
  expect(insert.startZ).toBeCloseTo(0.75)
  expect(insert.depth).toBeCloseTo(0.25)
  const body = new engine.Manifold(new engine.Mesh(insert.solid))
  try {
    expect(body.boundingBox()).toEqual({ min: [2, 2, 0], max: [5, 6, 1] })
    expect(body.volume() * insert.depth * base.depth).toBeCloseTo(24)
  }
  finally {
    body.delete()
  }
})
