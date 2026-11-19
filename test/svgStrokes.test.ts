import JSZip from 'jszip'
import { ExtrudeGeometry, Group, Mesh, MeshPhongMaterial, ShapeUtils } from 'three'
import { exportTo3MF } from 'three-3mf-exporter'
import { describe, expect, it } from 'vitest'
import { useSvgLoader } from '../src/composables/useSvgLoader'

const { createShapesWithColor } = useSvgLoader()
type Options = Parameters<typeof createShapesWithColor>[1]

function load(elements: string, options?: Options) {
  return createShapesWithColor(`<svg xmlns="http://www.w3.org/2000/svg">${elements}</svg>`, options)
}

function bounds(part: ReturnType<typeof load>[number]) {
  const geometry = new ExtrudeGeometry(part.shape, { depth: part.depth, bevelEnabled: false })
  geometry.computeBoundingBox()
  const box = geometry.boundingBox!
  geometry.dispose()
  return box
}

describe('sVG stroke import', () => {
  const circle = '<circle cx="256" cy="256" r="144" fill="#6d91ef" stroke="#000" stroke-width="64"/>'

  it('extrudes the visible disc and hollow border of issue #3 as adjacent parts', () => {
    const parts = load(circle)
    expect(parts.map(p => p.color.getHexString())).toEqual(['6d91ef', '000000'])
    const [disc, border] = parts
    expect(border.shape.holes).toHaveLength(1)
    expect(bounds(disc).min.x).toBeCloseTo(144, 0)
    expect(bounds(border).max.x).toBeCloseTo(432, 0)
    expect(bounds(border).max.z).toBe(2)
    const holeArea = Math.abs(ShapeUtils.area(border.shape.holes[0].getPoints()))
    expect(Math.abs(ShapeUtils.area(disc.shape.getPoints()))).toBeCloseTo(holeArea, 3)
  })

  it('exports both parts and their filament colors in the 3MF archive', async () => {
    const group = new Group()
    for (const { shape, color, depth } of load(circle)) {
      const geometry = new ExtrudeGeometry(shape, { depth, bevelEnabled: false })
      group.add(new Mesh(geometry, new MeshPhongMaterial({ color })))
    }
    const archive = await JSZip.loadAsync(await exportTo3MF(group))
    const model = await archive.file('3D/3dmodel.model')!.async('string')
    const settings = await archive.file('Metadata/project_settings.config')!.async('string')
    const xml = new DOMParser().parseFromString(model, 'application/xml')
    expect(xml.querySelectorAll('object > mesh')).toHaveLength(2)
    expect(JSON.parse(settings).filament_colour).toEqual(['#6d91ef', '#000000'])
  })

  it.each(['butt', 'square', 'round'])('outlines open lines with %s caps before nonuniform scaling', (cap) => {
    const [part] = load(`<g fill="none" stroke="#ab1234" stroke-width="4" transform="translate(20 10) scale(2 3)">
      <path d="M0 0L10 0" style="stroke-linecap:${cap};stroke-opacity:0.5"/>
    </g>`)
    const box = bounds(part)
    expect(box.min.x).toBeCloseTo(cap === 'butt' ? 20 : 16, 1)
    expect(box.max.x).toBeCloseTo(cap === 'butt' ? 40 : 44, 1)
    expect(box.min.y).toBeCloseTo(4, 1)
    expect(box.max.y).toBeCloseTo(16, 1)
    expect(part.opacity).toBe(0.5)
  })

  it('keeps bevel, round and miter joins distinct', () => {
    const areas = ['bevel', 'round', 'miter'].map((join) => {
      const [part] = load(`<polyline points="0,0 10,0 10,10" fill="none" stroke="black" stroke-width="4" stroke-linejoin="${join}"/>`)
      return Math.abs(ShapeUtils.area(part.shape.getPoints()))
    })
    expect(areas[0]).toBeLessThan(areas[1])
    expect(areas[1]).toBeLessThan(areas[2])
  })

  it('resolves stroke paint and width separately for each instance', () => {
    const [thin, thick] = load(`<defs><path id="line" d="M0 0L10 0" fill="none"/></defs>
      <use href="#line" stroke="red" stroke-width="2"/>
      <use href="#line" y="20" stroke="blue" stroke-width="6"/>`)
    expect(thin.color.getHexString()).toBe('ff0000')
    expect(bounds(thin).max.y).toBeCloseTo(1)
    expect(thick.color.getHexString()).toBe('0000ff')
    expect(bounds(thick).min.y).toBeCloseTo(17)
  })

  it('keeps fill-only siblings and resolves inherited currentColor on stroke-only icons', () => {
    const parts = load(`<rect width="5" height="5" fill="blue"/>
      <g style="color:#123456" stroke="currentColor" fill="none">
        <path d="M0 0Q5 10 10 0"/>
        <path d="M0 0L5 10" stroke-opacity="0"/>
      </g>`)
    expect(parts.map(p => p.color.getHexString())).toEqual(['0000ff', '123456'])
    expect(bounds(parts[1]).max.y).toBeCloseTo(5.5, 1)
  })

  it('retains the underlying fill for a translucent border', () => {
    const [disc, border] = load(circle.replace('stroke-width', 'stroke-opacity="0.4" stroke-width'))
    expect(bounds(disc).max.x).toBeCloseTo(400)
    expect(border.opacity).toBe(0.4)
  })

  it('honors independent fill and stroke options', () => {
    const [fill] = load(circle, { drawStrokes: false })
    expect(bounds(fill).max.x).toBeCloseTo(400, 0)
    expect(load(circle, { drawFillShapes: false }).map(p => p.color.getHexString())).toEqual(['000000'])
    expect(load(circle, { drawFillShapes: false, drawStrokes: false })).toEqual([])
    expect(load('<path d="M0 0L10 0" fill="none" stroke="black" stroke-width="0"/>')).toEqual([])
  })
})
