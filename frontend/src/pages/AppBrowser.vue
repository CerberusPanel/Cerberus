<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { fontAwesomeIcons } from '../lib/fontawesome'
import {
  fetchAppCatalog,
  fetchAppCatalogItem,
  addAppStore,
  type AppCatalogItem,
} from '../services/api'

const router = useRouter()

const iconMap = {
  boxes: fontAwesomeIcons.boxesStacked,
  shield: fontAwesomeIcons.shieldHalved,
  terminal: fontAwesomeIcons.terminal,
  workflow: fontAwesomeIcons.sitemap,
}
const catalog = ref<AppCatalogItem[]>([])
const loadingCatalog = ref(true)
const syncing = ref(false)
const selectedApp = ref<AppCatalogItem | null>(null)
const installTarget = ref<AppCatalogItem | null>(null)
const detailsOpen = ref(false)
const installOpen = ref(false)
const storeOpen = ref(false)
const addingStore = ref(false)
const storeForm = ref({
  repoUrl: '',
  branch: 'main',
})

const selectedReadme = computed(() => selectedApp.value?.readme ?? 'README not available yet.')
const formattedReadme = computed(() => renderMarkdown(selectedReadme.value))
const selectedVersions = computed(() =>
  selectedApp.value?.versions
    ?.map((version) => ({
      tag: String(version.tag ?? '').trim(),
      label: String(version.label ?? '').trim() || String(version.tag ?? '').trim(),
    }))
    .filter((version) => Boolean(version.tag)) ?? [],
)
const selectedLinks = computed(() => {
  const manifestLinks =
    selectedApp.value?.links && typeof selectedApp.value.links === 'object' && !Array.isArray(selectedApp.value.links)
      ? Object.entries(selectedApp.value.links)
          .map(([label, url]) => ({ label, url }))
          .filter((entry) => Boolean(entry.label) && Boolean(entry.url))
      : []

  return manifestLinks
})
const selectedPorts = computed(() =>
  selectedApp.value?.deployments?.[0]?.ports ?? [],
)
const selectedVolumes = computed(() =>
  selectedApp.value?.deployments?.[0]?.volumes ?? [],
)
const selectedEnvironmentEntries = computed(() => {
  const environment = selectedApp.value?.deployments?.[0]?.environment
  if (!Array.isArray(environment)) {
    return []
  }

  return environment
})

function getCatalogIcon(iconName: string) {
  return iconMap[iconName as keyof typeof iconMap] ?? fontAwesomeIcons.boxesStacked
}

function formatVersionLabel(version: string | number | null | undefined) {
  const value = String(version ?? '').trim()
  if (!value) {
    return ''
  }

  return /^\d/.test(value) ? `v${value}` : value
}

