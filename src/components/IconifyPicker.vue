<script setup lang="ts">
import type { CollectionInfo } from '../iconify/catalog'
import { buildIcon, Icon, loadIcon } from '@iconify/vue'
import { highlightIcons, loadCollection, loadDirectory, pageSize, searchIcons } from '../iconify/catalog'

const props = defineProps<{ importIcon: (id: string, svg: string) => void }>()
const emit = defineEmits<{ close: [] }>()
const dialog = ref<HTMLDialogElement>()
const query = ref('')
const prefix = ref('')
const page = ref(0)
const retry = ref(0)
const directory = shallowRef<Record<string, CollectionInfo>>({})
const collectionIcons = new Map<string, string[]>()
const collections = computed(() => Object.entries(directory.value).sort(([, a], [, b]) => a.name.localeCompare(b.name)))
const results = shallowRef<string[]>([])
const hasNext = ref(false)
const loading = ref(true)
const loadError = ref(false)
const selected = ref('')
const selectedSet = computed(() => directory.value[selected.value.split(':')[0]])
const importing = ref(false)
const importError = ref('')
const importController = new AbortController()

watch([query, prefix], () => {
  page.value = 0
}, { flush: 'sync' })
watch([query, prefix, page, retry], ([term, set, index], old, onCleanup) => {
  const controller = new AbortController()
  const { signal } = controller
  loading.value = true
  loadError.value = false
  selected.value = ''
  importError.value = ''
  results.value = []
  hasNext.value = false

  async function load() {
    try {
      if (!Object.keys(directory.value).length)
        directory.value = await loadDirectory(signal)
      const start = index * pageSize
      let icons: string[]
      if (term.trim()) {
        icons = await searchIcons(term.trim(), set, start, signal)
      }
      else {
        if (set && !collectionIcons.has(set))
          collectionIcons.set(set, await loadCollection(set, signal))
        const all = set ? collectionIcons.get(set)! : highlightIcons
        icons = all.slice(start, start + pageSize + 1)
      }
      if (!signal.aborted) {
        results.value = icons.slice(0, pageSize)
        hasNext.value = icons.length > pageSize
      }
    }
    catch {
      if (!signal.aborted)
        loadError.value = true
    }
    finally {
      if (!signal.aborted)
        loading.value = false
    }
  }

  const timer = window.setTimeout(load, term && term !== old[0] ? 250 : 0)
  onCleanup(() => {
    clearTimeout(timer)
    controller.abort()
  })
}, { immediate: true })

async function confirmImport() {
  if (!selected.value || importing.value)
    return
  importing.value = true
  importError.value = ''
  try {
    const icon = await loadIcon(selected.value)
    if (importController.signal.aborted)
      return
    try {
      const { attributes, body } = buildIcon(icon)
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${attributes.viewBox}">${body.replace(/currentColor/gi, '#27313b')}</svg>`
      props.importIcon(selected.value, svg)
    }
    catch {
      importError.value = 'This SVG could not be converted to 3D. Try another icon.'
      return
    }
    emit('close')
  }
  catch {
    if (!importController.signal.aborted)
      importError.value = 'Could not download this icon. Try importing again.'
  }
  finally {
    importing.value = false
  }
}

