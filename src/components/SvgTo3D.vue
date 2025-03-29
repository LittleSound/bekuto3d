<script lang="ts" setup>
import type { Group, Shape } from 'three'
import { OrbitControls } from '@tresjs/cientos'
import { TresCanvas } from '@tresjs/core'
import { useDropZone, useEventListener } from '@vueuse/core'
import { Box3, Color, Vector3 } from 'three'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js'
import { STLExporter } from 'three/addons/exporters/STLExporter.js'
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js'
import { exportTo3MF } from '~/composables/3mf-exporter'

interface ShapeWithColor {
  shape: Shape
  color: Color
  opacity: number
  depth: number
  startZ: number
  polygonOffset: number
}

interface ModelSize {
  width: number
  height: number
  depth: number
}

let stlExporter: STLExporter
let objExporter: OBJExporter
let gltfExporter: GLTFExporter

const groupRef = useTemplateRef<Group>('group')
const stlUrl = ref('')
const objUrl = ref('')
const gltfUrl = ref('')
const the3mfUrl = ref('')
const fileName = ref('')
const baseDepth = 2.1
const reliefDepth = 2
const defaultSize = 37
const svgShapes = ref<ShapeWithColor[]>([])
const scale = ref(1) // 添加缩放控制变量
const curveSegments = ref(64)
const modelSize = ref<ModelSize>({ width: 0, height: 0, depth: 0 })
const modelOffset = ref({ x: 0, y: 0, z: 0 })
const loader = new SVGLoader()

const modelGroup = computed(() => toRaw(groupRef.value))
const shownShapes = computed(() => suppressZFighting(svgShapes.value).filter(i => i.depth))
const size = computed({
  get() {
    if (svgShapes.value.length === 0)
      return 0
    return modelSize.value.width
  },
  set(value) {
    if (svgShapes.value.length === 0)
      return
    scale.value = calcScale(scale.value, modelSize.value.width, value)
  },
})

function readFileAndConvert(file: File) {
  const reader = new FileReader()
  reader.onload = (e) => {
    const svgData = e.target?.result as string
    const svgParsed = loader.parse(svgData)

    svgShapes.value = svgParsed.paths.map((path) => {
      const shapes = SVGLoader.createShapes(path)
      // 获取 SVG 路径的颜色属性
      const color = path.userData?.style?.fill || '#FFA500' // 默认橙色
      const fillOpacity = path.userData?.style?.fillOpacity ?? 1

      const shapesWithColor = shapes.map((shape) => {
        return {
          shape: markRaw(shape),
          color: markRaw(new Color().setStyle(color)),
          // depth: index > 0 ? reliefDepth : baseDepth,
          // startZ: index > 0 ? baseDepth : 0,
          depth: reliefDepth,
          startZ: true ? 0 : baseDepth,
          opacity: fillOpacity,
          polygonOffset: 0,
        } as ShapeWithColor
      })

      return shapesWithColor
    }).flat(1)

    nextTick(async () => {
      await nextTick()
      size.value = defaultSize
    })
  }
  reader.readAsText(file)
}

const dragEnterCount = ref(0)
const isGlobalDragging = ref(false)
useEventListener('dragenter', (e) => {
  e.preventDefault()
  dragEnterCount.value++
  if (dragEnterCount.value === 1) {
    isGlobalDragging.value = true
  }
  const dataTransfer = e.dataTransfer
  if (!dataTransfer)
    return
  dataTransfer.dropEffect = 'copy'
  if (dataTransfer.files.length && dataTransfer.items[0].type === 'image/svg+xml') {
    isGlobalDragging.value = true
  }
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
  if (dragEnterCount.value === 0) {
    isGlobalDragging.value = false
  }
})

function handleFileSelect(event: Event) {
  const inputEl = event.target as HTMLInputElement
  const file = inputEl.files?.[0]
  if (!file)
    return
  fileName.value = file.name
  inputEl.value = ''
  readFileAndConvert(file)
}

function onDrop(file: File[] | null) {
  if (!file || file.length === 0)
    return
  fileName.value = file[0].name
  readFileAndConvert(file[0])
}

const dropZone = ref<HTMLElement>()
const { isOverDropZone } = useDropZone(dropZone, {
  onDrop,
  dataTypes: ['image/svg+xml'],
  multiple: false,
  preventDefaultForUnhandled: true,
})

