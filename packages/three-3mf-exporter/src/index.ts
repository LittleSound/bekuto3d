import type { Group, Mesh, MeshPhongMaterial, Object3D } from 'three'
import JSZip from 'jszip'
import { Color, Matrix4, Vector3 } from 'three'

/**
 * 组件信息接口 / Component Information Interface
 * 已更新以支持程序集（组） / Updated to support Assemblies (Groups)
 */
interface ComponentInfo {
  id: number
  type: 'mesh' | 'assembly'
  // 网格字段 / Mesh fields
  vertices: { x: number, y: number, z: number }[]
  triangles: { v1: number, v2: number, v3: number }[]
  material: MaterialInfo | null
  // 程序集字段 / Assembly fields
  subComponents: { objectId: number, transform: Matrix4 }[] // 子组件及其变换 / Sub-components and their transforms
  name: string
  uuid: string
}

/**
 * 材质信息接口，用于存储颜色数据 / Material Information Interface for storing color data
 */
interface MaterialInfo {
  id: number
  color: Color
  name: string
  extruder: number
}

/**
 * 打印床配置接口 / Print Bed Configuration Interface
 */
interface PrintConfig {
  printer_name: string // 打印机名称 / Printer Name
  filament: string // 打印材料 / Filament
  printableWidth: number // 打印床宽度 (X轴) / Printable Width (X-axis)
  printableDepth: number // 打印床深度 (Y轴) / Printable Depth (Y-axis)
  printableHeight: number // 打印高度 (Z轴) / Printable Height (Z-axis)
  printableArea: readonly [string, string, string, string] // 打印区域坐标 / Printable Area Coordinates
  printerSettingsId: string // 打印机设置ID / Printer Settings ID
  printSettingsId: string // 打印设置ID / Print Settings ID
  compression: 'none' | 'standard' // 压缩方式 / Compression Method

  metadata: Partial<{ Application: string, Copyright: string, ApplicationTitle: string }>
}

/**
 * 构建项接口 / Build Item Interface
 */
interface BuildItem {
  objectId: number
  transformMatrix: { elements: number[] } // 兼容 THREE.Matrix4 / Compatible with THREE.Matrix4
  uuid: string
}

// 默认的打印配置 (基于 Bambu Lab A1) / Default Print Configuration (based on Bambu Lab A1)
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
 * Export Three.js Group or Mesh to 3MF format (BambuStudio compatible)
 * @param object Three.js Group 对象或 Mesh 数组 / Three.js Group or Mesh array
 * @param printJobConfig 打印床配置，可选 / Optional print bed configuration
 * @returns Blob 数据 / Blob data
 */
