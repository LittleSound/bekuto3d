import type { SvgGradient } from '~/types/three-types'

/** Sample a point or average the whole ramp in premultiplied sRGB; callers can use the color as opaque filament. */
export function getGradientPaint(gradient: SvgGradient, position?: number) {
  const stops = gradient.stops
  let samples: { stop: SvgGradient['stops'][number], weight: number }[]
  if (position === undefined) {
    samples = stops.map((stop, i) => ({
      stop,
      weight: (i === 0 ? stop.offset : (stop.offset - stops[i - 1].offset) / 2)
        + (i === stops.length - 1 ? 1 - stop.offset : (stops[i + 1].offset - stop.offset) / 2),
    }))
  }
  else {
    const point = Number.isNaN(position) ? 0.5 : Math.max(0, Math.min(1, position))
    const right = stops.findIndex(stop => stop.offset > point)
    if (right <= 0) {
      const stop = right === 0 ? stops[0] : stops.at(-1)
      samples = stop ? [{ stop, weight: 1 }] : []
    }
    else {
      const leftStop = stops[right - 1]
      const rightStop = stops[right]
      const ratio = (point - leftStop.offset) / (rightStop.offset - leftStop.offset)
      samples = [{ stop: leftStop, weight: 1 - ratio }, { stop: rightStop, weight: ratio }]
    }
  }

  const opacity = samples.reduce((sum, { stop, weight }) => sum + stop.opacity * weight, 0)
  const channels = [0, 0, 0]
  for (const { stop, weight } of samples) {
    const contribution = opacity > 0 ? weight * stop.opacity / opacity : weight
    for (let channel = 0; channel < channels.length; channel++)
      channels[channel] += Number.parseInt(stop.color.slice(1 + channel * 2, 3 + channel * 2), 16) * contribution
  }
  return {
    color: `#${channels.map(channel => Math.round(channel + 1e-10).toString(16).padStart(2, '0')).join('')}`,
    opacity,
  }
}

/** Reuse saved stops for source swatches; sliders always show the full ramp from left to right. */
export function getGradientBackground(gradient: SvgGradient, linear = false) {
  const stops = gradient.stops.map(({ color, opacity, offset }) =>
    `${color}${Math.round(opacity * 255).toString(16).padStart(2, '0')} ${offset * 100}%`,
  )
  if (!stops.length)
    return 'none'
  if (stops.length === 1)
    stops.push(stops[0])
  return !linear && gradient.type === 'radialGradient'
    ? `radial-gradient(circle, ${stops.join(', ')})`
    : `linear-gradient(to right, ${stops.join(', ')})`
}
