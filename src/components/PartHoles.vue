<script setup lang="ts">
import type { Vec2 } from 'manifold-3d'
import type { ModelPart } from '~/types/three-types'
import { partSource } from '../model/mergeParts'

const props = defineProps<{ part: ModelPart, partNumber: number, disabled: boolean, inserts?: Map<number, number> }>()
defineEmits<{ toggle: [index: number], separate: [index: number], select: [row: number] }>()

const previews = computed(() => {
  const source = partSource(props.part)
  const outlines = 'shape' in source
    ? source.shape.holes.map(path => [path.getPoints(24).map(({ x, y }): Vec2 => [x, y])])
    : source.holes.map(hole => hole.outline)
  return outlines.map((rings) => {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    const d = rings.map((ring) => {
      for (const [x, y] of ring) {
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }
      return `M${ring.join('L')}Z`
    }).join(' ')
    const pad = Math.max(maxX - minX, maxY - minY) * 0.12 || 1
    return { d, viewBox: `${minX - pad} ${minY - pad} ${maxX - minX + 2 * pad} ${maxY - minY + 2 * pad}` }
  })
})
</script>

<template>
  <div v-for="(preview, index) in previews" :key="index" class="hole-row">
    <svg :viewBox="preview.viewBox" class="hole-swatch" aria-hidden="true">
      <path :d="preview.d" fill="currentColor" :fill-opacity="part.holeEdit?.filled.includes(index) ? 1 : 0.12" fill-rule="evenodd" stroke="currentColor" stroke-width="1" vector-effect="non-scaling-stroke" />
    </svg>
    <span>Hole {{ index + 1 }}</span>
    <button
      v-if="inserts?.has(index)" type="button" :disabled="disabled"
      @click="$emit('select', inserts.get(index)!)"
    >
      Select part {{ inserts.get(index)! + 1 }}
    </button>
    <template v-else>
      <button
        type="button" :disabled="disabled" :aria-label="`${part.holeEdit?.filled.includes(index) ? 'Reopen' : 'Fill'} hole ${index + 1} in part ${partNumber}`"
        @click="$emit('toggle', index)"
      >
        {{ part.holeEdit?.filled.includes(index) ? 'Reopen' : 'Fill' }}
      </button>
      <button
        type="button" :disabled="disabled" :aria-label="`${part.holeEdit?.filled.includes(index) ? 'Split fill' : 'Fill as part'} for hole ${index + 1} in part ${partNumber}`"
        title="Create a separately colorable part from this hole"
        @click="$emit('separate', index)"
      >
        {{ part.holeEdit?.filled.includes(index) ? 'Split fill' : 'Fill as part' }}
      </button>
    </template>
  </div>
</template>

<style scoped>
.hole-row {
  margin: 0 0.5rem 0.25rem 1.25rem;
  border-left: 1px solid currentColor;
  padding: 0.15rem 0.5rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.78rem;
}
.hole-swatch {
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 3px;
  background: repeating-conic-gradient(#8884 0 25%, transparent 0 50%) 0 / 8px 8px;
}
span {
  margin-right: auto;
}
button {
  padding: 0.15rem 0.45rem;
  text-decoration: underline;
  cursor: pointer;
}
button:disabled {
  opacity: 0.4;
}
</style>
