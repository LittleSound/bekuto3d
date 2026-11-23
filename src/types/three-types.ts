import type { Color, Shape } from 'three'

export interface SvgGradient {
  id: string
  type: 'linearGradient' | 'radialGradient'
  reference: string
  definitions: string[]
  stops: { offset: number, color: string, opacity: number }[]
}

export interface ShapeWithColor {
  shape: Shape
  color: Color
  opacity: number
  depth: number
  startZ: number
  polygonOffset: number
  /** Retained for print-color edits; cleared when the user replaces the paint with a solid color. */
  sourceGradient?: SvgGradient
  colorOverridden?: boolean
  /** A selected point on the saved ramp; absent for automatic or arbitrary custom colors. */
  gradientPosition?: number
}
