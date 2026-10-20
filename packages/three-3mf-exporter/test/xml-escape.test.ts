/**
 * @vitest-environment jsdom
 */
import JSZip from 'jszip'
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Scene } from 'three'
import { describe, expect, it } from 'vitest'
import { exportTo3MF } from '../src/index'

const tricky = `Tom & Jerry <"it's"> &amp;`
const trickyGroup = `a"b'c<d>e&f`

/** Parses `text` strictly as XML and fails on any well-formedness error. */
function parseXml(name: string, text: string): Document {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  const error = doc.getElementsByTagName('parsererror')[0]
  expect(error?.textContent, `${name} is not well-formed`).toBeUndefined()
  return doc
}

/** Exports `object` and strictly parses every XML part; project settings are JSON. */
async function exportAndParse(object: Parameters<typeof exportTo3MF>[0], config?: Parameters<typeof exportTo3MF>[1]) {
  const blob = await exportTo3MF(object, config)
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  const docs: Record<string, Document> = {}
  for (const name of Object.keys(zip.files)) {
    if (zip.files[name].dir || name.endsWith('project_settings.config'))
      continue
    docs[name] = parseXml(name, await zip.file(name)!.async('string'))
  }
  const projectSettings = JSON.parse(await zip.file('Metadata/project_settings.config')!.async('string'))
  return { docs, projectSettings }
}

function buildScene(meshName: string, groupName: string) {
  const scene = new Scene()
  const group = new Group()
  group.name = groupName
  const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ color: 0xFF0000 }))
  mesh.name = meshName
  group.add(mesh)
  scene.add(group)
  return scene
}

describe('escaping user-provided strings in XML', () => {
  it('produces well-formed XML and round-trips names and metadata', async () => {
    const { docs } = await exportAndParse(buildScene(tricky, trickyGroup), {
      metadata: { Copyright: tricky, ApplicationTitle: `<script>&"'` },
    })

    expect(Object.keys(docs).sort()).toEqual([
      '3D/3dmodel.model',
      'Metadata/model_settings.config',
      '[Content_Types].xml',
      '_rels/.rels',
    ])

    const model = docs['3D/3dmodel.model']
    const objectNames = Array.from(model.getElementsByTagName('object'), o => o.getAttribute('name'))
    expect(objectNames).toEqual([tricky, trickyGroup])
    const metadata = Object.fromEntries(Array.from(model.getElementsByTagName('metadata'), m => [m.getAttribute('name'), m.textContent]))
    expect(metadata.Copyright).toBe(tricky)
    expect(metadata.ApplicationTitle).toBe(`<script>&"'`)

    const settings = docs['Metadata/model_settings.config']
    const names = Array.from(settings.querySelectorAll('metadata[key="name"]'), m => m.getAttribute('value'))
    expect(names).toEqual([trickyGroup, tricky])
  })

  it('strips characters that are not allowed in XML 1.0 and keeps the rest', async () => {
    const invalid = 'a\u0000b\u0008c\u000Bd\u000Ce\u001Ff\uD800g\uDFFFh'
    const valid = 'tab\there\nnew\rline \u{1F63A}'
    const { docs } = await exportAndParse(buildScene(invalid, valid), {
      metadata: { Copyright: invalid },
    })

    const model = docs['3D/3dmodel.model']
    const objectNames = Array.from(model.getElementsByTagName('object'), o => o.getAttribute('name'))
    expect(objectNames).toEqual(['abcdefgh', valid])
    const copyright = Array.from(model.getElementsByTagName('metadata')).find(m => m.getAttribute('name') === 'Copyright')
    expect(copyright?.textContent).toBe('abcdefgh')
  })

  it('keeps JSON project settings valid for tricky filament and printer names', async () => {
    const { projectSettings } = await exportAndParse(buildScene('m', 'g'), { filament: tricky, printer_name: tricky })
    expect(projectSettings.printer_model).toBe(tricky)
    expect(projectSettings.filament_settings_id[0]).toBe(tricky)
  })
})
