/**
 * Color-based flush (purge) volume estimation compatible with Bambu Studio / OrcaSlicer.
 *
 * This is an independent TypeScript implementation of the color heuristic the slicers use
 * when the user clicks "Recalculate" in the flushing volumes dialog. It was written from a
 * description of the algorithm (and verified against matrices saved by Bambu Studio),
 * not copied from the AGPL-licensed slicer sources.
 *
 * Not reproduced on purpose:
 * - Bambu Studio's measured lookup tables (`resources/flush/*`), which override the
 *   heuristic for a dozen Bambu Lab palette colors and some filament-id pairs.
 * - Support-material special cases (fixed 230 mm³ to support, at least 700 mm³ from support).
 */

export interface FlushVolumeOptions {
  /**
   * Volume (mm³) added to every color change. Bambu Studio uses the printer's
   * `nozzle_volume` here: 92 for the A1 / A1 mini, 107 for the X1 / P1 series.
   * @default 92
   */
  nozzleVolume?: number
}

const DEFAULT_NOZZLE_VOLUME = 92
/** Upper bound Bambu Studio applies to every computed volume (OrcaSlicer allows more). */
const MAX_FLUSH_VOLUME = 900
/** Lower bound of the color-dependent part, so even identical colors get purged a little. */
const MIN_COLOR_FLUSH = 60

/**
 * Round to single precision. The slicers compute in C++ `float`, and the result is truncated
 * to an integer, so double precision alone flips values sitting on integer boundaries
 * (e.g. white -> black lands on exactly 80 in float but 79.999… in double).
 */
const f32 = Math.fround

interface Rgb { r: number, g: number, b: number }

/**
 * Compute a flushing volumes matrix for the given filament colors, in the format Bambu Studio
 * stores as `flush_volumes_matrix`: a flattened, row-major `n * n` array where
 * `matrix[from * n + to]` is the volume (mm³) needed to switch from filament `from` to
 * filament `to`, with a zero diagonal. Values are not multiplied by `flush_multiplier`.
 *
 * Colors are hex strings (`#RGB`, `#RGBA`, `#RRGGBB` or `#RRGGBBAA`). Partial alpha is ignored;
 * fully transparent and unparseable colors are treated as white.
 *
 * Only single-nozzle printers are covered: multi-nozzle printers (e.g. H2D) store one
 * `n * n` block per nozzle, which this function does not produce.
 */
export function computeFlushVolumesMatrix(colors: readonly string[], options: FlushVolumeOptions = {}): number[] {
  const nozzleVolume = options.nozzleVolume ?? DEFAULT_NOZZLE_VOLUME
  const rgbs = colors.map(parseHexColor)
  return rgbs.flatMap((from, i) => rgbs.map((to, j) => {
    if (i === j)
      return 0
    return Math.min(Math.trunc(colorFlushVolume(from, to)) + nozzleVolume, MAX_FLUSH_VOLUME)
  }))
}

/**
 * Color-dependent part of the purge volume for one transition.
 *
 * Two contributions are combined as the sides of a triangle with a 120° angle between them:
 * - a hue/saturation distance (vectors on the HSV color wheel, scaled by value), and
 * - a luminance difference. Going dark -> light is penalized much harder (power curve)
 *   than light -> dark (linear), and when darkening, the hue term is capped by how bright
 *   the result is, since dark targets hide residual tint.
 */
function colorFlushVolume(from: Rgb, to: Rgb): number {
  const fromHsv = rgbToHsv(from)
  const toHsv = rgbToHsv(to)
  const fromLuma = luma(from)
  const toLuma = luma(to)

  let hueDistance = Math.min(f32(1.2), f32(Math.hypot(
    f32(hsvWheelX(fromHsv) - hsvWheelX(toHsv)),
    f32(hsvWheelY(fromHsv) - hsvWheelY(toHsv)),
  )))
  let lumaVolume: number
  if (toLuma >= fromLuma) {
    lumaVolume = f32(f32(f32(toLuma - fromLuma) ** f32(0.7)) * 560)
  }
  else {
    lumaVolume = f32(f32(fromLuma - toLuma) * 80)
    hueDistance = Math.min(hueDistance, f32(0.67 * toHsv.v + 0.33 * fromHsv.v))
  }
  const hueVolume = f32(hueDistance * 230)

  // Law of cosines with a 120° angle: c² = a² + b² - 2ab·cos(120°) = a² + b² + ab
  const volume = f32(Math.sqrt(hueVolume ** 2 + lumaVolume ** 2 + hueVolume * lumaVolume))
  return Math.max(volume, MIN_COLOR_FLUSH)
}

const WHITE: Rgb = { r: 1, g: 1, b: 1 }

/**
 * Parse `#RGB`, `#RGBA`, `#RRGGBB` or `#RRGGBBAA` into [0, 1] channels.
 * Fully transparent colors become white (Bambu Studio treats them that way), and so does
 * anything unparseable, so the matrix never contains NaN.
 */
function parseHexColor(hex: string): Rgb {
  let value = hex.trim().replace(/^#/, '')
  if (!/^(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(value))
    return WHITE
  if (value.length <= 4)
    value = [...value].map(c => c + c).join('')
  if (value.length === 8 && value.slice(6) === '00')
    return WHITE
  const channel = (offset: number) => f32(Number.parseInt(value.slice(offset, offset + 2), 16) / 255)
  return { r: channel(0), g: channel(2), b: channel(4) }
}

/** Perceived brightness with the classic 30/59/11 channel weights. */
function luma({ r, g, b }: Rgb): number {
  return f32(r * 0.3 + g * 0.59 + b * 0.11)
}

/** HSV with hue in degrees, saturation and value in [0, 1]. */
function rgbToHsv({ r, g, b }: Rgb): { h: number, s: number, v: number } {
  const max = Math.max(r, g, b)
  const delta = f32(max - Math.min(r, g, b))
  let h = 0
  if (delta >= 0.001) {
    if (max === r)
      h = f32(60 * f32(f32((g - b) / delta) % 6))
    else if (max === g)
      h = f32(60 * f32(f32((b - r) / delta) + 2))
    else
      h = f32(60 * f32(f32((r - g) / delta) + 4))
  }
  const s = max < 0.001 ? 0 : f32(delta / max)
  return { h, s, v: max }
}

function hsvWheelX({ h, s, v }: { h: number, s: number, v: number }): number {
  return Math.cos(h * Math.PI / 180) * s * v
}

function hsvWheelY({ h, s, v }: { h: number, s: number, v: number }): number {
  return Math.sin(h * Math.PI / 180) * s * v
}