function formatVersionTitle(version: { tag: string; label: string }) {
  return version.label || formatVersionLabel(version.tag)
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function sanitizeHtml(value: string) {
  return value
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\son\w+=(["']).*?\1/gi, '')
    .replace(/\s(href|src)=(["'])javascript:.*?\2/gi, '')
}

function renderInlineMarkdown(value: string) {
  return value
    .replace(
      /\[\[!\[([^\]]*)]\(([^)]+)\)]\([^)]+\)]\(([^)]+)\)/g,
      (_match, alt: string, imageUrl: string, linkUrl: string) =>
        `<a href="${escapeHtml(linkUrl)}" target="_blank" rel="noreferrer" class="inline-block align-middle"><img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(alt)}" class="inline-block max-h-8 max-w-full align-middle" /></a>`,
    )
    .replace(
      /\[!\[([^\]]*)]\(([^)]+)\)]\(([^)]+)\)/g,
      (_match, alt: string, imageUrl: string, linkUrl: string) =>
        `<a href="${escapeHtml(linkUrl)}" target="_blank" rel="noreferrer" class="inline-block align-middle"><img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(alt)}" class="inline-block max-h-8 max-w-full align-middle" /></a>`,
    )
    .replace(
      /!\[([^\]]*)]\(([^)]+)\)/g,
      (_match, alt: string, imageUrl: string) =>
        `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(alt)}" class="inline-block max-h-8 max-w-full align-middle" />`,
    )
    .replace(
      /\[([^\]]+)]\(([^)]+)\)/g,
      (_match, label: string, linkUrl: string) =>
        `<a href="${escapeHtml(linkUrl)}" target="_blank" rel="noreferrer" class="text-brand-600 hover:underline dark:text-brand-300">${label}</a>`,
    )
    .replace(/`([^`]+)`/g, '<code class="rounded bg-gray-100 px-1 py-0.5 text-[0.85em] dark:bg-white/[0.08]">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-gray-800 dark:text-white/90">$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
}

function getAdmonitionClass(type: string) {
  const styles: Record<string, string> = {
    note: 'border-brand-400 bg-brand-50 text-brand-700 dark:border-brand-500/60 dark:bg-brand-500/10 dark:text-brand-200',
    tip: 'border-success-500 bg-success-50 text-success-500 dark:border-success-500/60 dark:bg-success-500/10 dark:text-success-500',
    important: 'border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-500/60 dark:bg-brand-500/10 dark:text-brand-200',
    warning: 'border-warning-500 bg-warning-50 text-warning-500 dark:border-warning-500/60 dark:bg-warning-500/10 dark:text-warning-500',
    caution: 'border-error-500 bg-error-50 text-error-500 dark:border-error-500/60 dark:bg-error-500/10 dark:text-error-500',
  }

  return styles[type] ?? styles.note
}

function renderMarkdown(markdown: string) {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  const html: string[] = []
  let listType: 'ul' | 'ol' | null = null
  let inBlockquote = false
  let inCodeBlock = false
  let codeLines: string[] = []

  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`)
      listType = null
    }
  }

  const closeBlockquote = () => {
    if (inBlockquote) {
      html.push('</blockquote>')
      inBlockquote = false
    }
  }

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        html.push(`<pre class="overflow-x-auto rounded-lg bg-gray-900 p-3 text-xs leading-6 text-gray-100"><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`)
        codeLines = []
      } else {
        closeList()
        closeBlockquote()
      }
      inCodeBlock = !inCodeBlock
      continue
    }

    if (inCodeBlock) {
      codeLines.push(line)
      continue
    }

    const trimmed = line.trim()
    if (!trimmed) {
      closeList()
      closeBlockquote()
      continue
    }

    const quote = trimmed.match(/^>\s?(.*)$/)
    if (quote) {
      closeList()
      const admonition = quote[1].match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)]\s*$/i)
      if (admonition) {
        closeBlockquote()
        const type = admonition[1].toLowerCase()
        html.push(`<blockquote class="space-y-2 rounded-lg border-l-4 p-4 not-italic ${getAdmonitionClass(type)}">`)
        html.push(`<p class="text-xs font-semibold uppercase tracking-wide">${escapeHtml(type)}</p>`)
        inBlockquote = true
        continue
      }

      if (!inBlockquote) {
        html.push('<blockquote class="space-y-2 border-l-4 border-gray-300 pl-4 italic text-gray-500 dark:border-gray-700 dark:text-gray-400">')
        inBlockquote = true
      }
      html.push(`<p>${renderInlineMarkdown(quote[1])}</p>`)
      continue
    }

    closeBlockquote()

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/)
    if (heading) {
      closeList()
      const level = heading[1].length
      const sizeClass = level === 1 ? 'text-xl' : level === 2 ? 'text-lg' : 'text-base'
      html.push(`<h${level} class="${sizeClass} mt-4 first:mt-0 font-semibold text-gray-800 dark:text-white/90">${renderInlineMarkdown(heading[2])}</h${level}>`)
      continue
    }

    const unordered = trimmed.match(/^[-*]\s+(.+)$/)
    const ordered = trimmed.match(/^\d+\.\s+(.+)$/)
    if (unordered || ordered) {
      const nextListType = unordered ? 'ul' : 'ol'
      if (listType !== nextListType) {
        closeList()
        listType = nextListType
        const listClass = nextListType === 'ul' ? 'list-disc' : 'list-decimal'
        html.push(`<${nextListType} class="${listClass} space-y-1 pl-5">`)
      }
      html.push(`<li>${renderInlineMarkdown((unordered ?? ordered)?.[1] ?? '')}</li>`)
      continue
    }

    closeList()
    html.push(`<p>${renderInlineMarkdown(trimmed)}</p>`)
  }

  closeList()
  closeBlockquote()
  if (inCodeBlock) {
    html.push(`<pre class="overflow-x-auto rounded-lg bg-gray-900 p-3 text-xs leading-6 text-gray-100"><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`)
  }

  return sanitizeHtml(html.join(''))
}

function getPrimaryVersionTag(app: AppCatalogItem | null | undefined) {
  return app?.deployments?.[0]?.version ?? app?.versions?.[0]?.tag ?? null
}

