import type { SvgGradient } from '~/types/three-types'
import { Color } from 'three'

interface SvgPaint {
  color: string
  opacity: number
  opaque: boolean
  gradient?: SvgGradient
}

/** Normalize percentages and invalid numbers before applying SVG's unit-interval constraints. */
function fraction(value: string | null, fallback: number) {
  if (!value?.trim())
    return fallback
  const number = Number.parseFloat(value) / (value.trim().endsWith('%') ? 100 : 1)
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : fallback
}

/** Inline declarations override presentation attributes; explicit inheritance follows the source tree. */
function property(node: Element, name: string, fallback: string): string {
  const value = (node as SVGElement).style?.getPropertyValue(name) || node.getAttribute(name)
  if (value === 'inherit')
    return node.parentElement ? property(node.parentElement, name, fallback) : fallback
  return value || fallback
}

/** Resolve currentColor and CSS alpha before Three.js discards the alpha channel. */
function solidPaint(node: Element, paint: string, fallbackColor: string): SvgPaint {
  if (paint.toLowerCase() === 'currentcolor') {
    paint = 'black'
    for (let element: Element | null = node; element; element = element.parentElement) {
      const color = property(element, 'color', '')
      if (color && !['currentcolor', 'inherit', 'unset'].includes(color.toLowerCase())) {
        paint = color
        break
      }
    }
  }
  if (['none', 'transparent'].includes(paint.toLowerCase()))
    return { color: '#000000', opacity: 0, opaque: false }

  const declaration = node.ownerDocument.createElementNS('http://www.w3.org/1999/xhtml', 'span').style
  declaration.color = paint
  const normalized = declaration.color || fallbackColor
  const rgba = /^rgba\((.+),([^,]+)\)$/.exec(normalized)
  const opacity = rgba ? fraction(rgba[2], 1) : 1
  const color = new Color().setStyle(rgba ? `rgb(${rgba[1]})` : normalized)
  return { color: `#${color.getHexString()}`, opacity, opaque: opacity === 1 }
}

/** Preserve each referenced definition, resolving stops independently of Three.js's gradient parser. */
function readGradient(node: Element, id: string, reference: string): SvgGradient | undefined {
  let element = node.ownerDocument.getElementById(id)
  if (!element || !['linearGradient', 'radialGradient'].includes(element.localName))
    return

  const gradient: SvgGradient = {
    id,
    type: element.localName as SvgGradient['type'],
    reference,
    definitions: [],
    stops: [],
  }
  const visited = new Set<Element>()
  const serializer = new XMLSerializer()
  let stopNodes: Element[] = []
  while (element && !visited.has(element) && ['linearGradient', 'radialGradient'].includes(element.localName)) {
    visited.add(element)
    gradient.definitions.push(serializer.serializeToString(element))
    if (!stopNodes.length)
      stopNodes = Array.from(element.children).filter(child => child.localName === 'stop')
    const href: string | null = element.getAttribute('href') || element.getAttribute('xlink:href')
    element = href?.startsWith('#') ? node.ownerDocument.getElementById(href.slice(1)) : null
  }

  let previousOffset = 0
  gradient.stops = stopNodes.map((stop) => {
    const paint = solidPaint(stop, property(stop, 'stop-color', 'black'), '#000000')
    const offset = Math.max(previousOffset, fraction(stop.getAttribute('offset'), 0))
    previousOffset = offset
    return {
      offset,
      color: paint.color,
      opacity: paint.opacity * fraction(property(stop, 'stop-opacity', '1'), 1),
    }
  })
  return gradient
}

/** Integrate the premultiplied sRGB ramp; filament is opaque, but invisible stops must not tint it. */
function approximateGradient(gradient: SvgGradient): SvgPaint {
  const stops = gradient.stops
  const channels = [0, 0, 0]
  let weight = 0
  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i]
    const before = i === 0 ? stop.offset : (stop.offset - stops[i - 1].offset) / 2
    const after = i === stops.length - 1 ? 1 - stop.offset : (stops[i + 1].offset - stop.offset) / 2
    const contribution = (before + after) * stop.opacity
    weight += contribution
    for (let channel = 0; channel < channels.length; channel++)
      channels[channel] += Number.parseInt(stop.color.slice(1 + channel * 2, 3 + channel * 2), 16) * contribution
  }
  const color = weight > 0
    ? `#${channels.map(channel => Math.round(channel / weight + 1e-10).toString(16).padStart(2, '0')).join('')}`
    : '#000000'
  return {
    color,
    opacity: weight > 0 ? 1 : 0,
    opaque: stops.length > 0 && stops.every(stop => stop.opacity === 1),
    gradient,
  }
}

/** Return a printable paint and retain local gradient provenance; unresolved URLs use a solid fallback. */
export function resolveSvgPaint(node: Element, paint: string, fallbackColor = '#000000'): SvgPaint {
  const reference = /^url\(([^)]*)\)(.*)$/i.exec(paint.trim())
  if (!reference)
    return solidPaint(node, paint, fallbackColor)

  const id = reference[1].trim().replace(/^(['"])(.*)\1$/, '$2')
  const gradient = id.startsWith('#') ? readGradient(node, id.slice(1), paint) : undefined
  return gradient ? approximateGradient(gradient) : solidPaint(node, reference[2].trim() || fallbackColor, fallbackColor)
}
