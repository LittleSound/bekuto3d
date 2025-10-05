import type { ShapeWithColor } from '~/types/three-types'
import fixPathDirections from 'fix-path-directions'
import { Color } from 'three'
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js'

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
      // drawStrokes = true,
      drawFillShapes = true,
      customShapes,
    } = options

    const svgParsed = loader.parse(normalizePathDirections(svgData))
    const shapes: ShapeWithColor[] = []

    svgParsed.paths.forEach((path) => {
      // 处理填充形状
      if (drawFillShapes) {
        const fillColor = path.userData?.style?.fill || defaultColor
        const fillOpacity = path.userData?.style?.fillOpacity ?? 1

        if (fillColor !== undefined && fillColor !== 'none') {
          const pathShapes = SVGLoader.createShapes(path)
          pathShapes.forEach((shape) => {
            shapes.push({
              shape: markRaw(shape),
              color: markRaw(new Color().setStyle(fillColor)),
              startZ: defaultStartZ,
              depth: defaultDepth,
              opacity: fillOpacity,
              polygonOffset: 0,
            })
          })
        }
      }

      // TODO 描边处理
      // 描边处理
      // if (drawStrokes) {
      //   const strokeColor = path.userData?.style?.stroke
      //   if (strokeColor && strokeColor !== 'none') {
      //     const strokeOpacity = path.userData?.style?.strokeOpacity ?? 1
      //     // const strokeWidth = path.userData?.style?.strokeWidth ?? 1

      //     path.subPaths.forEach((subPath) => {
      //       if (!subPath || !subPath.getPoints || typeof subPath.getPoints !== 'function') return

      //       const output: number[] = []
      //       SVGLoader.pointsToStrokeWithBuffers(
      //         subPath.getPoints(),
      //         path.userData?.style,
      //         undefined, undefined, output, [], []
      //       )

      //       if (output.length) {
      //         const shape = new Shape()
      //         for (let t = 0, T = output.length / 9; t < T; ++t) {
      //           shape.moveTo(output[t * 9 + 0], output[t * 9 + 1]);
      //           shape.lineTo(output[t * 9 + 3], output[t * 9 + 4]);
      //           shape.lineTo(output[t * 9 + 6], output[t * 9 + 7]);
      //           shape.lineTo(output[t * 9 + 0], output[t * 9 + 1]);
      //         }

      //         shapes.push({
      //           shape: markRaw(shape),
      //           color: markRaw(new Color().setStyle(strokeColor)),
      //           startZ: defaultStartZ,
      //           depth: defaultDepth,
      //           opacity: strokeOpacity,
      //           polygonOffset: 0,
      //         })
      //       }
      //     })
      //   }
      // }
    })

    return customShapes ? customShapes(shapes, 0) : shapes
  }

  return {
    createShapesWithColor,
  }
}
