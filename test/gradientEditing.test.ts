import type { ShapeWithColor } from '../src/types/three-types'
import { flushPromises, mount } from '@vue/test-utils'
import JSZip from 'jszip'
import { ExtrudeGeometry, Group, Mesh, MeshPhongMaterial } from 'three'
import { exportTo3MF } from 'three-3mf-exporter'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SvgTo3D from '../src/components/SvgTo3D.vue'

vi.mock('../src/components/ModelRenderer.vue', () => ({
  default: { name: 'ModelRenderer', props: ['shapes'], template: '<div />' },
}))

afterEach(() => vi.unstubAllGlobals())

async function mountEditor(gradientType = 'linearGradient', stops = '<stop stop-color="red"/><stop offset="1" stop-color="blue"/>', secondGradient = 'g') {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ text: async () => '<svg/>' }))
  const wrapper = mount(SvgTo3D, {
    global: { stubs: { FileDropZone: true, ModelExporter: true } },
  })
  await flushPromises()
  await wrapper.get('textarea').setValue(`<svg width="30" height="10" xmlns="http://www.w3.org/2000/svg">
    <defs><${gradientType} id="g">${stops}</${gradientType}>
      <linearGradient id="other"><stop stop-color="lime"/><stop offset="1" stop-color="yellow"/></linearGradient></defs>
    <rect width="10" height="10" fill="url(#g)"/>
    <rect x="10" width="10" height="10" fill="url(#${secondGradient})"/>
    <rect x="20" width="10" height="10" fill="green"/>
  </svg>`)
  await wrapper.get('button').trigger('click')
  await flushPromises()
  const shapes = () => wrapper.getComponent({ name: 'ModelRenderer' }).props('shapes') as ShapeWithColor[]
  return { wrapper, shapes }
}

