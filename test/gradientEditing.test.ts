import type { ShapeWithColor } from '../src/types/three-types'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SvgTo3D from '../src/components/SvgTo3D.vue'

vi.mock('../src/components/ModelRenderer.vue', () => ({
  default: { name: 'ModelRenderer', props: ['shapes'], template: '<div />' },
}))

afterEach(() => vi.unstubAllGlobals())

async function mountEditor(gradientType = 'linearGradient', stops = '<stop stop-color="red"/><stop offset="1" stop-color="blue"/>') {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ text: async () => '<svg/>' }))
  const wrapper = mount(SvgTo3D, {
    global: { stubs: { FileDropZone: true, ModelExporter: true } },
  })
  await flushPromises()
  await wrapper.get('textarea').setValue(`<svg width="30" height="10" xmlns="http://www.w3.org/2000/svg">
    <defs><${gradientType} id="g">${stops}</${gradientType}></defs>
    <rect width="10" height="10" fill="url(#g)"/>
    <rect x="10" width="10" height="10" fill="url(#g)"/>
    <rect x="20" width="10" height="10" fill="green"/>
  </svg>`)
  await wrapper.get('button').trigger('click')
  await flushPromises()
  const shapes = () => wrapper.getComponent({ name: 'ModelRenderer' }).props('shapes') as ShapeWithColor[]
  return { wrapper, shapes }
}

describe('gradient color editing', () => {
  it('shows the fallback and warning, then keeps provenance after a manual color change', async () => {
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
      expect(wrapper.get('label').attributes('style')).not.toContain('gradient(')
      expect(wrapper.findAll('summary')).toHaveLength(1)
    }
    finally {
      wrapper.unmount()
    }
  })

  it('allows explicitly keeping the approximation as a solid color', async () => {
    const { wrapper, shapes } = await mountEditor()
    try {
      await wrapper.get('details button').trigger('click')
      expect(shapes()[0].color.getHexString()).toBe('800080')
      expect(shapes()[0].colorOverridden).toBe(true)
      expect(shapes()[0].sourceGradient?.id).toBe('g')
      expect(wrapper.get('label').attributes('style')).not.toContain('gradient(')
      expect(wrapper.findAll('summary')).toHaveLength(1)
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
      expect(wrapper.findAll('summary')).toHaveLength(0)
    }
    finally {
      wrapper.unmount()
    }
  })
})
