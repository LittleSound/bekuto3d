<script lang="ts" setup>
import type { ShapeWithColor } from '~/types/three-types'
import potrace from 'potrace'
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
const selectedShapeIndices = ref<Set<number>>(new Set())
const hoverShapeIndex = ref<number | null>(null)
const editingInputIndex = ref<number | null>(null)
const isExporting = ref<boolean>(false)
const lastSelectedIndex = ref<number | null>(null) // 用于 Shift 范围选择

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

/**
 * Load user selected image and convert to 3D model
 * Supports two types of files:
 * 1. SVG vector files - directly load and convert to 3D model. Best results.
 * 2. Bitmap files (jpg/png etc) - first convert bitmap to SVG, then generate 3D model, results have limitations.
 *
 * @param files User selected file list
 */
async function handleFileSelected(files: File[]) {
  if (files.length === 0)
    return
  const file = files[0]

  if (!file.type.includes('svg') && file.type.startsWith('image/')) {
    const svg = await convertBitmapToSvg(file)
    mountSVG(svg)
    return
  }

  const reader = new FileReader()
  reader.readAsText(file)
  reader.onload = (e) => {
    const svgData = e.target?.result as string
    mountSVG(svgData)
  }
}

async function convertBitmapToSvg(file: File) {
  /*
    TODO: There are currently a few issues that we hope can be resolved in the future.

    - Does not support multiple colors
    - The inner edges of hollow shapes are missing, a phenomenon usually referred to as non-manifold edges, which are structures that cannot be 3D printed.
    - Cannot remove the added background, the background should be optional.
  */

  const { width: imageWidth, height: imageHeight } = await getImageWidthHeight(file)

  const padding = 8
  const cornerRadius = 8

  return new Promise<string>((resolve, reject) => {
    file.arrayBuffer().then((buffer) => {
      // eslint-disable-next-line node/prefer-global/buffer
      potrace.trace(Buffer.from(buffer), (_: any, svg: string) => {
        const svgWidth = imageWidth + padding * 2
        const svgHeight = imageHeight + padding * 2

        const contentMatch = svg.match(/<svg[^>]*>([\s\S]*)<\/svg>/)
        const content = contentMatch ? contentMatch[1] : ''

        const svgWithBg = `<svg width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">
  <rect x="0" y="0" width="${svgWidth}" height="${svgHeight}" rx="${cornerRadius}" ry="${cornerRadius}" fill="white"/>
  <g transform="translate(${padding},${padding})">
    ${content}
  </g>
</svg>`

        resolve(svgWithBg)
      })
    }).catch(reject)
  })
}

function getImageWidthHeight(file: File) {
  return new Promise<{ width: number, height: number }>((resolve) => {
    const img = new Image()
    img.src = URL.createObjectURL(file)
    img.onload = () => {
      resolve({
        width: img.width,
        height: img.height,
      })
    }
  })
}

// 组件加载时自动加载默认文件
onMounted(() => {
  loadDefaultSvg()
})

// Monitor model changes
watchModelSizeChanges(modelGroup, svgShapes)

const cameraPosition = ref<[number, number, number]>([-50, 50, 100])

function toShownIndex(index: number) {
  return shownShapes.value.findIndex(s => s === svgShapes.value[index])
}

function toSvgIndex(index: number) {
  return svgShapes.value.findIndex(s => s === shownShapes.value[index])
}

// 将 svgShapes 索引集合转换为 shownShapes 索引集合
function toShownIndices(indices: Set<number>): Set<number> {
  const result = new Set<number>()
  for (const index of indices) {
    const shownIndex = toShownIndex(index)
    if (shownIndex !== -1) {
      result.add(shownIndex)
    }
  }
  return result
}

// 将 shownShapes 索引集合转换为 svgShapes 索引集合
function toSvgIndices(indices: Set<number>): Set<number> {
  const result = new Set<number>()
  for (const index of indices) {
    const svgIndex = toSvgIndex(index)
    if (svgIndex !== -1) {
      result.add(svgIndex)
    }
  }
  return result
}

// 用于 ModelRenderer 的双向绑定
const selectedShownShapeIndices = computed({
  get: () => {
    if (isExporting.value)
      return new Set<number>()
    return toShownIndices(selectedShapeIndices.value)
  },
  set: (indices: Set<number>) => {
    if (isDefaultSvg.value || isExporting.value)
      return
    selectedShapeIndices.value = toSvgIndices(indices)
  },
})

// hover 索引转换
const hoverShownShapeIndex = computed({
  get: () => {
    if (isExporting.value || hoverShapeIndex.value === null)
      return null
    if (editingInputIndex.value !== null) {
      const shownIndex = toShownIndex(editingInputIndex.value)
      return shownIndex === -1 ? null : shownIndex
    }
    const shownIndex = toShownIndex(hoverShapeIndex.value)
    return shownIndex === -1 ? null : shownIndex
  },
  set: (index: number | null) => {
    if (isDefaultSvg.value || isExporting.value)
      return
    hoverShapeIndex.value = index === null ? null : toSvgIndex(index)
  },
})

