import type { ShapeWithColor } from '~/types/three-types'
import fixPathDirections from 'fix-path-directions'
import { Color } from 'three'
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js'
import { expandStrokes } from '../svg/expandStrokes'
import { resolveSvgPaint } from '../svg/paint'

const { getFixedPathDataString } = fixPathDirections as {
  getFixedPathDataString: (d: string, options?: { toClockwise?: boolean }) => string
}

const hasDomParser = typeof globalThis !== 'undefined' && typeof (globalThis as any).DOMParser !== 'undefined'
const hasXmlSerializer = typeof globalThis !== 'undefined' && typeof (globalThis as any).XMLSerializer !== 'undefined'

export function normalizePathDirections(svgMarkup: string) {
  if (!hasDomParser)
    return svgMarkup

  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(svgMarkup, 'image/svg+xml')
    if (doc.querySelector('parsererror'))
      return svgMarkup

    let modified = false
    const paths = doc.querySelectorAll('path[d]')

    paths.forEach((path) => {
      const d = path.getAttribute('d')
      if (!d)
        return

      try {
        const fixed = getFixedPathDataString(d, { toClockwise: true })
        if (fixed && fixed !== d) {
          path.setAttribute('d', fixed)
          modified = true
        }
      }
      catch (error) {
        if (import.meta.env.DEV)
          console.warn('[useSvgLoader] Failed to normalize path direction', error)
      }
    })

    if (!modified)
      return svgMarkup

    if (!hasXmlSerializer)
      return svgMarkup

    const serializer = new XMLSerializer()
    return serializer.serializeToString(doc.documentElement)
  }
  catch (error) {
    if (import.meta.env.DEV)
      console.warn('[useSvgLoader] Failed to preprocess SVG paths', error)
    return svgMarkup
  }
}

export interface SvgLoaderOptions {
  defaultColor?: string
  defaultDepth?: number
  defaultStartZ?: number
  drawStrokes?: boolean
  drawFillShapes?: boolean
  customShapes?: (shapes: ShapeWithColor[], index: number) => ShapeWithColor[]
}

export function useSvgLoader() {
  const loader = new SVGLoader()

  function createShapesWithColor(svgData: string, options: SvgLoaderOptions = {}) {
    const {
      defaultColor = '#FFA500',
      defaultDepth = 2,
      defaultStartZ = 0,
      drawStrokes = true,
      drawFillShapes = true,
      customShapes,
    } = options

    const markup = drawStrokes ? expandStrokes(svgData, loader, drawFillShapes) : svgData
    const shapes: ShapeWithColor[] = []
    if (markup && (drawStrokes || drawFillShapes)) {
      const svgParsed = loader.parse(normalizePathDirections(markup))
      for (const path of svgParsed.paths) {
        const style = path.userData?.style as { fill?: string, fillOpacity?: number, opacity?: number } | undefined
        const fillColor = style?.fill || defaultColor
        const paint = resolveSvgPaint(path.userData!.node as SVGElement, fillColor, defaultColor)
        const opacity = (style?.fillOpacity ?? 1) * (style?.opacity ?? 1) * paint.opacity
        if (opacity <= 0)
          continue

        for (const shape of path.toShapes()) {
          shapes.push({
            shape: markRaw(shape),
            color: markRaw(new Color().setStyle(paint.color)),
            sourceGradient: paint.gradient ? markRaw(paint.gradient) : undefined,
            startZ: defaultStartZ,
            depth: defaultDepth,
            opacity,
            polygonOffset: 0,
          })
        }
      }
    }

    return customShapes ? customShapes(shapes, 0) : shapes
  }

  return {
    createShapesWithColor,
  }
}