function formatPort(port: { host: number; container: number; label?: string } | string) {
  if (typeof port === 'string') {
    return port
  }

  const label = port.label ? `${port.label}: ` : ''
  return `${label}${port.host}:${port.container}`
}

function formatVolume(volume: { host: string; container: string; label?: string } | string) {
  if (typeof volume === 'string') {
    return volume
  }

  const label = volume.label ? `${volume.label}: ` : ''
  return `${label}${volume.host} → ${volume.container}`
}

async function loadCatalog() {
  loadingCatalog.value = true
  try {
    catalog.value = await fetchAppCatalog()
  } catch (error) {
    catalog.value = []
  } finally {
    loadingCatalog.value = false
  }
}

async function refreshCatalog() {
  syncing.value = true
  try {
    await loadCatalog()
  } finally {
    syncing.value = false
  }
}

async function openAppDetails(app: AppCatalogItem) {
  try {
    selectedApp.value = await fetchAppCatalogItem(app.id)
  } catch (error) {
    selectedApp.value = app
  }
  detailsOpen.value = true
}

function closeDetails() {
  detailsOpen.value = false
  selectedApp.value = null
}

function openInstallDialog(app: AppCatalogItem) {
  installTarget.value = app
  installOpen.value = true
}

function closeInstallDialog() {
  installOpen.value = false
  installTarget.value = null
}

function closeStoreDialog() {
  storeOpen.value = false
  storeForm.value = {
    repoUrl: '',
    branch: 'main',
  }
}

async function submitStore() {
  if (!storeForm.value.repoUrl.trim()) {
    ElMessage.warning('Please provide a GitHub repository link.')
    return
  }

  addingStore.value = true
  try {
    await addAppStore({
      repoUrl: storeForm.value.repoUrl.trim(),
      branch: storeForm.value.branch.trim() || 'main',
    })
    ElMessage.success('Store added and synced.')
    await loadCatalog()
    closeStoreDialog()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.details ?? 'Unable to add app store')
  } finally {
    addingStore.value = false
  }
}

async function confirmInstall() {
  if (!installTarget.value) {
    return
  }

  ElMessage.info(`${installTarget.value.name} install wiring is not connected yet.`)
  closeInstallDialog()
}

function goBack() {
  router.push('/apps')
}

function openStoreManager() {
  router.push('/apps/settings')
}

onMounted(async () => {
  await loadCatalog()
})
</script>

