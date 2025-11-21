import type { Group, Mesh, MeshPhongMaterial, Object3D } from 'three'
import { XMLBuilder } from 'fast-xml-parser'
import JSZip from 'jszip'
import { Color, Vector3 } from 'three'

/**
 * 组件信息接口
 */
interface ComponentInfo {
  id: number
  vertices: { x: number, y: number, z: number }[]
  triangles: { v1: number, v2: number, v3: number }[]
  material: MaterialInfo | null
  name: string
}

/**
 * 材质信息接口，用于存储颜色数据
 */
interface MaterialInfo {
  id: number
  color: Color
  name: string
  extruder: number
}

/**
 * 打印床配置接口
 */
interface PrintConfig {
  printer_name: string // 打印机名称
  filament: string // 打印材料
  printableWidth: number // 打印床宽度 (X轴)
  printableDepth: number // 打印床深度 (Y轴)
  printableHeight: number // 打印高度 (Z轴)
  printableArea: [string, string, string, string] // 打印区域坐标
  printerSettingsId: string // 打印机设置ID
  printSettingsId: string // 打印设置ID
  compression: 'none' | 'standard' // 压缩方式

  metadata: Partial<{
    Application: string // 应用名称
    Copyright: string // 版权信息
    ApplicationTitle: string
  }> & Record<string, string>
}

// 默认的打印配置 (基于 Bambu Lab A1)
export const defaultPrintConfig: PrintConfig = {
  printer_name: 'Bambu Lab A1',
  filament: 'Bambu PLA Basic @BBL A1',
  printableWidth: 256,
  printableDepth: 256,
  printableHeight: 256,
  printableArea: ['0x0', '256x0', '256x256', '0x256'] as const,
  printerSettingsId: 'Bambu Lab A1 0.4 nozzle',
  printSettingsId: '0.20mm Standard @BBL A1',
  compression: 'standard',

  metadata: {
    Application: 'BambuStudio-02.04.00.70',
    ApplicationTitle: 'Exported 3D Model',
  },
} as const

const JSZipCompressionMap = { standard: 'DEFLATE' as const, none: 'STORE' as const }

/**
 * 将 Three.js 的 Group 或 Mesh 导出为 3MF 文件格式 (BambuStudio 兼容格式)
 * @param object Three.js Group 对象或 Mesh 数组
 * @param printJobConfig 打印床配置，可选
 * @returns Blob 数据
 */
export async function exportTo3MF(
  object: Group | Object3D,
  printJobConfig?: Partial<PrintConfig>,
): Promise<Blob> {
  const objectId = 1
  const zip = new JSZip()

  // 合并用户提供的配置与默认配置
  const printConfig = Object.assign({} as (typeof defaultPrintConfig & Partial<PrintConfig>), defaultPrintConfig, printJobConfig)
  const compression = JSZipCompressionMap[printConfig.compression]

  // 收集所有组件和材质信息
  const components: ComponentInfo[] = []
  const materials: MaterialInfo[] = []

  // 递归处理所有网格并计算模型边界和中心位置
  collectComponents(object, components, materials)
  const boundingBox = calculateBoundingBox(components)
  const modelCenter = calculateModelCenter(boundingBox)

  // 计算将模型放置在打印床中心所需的变换
  const transform = calculateCenteringTransform(modelCenter, boundingBox, printConfig)

  // 创建 3MF 所需的基本文件结构
  const mainModelXml = createMainModelXML(objectId, components, transform, printConfig)
  const objectModelXml = createObjectModelXML(components)
  const modelSettingsXml = createModelSettingsXML(objectId, components)
  const projectSettingsConfig = createProjectSettingsConfig(materials, printConfig)

  // 将文件添加到ZIP中
  zip.file('_rels/.rels', relationshipsXML({ id: `rel-1`, target: '/3D/3dmodel.model' }))
  zip.file('3D/3dmodel.model', mainModelXml)
  zip.file('3D/_rels/3dmodel.model.rels', relationshipsXML({ id: `rel-${objectId}`, target: `/3D/Objects/object-${objectId}.model` }))
  zip.file(`3D/Objects/object-${objectId}.model`, objectModelXml)
  zip.file('Metadata/model_settings.config', modelSettingsXml)
  zip.file('Metadata/project_settings.config', projectSettingsConfig)

  // 当我把 '[Content_Types].xml' 文件名放在压缩包的开头时，压缩文件将无法解压。
  // 不确定具体原因，但是请不要把它放在压缩包的开头。
  zip.file('[Content_Types].xml', contentTypesXML())

  // 生成ZIP文件
  return await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml', compression })
}

