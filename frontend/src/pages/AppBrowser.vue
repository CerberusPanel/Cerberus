<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  ArrowLeft,
  Boxes,
  Download,
  Shield,
  Terminal,
  Workflow,
  BookOpenText,
  Sparkles,
  X,
} from 'lucide-vue-next'
import { useAuthStore } from '../stores/auth'
import {
  fetchAppCatalog,
  fetchAppCatalogItem,
  fetchAppStores,
  addAppStore,
  syncAppStore,
  type AppCatalogItem,
  type AppStoreRecord,
} from '../services/api'

const router = useRouter()
const auth = useAuthStore()

const iconMap = {
  boxes: Boxes,
  shield: Shield,
  terminal: Terminal,
  workflow: Workflow,
}
const catalog = ref<AppCatalogItem[]>([])
const stores = ref<AppStoreRecord[]>([])
const loadingCatalog = ref(true)
const loadingStores = ref(true)
const refreshing = ref(false)
const syncingStores = ref(false)
const selectedApp = ref<AppCatalogItem | null>(null)
const installTarget = ref<AppCatalogItem | null>(null)
const detailsOpen = ref(false)
const installOpen = ref(false)
const storeOpen = ref(false)
const addingStore = ref(false)
const storeForm = ref({
  name: '',
  repoUrl: '',
  branch: 'main',
})
const canManageStores = computed(() => auth.user?.role === 'master')

const selectedReadme = computed(() => selectedApp.value?.readme ?? 'README not available yet.')

function getCatalogIcon(iconName: string) {
  return iconMap[iconName as keyof typeof iconMap] ?? Boxes
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

async function loadStores() {
  loadingStores.value = true
  try {
    stores.value = await fetchAppStores()
  } catch (error) {
    stores.value = []
  } finally {
    loadingStores.value = false
  }
}

async function refreshCatalog() {
  refreshing.value = true
  try {
    await loadCatalog()
    await loadStores()
  } finally {
    refreshing.value = false
  }
}

async function syncRegisteredStores() {
  syncingStores.value = true
  try {
    await loadStores()
  } finally {
    syncingStores.value = false
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

function openStoreDialog() {
  storeOpen.value = true
}

function closeStoreDialog() {
  storeOpen.value = false
  storeForm.value = {
    name: '',
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
      name: storeForm.value.name.trim(),
      repoUrl: storeForm.value.repoUrl.trim(),
      branch: storeForm.value.branch.trim() || 'main',
    })
    ElMessage.success('App store added and synced.')
    await Promise.all([loadStores(), loadCatalog()])
    closeStoreDialog()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.details ?? 'Unable to add app store')
  } finally {
    addingStore.value = false
  }
}