describe('gradient color editing', () => {
  it('keeps source swatches and print-color controls after a custom color change', async () => {
    const { wrapper, shapes } = await mountEditor()
    try {
      expect(wrapper.findAll('img').map(image => image.attributes('src'))).toEqual(['/logo-dark.svg', '/logo-light.svg'])
      expect(wrapper.findAll('summary')).toHaveLength(2)
      expect(wrapper.get<HTMLInputElement>('input[type="color"]').element.value).toBe('#800080')
      expect(wrapper.get('label').attributes('style')).toContain('linear-gradient(')
      expect(wrapper.text()).toContain('3D preview and 3MF use')
      const source = shapes()[0].sourceGradient
      await wrapper.get('input[type="color"]').setValue('#123456')
      expect(shapes()[0].color.getHexString()).toBe('123456')
      expect(shapes()[0].sourceGradient).toBe(source)
      expect(shapes()[0].colorOverridden).toBe(true)
      expect(wrapper.get('label').attributes('style')).toContain('gradient(')
      expect(wrapper.findAll('summary')).toHaveLength(2)
      expect(wrapper.get('summary').text()).toContain('123456')
    }
    finally {
      wrapper.unmount()
    }
  })

  it('remembers a chosen position after closing and reopening, and allows choosing again', async () => {
    const { wrapper, shapes } = await mountEditor()
    try {
      const details = wrapper.get<HTMLDetailsElement>('details')
      details.element.open = true
      const slider = wrapper.get<HTMLInputElement>('input[type="range"]')
      await slider.setValue('0.25')
      expect(shapes()[0].color.getHexString()).toBe('bf0040')
      expect(shapes()[0].gradientPosition).toBe(0.25)
      expect(shapes()[0].colorOverridden).toBe(true)
      expect(shapes()[0].sourceGradient?.id).toBe('g')
      await wrapper.get('button[aria-label="Close print color editor for shape 1"]').trigger('click')
      expect(details.element.open).toBe(false)
      details.element.open = true
      expect(slider.element.value).toBe('0.25')
      await slider.setValue('0.75')
      expect(shapes()[0].color.getHexString()).toBe('4000bf')
      expect(shapes()[0].gradientPosition).toBe(0.75)
      expect(wrapper.get('label').attributes('style')).toContain('linear-gradient(')
      expect(wrapper.findAll('summary')).toHaveLength(2)
    }
    finally {
      wrapper.unmount()
    }
  })

  it('selects the initial midpoint even without a range value change, then restores the automatic color', async () => {
    const { wrapper, shapes } = await mountEditor('linearGradient', '<stop stop-color="red"/><stop offset="80%" stop-color="red"/><stop offset="1" stop-color="blue"/>')
    try {
      expect(shapes()[0].color.getHexString()).toBe('e6001a')
      const source = shapes()[0].sourceGradient
      await wrapper.get('input[type="range"]').trigger('pointerup')
      expect(shapes()[0].color.getHexString()).toBe('ff0000')
      expect(shapes()[0].gradientPosition).toBe(0.5)
      await wrapper.get('button[aria-label="Reset print color for shape 1"]').trigger('click')
      expect(shapes()[0].color.getHexString()).toBe('e6001a')
      expect(shapes()[0].gradientPosition).toBeUndefined()
      expect(shapes()[0].colorOverridden).toBe(false)
      expect(shapes()[0].sourceGradient).toBe(source)
    }
    finally {
      wrapper.unmount()
    }
  })

  it.each(['linear', 'radial'])('shows saved %s gradient stops in the swatch while retaining the printable material color', async (type) => {
    const { wrapper, shapes } = await mountEditor(`${type}Gradient`, '<stop offset="25%" stop-color="red" stop-opacity="0.5"/><stop offset="75%" stop-color="blue"/>')
    try {
      const style = wrapper.get('label').attributes('style')!
      expect(style).toContain(`${type}-gradient(`)
      expect(style).toContain('rgba(255, 0, 0, 0.5) 25%')
      expect(style).toContain('rgb(0, 0, 255) 75%')
      expect(shapes()[0].color.getHexString()).toBe('5500aa')
      expect(wrapper.get<HTMLInputElement>('input[type="color"]').element.value).toBe('#5500aa')
    }
    finally {
      wrapper.unmount()
    }
  })

  it('overrides every selected gradient while leaving unselected colors alone', async () => {
    const { wrapper, shapes } = await mountEditor()
    try {
      const inputs = wrapper.findAll('input[type="color"]')
      await inputs[0].trigger('click')
      await inputs[1].trigger('click', { ctrlKey: true })
      await inputs[0].setValue('#abcdef')
      expect(shapes().map(shape => shape.color.getHexString())).toEqual(['abcdef', 'abcdef', '008000'])
      expect(shapes().slice(0, 2).every(shape => shape.sourceGradient && shape.colorOverridden)).toBe(true)
      expect(wrapper.findAll('summary')).toHaveLength(2)
      expect(wrapper.findAll('input[type="range"]')).toHaveLength(2)
      await wrapper.get('input[type="range"]').setValue('0.25')
      expect(shapes().slice(0, 2).map(shape => shape.color.getHexString())).toEqual(['bf0040', 'bf0040'])
      expect(shapes().slice(0, 2).map(shape => shape.gradientPosition)).toEqual([0.25, 0.25])
    }
    finally {
      wrapper.unmount()
    }
  })

  it('keeps batch positions tied to their source and resets each gradient independently', async () => {
    const { wrapper, shapes } = await mountEditor('linearGradient', undefined, 'other')
    try {
      const inputs = wrapper.findAll('input[type="color"]')
      await inputs[0].trigger('click')
      await inputs[1].trigger('click', { ctrlKey: true })
      await inputs[2].trigger('click', { ctrlKey: true })
      await wrapper.get('input[type="range"]').setValue('0.25')
      expect(shapes().map(shape => shape.color.getHexString())).toEqual(['bf0040', 'bf0040', 'bf0040'])
      expect(shapes().map(shape => shape.gradientPosition)).toEqual([0.25, undefined, undefined])
      await wrapper.get('button[aria-label="Reset print color for shape 1"]').trigger('click')
      expect(shapes().map(shape => shape.color.getHexString())).toEqual(['800080', '80ff00', 'bf0040'])
      expect(shapes()[1].colorOverridden).toBe(false)
    }
    finally {
      wrapper.unmount()
    }
  })

  it('exports the slider-selected color that is passed to the 3D renderer', async () => {
    const { wrapper, shapes } = await mountEditor()
    let geometry: ExtrudeGeometry | undefined
    let material: MeshPhongMaterial | undefined
    try {
      await wrapper.get('input[type="range"]').setValue('0.75')
      const part = shapes()[0]
      geometry = new ExtrudeGeometry(part.shape, { depth: part.depth, bevelEnabled: false })
      material = new MeshPhongMaterial({ color: part.color })
      const archive = await JSZip.loadAsync(await exportTo3MF(new Group().add(new Mesh(geometry, material))))
      const settings = JSON.parse(await archive.file('Metadata/project_settings.config')!.async('string'))
      expect(settings.filament_colour[0]).toBe('#4000bf')
      expect(part.sourceGradient?.id).toBe('g')
    }
    finally {
      geometry?.dispose()
      material?.dispose()
      wrapper.unmount()
    }
  })
})
