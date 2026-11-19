import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import SvgTo3D from '../src/components/SvgTo3D.vue'

it('undoes a batch edit and deletion of the last parts, and starts fresh for a new file', async () => {
  const svg = '<svg viewBox="0 0 20 10"><rect width="8" height="8" fill="red"/><circle r="3" cx="13" cy="4" fill="blue"/></svg>'
  vi.stubGlobal('fetch', vi.fn(async () => new Response(svg)))
  const editor = mount(SvgTo3D, {
    global: { stubs: { ModelRenderer: true, ModelExporter: true, FileDropZone: true } },
  })
  async function button(label: string) {
    await editor.findAll('button').find(button => button.text() === label)!.trigger('click')
  }
  async function openFile() {
    await editor.get('textarea').setValue(svg)
    await button('Convert')
  }
  const colors = () => editor.findAll<HTMLInputElement>('input[type=color]').map(input => input.element.value)
  try {
    await flushPromises()
    await openFile()
    for (const checkbox of editor.findAll('input[type=checkbox]'))
      await checkbox.setValue(true)

    const color = editor.get<HTMLInputElement>('input[type=color]')
    for (const value of ['#123456', '#abcdef']) {
      color.element.value = value
      await color.trigger('input')
    }
    expect(colors()).toEqual(['#abcdef', '#abcdef'])

    await button('Delete')
    await flushPromises()
    expect(editor.find('textarea').exists()).toBe(true)
    await button('Undo')
    expect(colors()).toEqual(['#abcdef', '#abcdef'])
    expect(editor.findAll('input:checked')).toHaveLength(2)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }))
    await flushPromises()
    expect(colors()).toEqual(['#ff0000', '#0000ff'])
    expect(editor.get('button[title^=Undo]').attributes('disabled')).toBeDefined()
    await button('Delete')
    await openFile()
    expect(editor.get('button[title^=Undo]').attributes('disabled')).toBeDefined()
  }
  finally {
    editor.unmount()
    vi.unstubAllGlobals()
  }
})

it('lists SVG holes separately and undoes filling and reopening one of them', async () => {
  const svg = '<svg viewBox="0 0 20 20"><path d="M0 0h20v20H0Z M2 2v3h3V2Z M10 10v5h5v-5Z"/></svg>'
  vi.stubGlobal('fetch', vi.fn(async () => new Response(svg)))
  const editor = mount(SvgTo3D, {
    global: { stubs: { ModelRenderer: true, ModelExporter: true, FileDropZone: true } },
  })
  try {
    await flushPromises()
    await editor.get('textarea').setValue(svg)
    await editor.findAll('button').find(button => button.text() === 'Convert')!.trigger('click')
    const fill = 'button[aria-label="Fill hole 2 in part 1"]'
    const reopen = 'button[aria-label="Reopen hole 2 in part 1"]'
    await editor.get(fill).trigger('click')
    await flushPromises()
    expect(editor.findAll('input[type=color]')).toHaveLength(1)
    expect(editor.find('button[aria-label="Fill hole 1 in part 1"]').exists()).toBe(true)
    await editor.get(reopen).trigger('click')
    await flushPromises()
    expect(editor.find(fill).exists()).toBe(true)
    await editor.get('button[title^=Undo]').trigger('click')
    expect(editor.find(reopen).exists()).toBe(true)
  }
  finally {
    editor.unmount()
    vi.unstubAllGlobals()
  }
})

it('splits a filled hole into a selected, independently colorable part in one undo step', async () => {
  const svg = '<svg viewBox="0 0 20 20"><path fill="red" d="M0 0h20v20H0Z M2 2v3h3V2Z M10 10v5h5v-5Z"/></svg>'
  vi.stubGlobal('fetch', vi.fn(async () => new Response(svg)))
  const editor = mount(SvgTo3D, {
    global: { stubs: { ModelRenderer: true, ModelExporter: true, FileDropZone: true } },
  })
  const action = (label: string) => editor.get(`button[aria-label="${label}"]`).trigger('click')
  const colors = () => editor.findAll<HTMLInputElement>('input[type=color]')
  try {
    await flushPromises()
    await editor.get('textarea').setValue(svg)
    await editor.findAll('button').find(button => button.text() === 'Convert')!.trigger('click')
    await action('Fill hole 1 in part 1')
    await flushPromises()
    await action('Split fill for hole 1 in part 1')
    await flushPromises()
    expect(colors()).toHaveLength(2)
    expect(editor.find('button[aria-label="Fill hole 1 in part 1"]').exists()).toBe(false)
    expect(editor.find('button[aria-label="Fill hole 2 in part 1"]').exists()).toBe(true)
    expect(editor.get('input:checked').attributes('aria-label')).toBe('Select part 2')
    await colors()[1].setValue('#ffaabb')
    expect(colors().map(input => input.element.value)).toEqual(['#ff0000', '#ffaabb'])
    await editor.get('button[title^=Undo]').trigger('click')
    await editor.get('button[title^=Undo]').trigger('click')
    expect(colors()).toHaveLength(1)
    expect(editor.find('button[aria-label="Reopen hole 1 in part 1"]').exists()).toBe(true)

    await action('Fill as part for hole 2 in part 1')
    await flushPromises()
    expect(colors()).toHaveLength(2)
    await editor.get('button[title="Delete selected parts"]').trigger('click')
    expect(editor.find('button[aria-label="Fill hole 2 in part 1"]').exists()).toBe(true)
    expect(editor.find('button[aria-label="Reopen hole 1 in part 1"]').exists()).toBe(true)
  }
  finally {
    editor.unmount()
    vi.unstubAllGlobals()
  }
})