/**
 * 收集模型中的组件和材质信息
 */
function collectComponents(
  object: Object3D,
  components: ComponentInfo[],
  materials: MaterialInfo[],
): void {
  object.updateMatrixWorld(true)

  if (object.type === 'Mesh') {
    const mesh = object as Mesh
    const geometry = mesh.geometry
    const positionAttr = geometry.attributes.position
    const indexAttr = geometry.index

    // 处理材质
    let materialInfo: MaterialInfo | null = null
    if (mesh.material) {
      // 获取材质颜色
      const color = new Color()
      if ('color' in mesh.material && mesh.material.color) {
        color.copy((mesh.material as MeshPhongMaterial).color)
      }
      else {
        // 默认颜色为灰色
        color.set(0x808080)
      }

      // 检查是否已存在相同颜色的材质
      const existingMaterial = materials.find(m =>
        m.color.r === color.r && m.color.g === color.g && m.color.b === color.b,
      )

      if (existingMaterial) {
        materialInfo = existingMaterial
      }
      else {
        const extruder = materials.length + 1 // 挤出头编号从1开始
        materialInfo = {
          id: materials.length,
          color,
          name: mesh.name ? `${mesh.name}_material` : `material_${materials.length}`,
          extruder,
        }
        materials.push(materialInfo)
      }
    }

    const componentId = components.length
    const component: ComponentInfo = {
      id: componentId,
      vertices: [],
      triangles: [],
      material: materialInfo,
      name: mesh.name || `Default-${componentId}`,
    }

    // 为当前 mesh 创建独立的顶点映射
    const vertexMap = new Map<string, number>()
    const worldMatrix = mesh.matrixWorld

    // 处理当前 mesh 的顶点
    const processVertex = (vertexIndex: number) => {
      const vertex = new Vector3()
      vertex.fromBufferAttribute(positionAttr, vertexIndex)
      vertex.applyMatrix4(worldMatrix)

      const vertexKey = `${vertex.x},${vertex.y},${vertex.z}`

      if (!vertexMap.has(vertexKey)) {
        vertexMap.set(vertexKey, component.vertices.length)
        component.vertices.push({ x: vertex.x, y: vertex.y, z: vertex.z })
      }

      return vertexMap.get(vertexKey)!
    }

    // 处理三角形
    if (indexAttr) {
      // 有索引的几何体
      for (let i = 0; i < indexAttr.count; i += 3) {
        const v1 = processVertex(indexAttr.getX(i))
        const v2 = processVertex(indexAttr.getX(i + 1))
        const v3 = processVertex(indexAttr.getX(i + 2))

        component.triangles.push({ v1, v2, v3 })
      }
    }
    else {
      // 无索引的几何体
      for (let i = 0; i < positionAttr.count; i += 3) {
        const v1 = processVertex(i)
        const v2 = processVertex(i + 1)
        const v3 = processVertex(i + 2)

        component.triangles.push({ v1, v2, v3 })
      }
    }

    components.push(component)
  }

  // 递归处理子对象
  object.children.forEach((child) => {
    collectComponents(child, components, materials)
  })
}

interface BoundingBox { min: { x: number, y: number, z: number }, max: { x: number, y: number, z: number } }
interface ModelCenter { x: number, y: number, z: number }

/**
 * 计算模型的边界框
 */