async function syncStore(storeId: string) {
  try {
    await syncAppStore(storeId)
    ElMessage.success('Store synced.')
    await Promise.all([loadStores(), loadCatalog()])
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.details ?? 'Unable to sync store')
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

onMounted(async () => {
  await Promise.all([loadCatalog(), loadStores()])
})
</script>

<template>
  <div class="space-y-6">
    <section class="rounded-2xl border border-gray-200 bg-white p-4 md:p-6 dark:border-gray-800 dark:bg-white/[0.03]">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div class="space-y-2">
          <div class="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-theme-xs font-medium text-brand-600 dark:border-brand-500/20 dark:bg-brand-500/10 dark:text-brand-300">
            <Sparkles class="h-4 w-4" />
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
            <ArrowLeft class="h-4 w-4" />
            Installed apps
          </button>
          <button
            class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-theme-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
            type="button"
            @click="refreshCatalog"
          >
            {{ refreshing ? 'Refreshing…' : 'Refresh' }}
          </button>
          <button
            v-if="canManageStores"
            class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-theme-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
            type="button"
            @click="openStoreDialog"
          >
            Add store
          </button>
        </div>
      </div>
    </section>

    <section class="rounded-2xl border border-gray-200 bg-white p-4 md:p-6 dark:border-gray-800 dark:bg-white/[0.03]">
      <div class="flex items-center justify-between gap-3">
        <div>
          <h3 class="text-lg font-semibold text-gray-800 dark:text-white/90">Linked stores</h3>
          <p class="text-sm text-gray-500 dark:text-gray-400">
            The official repository is mounted into Cerberus, and linked GitHub stores are cached locally after sync.
          </p>
        </div>
          <button
            class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-theme-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
            type="button"
            @click="syncRegisteredStores"
          >
            {{ syncingStores ? 'Syncing…' : 'Reload stores' }}
          </button>
      </div>

      <div v-if="loadingStores" class="mt-6 rounded-xl border border-dashed border-gray-200 px-4 py-10 text-center text-theme-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
        Loading stores…
      </div>

      <div v-else-if="!stores.length" class="mt-6 rounded-xl border border-dashed border-gray-200 px-4 py-10 text-center text-theme-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
        No GitHub stores are linked yet.
      </div>

      <div v-else class="mt-6 grid gap-4 lg:grid-cols-2">
        <article
          v-for="store in stores"
          :key="store.id"
          class="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.03]"
        >
          <div class="flex items-start justify-between gap-4">
            <div>
              <div class="flex items-center gap-2">
                <h4 class="font-semibold text-gray-800 dark:text-white/90">{{ store.name }}</h4>
                <span class="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:bg-white/[0.06] dark:text-gray-300">
                  {{ store.type }}
                </span>
              </div>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {{ store.repoUrl ?? store.rootPath }}
              </p>
            </div>
            <div class="text-right">
              <div class="text-xs uppercase tracking-wide text-gray-400">Apps</div>
              <div class="text-lg font-semibold text-gray-800 dark:text-white/90">{{ store.appCount ?? 0 }}</div>
            </div>
          </div>

          <div class="mt-4 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <span class="rounded-full bg-white px-2.5 py-1 dark:bg-gray-900/40">
              {{ store.ready ? 'Ready' : 'Not synced yet' }}
            </span>
            <span v-if="store.lastSyncedAt" class="rounded-full bg-white px-2.5 py-1 dark:bg-gray-900/40">
              Synced {{ new Date(store.lastSyncedAt).toLocaleString() }}
            </span>
          </div>

          <div v-if="store.type === 'github' && canManageStores" class="mt-4 flex justify-end">
            <button
              class="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-3.5 py-2 text-theme-sm font-medium text-white shadow-theme-xs transition hover:bg-brand-600"
              type="button"
              @click="syncStore(store.id)"
            >
              Sync
            </button>
          </div>
        </article>
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
                <div :class="['flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm', app.accent]">
                  <component :is="getCatalogIcon(app.icon)" class="h-5 w-5" />
                </div>
                <div>
                  <h4 class="font-semibold text-gray-800 dark:text-white/90">{{ app.name }}</h4>
                  <p class="text-theme-xs text-gray-400 dark:text-gray-500">
                    {{ app.image }}
                    <span v-if="app.storeName"> · {{ app.storeName }}</span>
                  </p>
                </div>
              </div>
              <span
                v-if="app.version || app.defaultVersion"
                class="rounded-full bg-gray-100 px-2.5 py-1 text-theme-xs font-medium text-gray-600 dark:bg-white/[0.06] dark:text-gray-300"
              >
                v{{ app.version ?? app.defaultVersion }}
              </span>
            </div>
            <p class="mt-4 text-sm leading-6 text-gray-500 dark:text-gray-400">{{ app.description }}</p>
          </button>

          <div class="mt-4 flex flex-wrap gap-2">
            <span
              v-for="highlight in app.highlights"
              :key="highlight"
              class="rounded-full bg-gray-100 px-2.5 py-1 text-theme-xs font-medium text-gray-600 dark:bg-white/[0.06] dark:text-gray-300"
            >
              {{ highlight }}
            </span>
          </div>

          <div class="mt-6 flex items-center justify-between gap-3">
            <button
              class="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3.5 py-2 text-theme-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
              type="button"
              @click="openAppDetails(app)"
            >
              <BookOpenText class="h-4 w-4" />
              README
            </button>

            <button
              class="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-3.5 py-2 text-theme-sm font-medium text-white shadow-theme-xs transition hover:bg-brand-600"
              type="button"
              @click="openInstallDialog(app)"
            >
              <Download class="h-4 w-4" />
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
            <div :class="['flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white', selectedApp?.accent ?? 'from-gray-500 to-gray-400']">
              <component :is="selectedApp ? getCatalogIcon(selectedApp.icon) : Boxes" class="h-5 w-5" />
            </div>
            <div>
              <div class="text-lg font-semibold text-gray-800 dark:text-white/90">{{ selectedApp?.name }}</div>
              <div class="text-sm text-gray-500 dark:text-gray-400">
                {{ selectedApp?.image }} · v{{ selectedApp?.version ?? selectedApp?.defaultVersion ?? '—' }}
              </div>
            </div>
          </div>

          <button
            class="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03]"
            type="button"
            @click="closeDetails"
          >
            <X class="h-4 w-4" />
          </button>
        </div>

        <div class="flex-1 overflow-y-auto px-5 py-5">
          <div class="space-y-4">
            <div class="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.03]">
              <p class="whitespace-pre-wrap text-sm leading-7 text-gray-600 dark:text-gray-300">
                {{ selectedReadme }}
              </p>
            </div>

            <div class="flex items-center justify-between gap-3">
              <div class="text-theme-sm text-gray-500 dark:text-gray-400">
                Need the guided installer? Open it from here when you’re ready.
              </div>
              <button
                class="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-theme-sm font-medium text-white shadow-theme-xs hover:bg-brand-600"
                type="button"
                @click="selectedApp && openInstallDialog(selectedApp)"
              >
                <Download class="h-4 w-4" />
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
            <div :class="['flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white', installTarget?.accent ?? 'from-gray-500 to-gray-400']">
              <component :is="installTarget ? getCatalogIcon(installTarget.icon) : Boxes" class="h-5 w-5" />
            </div>
            <div>
              <div class="text-lg font-semibold text-gray-800 dark:text-white/90">Guided install</div>
              <div class="text-sm text-gray-500 dark:text-gray-400">
                {{ installTarget?.name }} · v{{ installTarget?.version ?? installTarget?.defaultVersion ?? '—' }}
              </div>
            </div>
          </div>

          <button
            class="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03]"
            type="button"
            @click="closeInstallDialog"
          >
            <X class="h-4 w-4" />
          </button>
        </div>

        <div class="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          <div class="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm leading-6 text-gray-600 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-300">
            The install workflow is ready for wiring to live deployment logic.
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
            <Download class="h-4 w-4" />
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
            <X class="h-4 w-4" />
          </button>
        </div>

        <div class="flex-1 overflow-y-auto px-5 py-5">
          <div class="space-y-4">
            <div>
              <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300" for="store-name">Store name</label>
              <input
                id="store-name"
                v-model="storeForm.name"
                type="text"
                placeholder="GitHub store name"
                class="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-none dark:border-gray-800 dark:text-white/90 dark:placeholder:text-white/30"
              />
            </div>

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
              GitHub stores are synced locally before use. The repository must use the Cerberus app layout with app folders containing `data.yml` and version bundles.
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
