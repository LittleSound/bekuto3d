<script setup lang="ts">
import type { BaseplateSettings } from '../model/baseplate'

const props = defineProps<{ settings: BaseplateSettings, disabled: boolean }>()
const emit = defineEmits<{ change: [settings: BaseplateSettings] }>()
const styles = [
  { value: 'none', label: 'None' },
  { value: 'outline', label: 'Outline' },
  { value: 'square', label: 'Square' },
  { value: 'circle', label: 'Circle' },
] as const
type NumericKey = 'size' | 'radius' | 'thickness' | 'border' | 'offsetX' | 'offsetY'
interface Field { key: NumericKey, label: string, min: number, max: number }

const fields = computed(() => {
  const { style, size } = props.settings
  const rows: Field[] = [{ key: 'thickness', label: 'Thickness', min: 0.1, max: 100 }]
  if (style === 'outline') {
    rows.push({ key: 'border', label: 'Outline width', min: 0.1, max: 100 })
  }
  else {
    rows.push({ key: 'size', label: style === 'square' ? 'Side length' : 'Diameter', min: 1, max: 1000 })
    if (style === 'square')
      rows.push({ key: 'radius', label: 'Corner radius', min: 0, max: size / 2 })
    rows.push({ key: 'offsetX', label: 'Artwork X', min: -size / 2, max: size / 2 }, { key: 'offsetY', label: 'Artwork Y', min: -size / 2, max: size / 2 })
  }
  return rows
})
function changeNumber(field: Field, input: HTMLInputElement) {
  const value = input.valueAsNumber
  const next = Number.isFinite(value) ? Math.max(field.min, Math.min(field.max, value)) : props.settings[field.key]
  input.value = String(next)
  if (next === props.settings[field.key])
    return
  const settings = { ...props.settings, [field.key]: next }
  if (field.key === 'size') {
    settings.radius = Math.min(settings.radius, next / 2)
    settings.offsetX = Math.max(-next / 2, Math.min(next / 2, settings.offsetX))
    settings.offsetY = Math.max(-next / 2, Math.min(next / 2, settings.offsetY))
  }
  emit('change', settings)
}
</script>

<template>
  <fieldset class="plate-panel" :disabled="disabled">
    <legend>Baseplate</legend>
    <div class="styles" role="group" aria-label="Base shape">
      <button
        v-for="style in styles" :key="style.value" type="button"
        :aria-pressed="settings.style === style.value" @click="settings.style !== style.value && emit('change', { ...settings, style: style.value })"
      >
        {{ style.label }}
      </button>
    </div>
    <div v-if="settings.style !== 'none'" class="fields">
      <label>Color
        <input type="color" aria-label="Base color" :value="settings.color" @change="emit('change', { ...settings, color: ($event.target as HTMLInputElement).value })">
      </label>
      <label v-for="field in fields" :key="field.key">
        {{ field.label }} (mm)
        <input
          type="number" step="0.1" :min="field.min" :max="field.max" :value="Number(settings[field.key].toFixed(3))"
          @change="changeNumber(field, $event.target as HTMLInputElement)"
        >
      </label>
      <label v-if="settings.style === 'outline'">Corners
        <select :value="settings.join" @change="emit('change', { ...settings, join: ($event.target as HTMLSelectElement).value as BaseplateSettings['join'] })">
          <option>Round</option><option>Miter</option><option>Bevel</option>
        </select>
      </label>
      <button
        v-else type="button"
        class="text-xs px-2 py-1 border rounded col-span-2 cursor-pointer justify-self-end disabled:opacity-45 disabled:cursor-default"
        :disabled="settings.offsetX === 0 && settings.offsetY === 0"
        @click="emit('change', { ...settings, offsetX: 0, offsetY: 0 })"
      >
        Center artwork
      </button>
    </div>
    <slot />
  </fieldset>
</template>

<style scoped>
.plate-panel {
  padding: 0;
  min-width: 0;
  border: 0;
}
legend {
  font-size: 0.9rem;
  font-weight: 600;
  margin-bottom: 0.45rem;
}
.styles {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.2rem;
  padding: 0.2rem;
  background: color-mix(in srgb, currentColor 8%, transparent);
  border-radius: 0.55rem;
}
.styles button {
  padding: 0.35rem 0;
  border-radius: 0.35rem;
  font-size: 0.8rem;
  cursor: pointer;
}
.styles button[aria-pressed='true'] {
  background: #b5df4a;
  color: #243410;
  font-weight: 600;
}
.fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem 0.75rem;
  margin-top: 0.7rem;
}
label {
  display: grid;
  gap: 0.15rem;
  font-size: 0.75rem;
}
.fields input,
select {
  height: 1.8rem;
  width: 100%;
  border: 1px solid color-mix(in srgb, currentColor 24%, transparent);
  border-radius: 0.35rem;
  padding-inline: 0.35rem;
}
input[type='color'] {
  padding: 0.1rem;
  cursor: pointer;
}
</style>
