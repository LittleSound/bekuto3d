import type { Vec2 } from 'manifold-3d'
import type { Vector2 } from 'three'
import type { BaseplateSettings } from '../model/baseplate'
import type { ModelPart } from '../types/three-types'
import { fitsPlate, plateShape, shapeFromRing } from '../model/baseplate'
import { serializePart } from '../model/mergeParts'

export function useBaseplate(
  settings: Ref<BaseplateSettings>,
  parts: ComputedRef<ModelPart[]>,
  scale: Ref<number>,
  center: ComputedRef<Vector2>,
  points: ComputedRef<Vector2[]>,
  segments: Ref<number>,
) {
  const rings = shallowRef<Vec2[][]>([])
  const loading = ref(false)
  const error = ref('')
  watch([
    () => settings.value.style,
    () => settings.value.border,
    () => settings.value.join,
    parts,
    scale,
    center,
    segments,
  ], (_current, _previous, onCleanup) => {
    rings.value = []
    error.value = ''
    loading.value = false
    if (settings.value.style !== 'outline' || !parts.value.length)
      return
    const request = {
      parts: parts.value.map(serializePart),
      segments: segments.value,
      scale: scale.value,
      center: center.value.toArray(),
      border: settings.value.border,
      join: settings.value.join,
    }
    loading.value = true
    let worker: Worker | undefined
    const timer = setTimeout(() => {
      function fail() {
        error.value = 'Could not build the outline. Try a different width or base shape.'
        loading.value = false
        worker?.terminate()
      }
      try {
        worker = new Worker(new URL('../model/outlineBase.worker.ts', import.meta.url), { type: 'module' })
        worker.onerror = fail
        worker.onmessageerror = fail
        worker.onmessage = ({ data }) => {
          if (!data.rings?.length)
            return fail()
          rings.value = data.rings
          loading.value = false
          worker?.terminate()
        }
        worker.postMessage(request)
      }
      catch { fail() }
    }, 50)
    onCleanup(() => {
      clearTimeout(timer)
      worker?.terminate()
    })
  }, { immediate: true })
  const shapes = computed(() => {
    if (settings.value.style === 'none' || !parts.value.length)
      return []
    if (settings.value.style === 'outline')
      return rings.value.map(shapeFromRing)
    return [plateShape(settings.value)]
  })
  const fitted = computed(() => ['square', 'circle'].includes(settings.value.style))
  const overflow = computed(() => fitted.value && !fitsPlate(points.value, center.value, scale.value, settings.value))
  const status = computed(() => {
    if (loading.value)
      return 'Building outline…'
    if (error.value)
      return error.value
    if (overflow.value)
      return 'Artwork extends beyond the base. Enlarge the base or adjust the artwork size or position.'
    if (rings.value.length > 1)
      return 'The outline has separate islands. Increase its width to connect them.'
    return ''
  })
  return { shapes, fitted, status, ready: computed(() => !loading.value && !error.value && !overflow.value) }
}
