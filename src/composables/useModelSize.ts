import type { ModelPart } from '../types/three-types'
import { Box2, Vector2 } from 'three'

/** Sample the same visible contours as the renderer, including projected vertices of boolean results. */
export function useModelSize(parts: () => ModelPart[], segments: () => number) {
  const scale = ref(1)
  const points = computed(() => parts().flatMap((part) => {
    if ('shape' in part)
      return part.shape.getPoints(segments())
    const vertices = part.geometry.getAttribute('position')
    return Array.from({ length: vertices.count }, (_, i) => new Vector2(vertices.getX(i), vertices.getY(i)))
  }))
  const bounds = computed(() => new Box2().setFromPoints(points.value))
  const center = computed(() => bounds.value.getCenter(new Vector2()))
  const longest = computed(() => {
    const extent = bounds.value.getSize(new Vector2())
    return Math.max(extent.x, extent.y)
  })
  const size = computed({
    get: () => Number((longest.value * scale.value).toFixed(2)),
    set: (value: number) => {
      if (value > 0 && longest.value > 0)
        scale.value = value / longest.value
    },
  })
  return { scale, size, points, center }
}
