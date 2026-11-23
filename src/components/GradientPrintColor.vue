<script setup lang="ts">
import type { ShapeWithColor } from '~/types/three-types'
import { getGradientBackground } from '~/svg/gradient'

const props = defineProps<{
  shape: ShapeWithColor
  shapeNumber: number
}>()

const emit = defineEmits<{
  change: [position: number]
  reset: []
}>()

const detailsRef = useTemplateRef<HTMLDetailsElement>('details')
const sliderId = useId()
const color = computed(() => `#${props.shape.color.getHexString()}`)
const mode = computed(() => props.shape.gradientPosition !== undefined
  ? `${Math.round(props.shape.gradientPosition * 100)}%`
  : props.shape.colorOverridden ? 'Custom' : 'Auto')

/** Pointer release also commits an unchanged initial midpoint, which does not fire a native input event. */
function selectPosition(event: Event) {
  emit('change', Number((event.target as HTMLInputElement).value))
}

/** Keep keyboard focus on the persistent entry point after collapsing the inline editor. */
function close() {
  if (detailsRef.value) {
    detailsRef.value.open = false
    detailsRef.value.querySelector('summary')?.focus()
  }
}
</script>

<template>
  <details ref="details" class="print-color">
    <summary :aria-label="`Print color for shape ${shapeNumber}`" title="Choose a solid color for 3D printing">
      <span class="print-label">Prints as</span>
      <span class="print-swatch" :style="{ background: color }" aria-hidden="true" />
      <span class="print-hex">{{ color }}</span>
      <span class="i-carbon-chevron-right print-chevron" aria-hidden="true" />
    </summary>
    <div class="print-editor">
      <div class="editor-heading">
        <label :for="sliderId">Choose a print color</label>
        <span class="color-mode">{{ mode }}</span>
      </div>
      <p class="editor-description">
        Gradients become a solid color for printing.
        3D preview and 3MF use your chosen color.
      </p>
      <div class="gradient-slider" :style="{ '--thumb-color': color }">
        <div class="gradient-track" :style="{ background: shape.sourceGradient ? getGradientBackground(shape.sourceGradient, true) : color }" />
        <input
          :id="sliderId"
          type="range"
          min="0"
          max="1"
          step="0.001"
          :value="shape.gradientPosition ?? 0.5"
          :data-selected="shape.gradientPosition !== undefined"
          :aria-label="`Gradient color for shape ${shapeNumber}`"
          :aria-valuetext="shape.gradientPosition === undefined ? 'Choose a point on the original gradient' : `${mode}, ${color}`"
          @input="selectPosition"
          @pointerup="selectPosition"
          @keydown.enter.prevent="selectPosition"
        >
      </div>
      <div class="ramp-labels" aria-hidden="true">
        <span>0%</span>
        <span>Original gradient</span>
        <span>100%</span>
      </div>
      <div class="editor-actions">
        <button
          type="button"
          class="reset-color"
          :aria-label="`Reset print color for shape ${shapeNumber}`"
          :disabled="!shape.colorOverridden"
          @click="emit('reset')"
        >
          <span class="i-carbon-reset" aria-hidden="true" />
          Auto color
        </button>
        <button type="button" class="done" :aria-label="`Close print color editor for shape ${shapeNumber}`" @click="close">
          Done
        </button>
      </div>
    </div>
  </details>
</template>

<style scoped>
.print-color summary {
  display: flex;
  align-items: center;
  gap: 7px;
  width: fit-content;
  margin: 5px 0 0 40px;
  padding: 3px 0;
  cursor: pointer;
  list-style: none;
  font-size: 11px;
  color: var(--shape-muted);
  border-radius: 4px;
}

.print-color summary::-webkit-details-marker {
  display: none;
}

.print-color summary:hover .print-hex,
.print-color summary:focus-visible .print-hex {
  color: var(--shape-ink);
}

.print-color summary:focus-visible,
.editor-actions button:focus-visible {
  outline: 2px solid var(--shape-focus);
  outline-offset: 4px;
}

.print-swatch {
  width: 10px;
  height: 10px;
  margin-left: 2px;
  border-radius: 3px;
  box-shadow: inset 0 0 0 1px #ffffff30;
}

.print-hex {
  font-size: 10px;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  font-variant-numeric: tabular-nums;
}

.print-chevron {
  width: 11px;
  height: 11px;
  transition: transform 150ms ease;
}

.print-color[open] .print-chevron {
  transform: rotate(90deg);
}

.print-editor {
  margin-top: 10px;
  padding: 14px;
  border: 1px solid var(--shape-line);
  border-radius: 10px;
  background: var(--shape-editor-bg);
  cursor: default;
}

.editor-heading,
.editor-actions,
.ramp-labels {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.editor-heading {
  gap: 8px;
  color: var(--shape-ink);
  font-size: 12px;
  font-weight: 500;
}

.color-mode {
  font-size: 10px;
  font-weight: 400;
  color: var(--shape-muted);
  font-variant-numeric: tabular-nums;
}

.editor-description {
  margin-top: 7px;
  font-size: 11px;
  line-height: 1.6;
  color: var(--shape-muted);
}

.gradient-slider {
  position: relative;
  height: 32px;
  margin-top: 12px;
}

.gradient-track {
  position: absolute;
  inset: 10px 9px;
  border-radius: 6px;
  box-shadow: inset 0 0 0 1px #0000000a;
}

.gradient-slider input {
  appearance: none;
  position: relative;
  display: block;
  width: 100%;
  height: 32px;
  margin: 0;
  padding: 0;
  background: transparent;
  cursor: pointer;
  touch-action: pan-y;
}

.gradient-slider input::-webkit-slider-runnable-track {
  height: 12px;
  background: transparent;
}

.gradient-slider input::-moz-range-track {
  height: 12px;
  background: transparent;
}

.gradient-slider input::-webkit-slider-thumb {
  appearance: none;
  width: 18px;
  height: 18px;
  margin-top: -3px;
  border: 3px solid white;
  border-radius: 50%;
  background: var(--thumb-color);
  box-shadow:
    0 0 0 1px #18362640,
    0 2px 5px #00000020;
}

.gradient-slider input::-moz-range-thumb {
  box-sizing: border-box;
  width: 18px;
  height: 18px;
  border: 3px solid white;
  border-radius: 50%;
  background: var(--thumb-color);
  box-shadow:
    0 0 0 1px #18362640,
    0 2px 5px #00000020;
}

.gradient-slider input[data-selected='false']:not(:hover):not(:focus-visible)::-webkit-slider-thumb {
  opacity: 0;
}

.gradient-slider input[data-selected='false']:not(:hover):not(:focus-visible)::-moz-range-thumb {
  opacity: 0;
}

.gradient-slider input:focus-visible {
  outline: 2px solid var(--shape-focus);
  outline-offset: 2px;
  border-radius: 8px;
}

.ramp-labels {
  padding: 0 8px;
  font-size: 9px;
  color: var(--shape-muted);
}

.editor-actions {
  margin-top: 15px;
}

.editor-actions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  font-size: 11px;
  cursor: pointer;
  border-radius: 6px;
}

.reset-color {
  padding: 5px 0;
  color: var(--shape-muted);
}

.reset-color:disabled {
  opacity: 0.5;
  cursor: default;
}

.reset-color span {
  width: 12px;
  height: 12px;
}

.done {
  padding: 5px 12px;
  border: 1px solid var(--shape-line);
  color: var(--shape-ink);
  background: var(--shape-active-bg);
}

.done:hover,
.reset-color:not(:disabled):hover {
  filter: brightness(0.9);
}
</style>