// 选择操作函数
function toggleSelection(index: number, event?: MouseEvent | PointerEvent) {
  if (isDefaultSvg.value || isExporting.value)
    return

  const isCtrlOrCmd = event?.ctrlKey || event?.metaKey
  const isShift = event?.shiftKey

  if (isShift && lastSelectedIndex.value !== null) {
    // Shift + 点击：范围选择
    const start = Math.min(lastSelectedIndex.value, index)
    const end = Math.max(lastSelectedIndex.value, index)
    if (!isCtrlOrCmd) {
      selectedShapeIndices.value = new Set()
    }
    for (let i = start; i <= end; i++) {
      selectedShapeIndices.value.add(i)
    }
    // 触发响应式更新
    selectedShapeIndices.value = new Set(selectedShapeIndices.value)
  }
  else if (isCtrlOrCmd) {
    // Ctrl/Cmd + 点击：切换单个选择
    const newSet = new Set(selectedShapeIndices.value)
    if (newSet.has(index)) {
      newSet.delete(index)
    }
    else {
      newSet.add(index)
    }
    selectedShapeIndices.value = newSet
    lastSelectedIndex.value = index
  }
  else {
    // 普通点击：单选
    selectedShapeIndices.value = new Set([index])
    lastSelectedIndex.value = index
  }
}

// 取消全选
function clearSelection() {
  selectedShapeIndices.value = new Set()
  lastSelectedIndex.value = null
}

// 处理输入框区域的点击
function handleInputAreaClick(index: number, event: MouseEvent) {
  event.stopPropagation()

  const isCtrlOrCmd = event.ctrlKey || event.metaKey
  const isShift = event.shiftKey

  if (isCtrlOrCmd || isShift) {
    // 有修饰键时，执行多选逻辑
    toggleSelection(index, event)
  }
  else {
    // 没有修饰键时
    if (!selectedShapeIndices.value.has(index)) {
      // 如果当前项未被选中，选中当前项（单选）
      selectedShapeIndices.value = new Set([index])
      lastSelectedIndex.value = index
    }
    // 如果当前项已被选中，保持选择状态不变
  }
}

function handleMeshClick(index: number, event: PointerEvent) {
  if (isDefaultSvg.value || isExporting.value)
    return

  const svgIndex = toSvgIndex(index)
  toggleSelection(svgIndex, event)

  // 如果不是多选模式，聚焦到对应的输入框
  if (!event.ctrlKey && !event.metaKey && !event.shiftKey) {
    nextTick(() => {
      const targetInput = inputRefs.value[svgIndex]
      if (targetInput) {
        targetInput.focus()
      }
    })
  }
}

function handleColorChange(index: number, color: string) {
  const newColor = new Color().setStyle(color)
  // 如果当前项在选中集合中，批量修改所有选中项
  if (selectedShapeIndices.value.has(index) && selectedShapeIndices.value.size > 1) {
    for (const i of selectedShapeIndices.value) {
      svgShapes.value[i].color = newColor.clone()
    }
  }
  else {
    svgShapes.value[index].color = newColor
  }
}

function handleStartZChange(index: number, value: number) {
  // 如果当前项在选中集合中，批量修改所有选中项
  if (selectedShapeIndices.value.has(index) && selectedShapeIndices.value.size > 1) {
    const delta = value - svgShapes.value[index].startZ
    for (const i of selectedShapeIndices.value) {
      svgShapes.value[i].startZ = Number((svgShapes.value[i].startZ + delta).toFixed(2))
    }
  }
  else {
    svgShapes.value[index].startZ = value
  }
}