/**
 * 解决 Z-fighting 问题
 * 通过微调深度值来解决拉伸方向上面重叠时的闪烁问题
 * @param shapes
 * @param scale
 */
function suppressZFighting(shapes: ShapeWithColor[], scale = 0.001) {
  const depths = new Map<number, number>()
  const offsets = new Map<number, number>()

  return shapes.map((shape) => {
    if (!shape.depth)
      return shape

    const offset = shape.startZ
    let offsetCount = 0

    if (offsetCount = offsets.get(offset) || 0) {
      const newOffset = fixFloat(offsetCount * scale)
      shape = {
        ...shape,
        depth: fixFloat(shape.depth + newOffset),
        startZ: fixFloat(shape.startZ - newOffset),
      }
    }

    offsets.set(offset, offsetCount + 1)
    return shape
  }).map((shape) => {
    if (!shape.depth)
      return shape

    const depth = fixFloat(shape.startZ + shape.depth)
    let depthCount = 0

    if (depthCount = depths.get(depth) || 0) {
      shape = {
        ...shape,
        depth: fixFloat(shape.depth + depthCount * scale),
      }
    }
    depths.set(depth, depthCount + 1)
    return shape
  })
}

function updateDepth(index: number, depth: number) {
  if (svgShapes.value[index])
    svgShapes.value[index].depth = depth
}

// 添加更新startZ的函数
function updateStartZ(index: number, startZ: number) {
  if (svgShapes.value[index])
    svgShapes.value[index].startZ = startZ
}

function calculateModelSize() {
  const group = modelGroup.value
  if (!group)
    return

  // 延迟执行以确保模型已渲染
  nextTick(() => {
    try {
      const box = (new Box3()).setFromObject(group, true)
      const size = new Vector3()
      box.getSize(size)

      modelOffset.value = {
        x: size.x / scale.value / -2,
        y: size.y / scale.value / -2,
        z: 0,
      }

      modelSize.value = {
        width: Number(size.x.toFixed(2)),
        height: Number(size.y.toFixed(2)),
        depth: Number(size.z.toFixed(2)),
      }
    }
    catch (error) {
      console.error('计算模型尺寸失败:', error)
    }
  })
}

function calcScale(nowScale: number, nowSize: number, targetSize: number) {
  return targetSize / (nowSize / nowScale)
}

// 监听 group 和 scale 的变化
watch([() => groupRef.value, scale, () => svgShapes.value.map(i => [i.depth, i.startZ])], () => {
  calculateModelSize()
})

function handleExportSTL() {
  const group = modelGroup.value
  if (!group)
    return

  stlExporter ||= new STLExporter()
  const result = stlExporter.parse(group, {
    binary: true,
  })

  stlUrl.value = URL.createObjectURL(new Blob([result], { type: 'application/octet-stream' }))
}

function handleExportOBJ() {
  const group = modelGroup.value
  if (!group)
    return

  objExporter ||= new OBJExporter()
  const result = objExporter.parse(group)

  objUrl.value = URL.createObjectURL(new Blob([result], { type: 'text/plain' }))
}

function handleExportGLTF() {
  const group = modelGroup.value
  if (!group)
    return

  gltfExporter ||= new GLTFExporter()
  gltfExporter.parse(group, (result) => {
    gltfUrl.value = URL.createObjectURL(new Blob([result as ArrayBuffer], { type: 'application/octet-stream' }))
  }, (error) => {
    console.error('导出 GLTF 失败:', error)
  }, {
    binary: true,
  })
}

async function handleExport3MF() {
  const group = modelGroup.value
  if (!group)
    return

  const result = await exportTo3MF(group)
  the3mfUrl.value = URL.createObjectURL(result)
}

// 调整相机参数
const cameraPosition: [number, number, number] = [-50, 50, 100]
const controlsConfig = {
  enableDamping: true,
  dampingFactor: 0.05,
  minDistance: 0,
  maxDistance: 1000,
}

// 添加材质相关参数
const materialConfig = ref({
  shininess: 100, // 增加高光度
  specular: '#ffffffd0', // 添加镜面反射颜色
  transparent: true,
  wireframe: false,
})

// 添加默认文件路径常量
const DEFAULT_SVG = '/model/bekuto3d.svg'

const isDefaultSvg = computed(() => fileName.value === 'default-bekuto3d.svg')