onMounted(() => dialog.value?.showModal())
onBeforeUnmount(() => {
  importController.abort()
  dialog.value?.close()
})
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" class="picker" aria-labelledby="library-title" @cancel.prevent="emit('close')" @click.self="emit('close')" @paste.stop>
      <div class="surface">
        <header flex="~ items-center gap-3">
          <span class="library-mark"><span i-carbon-catalog /></span>
          <h2 id="library-title" text-xl font-semibold>
            Iconify library
          </h2>
          <button class="icon-control ml-auto" type="button" aria-label="Close icon library" @click="emit('close')">
            <span i-carbon-close />
          </button>
        </header>
        <div class="filters">
          <label class="search-field">
            <span i-carbon-search shrink-0 />
            <input v-model="query" :disabled="importing" type="search" aria-label="Search icons" placeholder="Search icons…" autofocus>
          </label>
          <select v-model="prefix" :disabled="importing" aria-label="Icon collection">
            <option value="">
              All collections
            </option>
            <option v-for="[key, info] in collections" :key="key" :value="key">
              {{ info.name }}
            </option>
          </select>
        </div>
        <div class="results-bar">
          <h3 text-sm font-semibold>
            {{ query.trim() ? 'Search results' : prefix ? directory[prefix]?.name : 'Collection highlights' }}
          </h3>
          <div flex="~ items-center gap-2">
            <span text-xs>Page {{ page + 1 }}</span>
            <button class="icon-control" aria-label="Previous page" :disabled="!page || importing" @click="page--">
              <span i-carbon-chevron-left />
            </button>
            <button class="icon-control" aria-label="Next page" :disabled="!hasNext || importing" @click="page++">
              <span i-carbon-chevron-right />
            </button>
          </div>
        </div>
        <div :key="page" class="results" :aria-busy="loading">
          <div v-if="loading || loadError || !results.length" class="status" role="status">
            <span v-if="loading">Loading icons…</span>
            <template v-else-if="loadError">
              <span>Could not load the icon library.</span>
              <button underline cursor-pointer @click="retry++">
                Try again
              </button>
            </template>
            <span v-else>No icons found. Try a different search or collection.</span>
          </div>
          <div v-else class="tiles">
            <button
              v-for="id in results" :key="id" type="button" class="tile"
              :title="id" :aria-label="id" :aria-pressed="selected === id" :disabled="importing"
              @click="selected = id; importError = ''"
            >
              <span class="preview"><Icon :icon="id" mode="style" height="32" aria-hidden="true" /></span>
              <span w-full truncate>{{ id.split(':')[1] }}</span>
            </button>
          </div>
        </div>
        <footer>
          <p v-if="importError" class="import-error" role="alert">
            {{ importError }}
          </p>
          <div flex="~ items-center gap-3">
            <div v-if="selected" flex="~ col" min-w-0>
              <strong text-sm truncate :title="selected">{{ selected }}</strong>
              <span class="credit">
                {{ selectedSet?.name }}
                <template v-if="selectedSet?.license">
                  · <a v-if="selectedSet.license.url" :href="selectedSet.license.url" target="_blank" rel="noreferrer" underline>{{ selectedSet.license.title }}</a>
                  <template v-else>{{ selectedSet.license.title }}</template>
                </template>
              </span>
            </div>
            <span v-else class="credit">Select an icon to import</span>
            <button class="import-button" :disabled="!selected || importing" @click="confirmImport">
              {{ importing ? 'Importing…' : 'Import icon' }}
              <span i-carbon-arrow-right />
            </button>
          </div>
        </footer>
      </div>
    </dialog>
  </Teleport>
</template>

<style scoped>
.picker {
  --surface: #fff;
  --tile: #f6f7f6;
  --line: #dce0dc;
  --muted: #58625a;
  --accent: #b5df4a;
  width: min(720px, calc(100vw - 24px));
  max-height: none;
  margin: auto;
  padding: 0;
  border: 0;
  border-radius: 18px;
  background: var(--surface);
  color: #202722;
  box-shadow: 0 20px 80px #0004;
}
:global(.dark .picker) {
  --surface: #202622;
  --tile: #2a302c;
  --line: #454d47;
  --muted: #b0bbb3;
  color: #f0f3f0;
}
.picker::backdrop {
  background: #15201970;
  backdrop-filter: blur(4px);
}
.surface {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  height: min(620px, 90dvh);
  overflow: auto;
}
.library-mark,
.icon-control {
  display: grid;
  place-items: center;
  border-radius: 8px;
}
.library-mark {
  width: 36px;
  height: 36px;
  background: var(--accent);
  color: #243410;
  font-size: 20px;
}
.icon-control {
  width: 28px;
  height: 28px;
  cursor: pointer;
}
.icon-control:hover:enabled {
  background: var(--tile);
}
.icon-control:disabled {
  opacity: 0.3;
  cursor: default;
}
.filters {
  display: grid;
  grid-template-columns: 1fr minmax(130px, 34%);
  gap: 8px;
}
.search-field,
select {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--tile);
}
input,
select {
  min-width: 0;
  width: 100%;
}
input:focus {
  outline: none;
}
.search-field:focus-within,
.tile:focus-visible {
  outline: 2px solid var(--muted);
  outline-offset: 1px;
}
.results-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: var(--muted);
}
.results {
  flex: 1;
  min-height: 80px;
  overflow: auto;
}
.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(86px, 1fr));
  gap: 7px;
  padding: 3px;
}
.tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 0;
  height: 78px;
  padding: 7px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: var(--tile);
  font-size: 11px;
  cursor: pointer;
}
.tile img {
  width: 32px;
  height: 32px;
  object-fit: contain;
}
.tile:hover {
  border-color: var(--line);
}
.tile[aria-pressed='true'] {
  border-color: #83a334;
  background: color-mix(in srgb, var(--accent) 18%, var(--surface));
}
.status {
  height: 100%;
  display: grid;
  align-content: center;
  justify-items: center;
  gap: 8px;
  color: var(--muted);
  text-align: center;
}
footer {
  border-top: 1px solid var(--line);
  padding-top: 14px;
}
.credit {
  color: var(--muted);
  font-size: 12px;
}
.import-button {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
  margin-left: auto;
  padding: 9px 14px;
  border-radius: 8px;
  background: var(--accent);
  color: #243410;
  font-weight: 600;
  cursor: pointer;
}
.import-button:disabled {
  background: var(--tile);
  color: var(--muted);
  cursor: default;
}
.import-error {
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--muted);
}
@media (max-width: 480px) {
  .surface {
    padding: 14px;
    gap: 10px;
  }
  .filters {
    grid-template-columns: 1fr;
  }
  .tiles {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
