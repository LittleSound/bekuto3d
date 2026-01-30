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

/** Converts a Set of indices using a mapping function, filtering out invalid (-1) results */
function mapIndices(indices: Set<number>, mapper: (index: number) => number): Set<number> {
  const result = new Set<number>()
  for (const index of indices) {
    const mapped = mapper(index)
    if (mapped !== -1) {
      result.add(mapped)
    }
  }
  return result
}

/** Computed property for ModelRenderer binding - converts between svgShapes and shownShapes indices */
const selectedShownShapeIndices = computed({
  get: () => {
    if (isExporting.value)
      return new Set<number>()
    return mapIndices(selectedShapeIndices.value, toShownIndex)
  },
  set: (indices: Set<number>) => {
    if (isDefaultSvg.value || isExporting.value)
      return
    selectedShapeIndices.value = mapIndices(indices, toSvgIndex)
  },
})

/** Computed property for hover state - prioritizes editingInputIndex over hoverShapeIndex */
const hoverShownShapeIndex = computed({
  get: () => {
    if (isExporting.value)
      return null
    const sourceIndex = editingInputIndex.value ?? hoverShapeIndex.value
    if (sourceIndex === null)
      return null
    const shownIndex = toShownIndex(sourceIndex)
    return shownIndex === -1 ? null : shownIndex
  },
  set: (index: number | null) => {
    if (isDefaultSvg.value || isExporting.value)
      return
    hoverShapeIndex.value = index === null ? null : toSvgIndex(index)
  },
})

/**
 * Handles selection logic with support for Ctrl/Cmd (toggle) and Shift (range) modifiers.
 * - Normal click: single select
 * - Ctrl/Cmd + click: toggle selection
 * - Shift + click: range select from lastSelectedIndex
 */
function toggleSelection(index: number, event?: MouseEvent | PointerEvent) {
  if (isDefaultSvg.value || isExporting.value)
    return

  const isCtrlOrCmd = event?.ctrlKey || event?.metaKey
  const isShift = event?.shiftKey

  if (isShift && lastSelectedIndex.value !== null) {
    const start = Math.min(lastSelectedIndex.value, index)
    const end = Math.max(lastSelectedIndex.value, index)
    const rangeSet = isCtrlOrCmd ? new Set(selectedShapeIndices.value) : new Set<number>()
    for (let i = start; i <= end; i++) {
      rangeSet.add(i)
    }
    selectedShapeIndices.value = rangeSet
    lastSelectedIndex.value = index
  }
  else if (isCtrlOrCmd) {
    const newSet = new Set(selectedShapeIndices.value)
    newSet.has(index) ? newSet.delete(index) : newSet.add(index)
    selectedShapeIndices.value = newSet
    lastSelectedIndex.value = index
  }
  else {
    selectedShapeIndices.value = new Set([index])
    lastSelectedIndex.value = index
  }
}

/** Selects the item and focuses its input. Used when clicking list items or canvas models. */
function selectAndFocus(index: number, event?: MouseEvent | PointerEvent) {
  toggleSelection(index, event)
  focusToInput(index)
}

/** Clears all selections */
function clearSelection() {
  selectedShapeIndices.value = new Set()
  lastSelectedIndex.value = null
}

/**
 * Focuses the input of the appropriate selected item.
 * Prioritizes the clicked item if selected, otherwise focuses the first selected item.
 */
function focusToInput(clickedIndex: number) {
  nextTick(() => {
    const targetIndex = selectedShapeIndices.value.has(clickedIndex)
      ? clickedIndex
      : selectedShapeIndices.value.size > 0
        ? Math.min(...selectedShapeIndices.value)
        : null

    if (targetIndex !== null) {
      inputRefs.value[targetIndex]?.focus()
    }
  })
}

/**
 * Handles clicks on input areas within list items.
 * - With modifier keys: performs multi-select and handles focus appropriately
 * - Without modifiers: selects unselected items, keeps selection for already selected items
 */
function handleInputAreaClick(index: number, event: MouseEvent) {
  event.stopPropagation()

  const hasModifier = event.ctrlKey || event.metaKey || event.shiftKey

  if (hasModifier) {
    toggleSelection(index, event)
    // If item was unselected, blur current input and focus another selected item
    if (!selectedShapeIndices.value.has(index)) {
      ;(event.target as HTMLElement)?.blur?.()
      focusToInput(index)
    }
  }
  else if (!selectedShapeIndices.value.has(index)) {
    // Select unselected item (single select)
    selectedShapeIndices.value = new Set([index])
    lastSelectedIndex.value = index
  }
}

/** Handles 3D mesh click - converts index and triggers selection with focus */
function handleMeshClick(index: number, event: PointerEvent) {
  if (isDefaultSvg.value || isExporting.value)
    return
  selectAndFocus(toSvgIndex(index), event)
}

/** Returns true if batch edit should be applied (item is selected and multiple items are selected) */
function shouldBatchEdit(index: number): boolean {
  return selectedShapeIndices.value.has(index) && selectedShapeIndices.value.size > 1
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

/**
 * Applies a numeric property change to selected shapes using delta-based modification.
 * This preserves relative differences between shapes when batch editing.
 */
function batchEditNumericProperty(
  index: number,
  newValue: number,
  getter: (shape: ShapeWithColor) => number,
  setter: (shape: ShapeWithColor, value: number) => void,
) {
  if (shouldBatchEdit(index)) {
    const delta = newValue - getter(svgShapes.value[index])
    for (const i of selectedShapeIndices.value) {
      const shape = svgShapes.value[i]
      setter(shape, Number((getter(shape) + delta).toFixed(2)))
    }
  }
  else {
    setter(svgShapes.value[index], newValue)
  }
}

/** Handles color change with batch support - applies same color to all selected shapes */
function handleColorChange(index: number, color: string) {
  const newColor = new Color().setStyle(color)
  if (shouldBatchEdit(index)) {
    for (const i of selectedShapeIndices.value) {
      svgShapes.value[i].color = newColor.clone()
    }
  }
  else {
    svgShapes.value[index].color = newColor
  }
}

/** Handles startZ change with batch support - uses delta-based modification, clamped to [-10, 10] */
function handleStartZChange(index: number, value: number) {
  const clampedValue = clampNumber(value, -10, 10)
  batchEditNumericProperty(index, clampedValue, s => s.startZ, (s, v) => s.startZ = clampNumber(v, -10, 10))
}

/** Handles depth change with batch support - uses delta-based modification, clamped to [0, 10] */
function handleDepthChange(index: number, value: number) {
  const clampedValue = clampNumber(value, 0, 10)
  batchEditNumericProperty(index, clampedValue, s => s.depth, (s, v) => s.depth = clampNumber(v, 0, 10))
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
          class="px-2 border rounded cursor-pointer select-none transition-colors duration-200"
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
          @click="selectAndFocus(index, $event)"
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
