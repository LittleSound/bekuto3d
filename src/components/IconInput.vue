<script lang="ts" setup>
import { ref } from 'vue'

interface Props {
  icon: string
  value: number
  type?: 'number' | 'text'
  min?: number
  max?: number
  step?: number
  title?: string
  class?: string
}

const props = withDefaults(defineProps<Props>(), {
  min: -Infinity,
  max: Infinity,
  step: 1,
  title: '',
  class: '',
})

const emit = defineEmits<{
  (e: 'update:value', value: number): void
  (e: 'input', value: number): void
  (e: 'change', value: number): void
  (e: 'focus'): void
  (e: 'blur'): void
}>()

function handleInput(e: Event) {
  const value = +(e.target as HTMLInputElement).value
  emit('update:value', value)
  emit('input', value)
}

function handleChange(e: Event) {
  const value = +(e.target as HTMLInputElement).value
  emit('change', value)
}

function handleFocus() {
  emit('focus')
}

function handleBlur() {
  emit('blur')
}

const inputRef = ref<HTMLInputElement | null>(null)

function focus() {
  inputRef.value?.focus()
  handleFocus()
}

defineExpose({
  focus,
})
</script>

<template>
  <div class="inline-flex gap-2 items-center" :class="[props.class]" :title="title" @click="focus()">
    <span class="h-[1.2em] min-h-[1.2em] min-w-[1.2em] w-[1.2em]" :class="[icon]" inline-block />
    <input
      ref="inputRef"
      :type="type || 'text'"
      :min="min"
      :max="max"
      :step="step"
      :value="value"
      class="px-1 border-b flex-1 w-full inline-block"
      @input="handleInput"
      @change="handleChange"
      @focus="handleFocus"
      @blur="handleBlur"
    >
  </div>
</template>