function calculateBoundingBox(components: ComponentInfo[]) {
  if (components.length === 0) {
    return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } }
  }

  // 初始化边界值为第一个顶点
  const firstVertex = components[0].vertices[0] || { x: 0, y: 0, z: 0 }
  const min = { x: firstVertex.x, y: firstVertex.y, z: firstVertex.z }
  const max = { x: firstVertex.x, y: firstVertex.y, z: firstVertex.z }

  // 遍历所有组件的所有顶点
  for (const component of components) {
    for (const vertex of component.vertices) {
      min.x = Math.min(min.x, vertex.x)
      min.y = Math.min(min.y, vertex.y)
      min.z = Math.min(min.z, vertex.z)
      max.x = Math.max(max.x, vertex.x)
      max.y = Math.max(max.y, vertex.y)
      max.z = Math.max(max.z, vertex.z)
    }
  }

  return { min, max }
}

/**
 * 计算模型中心点
 */
function calculateModelCenter(boundingBox: BoundingBox) {
  return {
    x: (boundingBox.min.x + boundingBox.max.x) / 2,
    y: (boundingBox.min.y + boundingBox.max.y) / 2,
    z: (boundingBox.min.z + boundingBox.max.z) / 2,
  }
}

/**
 * 计算使模型居中的变换矩阵
 */
function calculateCenteringTransform(modelCenter: ModelCenter, boundingBox: BoundingBox, printBed: PrintConfig) {
  // 计算打印床中心
  const bedCenter = {
    x: printBed.printableWidth / 2,
    y: printBed.printableDepth / 2,
    z: 0, // 通常Z坐标为0，模型放在打印床表面
  }

  // 计算需要移动的距离
  const translation = {
    x: bedCenter.x - modelCenter.x,
    y: bedCenter.y - modelCenter.y,
    z: bedCenter.z - boundingBox.min.z, // 将模型的底部放在打印床上
  }

  // 生成变换矩阵字符串 (3x4矩阵, 最后三个值是平移)
  return `1 0 0 0 1 0 0 0 1 ${translation.x.toFixed(4)} ${translation.y.toFixed(4)} ${translation.z.toFixed(4)}`
}

/**
 * 创建主3dmodel.model文件的XML数据
 */
function createMainModelXML(objectId: number, components: ComponentInfo[], transform: string, printConfig: PrintConfig): string {
  const metadata = []
  const metadataConfig = printConfig.metadata
  metadata.push({ '@_name': 'CreationDate', '#text': new Date().toString() })
  for (const key in metadataConfig) {
    metadata.push({ '@_name': key, '#text': metadataConfig[key] })
  }

  const model = {
    model: {
      '@_unit': 'millimeter',
      '@_xml:lang': 'en-US',
      '@_xmlns': 'http://schemas.microsoft.com/3dmanufacturing/core/2015/02',
      '@_xmlns:slic3rpe': 'http://schemas.slic3r.org/3mf/2017/06',
      '@_xmlns:p': 'http://schemas.microsoft.com/3dmanufacturing/production/2015/06',
      '@_requiredextensions': 'p',
      metadata,
      'resources': {
        object: {
          '@_id': `${objectId}`,
          '@_p:uuid': generateUUID(),
          '@_type': 'model',
          'components': {
            component: components.map(comp => ({
              '@_p:path': `/3D/Objects/object-${objectId}.model`,
              '@_objectid': comp.id.toString(),
            })),
          },
        },
      },
      'build': {
        '@_p:uuid': `${generateUUID()}1`,
        'item': {
          '@_objectid': `${objectId}`,
          '@_p:uuid': `${generateUUID()}2`,
          '@_transform': transform,
          '@_printable': '1',
        },
      },
    },
  }

  const builder = new XMLBuilder({
    attributeNamePrefix: '@_',
    ignoreAttributes: false,
    format: true,
    indentBy: '  ',
  })

  return `<?xml version="1.0" encoding="UTF-8"?>\n${builder.build(model)}`
}

/**
 * 创建对象模型XML数据
 */