const defaultSvgOffsetList = [0, 2.1]
const defaultSvgDepthList = [2.1, 0, 3, 2, 2, 4, 2, 2, 2]
// 添加加载默认文件的函数
async function loadDefaultSvg() {
  try {
    const response = await fetch(DEFAULT_SVG)
    const svgData = await response.text()
    const svgParsed = loader.parse(svgData)

    fileName.value = 'default-bekuto3d.svg'
    svgShapes.value = svgParsed.paths.map((path) => {
      const shapes = SVGLoader.createShapes(path)
      const color = path.userData?.style?.fill || '#FFA500'
      const fillOpacity = path.userData?.style?.fillOpacity ?? 1

      return shapes.map((shape) => {
        return {
          shape: markRaw(shape),
          color: markRaw(new Color().setStyle(color)),
          startZ: 0,
          depth: 0,
          opacity: fillOpacity,
          polygonOffset: 0,
        } as ShapeWithColor
      })
    }).flat(1).map((item, index) => {
      item.startZ = defaultSvgOffsetList[index] ?? defaultSvgOffsetList[defaultSvgOffsetList.length - 1] ?? 0
      item.depth = defaultSvgDepthList[index] ?? 2
      return item
    })

    nextTick(async () => {
      await nextTick()
      size.value = defaultSize
    })
  }
  catch (error) {
    console.error('加载默认 SVG 失败:', error)
  }
}

function fixFloat(num: number) {
  return Number.parseFloat(num.toFixed(10))
}

// 组件加载时自动加载默认文件
onMounted(() => {
  loadDefaultSvg()
})
</script>

