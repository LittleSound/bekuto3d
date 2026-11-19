<script lang="ts" setup>
import type { BaseplateSettings } from '../model/baseplate'
import type { BooleanOperation } from '../model/mergeGeometry'
import type { ModelPart, ShapeWithColor } from '~/types/three-types'
import potrace from 'potrace'
import { Color } from 'three'
import { depthLimit, partKey, startZLimit } from '~/types/three-types'
import { useBaseplate } from '../composables/useBaseplate'
import { useModelSize } from '../composables/useModelSize'
import { useSvgLoader } from '../composables/useSvgLoader'
import { defaultBaseplate, demoBaseplate } from '../model/baseplate'
import { mergeParts, partSource, splitHole, toggleHole } from '../model/mergeParts'
import FileDropZone from './FileDropZone.vue'
import IconInput from './IconInput.vue'
import ModelExporter from './ModelExporter.vue'
import ModelRenderer from './ModelRenderer.vue'
import PartHoles from './PartHoles.vue'

/** Modifier key state shared by DOM mouse events and TresJS pointer events */
type ModifierKeys = Partial<Pick<MouseEvent, 'ctrlKey' | 'metaKey' | 'shiftKey'>>

// 默认值
const defaultDepth = 2
const defaultSize = 37
const curveSegments = ref(64) // 模型曲线部分的细分程度

// 组件状态
const fileName = ref('')
const pickerOpen = ref(false)
const isDefaultSvg = ref(false)
const svgShapes = ref<ModelPart[]>([])
const modelRendererRef = ref<InstanceType<typeof ModelRenderer>>()
const selectedShapeIndices = ref<Set<number>>(new Set())
const hoverShapeIndex = ref<number | null>(null)
const editingInputIndex = ref<number | null>(null)
const isExporting = ref<boolean>(false)
const operation = ref<BooleanOperation>('union')
const operationLabels = { union: 'Merge', difference: 'Subtract', intersection: 'Intersect', xor: 'Exclude' }
const through = ref(true)
const baseOverride = ref<number>()
const selectedRows = computed(() => [...selectedShapeIndices.value].sort((a, b) => a - b))
const baseIndex = computed(() => baseOverride.value !== undefined && selectedShapeIndices.value.has(baseOverride.value)
  ? baseOverride.value
  : selectedRows.value[0])
const isComputing = ref(false)
const operationError = ref('')
const partRevision = ref(0)
const canOperate = computed(() => !isComputing.value && !isExporting.value && selectedShapeIndices.value.size >= 2
  && [...selectedShapeIndices.value].every(index => svgShapes.value[index]?.depth > 0))
const lastSelectedIndex = ref<number | null>(null) // 用于 Shift 范围选择

const shownShapes = computed(() => svgShapes.value.filter(part => part.depth > 0))
const { scale, size, points, center } = useModelSize(() => shownShapes.value, () => curveSegments.value)
const modelSize = ref({ width: 0, height: 0, depth: 0 })
const plate = ref<BaseplateSettings>({ ...defaultBaseplate })
const { shapes: plateShapes, fitted, status: plateStatus, ready: plateReady } = useBaseplate(
  plate,
  shownShapes,
  scale,
  center,
  points,
  curveSegments,
)
const artPosition = computed(() => ({
  x: -center.value.x * scale.value + (fitted.value ? plate.value.offsetX : 0),
  y: -center.value.y * scale.value - (fitted.value ? plate.value.offsetY : 0),
  z: plate.value.style !== 'none' && shownShapes.value.length
    ? plate.value.thickness - shownShapes.value.reduce((min, part) => Math.min(min, part.startZ), Infinity)
    : 0,
}))

function changePlate(settings: BaseplateSettings) {
  remember('baseplate change')
  plate.value = settings
}

interface UndoEntry {
  action: string
  parts: ModelPart[]
  plate: BaseplateSettings
  selection: Set<number>
  anchor: number | null
  scale: number
  fileName: string
}

const history = shallowRef<UndoEntry[]>([])
let editKey: string | undefined
let activeGeometryJob: AbortController | undefined

function finishEdit() {
  editKey = undefined
}

