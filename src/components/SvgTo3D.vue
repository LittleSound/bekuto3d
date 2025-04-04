<script lang="ts" setup>
import type { ShapeWithColor } from '~/types/three-types'
import { Color } from 'three'
import { useModelSize } from '../composables/useModelSize'
import { useSvgLoader } from '../composables/useSvgLoader'
import FileDropZone from './FileDropZone.vue'
import IconInput from './IconInput.vue'
import ModelExporter from './ModelExporter.vue'
import ModelRenderer from './ModelRenderer.vue'

// 默认值
const defaultDepth = 2
const defaultSize = 37
const curveSegments = ref(64) // 模型曲线部分的细分程度

// 组件状态
const fileName = ref('')
const svgShapes = ref<ShapeWithColor[]>([])
const modelRendererRef = ref<InstanceType<typeof ModelRenderer>>()
const selectedShapeIndex = ref<number | null>(null)
const editingInputIndex = ref<number | null>(null)
const isExporting = ref<boolean>(false)

// 使用 useModelSize composable
const {
  size,
  scale,
  modelSize,
  modelOffset,
  watchModelSizeChanges,
} = useModelSize()

// 默认模型信息
const DEFAULT_SVG = '/model/bekuto3d.svg'
const isDefaultSvg = ref(false)
const defaultSvgOffsetList = [0, 2.1]
const defaultSvgDepthList = [2.1, 0, 1, 1, 1, 2, 1, 1.4, 1.6]

const { createShapesWithColor } = useSvgLoader()

const modelGroup = computed(() => modelRendererRef.value?.modelGroup ?? null)

const shownShapes = computed(() => svgShapes.value.filter(i => i.depth))

const inputRefs = ref<(unknown & { focus: () => void } | null)[]>([])

const svgCode = ref('')

watch(svgCode, (newCode) => {
  const isNewCodeEmpty = !newCode || newCode.trim() === ''
  isDefaultSvg.value = isNewCodeEmpty

  if (isNewCodeEmpty || !isValidSvg(newCode)) {
    loadDefaultSvg()
    return
  }

  mountSVG(newCode)
})

function mountSVG(svgData: string, customShapes?: (shapes: ShapeWithColor[], index: number) => ShapeWithColor[]) {
  isDefaultSvg.value = false
  svgShapes.value = createShapesWithColor(svgData, {
    defaultDepth,
    defaultStartZ: 0,
    customShapes,
  })

  nextTick(async () => {
    await nextTick()
    size.value = defaultSize
  })
}

async function loadDefaultSvg() {
  try {
    const response = await fetch(DEFAULT_SVG)
    const svgData = await response.text()
    fileName.value = ''

    mountSVG(svgData, (shapes, _) => shapes.map((item, index) => {
      item.startZ = defaultSvgOffsetList[index] ?? defaultSvgOffsetList[defaultSvgOffsetList.length - 1] ?? 0
      item.depth = defaultSvgDepthList[index] ?? 2
      return item
    }))
    isDefaultSvg.value = true
  }
  catch (error) {
    console.error('加载默认 SVG 失败:', error)
  }
}

function handleFileSelected(files: File[]) {
  if (files.length === 0)
    return
  fileName.value = files[0].name

  const reader = new FileReader()
  reader.readAsText(files[0])
  reader.onload = (e) => {
    const svgData = e.target?.result as string
    mountSVG(svgData)
  }
}

// 组件加载时自动加载默认文件
onMounted(() => {
  loadDefaultSvg()
})

// Monitor model changes
watchModelSizeChanges(modelGroup, svgShapes)

const cameraPosition = ref<[number, number, number]>([-50, 50, 100])

function formatSelectedShapeIndex(index: number | null) {
  if (index === null)
    return null
  const newIndex = toShownIndex(index)
  return newIndex === -1 ? null : newIndex
}

function toShownIndex(index: number) {
  return shownShapes.value.findIndex(s => s === svgShapes.value[index])
}

function toSvgIndex(index: number) {
  return svgShapes.value.findIndex(s => s === shownShapes.value[index])
}

const selectedShownShapeIndex = computed({
  get: () => {
    if (isExporting.value)
      return null
    if (editingInputIndex.value !== null)
      return formatSelectedShapeIndex(editingInputIndex.value)
    return formatSelectedShapeIndex(selectedShapeIndex.value)
  },
  set: (index: number) => {
    if (isDefaultSvg.value || isExporting.value)
      return false
    const newIndex = toSvgIndex(index)
    selectedShapeIndex.value = newIndex
  },
})

function handleMeshClick(index: number) {
  if (isDefaultSvg.value || isExporting.value)
    return

  const svgIndex = toSvgIndex(index)
  nextTick(() => {
    const targetInput = inputRefs.value[svgIndex]
    if (targetInput) {
      targetInput.focus()
    }
  })
}

function handleColorChange(index: number, color: string) {
  svgShapes.value[index].color = new Color().setStyle(color)
}

function isValidSvg(code: string) {
  if (!code || code.trim() === '')
    return false

  const lowerCode = code.toLowerCase()
  const svgStart = lowerCode.indexOf('<svg')
  const svgEnd = lowerCode.indexOf('</svg>')

  return svgStart !== -1
    && svgEnd !== -1
    && svgStart < svgEnd
    && (lowerCode.includes('viewbox') || lowerCode.includes('width') || lowerCode.includes('height'))
}
</script>

