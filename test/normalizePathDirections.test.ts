import { describe, expect, it } from 'vitest'
import { normalizePathDirections } from '../src/composables/useSvgLoader'

describe('normalizePathDirections', () => {
  it('reorients compound path so outer shell is counter-clockwise and hole clockwise', () => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg">
        <path d="M0 0L0 10L10 10L10 0ZM2 2L2 8L8 8L8 2Z" />
      </svg>
    `

    const normalized = normalizePathDirections(svg)
    const doc = new DOMParser().parseFromString(normalized, 'image/svg+xml')
    const d = doc.querySelector('path')?.getAttribute('d')

    expect(d).toBeTruthy()

    const areas = extractSignedAreas(d ?? '')

    expect(areas.length).toBe(2)
    expect(areas[0]).toBeGreaterThan(0) // outer shell should wind CCW
    expect(areas[1]).toBeLessThan(0) // hole should wind opposite direction
  })

  it('returns original markup when SVG cannot be parsed', () => {
    const malformed = '<svg><path d="M0,0"'
    expect(normalizePathDirections(malformed)).toBe(malformed)
  })
})

function extractSignedAreas(d: string) {
  return d
    .split(/(?=M)/)
    .map(part => part.replace(/[MLZ]/gi, ' ').trim())
    .filter(Boolean)
    .map((part) => {
      const coords = part
        .split(/[ ,]+/)
        .map(Number)
        .filter(Number.isFinite)

      const points: Array<[number, number]> = []
      for (let i = 0; i < coords.length; i += 2)
        points.push([coords[i], coords[i + 1]])

      return computeSignedArea(points)
    })
}

function computeSignedArea(points: Array<[number, number]>) {
  let area = 0
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i]
    const [x2, y2] = points[(i + 1) % points.length]
    area += (x1 * y2 - x2 * y1) / 2
  }
  return area
}
