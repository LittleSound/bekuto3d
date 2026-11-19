import type { Matrix3, ShapePath } from 'three'
import type { SVGLoader } from 'three/addons/loaders/SVGLoader.js'
import type { MultiPolygon, Point, Polyline, StrokeStyle } from 'unstroke'
import { differenceMultiPolygons, multiPolygonToPathData, nonzeroRings, strokePolyline, unionRings, xorRings } from 'unstroke'

interface SvgPathData {
  node: SVGElement
  transform: Matrix3
  style: {
    fill: string
    fillOpacity: number
    fillRule?: string
    stroke?: string
    strokeWidth: number
    strokeLineCap: StrokeStyle['linecap']
    strokeLineJoin: StrokeStyle['linejoin']
    strokeMiterLimit: number
    strokeOpacity: number
    opacity?: number
    visibility?: string
  }
}

const svgNamespace = 'http://www.w3.org/2000/svg'

/** Each use can give the same source geometry a different stroke width or paint. */
function inlineUses(svg: string) {
  if (!svg.includes('<use'))
    return svg

  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
  function expand(use: Element, ancestors: Set<Element>) {
    const href = use.getAttribute('href') || use.getAttribute('xlink:href')
    const target = href?.startsWith('#') && doc.getElementById(href.slice(1))
    if (!target || ancestors.has(target)) {
      use.remove()
      return
    }
    const group = doc.createElementNS(svgNamespace, 'g')
    for (const attr of Array.from(use.attributes))
      group.setAttributeNS(attr.namespaceURI, attr.name, attr.value)

    const x = use.getAttribute('x') || '0'
    const y = use.getAttribute('y') || '0'
    group.setAttribute('transform', `${use.getAttribute('transform') || ''} translate(${x} ${y})`)
    const copy = target.cloneNode(true) as Element
    group.append(copy)
    const visited = new Set(ancestors).add(target)
    for (const nested of Array.from(group.querySelectorAll('use')))
      expand(nested, visited)

    use.replaceWith(group)
  }
  for (const use of Array.from(doc.querySelectorAll('use'))) {
    if (!use.closest('defs, symbol'))
      expand(use, new Set())
  }
  return new XMLSerializer().serializeToString(doc.documentElement)
}

function resolvePaint(node: SVGElement, paint: string) {
  if (paint.toLowerCase() !== 'currentcolor')
    return paint

  for (let element: Element | null = node; element; element = element.parentElement) {
    const color = (element as SVGElement).style?.color || element.getAttribute('color')
    if (color && !['currentcolor', 'inherit'].includes(color.toLowerCase()))
      return color
  }
  return 'black'
}

/** SVGLoader bakes transforms into points. Recover local geometry before applying stroke width. */
function localPolylines(path: ShapePath, node: SVGElement, loader: SVGLoader): Polyline[] {
  if (node.closest('[transform]')) {
    const copy = node.cloneNode(false) as SVGElement
    copy.removeAttribute('transform')
    const markup = new XMLSerializer().serializeToString(copy)
    path = loader.parse(`<svg xmlns="${svgNamespace}">${markup}</svg>`).paths[0]
  }

  const ellipse = ['circle', 'ellipse'].includes(node.localName)
  return path.subPaths.map((subPath) => {
    const points = subPath.getPoints(64)
    const closed = subPath.autoClose || ellipse || node.localName === 'rect'
    if (closed && points.length > 1 && (ellipse || points[0].equals(points[points.length - 1])))
      points.pop()
    return { closed, points: points.map(({ x, y }): Point => [x, y]) }
  }).filter(line => line.points.length > 0)
}

function appendRegion(group: Element, region: MultiPolygon, color: string, opacity: number) {
  for (const polygon of region) {
    const path = group.ownerDocument.createElementNS(svgNamespace, 'path')
    path.setAttribute('d', multiPolygonToPathData([polygon], { curves: false, precision: 8 }))
    path.setAttribute('fill', color)
    path.setAttribute('fill-opacity', String(opacity))
    path.setAttribute('fill-rule', 'evenodd')
    group.append(path)
  }
}

/** Expand in local coordinates so nested transforms also transform the outline and its caps. */
export function expandStrokes(svg: string, loader: SVGLoader, drawFills: boolean) {
  if (!/\bstroke\s*[:=]/i.test(svg))
    return drawFills ? svg : ''

  const parsed = loader.parse(inlineUses(svg))
  const serializer = new XMLSerializer()
  for (const path of parsed.paths) {
    const { node, style, transform } = path.userData as unknown as SvgPathData
    const strokeOpacity = (style.opacity ?? 1) * style.strokeOpacity
    if (node.closest('[display="none"]') || (style.visibility === 'hidden' || style.visibility === 'collapse') || style.opacity === 0) {
      node.remove()
      continue
    }
    if (!style.stroke || ['none', 'transparent'].includes(style.stroke) || style.strokeWidth <= 0 || strokeOpacity <= 0) {
      if (!drawFills)
        node.remove()
      continue
    }

    const lines = localPolylines(path, node, loader)
    const strokeStyle = {
      width: style.strokeWidth / Math.sqrt(Math.abs(transform.determinant())),
      linecap: style.strokeLineCap,
      linejoin: style.strokeLineJoin,
      miterLimit: style.strokeMiterLimit,
    }
    const tolerance = Math.min(0.05, strokeStyle.width / 200)
    const stroke = unionRings(lines.flatMap(line => strokePolyline(line, strokeStyle, tolerance)))

    const group = node.ownerDocument.createElementNS(svgNamespace, 'g')
    if (node.hasAttribute('transform'))
      group.setAttribute('transform', node.getAttribute('transform')!)

    if (drawFills && !['none', 'transparent'].includes(style.fill) && style.fillOpacity > 0) {
      const rings = lines.map(line => line.points).filter(points => points.length >= 3)
      const fill = style.fillRule === 'evenodd' ? xorRings(rings) : nonzeroRings(rings)
      const visible = strokeOpacity === 1 ? differenceMultiPolygons(fill, stroke) : fill
      appendRegion(group, visible, resolvePaint(node, style.fill), (style.opacity ?? 1) * style.fillOpacity)
    }
    appendRegion(group, stroke, resolvePaint(node, style.stroke), strokeOpacity)
    node.replaceWith(group)
  }

  return serializer.serializeToString(parsed.xml)
}