/** Part geometry and colors are shared. Property edits replace colors and only mutate the row wrapper. */
function remember(action: string, key?: string) {
  if (key && key === editKey)
    return
  editKey = key
  history.value = [...history.value.slice(-39), {
    action,
    plate: { ...plate.value },
    parts: svgShapes.value.map(part => ({ ...part })),
    selection: new Set(selectedShapeIndices.value),
    anchor: lastSelectedIndex.value,
    scale: scale.value,
    fileName: fileName.value,
  }]
}

function undo() {
  const entry = history.value.at(-1)
  if (!entry || isExporting.value || pickerOpen.value)
    return
  activeGeometryJob?.abort()
  finishEdit()
  history.value = history.value.slice(0, -1)
  svgShapes.value = entry.parts
  isDefaultSvg.value = false
  fileName.value = entry.fileName
  plate.value = entry.plate
  scale.value = entry.scale
  resetPartSelection()
  selectedShapeIndices.value = entry.selection
  lastSelectedIndex.value = entry.anchor
}

useEventListener('keydown', (event) => {
  const target = event.target
  if (event.defaultPrevented || event.isComposing || event.shiftKey || event.altKey
    || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z'
    || !history.value.length || isExporting.value || pickerOpen.value) {
    return
  }
  if (target instanceof HTMLElement && (target.isContentEditable || target.closest('textarea, input:not([type=number]):not([type=color]):not([type=checkbox]), dialog')))
    return
  event.preventDefault()
  undo()
})

function changeSize(value: number) {
  if (value <= 0 || !size.value || value === size.value)
    return
  remember('resize', 'scale')
  size.value = value
}

// 默认模型信息
const DEFAULT_SVG = '/model/bekuto3d.svg'
const defaultSvgDepthList = [0, 1, 1, 1, 2, 1, 1.4, 1.6]

const { createShapesWithColor } = useSvgLoader()

const modelGroup = computed(() => modelRendererRef.value?.modelGroup ?? null)

watch([scale, plate, () => svgShapes.value.map(part => [part.color, part.startZ, part.depth])], () => {
  partRevision.value++
})

watch([selectedShapeIndices, partRevision, operation, through, baseOverride], () => {
  operationError.value = ''
  activeGeometryJob?.abort()
})
watch(selectedShapeIndices, finishEdit, { flush: 'sync' })

watch(svgShapes, (parts, previous) => {
  const retained = new Set(parts.map(partKey))
  for (const part of previous) {
    if ('geometry' in part && !retained.has(partKey(part)))
      part.geometry.dispose()
  }
})
onUnmounted(() => {
  activeGeometryJob?.abort()
  for (const part of svgShapes.value) {
    if ('geometry' in part)
      part.geometry.dispose()
  }
})

const insertsByOwner = computed(() => {
  const owners = new Map<string, Map<number, number>>()
  svgShapes.value.forEach(({ insertFor }, row) => {
    if (insertFor) {
      const holes = owners.get(insertFor.owner) ?? new Map<number, number>()
      holes.set(insertFor.hole, row)
      owners.set(insertFor.owner, holes)
    }
  })
  return owners
})

const partsList = useTemplateRef<HTMLDivElement>('partsList')
const inputRefs = ref<(unknown & { focus: () => void } | null)[]>([])

const svgCode = ref('')
const IconifyPicker = defineAsyncComponent(() => import('./IconifyPicker.vue'))

function parseShapes(svg: string) {
  return createShapesWithColor(svg, { defaultDepth, defaultStartZ: 0 })
}

function parseLogoShapes(svg: string) {
  return parseShapes(svg).map((item, index) => ({
    ...item,
    depth: defaultSvgDepthList[index] ?? 2,
  }))
}

function mountShapes(shapes: ShapeWithColor[], source: 'import' | 'demo' | 'standby' = 'import') {
  activeGeometryJob?.abort()
  finishEdit()
  if (source !== 'standby')
    history.value = []
  resetPartSelection()
  svgShapes.value = shapes
  isDefaultSvg.value = source === 'standby'
  const demo = source !== 'import'
  plate.value = { ...(demo ? demoBaseplate : defaultBaseplate) }
  if (demo)
    scale.value = demoBaseplate.size / 500
  else
    size.value = defaultSize
}