function createObjectModelXML(components: ComponentInfo[]): string {
  const objects = components.map((component) => {
    return {
      object: {
        '@_id': component.id.toString(),
        '@_p:uuid': generateUUID(),
        '@_type': 'model',
        'mesh': {
          vertices: {
            vertex: component.vertices.map(v => ({
              '@_x': v.x.toFixed(7),
              '@_y': v.y.toFixed(7),
              '@_z': v.z.toFixed(7),
            })),
          },
          triangles: {
            triangle: component.triangles.map(t => ({
              '@_v1': t.v1,
              '@_v2': t.v2,
              '@_v3': t.v3,
            })),
          },
        },
      },
    }
  })

  const model = {
    model: {
      '@_unit': 'millimeter',
      '@_xml:lang': 'en-US',
      '@_xmlns': 'http://schemas.microsoft.com/3dmanufacturing/core/2015/02',
      '@_xmlns:p': 'http://schemas.microsoft.com/3dmanufacturing/production/2015/06',
      'resources': objects,
      'build': {},
    },
  }

  const builder = new XMLBuilder({
    attributeNamePrefix: '@_',
    ignoreAttributes: false,
    format: true,
    indentBy: '  ',
  })

  return `<?xml version="1.0" encoding="UTF-8"?>\n${builder.build(model)}`
}

/**
 * 创建模型设置XML配置
 */
function createModelSettingsXML(objectId: number, components: ComponentInfo[]): string {
  const partsXml = components.map((comp) => {
    const extruder = comp.material ? comp.material.extruder : 1
    return `    <part id="${comp.id}" subtype="normal_part">
      <metadata key="name" value="${comp.name}"/>
      <metadata key="extruder" value="${extruder}"/>
      <mesh_stat edges_fixed="0" degenerate_facets="0" facets_removed="0" facets_reversed="0" backwards_edges="0"/>
    </part>`
  }).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <object id="${objectId}">
    <metadata key="name" value="Exported3DModel.3mf"/>
    <metadata key="extruder" value="1"/>
    <metadata key="thumbnail_file" value=""/>
${partsXml}
  </object>
  <plate>
    <metadata key="plater_id" value="1"/>
    <metadata key="plater_name" value="plate-1"/>
    <model_instance>
      <metadata key="object_id" value="${objectId}"/>
      <metadata key="instance_id" value="0"/>
    </model_instance>
  </plate>
  <assemble>
    <assemble_item object_id="${objectId}" instance_id="0" offset="0 0 0"/>
  </assemble>
</config>`
}

/**
 * 创建项目设置配置文件
 */
function createProjectSettingsConfig(materials: MaterialInfo[], printConfig: PrintConfig): string {
  // 从材质中提取颜色
  const colors = materials.map((m) => {
    const hex = `#${m.color.getHexString()}`
    return hex
  })

  // 确保至少有两个颜色(BambuStudio的要求)
  while (colors.length < 2) {
    colors.push('#FFFFFF')
  }

  const projectSettings = {
    printable_area: printConfig.printableArea,
    printable_height: printConfig.printableHeight.toString(),
    bed_exclude_area: [],
    filament_colour: colors,
    filament_settings_id: Array.from({ length: colors.length }).fill(printConfig.filament),
    filament_diameter: Array.from({ length: colors.length }).fill('1.75'),
    filament_is_support: Array.from({ length: colors.length }).fill('0'),
    printer_model: printConfig.printer_name,
    layer_height: '0.2',
    wall_loops: '2',
    sparse_infill_density: '15%',
    printer_settings_id: printConfig.printerSettingsId,
    printer_variant: '0.4',
    nozzle_diameter: ['0.4'],
    enable_support: '0',
    support_type: 'normal(auto)',
    print_settings_id: printConfig.printSettingsId,
  }

  return JSON.stringify(projectSettings)
}

/**
 * 创建 3MF ContentTypes XML
 */
function contentTypesXML(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml" />
  <Default Extension="png" ContentType="image/png" />
  <Default Extension="gcode" ContentType="text/x.gcode"/>
</Types>`
}

/**
 * 创建 3MF Relationships XML
 */
function relationshipsXML(options: {
  id: string
  target: string
}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rel-${options.id}" Target="${options.target}" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`
}

/**
 * 生成简单的UUID
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}