<template>
  <ModelRenderer
    ref="modelRendererRef"
    v-model:model-size="modelSize"
    v-model:model-offset="modelOffset"
    v-model:camera-position="cameraPosition"
    v-model:selected-shape-index="selectedShownShapeIndex"
    :shapes="shownShapes"
    :scale="scale"
    :curve-segments="curveSegments"
    :material-config="{
      shininess: 100, // 增加高光度
      transparent: true,
      wireframe: false,
    }"
    :controls-config="{
      enableDamping: true,
      dampingFactor: 0.05,
      minDistance: 0,
      maxDistance: 1000,
    }"
    @model-loaded="() => {}"
    @mesh-click="handleMeshClick"
  />
  <div flex="~ col gap-6" p4 rounded-4 bg-white:50 max-w-340px w-full left-10 top-10 fixed z-999 of-y-auto backdrop-blur-md dark:bg-black:50 max-h="[calc(100vh-160px)]">
    <div flex="~ col gap-2">
      <div flex="~ gap-3 items-center" text-xl font-500>
        <img src="/logo-dark.svg" size-7.5 class="hidden dark:block">
        <img src="/logo-light.svg" size-7.5 class="block dark:hidden">
        <h1>Bekuto 3D</h1>
      </div>
      <p op-80>
        Convert SVG files to 3D models
      </p>
    </div>
    <div flex="~ col gap-2">
      <template v-if="!svgCode">
        <FileDropZone
          v-model:filename="fileName"
          :accept="['image/svg+xml']"
          default-text="Click or drop SVG file"
          @file-selected="handleFileSelected"
        />
        <div flex="~ gap-2 items-center">
          <hr flex-1>
          <p text-center op-80>
            OR
          </p>
          <hr flex-1>
        </div>
      </template>
      <textarea
        v-model="svgCode"
        name="svg-code"
        placeholder="Paste SVG code here"
        bg="black/10 dark:white/20 hover:black/20 dark:hover:white/30"
        p2
        border
        rounded
      />
    </div>
    <template v-if="svgShapes.length && !isDefaultSvg">
      <div flex="~ gap-2 items-center">
        <IconInput
          v-model:value="size"
          icon="i-iconoir-scale-frame-enlarge"
          type="number"
          title="Scale"
          class="w-30"
        />
        <div flex-1 />
        <div>unit: <span text-blue>mm</span></div>
      </div>
      <div flex="~ col">
        <div
          v-for="(item, index) in svgShapes"
          :key="index"
          flex="~ gap-4"
          class="px-2 border rounded transition-colors duration-200"
          :class="[
            (editingInputIndex !== null ? editingInputIndex === index : selectedShapeIndex === index)
              ? 'dark:border-white border-black'
              : 'border-transparent hover:border-gray-500/50',
            item.depth === 0 ? 'op-50' : '',
          ]"
          @mouseenter="selectedShapeIndex = index"
          @mouseleave="selectedShapeIndex = null"
        >
          <div flex="~ gap-2 items-center py-3" relative :title="`Shape ${index + 1}`">
            <label
              class="border rounded h-5 min-h-5 min-w-5 w-5 cursor-pointer transition-all duration-200 has-focus:scale-120 has-hover:scale-110"
              :title="`Color: #${item.color.getHexString()}`"
              :style="{ background: `#${item.color.getHexString()}` }"
              @focus="editingInputIndex = index"
              @blur="editingInputIndex = null"
            >
              <input
                type="color"
                :value="`#${item.color.getHexString()}`"
                class="op0 inset-0 absolute z--1"
                @input="handleColorChange(index, ($event.target as HTMLInputElement).value)"
              >
            </label>
            <pre min-w-5>{{ index + 1 }}</pre>
          </div>
          <IconInput
            :ref="el => inputRefs[index] = (el as any)"
            v-model:value="item.startZ"
            icon="i-iconoir-position"
            type="number"
            :min="-10"
            :max="10"
            :step="0.1"
            title="Starting Point"
            class="py-3 flex-1"
            @focus="editingInputIndex = index"
            @blur="editingInputIndex = null"
          />
          <IconInput
            v-model:value="item.depth"
            icon="i-iconoir-extrude"
            type="number"
            :min="0"
            :max="10"
            :step="0.1"
            title="Extrude Depth"
            class="py-3 flex-1"
            @focus="editingInputIndex = index"
            @blur="editingInputIndex = null"
          />
        </div>
      </div>
      <div v-if="modelSize.width" flex="~ gap-2 text-sm items-center" title="Size">
        <div i-iconoir-ruler-combine />
        <div>W: {{ modelSize.width }}</div>
        <div>H: {{ modelSize.height }}</div>
        <div>L: {{ modelSize.depth }}</div>
      </div>
      <ModelExporter
        v-model:is-exporting="isExporting"
        :model-group="modelGroup"
        :file-name="isDefaultSvg ? 'default-bekuto3d.svg' : fileName"
      />
    </template>
  </div>
</template>
