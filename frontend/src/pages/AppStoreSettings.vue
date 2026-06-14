<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { fontAwesomeIcons } from '../lib/fontawesome'
import {
  fetchAppStores,
  syncAllAppStores,
  syncAppStore,
  type AppStoreRecord,
} from '../services/api'

const router = useRouter()

const stores = ref<AppStoreRecord[]>([])
const loadingStores = ref(true)
const syncingAll = ref(false)
const syncingStoreId = ref<string | null>(null)

function goBack() {
  router.push('/apps/browser')
}

async function loadStores() {
  loadingStores.value = true
  try {
    stores.value = await fetchAppStores()
  } catch (error) {
    stores.value = []
    ElMessage.error('Unable to load app stores')
  } finally {
    loadingStores.value = false
  }
}

async function syncOne(storeId: string) {
  syncingStoreId.value = storeId
  try {
    await syncAppStore(storeId)
    ElMessage.success('Store synced.')
    await loadStores()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.details ?? 'Unable to sync store')
  } finally {
    syncingStoreId.value = null
  }
}

async function syncAll() {
  syncingAll.value = true
  try {
    await syncAllAppStores()
    ElMessage.success('All stores synced.')
    await loadStores()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.details ?? 'Unable to sync all stores')
  } finally {
    syncingAll.value = false
  }
}

function storeBadgeClass(store: AppStoreRecord) {
  if (store.cacheStatus === 'ready' && store.ready) {
    return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
  }

  if (store.cacheStatus === 'syncing') {
    return 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'
  }

  return 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300'
}

onMounted(async () => {
  await loadStores()
})
</script>

<template>
  <div class="space-y-6">
    <section class="rounded-2xl border border-gray-200 bg-white p-4 md:p-6 dark:border-gray-800 dark:bg-white/[0.03]">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div class="space-y-2">
          <div class="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-theme-xs font-medium text-brand-600 dark:border-brand-500/20 dark:bg-brand-500/10 dark:text-brand-300">
            <FontAwesomeIcon :icon="fontAwesomeIcons.gear" />
            Store management
          </div>
          <div>
            <h1 class="text-2xl font-bold text-gray-800 dark:text-white/90">App store settings</h1>
            <p class="text-sm text-gray-500 dark:text-gray-400">
              Sync the catalog from each connected repository and keep the database up to date.
            </p>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <button
            class="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-theme-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
            type="button"
            :disabled="loadingStores || syncingAll"
            @click="syncAll"
          >
            <FontAwesomeIcon :icon="fontAwesomeIcons.arrowsRotate" :class="{ 'animate-spin': syncingAll }" />
            {{ syncingAll ? 'Syncing…' : 'Sync all stores' }}
          </button>
          <button
            class="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-theme-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
            type="button"
            @click="goBack"
          >
            <FontAwesomeIcon :icon="fontAwesomeIcons.arrowLeft" />
            Back to browser
          </button>
        </div>
      </div>
    </section>

    <section class="rounded-2xl border border-gray-200 bg-white p-4 md:p-6 dark:border-gray-800 dark:bg-white/[0.03]">
      <div class="flex items-center justify-between gap-4">
        <div>
          <h3 class="text-lg font-semibold text-gray-800 dark:text-white/90">Connected stores</h3>
          <p class="text-sm text-gray-500 dark:text-gray-400">
            These stores live in the database and are refreshed from their Git repositories.
          </p>
        </div>
        <div class="text-theme-xs text-gray-400 dark:text-gray-500">
          {{ stores.length }} store{{ stores.length === 1 ? '' : 's' }}
        </div>
      </div>

      <div v-if="loadingStores" class="mt-6 rounded-xl border border-dashed border-gray-200 px-4 py-10 text-center text-theme-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
        Loading stores…
      </div>

      <div v-else class="mt-6 overflow-hidden rounded-xl border border-gray-100 dark:border-gray-800">
        <table class="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
          <thead class="bg-gray-50 dark:bg-white/[0.03]">
            <tr>
              <th class="px-4 py-3 text-left text-theme-xs font-medium text-gray-400">Store</th>
              <th class="px-4 py-3 text-left text-theme-xs font-medium text-gray-400">Source</th>
              <th class="px-4 py-3 text-left text-theme-xs font-medium text-gray-400">Status</th>
              <th class="px-4 py-3 text-left text-theme-xs font-medium text-gray-400">Apps</th>
              <th class="px-4 py-3 text-left text-theme-xs font-medium text-gray-400">Last sync</th>
              <th class="px-4 py-3 text-left text-theme-xs font-medium text-gray-400">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-transparent">
            <tr v-if="!stores.length">
              <td class="px-4 py-6 text-theme-sm text-gray-500 dark:text-gray-400" colspan="6">
                No stores are connected yet.
              </td>
            </tr>
            <tr v-for="store in stores" :key="store.id" class="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
              <td class="px-4 py-4">
                <div class="flex items-center gap-3">
                  <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-500 dark:bg-brand-500/10 dark:text-brand-400">
                    <FontAwesomeIcon :icon="fontAwesomeIcons.store" />
                  </div>
                  <div>
                    <div class="font-medium text-gray-800 dark:text-white/90">{{ store.name }}</div>
                    <div class="mt-1 text-theme-xs text-gray-400">{{ store.id }}</div>
                  </div>
                </div>
              </td>
              <td class="px-4 py-4 text-theme-sm text-gray-500 dark:text-gray-400">
                <div>{{ store.type }}</div>
                <div class="mt-1 text-theme-xs">{{ store.repoUrl || '—' }}</div>
                <div v-if="store.branch" class="mt-1 text-theme-xs">Branch: {{ store.branch }}</div>
              </td>
              <td class="px-4 py-4">
                <span class="inline-flex rounded-full px-2.5 py-1 text-theme-xs font-medium" :class="storeBadgeClass(store)">
                  {{ store.cacheStatus }}
                </span>
              </td>
              <td class="px-4 py-4 text-theme-sm text-gray-500 dark:text-gray-400">
                {{ store.appCount ?? 0 }}
              </td>
              <td class="px-4 py-4 text-theme-sm text-gray-500 dark:text-gray-400">
                {{ store.lastSyncedAt ? new Date(store.lastSyncedAt).toLocaleString() : 'Never' }}
              </td>
              <td class="px-4 py-4">
                <button
                  class="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-theme-xs font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                  type="button"
                  :disabled="syncingStoreId === store.id"
                  @click="syncOne(store.id)"
                >
                  <FontAwesomeIcon :icon="fontAwesomeIcons.arrowsRotate" :class="{ 'animate-spin': syncingStoreId === store.id }" />
                  {{ syncingStoreId === store.id ? 'Syncing…' : 'Sync' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
