import JSZip from 'jszip'
import { ExtrudeGeometry, Group, Mesh, MeshPhongMaterial } from 'three'
import { exportTo3MF } from 'three-3mf-exporter'
import { describe, expect, it } from 'vitest'
import { useSvgLoader } from '../src/composables/useSvgLoader'

const { createShapesWithColor } = useSvgLoader()
const stops = '<stop stop-color="red"/><stop offset="100%" stop-color="blue"/>'

function load(definitions: string, elements = '<rect width="10" height="10" fill="url(#g)"/>') {
  return createShapesWithColor(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><defs>${definitions}</defs>${elements}</svg>`)
}

describe('gradient import', () => {
  it.each(['linearGradient', 'radialGradient'])('approximates %s and preserves its original definition', (type) => {
    const [part] = load(`<${type} id="g" gradientTransform="rotate(30)">${stops}</${type}>`)
    expect(part.color.getHexString()).toBe('800080')
    expect(part.opacity).toBe(1)
    expect(part.sourceGradient).toMatchObject({
      id: 'g',
      type,
      reference: 'url(#g)',
      stops: [{ offset: 0, color: '#ff0000', opacity: 1 }, { offset: 1, color: '#0000ff', opacity: 1 }],
    })
    expect(part.sourceGradient?.definitions[0]).toContain('gradientTransform="rotate(30)"')
  })

  it('weights stop intervals rather than counting stops or taking the middle stop', () => {
    const [part] = load('<linearGradient id="g"><stop offset="0" stop-color="red"/><stop offset="80%" stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient>')
    expect(part.color.getHexString()).toBe('e6001a')
  })

  it('includes the constant-color regions at both ends of a ramp', () => {
    const [part] = load('<linearGradient id="g"><stop offset="20%" stop-color="red"/><stop offset="60%" stop-color="blue"/></linearGradient>')
    expect(part.color.getHexString()).toBe('660099')
  })

  it('resolves href chains, quoted references and inline styles before attributes', () => {
    const [part] = load(`<linearGradient id="base" color="#00ff00"><stop stop-color="red" style="stop-color:currentColor"/><stop offset="100%" stop-color="blue"/></linearGradient>
      <linearGradient id="middle" xlink:href="#base"/><radialGradient id="g" href="#middle" cx="25%"/>`, '<g fill="url(\'#g\')"><rect width="10" height="10"/></g>')
    expect(part.color.getHexString()).toBe('008080')
    expect(part.sourceGradient?.definitions).toHaveLength(3)
    expect(part.sourceGradient?.type).toBe('radialGradient')
  })

  it('clamps offsets in document order and keeps hard transitions', () => {
    const [part] = load('<linearGradient id="g"><stop offset="50%" stop-color="red"/><stop offset="20%" stop-color="blue"/></linearGradient>')
    expect(part.sourceGradient?.stops.map(stop => stop.offset)).toEqual([0.5, 0.5])
    expect(part.color.getHexString()).toBe('800080')
  })

  it('ignores transparent colors when choosing opaque filament color', () => {
    const [part] = load('<linearGradient id="g"><stop stop-color="red"/><stop offset="100%" stop-color="#0000ff00"/></linearGradient>')
    expect(part.color.getHexString()).toBe('ff0000')
    expect(part.opacity).toBe(1)
    expect(part.sourceGradient?.stops[1].opacity).toBe(0)
  })

  it('retains gradient references on both expanded fill and stroke parts', () => {
    const parts = load(`<linearGradient id="g">${stops}</linearGradient>`, '<rect width="10" height="10" fill="url(#g)" stroke="url(#g)" stroke-width="2"/>')
    expect(parts).toHaveLength(2)
    expect(parts.every(part => part.color.getHexString() === '800080' && part.sourceGradient?.id === 'g')).toBe(true)
  })

  it('does not cut the underlying fill for translucent gradient strokes', () => {
    const [fill, stroke] = load(`<linearGradient id="g"><stop stop-color="red"/><stop offset="1" stop-color="blue" stop-opacity="0.5"/></linearGradient>`, '<rect width="10" height="10" fill="green" stroke="url(#g)" stroke-width="2"/>')
    expect(Math.max(...fill.shape.getPoints().map(point => point.x))).toBe(10)
    expect(stroke.sourceGradient?.stops[1].opacity).toBe(0.5)
  })

  it('keeps gradient paint opacity consistent with and without stroke expansion', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g">${stops}</linearGradient></defs>
      <g opacity="0.5"><rect width="10" height="10" fill="url(#g)" fill-opacity="0.8" stroke="url(#g)" stroke-opacity="0.6" stroke-width="2"/></g></svg>`
    const [fill, stroke] = createShapesWithColor(svg)
    const [fillOnly] = createShapesWithColor(svg, { drawStrokes: false })
    expect(fill.opacity).toBeCloseTo(0.4)
    expect(stroke.opacity).toBeCloseTo(0.3)
    expect(fillOnly.opacity).toBe(fill.opacity)
    expect(fillOnly.color.getHexString()).toBe(fill.color.getHexString())
  })

  it('does not cut the underlying stroke for a translucent gradient foreground fill', () => {
    const [stroke, fill] = load('<linearGradient id="g"><stop stop-color="red"/><stop offset="1" stop-color="blue" stop-opacity="50%"/></linearGradient>', '<rect width="10" height="10" fill="url(#g)" stroke="black" stroke-width="2" paint-order="stroke"/>')
    expect(stroke.shape.holes).toHaveLength(1)
    expect(Math.max(...stroke.shape.holes[0].getPoints().map(point => point.x))).toBe(9)
    expect(fill.sourceGradient?.stops[1].opacity).toBe(0.5)
  })

  it('handles single-stop, empty and cyclic gradients without invalid colors', () => {
    expect(load('<linearGradient id="g"><stop offset="40%" stop-color="#123456"/></linearGradient>')[0].color.getHexString()).toBe('123456')
    expect(load('<linearGradient id="g"/>')).toEqual([])
    expect(load('<linearGradient id="g" href="#b"/><linearGradient id="b" href="#g"/>')).toEqual([])
  })

  it('uses an explicit paint fallback or the import default for missing references', () => {
    expect(load('', '<rect width="10" height="10" fill="url(#missing) #123456"/>')[0].color.getHexString()).toBe('123456')
    expect(load('')[0].color.getHexString()).toBe('ffa500')
    expect(load('', '<rect width="10" height="10" fill="url(#missing) none"/>')).toEqual([])
  })

  it('exports the same approximate color as the preview material', async () => {
    const [part] = load(`<linearGradient id="g">${stops}</linearGradient>`)
    const geometry = new ExtrudeGeometry(part.shape, { depth: part.depth, bevelEnabled: false })
    const material = new MeshPhongMaterial({ color: part.color })
    const group = new Group().add(new Mesh(geometry, material))
    try {
      const archive = await JSZip.loadAsync(await exportTo3MF(group))
      const settings = JSON.parse(await archive.file('Metadata/project_settings.config')!.async('string'))
      expect(settings.filament_colour[0]).toBe('#800080')
      expect(material.color.getHexString()).toBe(part.color.getHexString())
      expect(part.sourceGradient?.id).toBe('g')
    }
    finally {
      geometry.dispose()
      material.dispose()
    }
  })
})