function handleDepthChange(index: number, value: number) {
  // 如果当前项在选中集合中，批量修改所有选中项
  if (selectedShapeIndices.value.has(index) && selectedShapeIndices.value.size > 1) {
    const delta = value - svgShapes.value[index].depth
    for (const i of selectedShapeIndices.value) {
      svgShapes.value[i].depth = Math.max(0, Number((svgShapes.value[i].depth + delta).toFixed(2)))
    }
  }
  else {
    svgShapes.value[index].depth = value
  }
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

function handleInputSvgCode() {
  pasteSvg(svgCode.value)
  svgCode.value = ''
}

function pasteSvg(paste: string | undefined) {
  if (paste && isValidSvg(paste)) {
    fileName.value = 'Pasted file'
    mountSVG(paste)
    return true
  }
  return false
}

onMounted(() => {
  document.addEventListener('paste', (event) => {
    // 检查是否在输入框中粘贴
    const target = event.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
      return

    const paste = getClipboardData(event)?.getData('text')

    if (pasteSvg(paste)) {
      event.preventDefault()
    }
    else {
      console.warn('not a svg')
    }
  })
})

function getClipboardData(event: ClipboardEvent): DataTransfer | null {
  return (event.clipboardData || (window as any).clipboardData)
}

function handleClose() {
  fileName.value = ''
  svgShapes.value = []
  svgCode.value = ''
  clearSelection()
  editingInputIndex.value = null
  isExporting.value = false
  size.value = defaultSize
  loadDefaultSvg()
}

const isLoaded = computed(() => svgShapes.value.length && !isDefaultSvg.value)
</script>

<template>
  <ModelRenderer
    ref="modelRendererRef"
    v-model:model-size="modelSize"
    v-model:model-offset="modelOffset"
    v-model:camera-position="cameraPosition"
    v-model:selected-shape-indices="selectedShownShapeIndices"
    v-model:hover-shape-index="hoverShownShapeIndex"
    :shapes="shownShapes"
    :z-fighting="!isExporting"
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
    @pointer-missed="clearSelection"
  />
  <div flex="~ col gap-6" p4 rounded-4 bg-white:50 max-w-340px w-full left-10 top-10 fixed z-999 of-y-auto backdrop-blur-md dark:bg-black:50 max-h="[calc(100vh-160px)]">
    <div flex="~ col gap-2">
      <div flex="~ gap-3 items-center justify-between" text-xl font-500>
        <div flex="~ gap-3 items-center">
          <img src="/logo-dark.svg" size-7.5 class="hidden dark:block">
          <img src="/logo-light.svg" size-7.5 class="block dark:hidden">
          <h1>Bekuto 3D</h1>
        </div>
        <button
          v-if="isLoaded"
          class="i-iconoir-trash text-xl cursor-pointer transition-opacity hover:op-80"
          title="Close current file"
          @click="handleClose"
        />
      </div>
      <p op-80>
        Convert SVG files to 3D models
      </p>
    </div>
    <div flex="~ col gap-2">
      <FileDropZone
        v-if="!svgCode || isLoaded"
        v-model:filename="fileName"
        :accept="['image/*']"
        default-text="Drop SVG or image file"
        @file-selected="handleFileSelected"
        @error="(stopPropagation, error) => {
          stopPropagation()
          console.error('FileDropZone error:', error)
        }"
      />
      <div v-if="!svgCode && !isLoaded" flex="~ gap-2 items-center">
        <hr flex-1>
        <p text-center op-80>
          OR
        </p>
        <hr flex-1>
      </div>
      <template v-if="!isLoaded">
        <textarea
          v-model="svgCode"
          name="svg-code"
          placeholder="Paste SVG code here"
          bg="black/10 dark:white/20 hover:black/20 dark:hover:white/30"
          p2
          border
          rounded
        />
        <button
          v-if="svgCode && isValidSvg(svgCode)"
          class="text-xl p2 text-center rounded bg-blue flex-1 w-full block cursor-pointer"
          @click="handleInputSvgCode()"
        >
          Convert
        </button>
      </template>
    </div>
    <template v-if="isLoaded">
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
          class="px-2 border rounded cursor-pointer transition-colors duration-200"
          :class="[
            selectedShapeIndices.has(index) || editingInputIndex === index
              ? 'dark:border-white border-black'
              : hoverShapeIndex === index
                ? 'border-gray-500/50'
                : 'border-transparent hover:border-gray-500/50',
            item.depth === 0 ? 'op-50' : '',
          ]"
          @mouseenter="hoverShapeIndex = index"
          @mouseleave="hoverShapeIndex = null"
          @click="toggleSelection(index, $event)"
        >
          <div flex="~ gap-2 items-center py-3" relative :title="`Shape ${index + 1}`" @click="handleInputAreaClick(index, $event)">
            <label
              class="border rounded h-5 min-h-5 min-w-5 w-5 cursor-pointer transition-all duration-200 has-focus:scale-120 has-hover:scale-110"
              :title="`Color: #${item.color.getHexString()}`"
              :style="{ background: `#${item.color.getHexString()}` }"
            >
              <input
                type="color"
                :value="`#${item.color.getHexString()}`"
                class="op0 inset-0 absolute z--1"
                @input="handleColorChange(index, ($event.target as HTMLInputElement).value)"
                @focus="editingInputIndex = index"
                @blur="editingInputIndex = null"
              >
            </label>
            <pre min-w-5>{{ index + 1 }}</pre>
          </div>
          <IconInput
            :ref="el => inputRefs[index] = (el as any)"
            :value="item.startZ"
            icon="i-iconoir-position"
            type="number"
            :min="-10"
            :max="10"
            :step="0.1"
            title="Starting Point"
            class="py-3 flex-1"
            @click="handleInputAreaClick(index, $event)"
            @update:value="handleStartZChange(index, $event)"
            @focus="editingInputIndex = index"
            @blur="editingInputIndex = null"
          />
          <IconInput
            :value="item.depth"
            icon="i-iconoir-extrude"
            type="number"
            :min="0"
            :max="10"
            :step="0.1"
            title="Extrude Depth"
            class="py-3 flex-1"
            @click="handleInputAreaClick(index, $event)"
            @update:value="handleDepthChange(index, $event)"
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