export async function exportTo3MF(
  object: Group | Object3D,
  printJobConfig?: Partial<PrintConfig>,
): Promise<Blob> {
  const zip = new JSZip()
  // 合并用户提供的配置与默认配置 / Merge user-provided config with defaults
  const printConfig = Object.assign({} as (typeof defaultPrintConfig & Partial<PrintConfig>), defaultPrintConfig, printJobConfig)
  const compression = JSZipCompressionMap[printConfig.compression]

  // 收集所有组件、材质和构建项信息 / Collect all components, materials, and build items
  const components: ComponentInfo[] = []
  const materials: MaterialInfo[] = []
  const buildItems: BuildItem[] = []

  // 辅助函数：处理唯一的网格 / Helper: Process Unique Mesh
  const processMesh = (mesh: Mesh): number => {
    mesh.updateMatrixWorld(true)
    const geometry = mesh.geometry
    const positionAttr = geometry.attributes.position
    const indexAttr = geometry.index

    // 处理材质 / Process Materials
    let materialInfo: MaterialInfo | null = null
    if (mesh.material) {
      const color = new Color()
      // 处理数组材质 or 单个材质 / Handle array materials or single material
      const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
      
      if (mat && 'color' in mat && mat.color) {
        color.copy((mat as MeshPhongMaterial).color)
      } else {
        // 默认颜色为灰色 / Default color is gray
        color.set(0x808080)
      }

      // 检查是否已存在相同颜色的材质 / Check for existing material with the same color
      const existingMaterial = materials.find(
        m => m.color.r === color.r && m.color.g === color.g && m.color.b === color.b,
      )

      if (existingMaterial) {
        materialInfo = existingMaterial
      } else {
        const extruder = materials.length + 1 // 挤出头编号从1开始 / Extruder numbering starts from 1
        materialInfo = {
          id: materials.length + 1,
          color,
          name: mesh.name ? `${mesh.name}_material` : `material_${materials.length}`,
          extruder,
        }
        materials.push(materialInfo)
      }
    }

    const componentId = components.length + 1
    const component: ComponentInfo = {
      id: componentId,
      type: 'mesh',
      vertices: [],
      triangles: [],
      material: materialInfo,
      name: mesh.name || `Mesh-${componentId}`,
      subComponents: [],
      uuid: generateUUID()
    }

    // 顶点去重映射表 / Vertex De-duplication Map
    const vertexMap = new Map<string, number>()
    
    // 在局部空间（几何空间）处理顶点 / Process Vertices in LOCAL space (Geometry space)
    const processVertex = (vertexIndex: number) => {
      const vertex = new Vector3()
      vertex.fromBufferAttribute(positionAttr, vertexIndex)
      // 对于模块化组件，不要在这里应用世界矩阵 / Do NOT apply world matrix here for modular components

      const vertexKey = `${vertex.x},${vertex.y},${vertex.z}`
      if (!vertexMap.has(vertexKey)) {
        vertexMap.set(vertexKey, component.vertices.length)
        component.vertices.push({ x: vertex.x, y: vertex.y, z: vertex.z })
      }
      return vertexMap.get(vertexKey)!
    }

    // 处理三角形 / Process Triangles
    if (indexAttr) {
      for (let i = 0; i < indexAttr.count; i += 3) {
        component.triangles.push({
          v1: processVertex(indexAttr.getX(i)),
          v2: processVertex(indexAttr.getX(i + 1)),
          v3: processVertex(indexAttr.getX(i + 2)),
        })
      }
    } else {
      for (let i = 0; i < positionAttr.count; i += 3) {
        component.triangles.push({
          v1: processVertex(i),
          v2: processVertex(i + 1),
          v3: processVertex(i + 2),
        })
      }
    }

    components.push(component)
    return componentId
  }

  // 辅助函数：处理节点（网格或组） / Helper: Process Node (Mesh or Group)
  const processNode = (node: Object3D): number => {
    if (node.type === 'Mesh') {
      return processMesh(node as Mesh)
    } else if (node.type === 'Group' || node.type === 'Object3D' || node.type === 'Scene') {
      const subComponents: { objectId: number, transform: Matrix4 }[] = []
      node.updateMatrixWorld(true)

      node.children.forEach((child) => {
        const subId = processNode(child)
        if (subId !== -1) {
          // 计算相对于当前节点的变换 / Calculate transform relative to the current node
          const relMatrix = child.matrixWorld.clone().premultiply(node.matrixWorld.clone().invert())
          subComponents.push({ objectId: subId, transform: relMatrix })
        }
      })

      if (subComponents.length > 0) {
        const assemblyId = components.length + 1
        components.push({
          id: assemblyId,
          type: 'assembly',
          subComponents,
          name: node.name || `Group-${assemblyId}`,
          vertices: [], triangles: [], material: null, uuid: generateUUID()
        })
        return assemblyId
      }
    }
    return -1
  }

  // 遍历与原生分组 / Traversal & Native Grouping
  // 如果输入是场景，将其子项作为顶级构建项。如果是组或网格，作为单个顶级构建项。
  // If input is Scene, treat children as top-level build items. If Group or Mesh, treat as single top-level.
  const rootChildren = (object.type === 'Scene') ? object.children : [object]
  const allVerticesWorld: Vector3[] = []

  rootChildren.forEach((child) => {
    const childId = processNode(child)
    if (childId !== -1) {
      child.updateMatrix()
      const itemMatrix = child.matrix.clone()
      
      const targetComp = components.find(c => c.id === childId)!
      const getVerts = (c: ComponentInfo): Vector3[] => {
        if (c.type === 'assembly') {
          return c.subComponents.flatMap((sc) => {
            const subComp = components.find(x => x.id === sc.objectId)!
            return getVerts(subComp).map(v => v.clone().applyMatrix4(sc.transform))
          })
        }
        return c.vertices.map(v => new Vector3(v.x, v.y, v.z))
      }

      getVerts(targetComp).forEach((vec) => {
        vec.applyMatrix4(itemMatrix)
        allVerticesWorld.push(vec)
      })

      buildItems.push({
        objectId: childId,
        transformMatrix: itemMatrix,
        uuid: generateUUID()
      })
    }
  })

  // 居中逻辑 / Centering Logic
  let min = { x: Infinity, y: Infinity, z: Infinity }
  let max = { x: -Infinity, y: -Infinity, z: -Infinity }
  if (allVerticesWorld.length > 0) {
    allVerticesWorld.forEach(v => {
      min.x = Math.min(min.x, v.x); min.y = Math.min(min.y, v.y); min.z = Math.min(min.z, v.z)
      max.x = Math.max(max.x, v.x); max.y = Math.max(max.y, v.y); max.z = Math.max(max.z, v.z)
    })
  } else { min = { x: 0, y: 0, z: 0 }; max = { x: 0, y: 0, z: 0 } }

  const modelCenter = { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 }
  const bedCenter = { x: printConfig.printableWidth / 2, y: printConfig.printableDepth / 2, z: 0 }
  const shift = { x: bedCenter.x - modelCenter.x, y: bedCenter.y - modelCenter.y, z: bedCenter.z - min.z }

  // 生成 XML / Generate XML
  const mainModelXml = createMainModelXML(components, buildItems, shift, printConfig)
  const modelSettingsXml = createModelSettingsXML(components, buildItems)
  const projectSettingsConfig = createProjectSettingsConfig(materials, printConfig)

  // ZIP 打包 / Zip Packaging
  zip.file('_rels/.rels', relationshipsXML())
  zip.file('3D/3dmodel.model', mainModelXml)
  zip.file('Metadata/model_settings.config', modelSettingsXml)
  zip.file('Metadata/project_settings.config', projectSettingsConfig)

  // 当我把 '[Content_Types].xml' 文件名放在压缩包的开头时，压缩文件将无法解压。
  // 不确定具体原因，但是请不要把它放在压缩包的开头。
  // When I put '[Content_Types].xml' at the beginning of the zip, it fails to decompress.
  // Not sure why, but please do not put it at the start.
  zip.file('[Content_Types].xml', contentTypesXML())

  // 生成ZIP文件 / Generate ZIP file
  return await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml', compression })
}

