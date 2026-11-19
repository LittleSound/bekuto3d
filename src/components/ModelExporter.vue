<script setup lang="ts">
import type { Group } from 'three'
import { exportTo3MF } from 'three-3mf-exporter'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { STLExporter } from 'three/addons/exporters/STLExporter.js'

// 定义导出格式类型
type ExportFormat = 'stl' | 'gltf' | 'threeMF'

interface ExportConfig {
  extension: string
  mimeType: string
  label: string
}

const props = defineProps<{
  modelGroup: Group | null
  revision: number
  fileName: string
}>()

const isExporting = defineModel<boolean>('isExporting', { default: false })

// 导出格式配置
const EXPORT_FORMATS: Record<ExportFormat, ExportConfig> = {
  stl: {
    extension: 'stl',
    mimeType: 'application/octet-stream',
    label: 'STL',
  },
  // obj: {
  //   extension: 'obj',
  //   mimeType: 'text/plain',
  //   label: 'OBJ',
  // },
  gltf: {
    extension: 'gltf',
    mimeType: 'application/octet-stream',
    label: 'GLTF',
  },
  threeMF: {
    extension: '3mf',
    mimeType: 'application/octet-stream',
    label: '3MF',
  },
}

// 使用响应式对象统一管理URL
const exportUrls = reactive<Record<ExportFormat, string>>({
  stl: '',
  // obj: '',
  gltf: '',
  threeMF: '',
})

// 缓存导出器实例
const exporters = {
  stl: shallowRef<STLExporter>(),
  // obj: shallowRef<OBJExporter>(),
  gltf: shallowRef<GLTFExporter>(),
}

// 检查是否有任何导出URL存在
const hasActiveExport = computed(() =>
  Object.values(exportUrls).some(url => url !== ''),
)

// 导出处理函数
const exportHandlers = {
  async stl() {
    if (!props.modelGroup)
      return
    exporters.stl.value ||= new STLExporter()
    const result = exporters.stl.value.parse(props.modelGroup, { binary: true })
    exportUrls.stl = URL.createObjectURL(new Blob([result], { type: EXPORT_FORMATS.stl.mimeType }))
  },

  // async obj() {
  //   if (!props.modelGroup)
  //     return
  //   exporters.obj.value ||= new OBJExporter()
  //   const result = exporters.obj.value.parse(props.modelGroup)
  //   // 将字符串转换为 Blob
  //   exportUrls.obj = URL.createObjectURL(new Blob([result], { type: EXPORT_FORMATS.obj.mimeType }))
  // },

  async gltf() {
    await new Promise((resolve, reject) => {
      if (!props.modelGroup)
        return
      exporters.gltf.value ||= new GLTFExporter()

      exporters.gltf.value.parse(props.modelGroup, (result) => {
        if (result instanceof ArrayBuffer) {
          exportUrls.gltf = URL.createObjectURL(new Blob([result], { type: EXPORT_FORMATS.gltf.mimeType }))
        }
        else {
          exportUrls.gltf = URL.createObjectURL(new Blob([JSON.stringify(result)], { type: EXPORT_FORMATS.gltf.mimeType }))
        }
        resolve(undefined)
      }, (error) => {
        reject(error)
      }, { binary: true })
    })
  },

  async threeMF() {
    if (!props.modelGroup)
      return
    const result = await exportTo3MF(props.modelGroup)
    exportUrls.threeMF = URL.createObjectURL(new Blob([result], { type: EXPORT_FORMATS.threeMF.mimeType }))
  },
}

// 统一的导出处理函数
async function handleExport(format: ExportFormat) {
  if (isExporting.value || !props.modelGroup)
    return
  const revision = props.revision
  isExporting.value = true
  try {
    await nextTick()
    await exportHandlers[format]()
    if (revision !== props.revision)
      clearUrls()
  }
  finally {
    isExporting.value = false
  }
}

// 清除所有URL
function clearUrls() {
  Object.keys(exportUrls).forEach((key) => {
    const url = exportUrls[key as ExportFormat]
    if (url)
      URL.revokeObjectURL(url)
    exportUrls[key as ExportFormat] = ''
  })
}

// 处理单个URL的清除
function clearUrl(format: ExportFormat) {
  exportUrls[format] = ''
}

watch(() => props.revision, clearUrls)

onUnmounted(() => {
  clearUrls()
})
</script>

<template>
  <div flex="~ col gap-2">
    <h2 text-lg flex="~ items-center gap-2">
      <div i-iconoir-floppy-disk-arrow-in />
      Export
    </h2>

    <!-- 导出按钮组 -->
    <div v-if="!hasActiveExport" flex="~ gap-2">
      <button
        v-for="(config, format) in EXPORT_FORMATS"
        :key="format"
        text-xl
        p2
        rounded
        bg-gray:30
        flex-1
        cursor-pointer
        :disabled="isExporting || !modelGroup"
        @click="handleExport(format as ExportFormat)"
      >
        {{ config.label }}
      </button>
    </div>

    <!-- 下载链接组 -->
    <div v-else flex="~ gap-2" text-white>
      <template v-for="(config, format) in EXPORT_FORMATS" :key="format">
        <a
          v-if="exportUrls[format as ExportFormat]"
          class="text-xl p2 text-center rounded bg-blue flex-1 w-full block"
          :href="exportUrls[format as ExportFormat]"
          :download="`${fileName}.${config.extension}`"
          @click="clearUrl(format as ExportFormat)"
        >
          Download {{ config.label }} File
        </a>
      </template>

      <button
        title="Close"
        text-xl
        p2
        rounded
        bg-gray
        cursor-pointer
        @click="clearUrls"
      >
        <div i-carbon:close />
      </button>
    </div>
  </div>
</template>
