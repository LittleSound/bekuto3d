export interface CollectionInfo {
  name: string
  total: number
  license: { title: string, url?: string }
}

type Directory = Record<string, CollectionInfo>

const api = 'https://api.iconify.design'
export const pageSize = 36

export const highlightIcons = [
  'material-icon-theme:vue',
  'material-icon-theme:vite',
  'logos:nuxt-icon',
  'material-icon-theme:python',
  'material-icon-theme:rust',
  'logos:go',
  'logos:vueuse',
  'logos:vitest',
  'logos:c-plusplus',
  'material-icon-theme:swift',
  'material-icon-theme:ruby',
  'logos:vuetifyjs',
  'logos:naiveui',
  'logos:unocss',
  'logos:java',
  'material-icon-theme:dart',
  'material-icon-theme:zig',
  'logos:javascript',
  'logos:typescript-icon',
  'material-icon-theme:elixir',
  'logos:haskell-icon',
  'material-icon-theme:scala',
  'logos:svelte-icon',
  'logos:preact',
  'material-icon-theme:lua',
  'material-icon-theme:julia',
  'logos:fortran',
  'logos:html-5',
  'logos:css-3',
  'material-icon-theme:clojure',
  'logos:bulma',
  'logos:eslint',
]

async function request(path: string, signal: AbortSignal) {
  const response = await fetch(`${api}/${path}`, { signal })
  if (!response.ok)
    throw new Error(`Iconify request failed (${response.status})`)
  return response
}

export async function loadDirectory(signal: AbortSignal): Promise<Directory> {
  return (await request('collections', signal)).json()
}

export async function loadCollection(prefix: string, signal: AbortSignal) {
  const response = await request(`collection?${new URLSearchParams({ prefix })}`, signal)
  const data: { uncategorized?: string[], categories?: Record<string, string[]> } = await response.json()
  const names = new Set([...(data.uncategorized ?? []), ...Object.values(data.categories ?? {}).flat()])
  return [...names].sort().map(name => `${prefix}:${name}`)
}

export async function searchIcons(query: string, prefix: string, start: number, signal: AbortSignal): Promise<string[]> {
  const params = new URLSearchParams({ query, start: String(start), limit: String(pageSize + 1) })
  if (prefix)
    params.set('prefix', prefix)
  const response = await request(`search?${params}`, signal)
  return (await response.json()).icons
}