<template>
  <div class="space-y-6">
    <section class="rounded-2xl border border-gray-200 bg-white p-4 md:p-6 dark:border-gray-800 dark:bg-white/[0.03]">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div class="space-y-2">
          <div class="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-theme-xs font-medium text-brand-600 dark:border-brand-500/20 dark:bg-brand-500/10 dark:text-brand-300">
            <FontAwesomeIcon :icon="fontAwesomeIcons.sparkles" />
            App browser
          </div>
          <div>
            <h3 class="text-lg font-semibold text-gray-800 dark:text-white/90">Install a new app</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400">
              Browse the official repository or any linked GitHub stores, read their README, then open the install drawer.
            </p>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <button
            class="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-theme-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
            type="button"
            @click="goBack"
          >
            <FontAwesomeIcon :icon="fontAwesomeIcons.arrowLeft" />
            Installed apps
          </button>
          <button
            class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-theme-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
            type="button"
            @click="refreshCatalog"
          >
            {{ syncing ? 'Syncing...' : 'Sync' }}
          </button>
          <button
            class="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-theme-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
            type="button"
            @click="openStoreManager"
          >
            <FontAwesomeIcon :icon="fontAwesomeIcons.gear" />
            Manage stores
          </button>
        </div>
      </div>
    </section>

    <section class="space-y-4 rounded-2xl border border-gray-200 bg-white p-4 md:p-6 dark:border-gray-800 dark:bg-white/[0.03]">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-lg font-semibold text-gray-800 dark:text-white/90">Catalog</h3>
          <p class="text-sm text-gray-500 dark:text-gray-400">
            Click an app to open its README. Click install to open the guided installer drawer.
          </p>
        </div>
        <div class="text-theme-xs text-gray-400 dark:text-gray-500">
          {{ catalog.length }} app{{ catalog.length === 1 ? '' : 's' }}
        </div>
      </div>

      <div v-if="loadingCatalog" class="rounded-xl border border-dashed border-gray-200 px-4 py-10 text-center text-theme-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
        Loading app browser…
      </div>

      <div v-else-if="!catalog.length" class="rounded-xl border border-dashed border-gray-200 px-4 py-10 text-center text-theme-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
        No apps found in the official repository or linked stores.
      </div>

      <div v-else class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article
          v-for="app in catalog"
          :key="app.id"
          class="group flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-4 shadow-theme-xs transition hover:-translate-y-0.5 hover:shadow-lg dark:border-gray-800 dark:bg-white/[0.03]"
        >
          <button type="button" class="text-left" @click="openAppDetails(app)">
            <div class="flex items-start justify-between gap-3">
              <div class="flex items-center gap-3">
                <div :class="['flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br text-white shadow-sm']">
                  <img
                    v-if="app.logo"
                    :src="app.logo"
                    :alt="`${app.name} logo`"
                    class="h-full w-full object-cover"
                  />
                  <FontAwesomeIcon v-else :icon="getCatalogIcon(app.logo ? app.logo : '')" />
                </div>
                <div>
                  <h4 class="font-semibold text-gray-800 dark:text-white/90">{{ app.name }}</h4>
                </div>
              </div>
            </div>
            <div class="mt-4 space-y-2">
              <p
                class="text-sm leading-6 text-gray-500 dark:text-gray-400"
                style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-clamp: 2;"
              >
                {{ app.description }}
              </p>
              <p
                v-if="app.category"
                class="text-theme-xs text-gray-500 dark:text-gray-400"
                style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-clamp: 2;"
              >
                Category: {{ app.category }}
              </p>
              <p
                v-if="app.tags?.length"
                class="text-theme-xs text-gray-500 dark:text-gray-400"
                style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-clamp: 2;"
              >
                Tags: {{ app.tags.join(', ') }}
              </p>
            </div>
          </button>

          <div class="mt-6 flex items-center justify-between gap-3">
            <button
              class="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3.5 py-2 text-theme-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
              type="button"
              @click="openAppDetails(app)"
            >
              <FontAwesomeIcon :icon="fontAwesomeIcons.bookOpen" />
              README
            </button>

            <button
              class="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-3.5 py-2 text-theme-sm font-medium text-white shadow-theme-xs transition hover:bg-brand-600"
              type="button"
              @click="openInstallDialog(app)"
            >
              <FontAwesomeIcon :icon="fontAwesomeIcons.download" />
              Install
            </button>
          </div>
        </article>
      </div>
    </section>

    <el-drawer
      v-model="detailsOpen"
      direction="rtl"
      size="min(980px, 96vw)"
      :with-header="false"
      destroy-on-close
      @closed="closeDetails"
    >
      <div class="flex h-full flex-col">
        <div class="flex items-start justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <div class="flex items-center gap-3">
            <div :class="['flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white from-gray-500 to-gray-400']">
              <FontAwesomeIcon :icon="selectedApp ? getCatalogIcon(selectedApp.logo ? selectedApp.logo : '') : fontAwesomeIcons.boxesStacked" />
            </div>
            <div>
              <div class="text-lg font-semibold text-gray-800 dark:text-white/90">{{ selectedApp?.name }}</div>
              <div class="text-sm text-gray-500 dark:text-gray-400">
                {{ selectedApp?.image ?? '—' }}<span v-if="getPrimaryVersionTag(selectedApp)">
                </span>
              </div>
            </div>
          </div>

          <button
            class="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03]"
            type="button"
            @click="closeDetails"
          >
            <FontAwesomeIcon :icon="fontAwesomeIcons.xmark" />
          </button>
        </div>

        <div class="flex-1 overflow-y-auto px-5 py-5">
          <div class="space-y-4">

            <div class="grid gap-4 md:grid-cols-2">
              <div class="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
                <div class="mb-2 text-sm font-semibold text-gray-800 dark:text-white/90">Versions</div>
                <div v-if="selectedVersions.length" class="flex flex-wrap gap-2">
                  <span
                    v-for="version in selectedVersions"
                    :key="version.tag"
                    class="rounded-full bg-gray-100 px-2.5 py-1 text-theme-xs font-medium text-gray-600 dark:bg-white/[0.06] dark:text-gray-300"
                  >
                    {{ formatVersionTitle(version) }}
                  </span>
                </div>
                <div v-else class="text-theme-sm text-gray-500 dark:text-gray-400">No versions listed.</div>
              </div>

              <div class="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
                <div class="mb-2 text-sm font-semibold text-gray-800 dark:text-white/90">Links</div>
                <div v-if="selectedLinks.length" class="space-y-2">
                  <a
                    v-for="link in selectedLinks"
                    :key="`${link.label}-${link.url}`"
                    :href="link.url"
                    class="flex items-center gap-2 text-theme-sm text-brand-600 hover:underline dark:text-brand-300"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <FontAwesomeIcon :icon="fontAwesomeIcons.link" />
                    <span>{{ link.label }}</span>
                  </a>
                </div>
                <div v-else class="text-theme-sm text-gray-500 dark:text-gray-400">No links listed.</div>
              </div>

              <div class="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
                <div class="mb-2 text-sm font-semibold text-gray-800 dark:text-white/90">Ports</div>
                <div v-if="selectedPorts.length" class="flex flex-wrap gap-2">
                  <span
                    v-for="port in selectedPorts"
                    :key="formatPort(port)"
                    class="rounded-full bg-gray-100 px-2.5 py-1 text-theme-xs font-medium text-gray-600 dark:bg-white/[0.06] dark:text-gray-300"
                  >
                    {{ formatPort(port) }}
                  </span>
                </div>
                <div v-else class="text-theme-sm text-gray-500 dark:text-gray-400">No ports listed.</div>
              </div>

              <div class="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
                <div class="mb-2 text-sm font-semibold text-gray-800 dark:text-white/90">Volumes</div>
                <div v-if="selectedVolumes.length" class="space-y-2">
                  <div
                    v-for="volume in selectedVolumes"
                    :key="formatVolume(volume)"
                    class="rounded-lg bg-gray-100 px-3 py-2 text-theme-xs text-gray-600 dark:bg-white/[0.06] dark:text-gray-300"
                  >
                    {{ formatVolume(volume) }}
                  </div>
                </div>
                <div v-else class="text-theme-sm text-gray-500 dark:text-gray-400">No volumes listed.</div>
              </div>
            </div>

            <div class="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.03]">
              <div
                class="space-y-3 text-sm leading-7 text-gray-600 dark:text-gray-300"
                v-html="formattedReadme"
              />
            </div>

            <div
              v-if="selectedEnvironmentEntries.length"
              class="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]"
            >
                <div class="mb-3 text-sm font-semibold text-gray-800 dark:text-white/90">Environment</div>
                <div class="grid gap-3 md:grid-cols-2">
                  <div
                    v-for="entry in selectedEnvironmentEntries"
                    :key="entry.name"
                    class="rounded-lg bg-gray-100 px-3 py-2 text-theme-xs text-gray-600 dark:bg-white/[0.06] dark:text-gray-300"
                  >
                    <div class="font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      {{ entry.label || entry.name }}
                    </div>
                    <div class="mt-1 whitespace-pre-wrap break-words">{{ entry.value }}</div>
                  </div>
                </div>
              </div>

            <div class="flex items-center justify-between gap-3">
              <div class="text-theme-sm text-gray-500 dark:text-gray-400"> </div>
              <button
                class="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-theme-sm font-medium text-white shadow-theme-xs hover:bg-brand-600"
                type="button"
                @click="selectedApp && openInstallDialog(selectedApp)"
              >
                <FontAwesomeIcon :icon="fontAwesomeIcons.download" />
                Install
              </button>
            </div>
          </div>
        </div>
      </div>
    </el-drawer>

    <el-drawer
      v-model="installOpen"
      direction="rtl"
      size="min(520px, 88vw)"
      :with-header="false"
      destroy-on-close
      @closed="closeInstallDialog"
    >
      <div class="flex h-full flex-col">
        <div class="flex items-start justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <div class="flex items-center gap-3">
            <div :class="['flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white from-gray-500 to-gray-400']">
              <FontAwesomeIcon :icon="installTarget ? getCatalogIcon(installTarget.logo ? installTarget.logo : '') : fontAwesomeIcons.boxesStacked" />
            </div>
            <div>
              <div class="text-lg font-semibold text-gray-800 dark:text-white/90">Guided install</div>
              <div class="text-sm text-gray-500 dark:text-gray-400">
                {{ installTarget?.name }}<span v-if="getPrimaryVersionTag(installTarget)">
                  · {{ formatVersionLabel(getPrimaryVersionTag(installTarget)) }}
                </span>
              </div>
            </div>
          </div>

          <button
            class="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03]"
            type="button"
            @click="closeInstallDialog"
          >
            <FontAwesomeIcon :icon="fontAwesomeIcons.xmark" />
          </button>
        </div>

        <div class="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          <div class="space-y-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
            <div class="text-sm font-semibold text-gray-800 dark:text-white/90">Manifest snapshot</div>
            <div class="grid gap-3">
              <div class="flex items-center justify-between gap-3 border-b border-gray-100 pb-2 dark:border-gray-800">
                <span class="text-theme-sm text-gray-500 dark:text-gray-400">Versions</span>
                <span class="text-theme-sm font-medium text-gray-800 dark:text-white/90">
                  {{ selectedVersions.length ? selectedVersions.map((version) => formatVersionTitle(version)).join(', ') : '—' }}
                </span>
              </div>
              <div class="flex items-start justify-between gap-3 border-b border-gray-100 pb-2 dark:border-gray-800">
                <span class="text-theme-sm text-gray-500 dark:text-gray-400">Ports</span>
                <span class="text-theme-sm font-medium text-gray-800 dark:text-white/90 text-right">
                  {{ selectedPorts.length ? selectedPorts.map((port) => formatPort(port)).join(', ') : '—' }}
                </span>
              </div>
              <div class="flex items-start justify-between gap-3 border-b border-gray-100 pb-2 dark:border-gray-800">
                <span class="text-theme-sm text-gray-500 dark:text-gray-400">Volumes</span>
                <span class="text-theme-sm font-medium text-gray-800 dark:text-white/90 text-right">
                  {{ selectedVolumes.length ? selectedVolumes.map((volume) => formatVolume(volume)).join(', ') : '—' }}
                </span>
              </div>
              <div class="flex items-start justify-between gap-3">
                <span class="text-theme-sm text-gray-500 dark:text-gray-400">Links</span>
                <span class="text-theme-sm font-medium text-gray-800 dark:text-white/90 text-right">
                  {{ selectedLinks.length ? selectedLinks.map((link) => link.label).join(', ') : '—' }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div class="flex items-center justify-between gap-3 border-t border-gray-200 px-5 py-4 dark:border-gray-800">
          <button
            class="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-theme-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
            type="button"
            @click="closeInstallDialog"
          >
            Cancel
          </button>
          <button
            class="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-theme-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-400/70"
            type="button"
            :disabled="!installTarget"
            @click="confirmInstall"
          >
            <FontAwesomeIcon :icon="fontAwesomeIcons.download" />
            Continue
          </button>
        </div>
      </div>
    </el-drawer>

    <el-drawer
      v-model="storeOpen"
      direction="rtl"
      size="min(560px, 90vw)"
      :with-header="false"
      destroy-on-close
      @closed="closeStoreDialog"
    >
      <div class="flex h-full flex-col">
        <div class="flex items-start justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <div>
            <div class="text-lg font-semibold text-gray-800 dark:text-white/90">Add app store</div>
            <div class="text-sm text-gray-500 dark:text-gray-400">Add a GitHub repository that follows the Cerberus app layout.</div>
          </div>

          <button
            class="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03]"
            type="button"
            @click="closeStoreDialog"
          >
            <FontAwesomeIcon :icon="fontAwesomeIcons.xmark" />
          </button>
        </div>

        <div class="flex-1 overflow-y-auto px-5 py-5">
          <div class="space-y-4">
            <div>
              <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300" for="store-url">GitHub link</label>
              <input
                id="store-url"
                v-model="storeForm.repoUrl"
                type="url"
                placeholder="https://github.com/owner/repository"
                class="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-none dark:border-gray-800 dark:text-white/90 dark:placeholder:text-white/30"
              />
            </div>

            <div>
              <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300" for="store-branch">Branch</label>
              <input
                id="store-branch"
                v-model="storeForm.branch"
                type="text"
                placeholder="main"
                class="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-none dark:border-gray-800 dark:text-white/90 dark:placeholder:text-white/30"
              />
            </div>

            <div class="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm leading-6 text-gray-600 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-300">
              GitHub stores are synced before use. The repository must use the Cerberus app layout with one manifest per app in `apps/*.yml`.
            </div>
          </div>
        </div>

        <div class="flex items-center justify-between gap-3 border-t border-gray-200 px-5 py-4 dark:border-gray-800">
          <button
            class="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-theme-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
            type="button"
            @click="closeStoreDialog"
          >
            Cancel
          </button>
          <button
            class="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-theme-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-400/70"
            type="button"
            :disabled="addingStore"
            @click="submitStore"
          >
            {{ addingStore ? 'Adding…' : 'Add store' }}
          </button>
        </div>
      </div>
    </el-drawer>
  </div>
</template>
