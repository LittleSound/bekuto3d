<script lang="ts" setup>
import { useDropZone, useEventListener } from '@vueuse/core'
import { computed, ref } from 'vue'

interface Props {
  accept?: string[]
  multiple?: boolean
  maxSize?: number
  defaultText?: string
  dragText?: string
  dropText?: string
}

const props = withDefaults(defineProps<Props>(), {
  accept: () => ['image/svg+xml'],
  multiple: false,
  maxSize: 10 * 1024 * 1024, // 默认 10MB
  defaultText: 'Click or drop file',
  dragText: 'Drag to here!',
  dropText: 'Drop it!',
})

const emit = defineEmits<{
  (e: 'fileSelected', files: File[]): void
  (e: 'error', error: Error): void
}>()

const filename = defineModel<string>('filename')

const dragEnterCount = ref(0)
const isGlobalDragging = ref(false)
const dropZone = ref<HTMLElement>()

// 处理全局拖拽事件
useEventListener('dragenter', (e) => {
  e.preventDefault()
  dragEnterCount.value++
  if (dragEnterCount.value === 1)
    isGlobalDragging.value = true
  const dataTransfer = e.dataTransfer
  if (!dataTransfer)
    return
  dataTransfer.dropEffect = 'copy'
})

useEventListener('dragover', (e) => {
  e.preventDefault()
  e.stopPropagation()
})

useEventListener('drop', (e) => {
  e.preventDefault()
  e.stopPropagation()
  isGlobalDragging.value = false
  dragEnterCount.value = 0
})

useEventListener('dragleave', (e) => {
  e.preventDefault()
  dragEnterCount.value--
  if (dragEnterCount.value === 0)
    isGlobalDragging.value = false
})

// 处理文件拖放
const { isOverDropZone } = useDropZone(dropZone, {
  onDrop: (files) => {
    if (!files || files.length === 0)
      return
    handleFiles(files)
  },
  dataTypes: props.accept,
  multiple: props.multiple,
  preventDefaultForUnhandled: true,
})

// 处理文件选择
function handleFileSelect(event: Event) {
  const inputEl = event.target as HTMLInputElement
  const files = inputEl.files
  if (!files || files.length === 0)
    return
  handleFiles(Array.from(files))
  inputEl.value = ''
}

// 处理文件验证和提交
function handleFiles(files: File[]) {
  try {
    const invalidType = files.find(file => !validateFileType(file))
    if (invalidType)
      throw new Error(`不支持的文件类型: ${invalidType.type}`)

    // 验证文件大小
    const oversized = files.find(file => file.size > props.maxSize)
    if (oversized)
      throw new Error(`文件过大: ${oversized.name}`)

    // 更新文件名
    const fileName = files[0].name
    filename.value = fileName
    emit('fileSelected', files)
  }
  catch (error) {
    emit('error', error as Error)
  }
}

/**
 * Validate File Type. Supported types are defined in props.accept.
 * Use image/* to support all image types.
 *
 * @param file
 */
function validateFileType(file: File) {
  if (props.accept.includes('image/*') && file.type.startsWith('image/'))
    return true
  return props.accept.includes(file.type)
}

// 计算显示文本
const displayText = computed(() => {
  if (isGlobalDragging.value && isOverDropZone.value)
    return props.dropText
  if (isGlobalDragging.value)
    return props.dragText
  if (filename.value)
    return filename.value
  return props.defaultText
})
</script>

<template>
  <label
    ref="dropZone"
    flex="~ items-center"
    p2
    border
    rounded
    cursor-pointer
    relative
    bg="black/10 dark:white/20 hover:black/20 dark:hover:white/30"
    :class="{
      'border-dashed !bg-[#b5df4a] min-h-40 justify-center sticky top-10 z-10 shadow-xl': isGlobalDragging,
      'min-h-40': isOverDropZone,
    }"
  >
    <input
      type="file"
      :accept="accept.join(',')"
      :multiple="multiple"
      class="op0 inset-0 absolute z--1"
      @change="handleFileSelect"
    >
    <span v-if="isGlobalDragging || !filename" i-carbon:document-add mr-2 inline-block />
    <span v-else i-carbon:document mr-2 inline-block />
    <span>{{ displayText }}</span>
  </label>
</template>