<template>
  <TresCanvas window-size :clear-color="isDark ? '#437568' : '#82DBC5'" :logarithmic-depth-buffer="true">
    <TresPerspectiveCamera
      :position="cameraPosition"
      :look-at="[0, 0, 0]"
    />
    <OrbitControls v-bind="controlsConfig" />
    <TresGroup
      v-if="svgShapes.length"
      ref="group"
      :scale="[scale, -scale, 1]"
    >
      <TresMesh
        v-for="(item, index) in shownShapes"
        :key="index"
        :position="[modelOffset.x, modelOffset.y, modelOffset.z + item.startZ]"
        :render-order="index + 1"
      >
        <TresExtrudeGeometry
          :args="[item.shape, {
            depth: item.depth,
            bevelEnabled: false,
            curveSegments,
          }]"
        />
        <TresMeshPhongMaterial
          v-bind="materialConfig"
          :color="item.color"
          :opacity="item.opacity"
          :polygon-offset="!!item.polygonOffset"
          :polygon-offset-factor="item.polygonOffset"
        />
      </TresMesh>
    </TresGroup>

    <!-- 移除原来的 Torus 默认显示 -->

    <!-- 重新设计的光照系统 -->
    <!-- 主光源：从右上方打光 -->
    <TresDirectionalLight
      :position="[100, 100, 50]"
      :intensity="1"
    />
    <!-- 侧面补光：从左侧打光 -->
    <TresDirectionalLight
      :position="[-50, 20, 50]"
      :intensity="0.4"
    />
    <!-- 正面补光：轻微的正面打光 -->
    <TresDirectionalLight
      :position="[0, 0, 100]"
      :intensity="0.5"
    />
    <!-- 柔和的环境光 -->
    <TresAmbientLight :intensity="0.4" />
    <!-- 半球光：提供更自然的环境光照 -->
    <TresHemisphereLight
      :args="['#ffffff', '#4444ff', 0.5]"
      :position="[0, 100, 0]"
    />
  </TresCanvas>
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
    <label
      ref="dropZone" flex="~ items-center"
      p2 border rounded cursor-pointer relative bg="black/10 dark:white/20 hover:black/20 dark:hover:white/30" title="Select SVG File" :class="{
        'border-dashed !bg-[#b5df4a] min-h-40 justify-center sticky top-10 z-10 shadow-xl': isGlobalDragging,
        'min-h-40': isOverDropZone,
      }"
    >
      <input
        type="file"
        accept=".svg"
        class="op0 inset-0 absolute z--1"
        @change="handleFileSelect"
      >
      <template v-if="isGlobalDragging && isOverDropZone">
        <span i-carbon:document-add mr-2 inline-block />
        <span>Drop it!</span>
      </template>
      <template v-else-if="isGlobalDragging">
        <span i-carbon:document-add mr-2 inline-block />
        <span>Drag to here!</span>
      </template>
      <template v-else-if="fileName && !isDefaultSvg">
        <span i-carbon:document mr-2 inline-block />
        <span>{{ fileName }}</span>
      </template>
      <template v-else>
        <span i-carbon:document-add mr-2 inline-block />
        <span>Click or drop SVG file</span>
      </template>
    </label>
    <template v-if="svgShapes.length && !isDefaultSvg">
      <div flex="~ gap-2 items-center">
        <label i-iconoir-scale-frame-enlarge inline-block />
        <input
          v-model.lazy.number="size"
          type="number"
          class="px-1 border-b w-20 inline-block"
        >
        <div flex-1 />
        <div>unit: <span text-blue>mm</span></div>
      </div>
      <div flex="~ col gap-4">
        <div
          v-for="(item, index) in svgShapes"
          :key="index"
          flex="~ gap-4"
        >
          <div flex="~ gap-2 items-center" :title="`Shape ${index + 1}`">
            <div
              class="border rounded h-5 min-h-5 min-w-5 w-5"
              :style="{ background: `#${item.color.getHexString()}` }"
            />
            <pre min-w-5>{{ index + 1 }}</pre>
          </div>
          <div flex="~ gap-2 items-center" title="起点位置">
            <label i-iconoir-position inline-block />
            <input
              type="number"
              min="-10"
              step="0.1"
              max="10"
              :value="item.startZ"
              class="px-1 border-b w-20 inline-block"
              @change="e => updateStartZ(index, +(e.target as HTMLInputElement).value)"
            >
          </div>
          <div flex="~ gap-2 items-center" title="拉伸深度">
            <label i-iconoir-extrude inline-block />
            <input
              type="number"
              min="0"
              step="0.1"
              max="10"
              :value="item.depth"
              class="px-1 border-b w-20 inline-block"
              @change="e => updateDepth(index, +(e.target as HTMLInputElement).value)"
            >
          </div>
        </div>
      </div>
      <div v-if="modelSize.width" flex="~ gap-2 text-sm items-center" title="Size">
        <div i-iconoir-ruler-combine />
        <div>W: {{ modelSize.width }}</div>
        <div>H: {{ modelSize.height }}</div>
        <div>L: {{ modelSize.depth }}</div>
      </div>
      <div flex="~ col gap-2">
        <h2 text-lg flex="~ items-center gap-2">
          <div i-iconoir-floppy-disk-arrow-in />
          Export
        </h2>
        <div v-if="!(stlUrl || objUrl || gltfUrl || the3mfUrl)" flex="~ gap-2">
          <button text-xl p2 rounded bg-gray:30 flex-1 cursor-pointer @click="handleExportSTL">
            STL
          </button>
          <button text-xl p2 rounded bg-gray:30 flex-1 cursor-pointer @click="handleExportOBJ">
            OBJ
          </button>
          <button text-xl p2 rounded bg-gray:30 flex-1 cursor-pointer @click="handleExportGLTF">
            GLTF
          </button>
          <button text-xl p2 rounded bg-gray:30 flex-1 cursor-pointer @click="handleExport3MF">
            3MF
          </button>
        </div>
        <div v-else flex="~ gap-2" text-white>
          <a
            v-if="stlUrl"
            class="text-xl p2 text-center rounded bg-blue flex-1 w-full block"
            :href="stlUrl"
            :download="`${fileName}.stl`"
            @click="stlUrl = ''"
          >
            Download The STL File
          </a>
          <a
            v-if="objUrl"
            class="text-xl p2 text-center rounded bg-blue flex-1 w-full block"
            :href="objUrl"
            :download="`${fileName}.obj`"
            @click="objUrl = ''"
          >
            Download The OBJ File
          </a>
          <a
            v-if="gltfUrl"
            class="text-xl p2 text-center rounded bg-blue flex-1 w-full block"
            :href="gltfUrl"
            :download="`${fileName}.gltf`"
            @click="gltfUrl = ''"
          >
            Download The GLTF File
          </a>
          <a
            v-if="the3mfUrl"
            class="text-xl p2 text-center rounded bg-blue flex-1 w-full block"
            :href="the3mfUrl"
            :download="`${fileName}.3mf`"
            @click="the3mfUrl = ''"
          >
            Download The 3MF File
          </a>
          <button title="close" text-xl p2 rounded bg-gray cursor-pointer @click="() => { stlUrl = ''; objUrl = ''; gltfUrl = ''; the3mfUrl = '' }">
            <div i-carbon:close />
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
