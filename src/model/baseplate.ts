import type { Vec2 } from 'manifold-3d'
import { Shape, Vector2 } from 'three'

export interface BaseplateSettings {
  style: 'none' | 'outline' | 'square' | 'circle'
  color: string
  thickness: number
  size: number
  radius: number
  border: number
  join: 'Round' | 'Miter' | 'Bevel'
  offsetX: number
  offsetY: number
}

export const defaultBaseplate: BaseplateSettings = {
  style: 'none',
  color: '#f4f1e8',
  thickness: 2,
  size: 54,
  radius: 5,
  border: 2,
  join: 'Round',
  offsetX: 0,
  offsetY: 0,
}

export const demoBaseplate: BaseplateSettings = {
  ...defaultBaseplate,
  style: 'square',
  color: '#1f1f1f',
  size: 37,
  radius: 37 * 117.188 / 500,
}

export function plateShape({ style, size, radius }: BaseplateSettings) {
  const shape = new Shape()
  const h = size / 2
  const r = Math.min(radius, h)
  if (style === 'circle' || r === h) {
    shape.absarc(0, 0, h, 0, Math.PI * 2, false)
    return shape
  }
  shape.moveTo(-h + r, -h)
  shape.lineTo(h - r, -h)
  if (r > 0)
    shape.absarc(h - r, -h + r, r, -Math.PI / 2, 0, false)
  shape.lineTo(h, h - r)
  if (r > 0)
    shape.absarc(h - r, h - r, r, 0, Math.PI / 2, false)
  shape.lineTo(-h + r, h)
  if (r > 0)
    shape.absarc(-h + r, h - r, r, Math.PI / 2, Math.PI, false)
  shape.lineTo(-h, -h + r)
  if (r > 0)
    shape.absarc(-h + r, -h + r, r, Math.PI, 1.5 * Math.PI, false)
  shape.closePath()
  return shape
}

export function shapeFromRing(ring: Vec2[]) {
  return new Shape(ring.map(([x, y]) => new Vector2(x, y)))
}

/** Distance to the rounded rectangle's inset core also covers a circle when radius equals half the side. */
export function fitsPlate(points: Vector2[], center: Vector2, scale: number, settings: BaseplateSettings) {
  const half = settings.size / 2
  const radius = settings.style === 'circle' ? half : Math.min(half, settings.radius)
  return points.every(({ x, y }) => {
    const dx = Math.abs((x - center.x) * scale + settings.offsetX) - half + radius
    const dy = Math.abs((y - center.y) * scale - settings.offsetY) - half + radius
    return Math.hypot(Math.max(0, dx), Math.max(0, dy)) <= radius + 0.0001
  })
}
