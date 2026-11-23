import type { SvgGradient } from '../src/types/three-types'
import { describe, expect, it } from 'vitest'
import { getGradientPaint } from '../src/svg/gradient'

function gradient(stops: SvgGradient['stops']): SvgGradient {
  return { id: 'g', type: 'linearGradient', reference: 'url(#g)', definitions: [], stops }
}

const red = { offset: 0, color: '#ff0000', opacity: 1 }
const blue = { offset: 1, color: '#0000ff', opacity: 1 }

describe('printable gradient sampling', () => {
  it.each([[0, '#ff0000'], [0.25, '#bf0040'], [0.5, '#800080'], [0.75, '#4000bf'], [1, '#0000ff']] as const)('samples %s in sRGB', (position, color) => {
    expect(getGradientPaint(gradient([red, blue]), position).color).toBe(color)
  })

  it('honors uneven stop positions and holds endpoint colors outside the stop range', () => {
    const source = gradient([{ ...red, offset: 0.2 }, { ...blue, offset: 0.6 }])
    expect(getGradientPaint(source, -1).color).toBe('#ff0000')
    expect(getGradientPaint(source, 0.4).color).toBe('#800080')
    expect(getGradientPaint(source, 2).color).toBe('#0000ff')
  })

  it('uses the last coincident stop at a hard transition', () => {
    const source = gradient([red, { ...red, offset: 0.5 }, { ...blue, offset: 0.5 }, blue])
    expect(getGradientPaint(source, 0.499).color).toBe('#ff0000')
    expect(getGradientPaint(source, 0.5).color).toBe('#0000ff')
  })

  it('does not tint visible colors with fully transparent stops', () => {
    expect(getGradientPaint(gradient([red, { ...blue, opacity: 0 }]), 0.5)).toEqual({ color: '#ff0000', opacity: 0.5 })
    expect(getGradientPaint(gradient([{ ...red, opacity: 0 }, { ...blue, opacity: 0 }]), 0.5)).toEqual({ color: '#800080', opacity: 0 })
  })

  it('handles single-stop and empty gradients and preserves the saved stops', () => {
    const source = gradient([red])
    expect(getGradientPaint(source, 0.9).color).toBe('#ff0000')
    expect(getGradientPaint(gradient([]), 0.5)).toEqual({ color: '#000000', opacity: 0 })
    expect(source.stops).toEqual([red])
  })

  it('restores the interval-weighted automatic color when no position is supplied', () => {
    expect(getGradientPaint(gradient([red, { ...red, offset: 0.8 }, blue])).color).toBe('#e6001a')
  })
})