/**
 * 创建主3dmodel.model文件的XML数据 / Create XML data for the main 3dmodel.model file
 */
function createMainModelXML(components: ComponentInfo[], buildItems: BuildItem[], shift: { x: number, y: number, z: number }, printConfig: PrintConfig): string {
  const metadata: string[] = []
  const metadataConfig = printConfig.metadata
  metadata.push(`<metadata name="CreationDate">${new Date().toISOString()}</metadata>`)
  for (const key in metadataConfig) {
    metadata.push(`<metadata name="${key}">${metadataConfig[key]}</metadata>`)
  }

  const resources = components.map((c) => {
    if (c.type === 'assembly') {
      const comps = c.subComponents.map((sc) => {
        const e = sc.transform.elements
        const tStr = `${e[0].toFixed(5)} ${e[1].toFixed(5)} ${e[2].toFixed(5)} ${e[4].toFixed(5)} ${e[5].toFixed(5)} ${e[6].toFixed(5)} ${e[8].toFixed(5)} ${e[9].toFixed(5)} ${e[10].toFixed(5)} ${e[12].toFixed(5)} ${e[13].toFixed(5)} ${e[14].toFixed(5)}`
        return `<component objectid="${sc.objectId}" transform="${tStr}" />`
      }).join('')
      return `<object id="${c.id}" type="model" name="${c.name}"><components>${comps}</components></object>`
    } else {
      const vXml = c.vertices.map(v => `<vertex x="${v.x.toFixed(5)}" y="${v.y.toFixed(5)}" z="${v.z.toFixed(5)}" />`).join(' ')
      const tXml = c.triangles.map(t => `<triangle v1="${t.v1}" v2="${t.v2}" v3="${t.v3}" />`).join(' ')
      return `<object id="${c.id}" type="model" name="${c.name}"><mesh><vertices>${vXml}</vertices><triangles>${tXml}</triangles></mesh></object>`
    }
  }).join('\n')

  const build = buildItems.map((item) => {
    // 对平移元素应用位移 (12, 13, 14) / Apply shift to translation elements (12, 13, 14)
    const e = item.transformMatrix.elements
    const tx = e[12] + shift.x
    const ty = e[13] + shift.y
    const tz = e[14] + shift.z
    // 3MF 变换：m00 m01 m02 m10 m11 m12 m20 m21 m22 m30 m31 m32 (仿射 3x4)
    // 3MF Transform: m00 m01 m02 m10 m11 m12 m20 m21 m22 m30 m31 m32 (affine 3x4)
    const tStr = `${e[0].toFixed(5)} ${e[1].toFixed(5)} ${e[2].toFixed(5)} ${e[4].toFixed(5)} ${e[5].toFixed(5)} ${e[6].toFixed(5)} ${e[8].toFixed(5)} ${e[9].toFixed(5)} ${e[10].toFixed(5)} ${tx.toFixed(5)} ${ty.toFixed(5)} ${tz.toFixed(5)}`
    return `<item objectid="${item.objectId}" transform="${tStr}" printable="1" />`
  }).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:slic3rpe="http://schemas.slic3r.org/3mf/2017/06" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p">
    ${metadata.join('\n    ')}
    <resources>
${resources}
    </resources>
    <build>
${build}
    </build>
</model>`
}

/**
 * 创建模型设置XML配置 / Create XML configuration for model settings
 */
function createModelSettingsXML(components: ComponentInfo[], buildItems: BuildItem[]): string {
  let objectsXml = ""
  let instancesXml = ""
  let assembleXml = ""

  buildItems.forEach((item, index) => {
    const objId = item.objectId
    const comp = components.find(c => c.id === objId)!

    // 展平此对象的部件 / Flatten parts for this object
    const parts: ComponentInfo[] = []
    const collect = (c: ComponentInfo) => {
      if (c.type === 'mesh')
        parts.push(c)
      else c.subComponents.forEach(sc => collect(components.find(x => x.id === sc.objectId)!))
    }
    collect(comp)

    const partsXml = parts.map(p => {
      const extruder = p.material ? p.material.extruder : 1
      return `    <part id="${p.id}" subtype="normal_part">
      <metadata key="name" value="${p.name}"/>
      <metadata key="extruder" value="${extruder}"/>
      <mesh_stat edges_fixed="0" degenerate_facets="0" facets_removed="0" facets_reversed="0" backwards_edges="0"/>
    </part>`
    }).join('\n')

    objectsXml += `  <object id="${objId}">
    <metadata key="name" value="${comp.name}"/>
    <metadata key="extruder" value="1"/>
    <metadata key="thumbnail_file" value=""/>
${partsXml}
  </object>\n`

    instancesXml += `    <model_instance>
      <metadata key="object_id" value="${objId}"/>
      <metadata key="instance_id" value="0"/>
      <metadata key="identify_id" value="${index + 1}"/>
    </model_instance>\n`

    assembleXml += `    <assemble_item object_id="${objId}" instance_id="0" offset="0 0 0"/>\n`
  })

  return `<?xml version="1.0" encoding="UTF-8"?>
<config>
${objectsXml}
  <plate>
    <metadata key="plater_id" value="1"/>
    <metadata key="plater_name" value="plate-1"/>
${instancesXml}
  </plate>
  <assemble>
${assembleXml}
  </assemble>
</config>`
}

/**
 * 创建项目设置配置文件 / Create project settings configuration file
 */
function createProjectSettingsConfig(materials: MaterialInfo[], printConfig: PrintConfig): string {
  // 从材质中提取颜色 / Extract colors from materials
  const colors = materials.map((m) => {
    const hex = `#${m.color.getHexString()}`
    return hex
  })
  // 确保至少有两个颜色(BambuStudio的要求) / Ensure at least two colors (BambuStudio requirement)
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
 * 创建 3MF Relationships XML / Create 3MF Relationships XML
 */
function relationshipsXML(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rel-1" Target="/3D/3dmodel.model" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
  <Relationship Id="rel-2" Target="/Metadata/model_settings.config" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
  <Relationship Id="rel-3" Target="/Metadata/project_settings.config" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`
}

/**
 * 创建 3MF ContentTypes XML / Create 3MF ContentTypes XML
 */
function contentTypesXML(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml" />
  <Default Extension="config" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml" />
  <Default Extension="png" ContentType="image/png" />
  <Default Extension="gcode" ContentType="text/x.gcode"/>
</Types>`
}

/**
 * 生成简单的UUID / Generate simple UUID
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}