function importIcon(id: string, svg: string) {
  const shapes = parseShapes(svg)
  if (!shapes.length)
    throw new Error('No convertible shapes')
  mountShapes(shapes)
  fileName.value = `${id.replace(':', '-')}.svg`
  svgCode.value = ''
}

async function loadDefaultSvg() {
  try {
    const response = await fetch(DEFAULT_SVG)
    const svgData = await response.text()
    if (fileName.value)
      return

    mountShapes(parseLogoShapes(svgData), 'standby')
  }
  catch (error) {
    console.error('加载默认 SVG 失败:', error)
  }
}

async function handlePlayDemo() {
  try {
    const response = await fetch(DEFAULT_SVG)
    const svgData = await response.text()
    svgCode.value = ''
    fileName.value = 'bekuto3d-logo.svg'

    mountShapes(parseLogoShapes(svgData), 'demo')
  }
  catch (error) {
    console.error('加载 Demo SVG 失败:', error)
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
    mountShapes(parseShapes(svg))
    return
  }

  const reader = new FileReader()
  reader.readAsText(file)
  reader.onload = (e) => {
    const svgData = e.target?.result as string
    mountShapes(parseShapes(svgData))
  }
}

function convertBitmapToSvg(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => {
      potrace.trace(String(reader.result), (error, svg) => {
        if (error)
          reject(error)
        else
          resolve(svg)
      })
    }
    reader.readAsDataURL(file)
  })
}

