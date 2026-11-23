import JSZip from 'jszip'
import { ExtrudeGeometry, Group, Mesh, MeshPhongMaterial, ShapeUtils } from 'three'
import { exportTo3MF } from 'three-3mf-exporter'
import { describe, expect, it } from 'vitest'
import { useSvgLoader } from '../src/composables/useSvgLoader'

const { createShapesWithColor } = useSvgLoader()
type Options = Parameters<typeof createShapesWithColor>[1]

function load(elements: string, options?: Options) {
  return createShapesWithColor(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">${elements}</svg>`, options)
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

  it.each(['90px', '1in', '25.4mm', '2.54cm', '72pt', '6pc'])('resolves use positions in %s before the instance transform', (x) => {
    const [part] = load(`<defs><path id="line" d="M0 0L10 0" fill="none"/></defs>
      <use xlink:href="#line" x="${x}" y="12pt" transform="translate(3 4) scale(2 3)" stroke="red" stroke-width="2"/>`)
    const box = bounds(part)
    expect(box.min.x).toBeCloseTo(183)
    expect(box.max.x).toBeCloseTo(203)
    expect(box.min.y).toBeCloseTo(46)
    expect(box.max.y).toBeCloseTo(52)
  })

  it('resolves unit-bearing positions independently in nested instances', () => {
    const [part] = load(`<defs>
      <path id="line" d="M0 0L10 0" fill="none"/>
      <g id="pair"><use href="#line" x="1in"/></g>
    </defs><use href="#pair" x="1in" stroke="blue" stroke-width="2"/>`)
    expect(bounds(part).min.x).toBeCloseTo(180)
    expect(bounds(part).max.x).toBeCloseTo(190)
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

  it.each(['rgba(0,0,0,0)', 'hsla(0,0%,0%,0)', '#0000', '#00000000'])('omits an invisible %s stroke without cutting the fill', (stroke) => {
    const svg = circle.replace('stroke="#000"', `stroke="${stroke}"`)
    const parts = load(svg)
    expect(parts).toHaveLength(1)
    expect(parts[0].color.getHexString()).toBe('6d91ef')
    expect(bounds(parts[0]).max.x).toBeCloseTo(400)
    expect(load(svg, { drawFillShapes: false })).toEqual([])
  })

  it.each(['rgba(255,0,0,0.5)', 'hsla(0,100%,50%,0.5)', 'rgb(255 0 0 / 50%)', '#ff000080'])('combines %s alpha with the inherited stroke and element opacity', (stroke) => {
    const [disc, border] = load(`<g opacity="0.5" stroke-opacity="0.4" color="${stroke}">
      ${circle.replace('stroke="#000"', 'stroke="currentColor"')}
    </g>`)
    expect(bounds(disc).max.x).toBeCloseTo(400)
    expect(disc.opacity).toBe(0.5)
    expect(border.color.getHexString()).toBe('ff0000')
    expect(border.opacity).toBeCloseTo(0.1, 2)
  })

  it.each(['paint-order="stroke fill"', 'paint-order="stroke"', 'style="paint-order:markers stroke"'])('keeps fill over stroke for %s', (order) => {
    const [border, disc] = load(circle.replace('<circle', `<circle ${order}`))
    expect([border.color.getHexString(), disc.color.getHexString()]).toEqual(['000000', '6d91ef'])
    expect(bounds(disc).max.x).toBeCloseTo(400)
    const holeArea = Math.abs(ShapeUtils.area(border.shape.holes[0].getPoints()))
    expect(holeArea / Math.abs(ShapeUtils.area(disc.shape.getPoints()))).toBeCloseTo(1, 6)
  })

  it('inherits paint order and allows inline normal to override a presentation attribute', () => {
    const [border, disc] = load(`<g style="paint-order:stroke">${circle}</g>`)
    expect(border.color.getHexString()).toBe('000000')
    expect(bounds(disc).max.x).toBeCloseTo(400)
    const [resetDisc, resetBorder] = load(`<g paint-order="stroke">${circle.replace('<circle', '<circle paint-order="stroke" style="paint-order:normal"')}</g>`)
    expect(resetDisc.color.getHexString()).toBe('6d91ef')
    expect(bounds(resetDisc).max.x).toBeCloseTo(368, 0)
    expect(resetBorder.color.getHexString()).toBe('000000')
  })

  it('keeps the underlying stroke beneath a translucent foreground fill', () => {
    const [border, disc] = load(circle.replace('fill="#6d91ef"', 'fill="rgba(0,0,255,0.5)" paint-order="stroke"'))
    expect(border.color.getHexString()).toBe('000000')
    expect(disc.color.getHexString()).toBe('0000ff')
    expect(disc.opacity).toBe(0.5)
    expect(bounds(disc).max.x).toBeCloseTo(400)
    expect(Math.max(...border.shape.holes[0].getPoints().map(point => point.x))).toBeCloseTo(368, 0)
  })

  it('does not cut strokes with disabled or invisible foreground fills', () => {
    const svg = circle.replace('<circle', '<circle paint-order="stroke"')
    for (const parts of [load(svg, { drawFillShapes: false }), load(svg.replace('fill="#6d91ef"', 'fill="rgba(0,0,255,0)"'))]) {
      expect(parts).toHaveLength(1)
      expect(parts[0].color.getHexString()).toBe('000000')
      expect(Math.max(...parts[0].shape.holes[0].getPoints().map(point => point.x))).toBeCloseTo(368, 0)
    }
  })

  it('honors independent fill and stroke options', () => {
    const [fill] = load(circle, { drawStrokes: false })
    expect(bounds(fill).max.x).toBeCloseTo(400, 0)
    expect(load(circle, { drawFillShapes: false }).map(p => p.color.getHexString())).toEqual(['000000'])
    expect(load(circle, { drawFillShapes: false, drawStrokes: false })).toEqual([])
    expect(load('<path d="M0 0L10 0" fill="none" stroke="black" stroke-width="0"/>')).toEqual([])
  })
})
