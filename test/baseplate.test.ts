import type { Vec2 } from 'manifold-3d'
import { readFileSync } from 'node:fs'
import { flushPromises, mount } from '@vue/test-utils'
import Module from 'manifold-3d'
import { Shape, Vector2 } from 'three'
import { expect, it, vi } from 'vitest'
import SvgTo3D from '../src/components/SvgTo3D.vue'
import { useSvgLoader } from '../src/composables/useSvgLoader'
import { defaultBaseplate, fitsPlate, plateShape } from '../src/model/baseplate'
import { serializePart } from '../src/model/mergeParts'
import { outlineBase } from '../src/model/outlineBase'

it('offsets visible projections in millimeters and gives a ring a solid backing', async () => {
  const engine = await Module()
  engine.setup()
  const [ring] = useSvgLoader().createShapesWithColor('<svg><path d="M10 10h20v20H10z M15 15v10h10V15z"/></svg>')
  const request = { parts: [serializePart(ring)], center: [20, 20] as Vec2, scale: 0.5, border: 1, segments: 32 }
  for (const [join, expected] of [['Miter', 144], ['Bevel', 142], ['Round', 140 + Math.PI]] as const) {
    const rings = outlineBase({ ...request, join }, engine)
    expect(rings).toHaveLength(1)
    const base = new engine.CrossSection(rings)
    try {
      expect(base.area()).toBeCloseTo(expected, 2)
      expect(base.bounds()).toEqual({ min: [-6, -6], max: [6, 6] })
    }
    finally { base.delete() }
  }
})

it('projects a merged mesh and joins nearby islands as the outline grows', async () => {
  const engine = await Module()
  engine.setup()
  const cubes = engine.Manifold.cube([2, 2, 1])
  const island = cubes.translate([4, 0, 0])
  const assembly = cubes.add(island)
  try {
    const request = {
      parts: [{ solid: assembly.getMesh(), startZ: -2, depth: 4 }],
      scale: 2,
      center: [3, 1] as Vec2,
      segments: 32,
      join: 'Round' as const,
    }
    expect(outlineBase({ ...request, border: 1 }, engine)).toHaveLength(2)
    expect(outlineBase({ ...request, border: 3 }, engine)).toHaveLength(1)
  }
  finally {
    assembly.delete()
    island.delete()
    cubes.delete()
  }
})

it('uses the actual rounded or circular edge when positioning artwork', () => {
  const center = new Vector2(100, 100)
  const points = [new Vector2(109, 109)]
  const square = { ...defaultBaseplate, style: 'square' as const, size: 20, radius: 0 }
  expect(fitsPlate(points, center, 1, square)).toBe(true)
  expect(fitsPlate(points, center, 1, { ...square, radius: 5 })).toBe(false)
  expect(fitsPlate(points, center, 1, { ...square, style: 'circle' })).toBe(false)
  expect(fitsPlate(points, center, 1, { ...square, style: 'circle', offsetX: -5, offsetY: 5 })).toBe(true)
  for (const radius of [0, 5, 10])
    expect(plateShape({ ...square, radius }).getPoints().every(p => Math.abs(p.x) <= 10 && Math.abs(p.y) <= 10)).toBe(true)
})

it('loads the demo with a separately editable base and clears it for pasted artwork', async () => {
  const svg = readFileSync('public/model/bekuto3d.svg', 'utf8')
  vi.stubGlobal('fetch', vi.fn(async () => new Response(svg)))
  const editor = mount(SvgTo3D, { global: { stubs: { ModelRenderer: true, ModelExporter: true, FileDropZone: true } } })
  const button = (name: string) => editor.findAll('button').find(b => b.text() === name)!
  const renderer = editor.getComponent({ name: 'ModelRenderer' })
  try {
    await flushPromises()
    expect(renderer.props('plateShapes')).toHaveLength(1)
    await button('Play demo').trigger('click')
    await flushPromises()
    expect(button('Square').attributes('aria-pressed')).toBe('true')
    expect(renderer.props('plateColor')).toBe('#1f1f1f')
    expect(renderer.props('plateThickness')).toBe(2)
    expect(renderer.props('shapes')).toHaveLength(7)
    await button('None').trigger('click')
    expect(renderer.props('plateShapes')).toHaveLength(0)
    await button('Undo').trigger('click')
    expect(renderer.props('plateShapes')[0]).toBeInstanceOf(Shape)
    await editor.get('[title="Close current file"]').trigger('click')
    await flushPromises()
    await editor.get('textarea').setValue('<svg viewBox="0 0 5 5"><rect width="5" height="5"/></svg>')
    await button('Convert').trigger('click')
    expect(button('None').attributes('aria-pressed')).toBe('true')
  }
  finally {
    editor.unmount()
    vi.unstubAllGlobals()
  }
})