// 组件加载时自动加载默认文件
onMounted(() => {
  loadDefaultSvg()
})

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
function toggleSelection(index: number, event?: ModifierKeys) {
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
function selectAndFocus(index: number, event?: ModifierKeys) {
  toggleSelection(index, event)
  focusToInput(index)
}

/** Clears all selections */
function clearSelection() {
  selectedShapeIndices.value = new Set()
  lastSelectedIndex.value = null
}

function resetPartSelection() {
  baseOverride.value = undefined
  clearSelection()
  hoverShapeIndex.value = null
  editingInputIndex.value = null
  operationError.value = ''
}

function deleteSelectedParts() {
  if (!selectedShapeIndices.value.size || isExporting.value || isComputing.value)
    return
  remember('delete')
  const remaining = svgShapes.value.filter((_, index) => !selectedShapeIndices.value.has(index))
  if (!remaining.length) {
    returnToStandby()
    return
  }
  svgShapes.value = remaining
  resetPartSelection()
}

async function applyGeometryEdit(
  rows: number[],
  target: number,
  action: string,
  calculate: (signal: AbortSignal) => Promise<ModelPart | [ModelPart, ModelPart]>,
) {
  if (isComputing.value || isExporting.value)
    return
  isComputing.value = true
  operationError.value = ''
  const controller = new AbortController()
  activeGeometryJob = controller
  const model = svgShapes.value
  const revision = partRevision.value
  try {
    const result = await calculate(controller.signal)
    if (controller.signal.aborted || model !== svgShapes.value || revision !== partRevision.value || isExporting.value)
      return

    remember(action)
    const removed = new Set(rows)
    const remaining = model.filter((_, index) => !removed.has(index))
    const position = target - rows.filter(index => index < target).length
    const replacements = Array.isArray(result) ? result : [result]
    remaining.splice(position, 0, ...replacements)
    svgShapes.value = remaining
    resetPartSelection()
    const selected = position + replacements.length - 1
    selectedShapeIndices.value = new Set([selected])
    lastSelectedIndex.value = selected
    if (replacements.length > 1) {
      await nextTick()
      partsList.value?.querySelectorAll<HTMLInputElement>('input[type="color"]')[selected]?.focus()
    }
  }
  catch (error) {
    if (!controller.signal.aborted)
      operationError.value = error instanceof Error ? error.message : 'Could not complete the operation.'
  }
  finally {
    activeGeometryJob = undefined
    isComputing.value = false
  }
}

function operateOnSelection() {
  if (!canOperate.value)
    return
  const rows = selectedRows.value
  const target = operation.value === 'difference' ? baseIndex.value : rows[0]
  const parts = [target, ...rows.filter(index => index !== target)].map(index => svgShapes.value[index])
  const options = { operation: operation.value, through: through.value }
  return applyGeometryEdit(rows, target, operationLabels[operation.value].toLowerCase(), signal =>
    mergeParts(parts, curveSegments.value, signal, options))
}

function editHole(row: number, hole: number, separate = false) {
  const part = svgShapes.value[row]
  if (insertsByOwner.value.get(partKey(partSource(part)))?.has(hole))
    return
  if (separate)
    return applyGeometryEdit([row], row, 'separate hole fill', signal => splitHole(part, hole, curveSegments.value, signal))
  const action = part.holeEdit?.filled.includes(hole) ? 'reopen hole' : 'fill hole'
  return applyGeometryEdit([row], row, action, signal => toggleHole(part, hole, curveSegments.value, signal))
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
function handleMeshClick(index: number, event: ModifierKeys) {
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
  getter: (shape: ModelPart) => number,
  setter: (shape: ModelPart, value: number) => void,
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
  const indices = shouldBatchEdit(index) ? [...selectedShapeIndices.value] : [index]
  if (indices.every(i => svgShapes.value[i].color.equals(newColor)))
    return
  remember('color change', `color-${index}`)
  for (const i of indices)
    svgShapes.value[i].color = newColor
}

/** Handles startZ change with batch support - uses delta-based modification, clamped to [-10, 10] */
function handleStartZChange(index: number, value: number) {
  const clampedValue = clampNumber(value, -10, startZLimit(svgShapes.value[index]))
  if (clampedValue === svgShapes.value[index].startZ)
    return
  remember('Z offset change', `startZ-${index}`)
  batchEditNumericProperty(index, clampedValue, s => s.startZ, (s, v) => s.startZ = clampNumber(v, -10, startZLimit(s)))
}

/** Handles depth change with batch support - uses delta-based modification, clamped to [0, 10] */
function handleDepthChange(index: number, value: number) {
  const clampedValue = clampNumber(value, 0, depthLimit(svgShapes.value[index]))
  if (clampedValue === svgShapes.value[index].depth)
    return
  remember('depth change', `depth-${index}`)
  batchEditNumericProperty(index, clampedValue, s => s.depth, (s, v) => s.depth = clampNumber(v, 0, depthLimit(s)))
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
    mountShapes(parseShapes(paste))
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
  history.value = []
  returnToStandby()
}

function returnToStandby() {
  activeGeometryJob?.abort()
  finishEdit()
  fileName.value = ''
  svgShapes.value = []
  svgCode.value = ''
  resetPartSelection()
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
    v-model:camera-position="cameraPosition"
    v-model:selected-shape-indices="selectedShownShapeIndices"
    v-model:hover-shape-index="hoverShownShapeIndex"
    :art-position="artPosition"
    :plate-shapes="plateShapes"
    :plate-color="plate.color"
    :plate-thickness="plate.thickness"
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
  <div flex="~ col gap-6" w="[calc(100%-2rem)]" p4 rounded-4 bg-white:50 max-w-340px left-4 top-4 fixed z-999 of-y-auto backdrop-blur-md dark:bg-black:50 sm:left-10 sm:top-10 max-h="[calc(100vh-160px)]">
    <div flex="~ col gap-2">
      <div flex="~ gap-3 items-center justify-between" text-xl font-500>
        <div flex="~ gap-3 items-center">
          <img src="/logo-dark.svg" size-7.5 class="hidden dark:block">
          <img src="/logo-light.svg" size-7.5 class="block dark:hidden">
          <h1>Bekuto 3D</h1>
        </div>
        <button
          v-if="isLoaded || history.length"
          type="button" class="part-action ml-auto" :disabled="!history.length || isExporting"
          :title="history.length ? `Undo ${history.at(-1)?.action} (Ctrl/⌘ Z)` : 'Undo (Ctrl/⌘ Z)'" @click="undo"
        >
          <span i-carbon-undo />Undo
        </button>
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

      <div v-if="!svgCode && !isLoaded" flex="~ gap-3 items-center justify-between" mt-2>
        <button
          class="text-sm op-80 flex gap-2 cursor-pointer transition-opacity items-center hover:op-100"
          type="button"
          @click="handlePlayDemo"
        >
          <span i-iconoir-arcade />
          <span>Play demo</span>
        </button>
        <button
          class="text-sm text-[#243410] font-medium px-3 py-2 rounded-lg bg-[#b5df4a] flex gap-2 cursor-pointer items-center hover:brightness-105"
          type="button"
          aria-haspopup="dialog"
          @click="pickerOpen = true"
        >
          <svg aria-hidden="true" width="1.2em" height="1.2em" viewBox="0 0 24 24" fill="currentColor">
            <path d="M2.8571 19.4286V9.6423c.232-.06.4583-.1577.6703-.2949L5.143 8.3023v9.9834h4.5714v2.2857H4c-.6309 0-1.1429-.512-1.1429-1.1428Zm7.4286-8.5714c0-.9463.768-1.7143 1.7143-1.7143.9463 0 1.7143.768 1.7143 1.7143 0 .9511-.7751 1.7142-1.7143 1.7142-.9392 0-1.7143-.7631-1.7143-1.7142zm-5.1428-8V1.1429C5.1429.512 5.6549 0 6.2857 0c.6309 0 1.1429.512 1.1429 1.1429v.2354zm9.1428 15.4285h4.5715V8.3023l1.6154 1.0451c.212.1372.4383.2349.6703.2949v9.7863c0 .6308-.512 1.1429-1.1429 1.1429h-5.7143Zm-.0034-17.0274 8.0531 5.2109c.5292.3428.6812 1.0508.3383 1.5805-.3428.5292-1.0508.6812-1.5805.3383L13.052 3.1846l.1897-.1229c.64-.4143 1.004-1.0954 1.0406-1.8034ZM11.3789.1834c.5297-.3428 1.2377-.1908 1.5805.3383.3429.5297.1909 1.2377-.3383 1.5806L2.907 8.388c-.5298.3429-1.2378.1909-1.5806-.3383-.3429-.5297-.1909-1.2377.3383-1.5805Zm2.6005 22.1023H22c.4732 0 .8572.384.8572.8572A.8575.8575 0 0 1 22 24H2a.8575.8575 0 0 1-.8571-.8571c0-.4732.384-.8572.8571-.8572h8.0206c.3954.6829 1.1343 1.1429 1.9794 1.1429s1.584-.46 1.9794-1.1429zm-.8365-8.8097v7.6669c0 .6308-.512 1.1428-1.1429 1.1428s-1.1429-.512-1.1429-1.1428V13.476a2.8453 2.8453 0 0 0 1.143.2383c.4062 0 .7925-.0851 1.1428-.2383z" />
          </svg>
          <span>Browse Iconify</span>
        </button>
      </div>
    </div>
    <template v-if="isLoaded">
      <label flex="~ gap-2 items-center">
        <span text-sm>Artwork size</span>
        <IconInput
          :value="size"
          icon="i-iconoir-scale-frame-enlarge"
          type="number"
          title="Artwork size (mm)"
          class="w-30"
          @update:value="changeSize"
          @blur="finishEdit"
          @change="finishEdit"
        />
        <div flex-1 />
        <div>unit: <span text-blue>mm</span></div>
      </label>
      <BaseplateControls :settings="plate" :disabled="isExporting" @change="changePlate">
        <p v-if="plateStatus" role="status" text-xs mt-2>
          {{ plateStatus }}
        </p>
      </BaseplateControls>
      <div ref="partsList" flex="~ col">
        <div class="mb-2 flex gap-2 items-center">
          <h2 class="text-sm font-semibold mr-auto" aria-live="polite">
            {{ selectedShapeIndices.size ? `${selectedShapeIndices.size} selected` : `Parts (${svgShapes.length})` }}
          </h2>
          <button
            type="button" class="part-action" :disabled="!canOperate"
            :title="`${operationLabels[operation]} selected parts with positive depth`" @click="operateOnSelection"
          >
            <span i-carbon-merge />{{ isComputing ? 'Working…' : operationLabels[operation] }}
          </button>
          <button
            type="button" class="part-action" :disabled="!selectedShapeIndices.size || isExporting || isComputing"
            title="Delete selected parts" @click="deleteSelectedParts"
          >
            <span i-carbon-trash-can />Delete
          </button>
        </div>
        <fieldset class="operation-options" aria-label="Operation settings" :disabled="!canOperate">
          <label>
            Operation
            <select v-model="operation">
              <option value="union">Union</option>
              <option value="difference">Difference</option>
              <option value="intersection">Intersection</option>
              <option value="xor">Exclusion (XOR)</option>
            </select>
          </label>
          <template v-if="operation === 'difference'">
            <label>
              Subtract from
              <select :value="baseIndex" @change="baseOverride = Number(($event.target as HTMLSelectElement).value)">
                <option v-for="row in selectedRows" :key="row" :value="row">Part {{ row + 1 }}</option>
              </select>
            </label>
            <label class="through-option">
              <input v-model="through" type="checkbox"> Cut through full depth
            </label>
          </template>
        </fieldset>
        <p v-if="operationError" role="alert" text-sm mb-2>
          {{ operationError }}
        </p>
        <template v-for="(item, index) in svgShapes" :key="partKey(item)">
          <div
            flex="~ gap-2 items-center"
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
            <input
              type="checkbox" :aria-label="`Select part ${index + 1}`" :checked="selectedShapeIndices.has(index)" :disabled="isExporting"
              class="accent-[#58761b] shrink-0 size-4 cursor-pointer" @click.stop @change="toggleSelection(index, { ctrlKey: true })"
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
                  @change="finishEdit"
                  @input="handleColorChange(index, ($event.target as HTMLInputElement).value)"
                  @focus="editingInputIndex = index"
                  @blur="editingInputIndex = null; finishEdit()"
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
              :max="startZLimit(item)"
              :step="0.1"
              title="Starting Point"
              class="py-3 flex-1"
              @click="handleInputAreaClick(index, $event)"
              @change="finishEdit"
              @update:value="handleStartZChange(index, $event)"
              @focus="editingInputIndex = index"
              @blur="editingInputIndex = null; finishEdit()"
            />
            <IconInput
              :value="item.depth"
              icon="i-iconoir-extrude"
              type="number"
              :min="0"
              :max="depthLimit(item)"
              :step="0.1"
              title="Extrude Depth"
              class="py-3 flex-1"
              @click="handleInputAreaClick(index, $event)"
              @change="finishEdit"
              @update:value="handleDepthChange(index, $event)"
              @focus="editingInputIndex = index"
              @blur="editingInputIndex = null; finishEdit()"
            />
          </div>
          <PartHoles
            :part="item" :part-number="index + 1" :disabled="isExporting || isComputing"
            :inserts="insertsByOwner.get(partKey(partSource(item)))"
            @toggle="editHole(index, $event)" @separate="editHole(index, $event, true)"
            @select="selectAndFocus($event)"
          />
        </template>
      </div>
      <div v-if="modelSize.width" flex="~ gap-2 text-sm items-center" title="Size">
        <div i-iconoir-ruler-combine />
        <div>W: {{ modelSize.width }}</div>
        <div>H: {{ modelSize.height }}</div>
        <div>L: {{ modelSize.depth }}</div>
      </div>
      <ModelExporter
        v-model:is-exporting="isExporting"
        :revision="partRevision"
        :model-group="plateReady ? modelGroup : null"
        :file-name="isDefaultSvg ? 'default-bekuto3d.svg' : fileName"
      />
    </template>
  </div>
  <IconifyPicker v-if="pickerOpen && !isLoaded" :import-icon="importIcon" @close="pickerOpen = false" />
</template>

<style scoped>
.part-action {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.25rem 0.5rem;
  border: 1px solid currentColor;
  border-radius: 0.4rem;
  font-size: 0.8rem;
  cursor: pointer;
}
.part-action:disabled {
  opacity: 0.4;
  cursor: default;
}
.part-action:hover:enabled {
  background: color-mix(in srgb, currentColor 10%, transparent);
}
.operation-options {
  display: grid;
  gap: 0.4rem;
  margin: 0 0 0.5rem;
  padding: 0.5rem 0.65rem;
  border-radius: 0.5rem;
  background: color-mix(in srgb, currentColor 6%, transparent);
  font-size: 0.8rem;
}
.operation-options label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.operation-options:disabled {
  opacity: 0.5;
}
.operation-options select {
  padding: 0.2rem 0.4rem;
  border-radius: 0.25rem;
  border: 1px solid color-mix(in srgb, currentColor 35%, transparent);
}
.operation-options .through-option {
  justify-content: flex-start;
}
.operation-options:enabled .through-option {
  cursor: pointer;
}
</style>
