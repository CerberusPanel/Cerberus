<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { fontAwesomeIcons } from '../lib/fontawesome'
import {
  fetchInstalledApps,
  syncAllAppStores,
  type InstalledAppRecord,
} from '../services/api'

const router = useRouter()

const installedApps = ref<InstalledAppRecord[]>([])
const loadingInstalled = ref(true)
const refreshing = ref(false)
const syncingAll = ref(false)

function formatPorts(ports: NonNullable<InstalledAppRecord['container']>['Ports']) {
  if (!ports?.length) {
    return '—'
  }

  return ports
    .map((port) => {
      const host = port.PublicPort ? `${port.PublicPort}:` : ''
      const ip = port.IP && port.IP !== '0.0.0.0' ? `${port.IP}:` : ''
      return `${ip}${host}${port.PrivatePort}/${port.Type}`
    })
    .join(', ')
}

function formatCreatedAt(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function stateBadgeClass(active: boolean) {
  return active
    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
    : 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300'
}

async function loadInstalledApps() {
  loadingInstalled.value = true
  try {
    installedApps.value = await fetchInstalledApps()
  } catch (error) {
    installedApps.value = []
    ElMessage.error('Unable to load installed apps')
  } finally {
    loadingInstalled.value = false
  }
}

async function refreshInstalledApps() {
  refreshing.value = true
  try {
    await loadInstalledApps()
  } finally {
    refreshing.value = false
  }
}

async function syncAllStores() {
  syncingAll.value = true
  try {
    await syncAllAppStores()
    ElMessage.success('All stores synced.')
    await loadInstalledApps()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.details ?? 'Unable to sync all stores')
  } finally {
    syncingAll.value = false
  }
}

function openAppBrowser() {
  router.push('/apps/browser')
}

onMounted(async () => {
  await loadInstalledApps()
})
</script>

<template>
  <div class="space-y-6">
    <section class="rounded-2xl border border-gray-200 bg-white p-4 md:p-6 dark:border-gray-800 dark:bg-white/[0.03]">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div class="space-y-2">
          <div class="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-theme-xs font-medium text-brand-600 dark:border-brand-500/20 dark:bg-brand-500/10 dark:text-brand-300">
            <FontAwesomeIcon :icon="fontAwesomeIcons.shieldHalved" />
            Installed apps
          </div>
          <div>
            <h3 class="text-lg font-semibold text-gray-800 dark:text-white/90">App Store</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400">
              This page only shows apps recorded through Cerberus. Unknown containers are ignored.
            </p>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <button
            class="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-theme-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
            type="button"
            :disabled="syncingAll"
            @click="syncAllStores"
          >
            <FontAwesomeIcon :icon="fontAwesomeIcons.arrowsRotate" :class="{ 'animate-spin': syncingAll }" />
            {{ syncingAll ? 'Syncing…' : 'Sync all stores' }}
          </button>
          <button
            class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-theme-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
            type="button"
            @click="refreshInstalledApps"
          >
            {{ refreshing ? 'Refreshing…' : 'Refresh' }}
          </button>
          <button
            class="rounded-lg bg-brand-500 px-4 py-2 text-theme-sm font-medium text-white shadow-theme-xs hover:bg-brand-600"
            type="button"
            @click="openAppBrowser"
          >
            Install a new app
          </button>
        </div>
      </div>
    </section>

    <section class="rounded-2xl border border-gray-200 bg-white p-4 md:p-6 dark:border-gray-800 dark:bg-white/[0.03]">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-lg font-semibold text-gray-800 dark:text-white/90">Installed apps</h3>
          <p class="text-sm text-gray-500 dark:text-gray-400">Only apps recorded through Cerberus are shown here.</p>
        </div>
      </div>

      <div v-if="loadingInstalled" class="mt-6 rounded-xl border border-dashed border-gray-200 px-4 py-10 text-center text-theme-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
        Loading installed apps…
      </div>

      <div v-else class="mt-6 overflow-hidden rounded-xl border border-gray-100 dark:border-gray-800">
        <table class="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
          <thead class="bg-gray-50 dark:bg-white/[0.03]">
            <tr>
              <th class="px-4 py-3 text-left text-theme-xs font-medium text-gray-400">App</th>
              <th class="px-4 py-3 text-left text-theme-xs font-medium text-gray-400">Image</th>
              <th class="px-4 py-3 text-left text-theme-xs font-medium text-gray-400">Container</th>
              <th class="px-4 py-3 text-left text-theme-xs font-medium text-gray-400">Status</th>
              <th class="px-4 py-3 text-left text-theme-xs font-medium text-gray-400">Installed</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-transparent">
            <tr v-if="!installedApps.length">
              <td class="px-4 py-6 text-theme-sm text-gray-500 dark:text-gray-400" colspan="5">
                No installed apps have been recorded yet. Use the browser to add one.
              </td>
            </tr>
            <tr v-for="app in installedApps" :key="app.id" class="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
              <td class="px-4 py-4">
                <div class="font-medium text-gray-800 dark:text-white/90">{{ app.name }}</div>
                <div class="mt-1 text-theme-xs text-gray-400">{{ app.description }}</div>
                <div v-if="app.storeName" class="mt-1 text-theme-xs text-gray-500">
                  Store: {{ app.storeName }}
                </div>
              </td>
              <td class="px-4 py-4 text-theme-sm text-gray-500 dark:text-gray-400">{{ app.image }}</td>
              <td class="px-4 py-4">
                <div class="text-theme-sm text-gray-500 dark:text-gray-400">
                  <div v-if="app.container" class="font-medium text-gray-700 dark:text-gray-200">
                    {{ app.container.Names[0]?.replace(/^\//, '') || app.container.Id.slice(0, 12) }}
                  </div>
                  <div v-if="app.container" class="mt-1 text-theme-xs text-gray-400">
                    {{ formatPorts(app.container.Ports) }}
                  </div>
                  <div v-else class="font-medium text-gray-500 dark:text-gray-400">Not deployed yet</div>
                </div>
              </td>
              <td class="px-4 py-4">
                <span
                  class="inline-flex rounded-full px-2.5 py-1 text-theme-xs font-medium"
                  :class="stateBadgeClass(Boolean(app.container))"
                >
                  {{ app.container ? app.container.Status : 'Recorded only' }}
                </span>
              </td>
              <td class="px-4 py-4 text-theme-sm text-gray-500 dark:text-gray-400">
                {{ app.container ? formatCreatedAt(app.container.Created) : formatTimestamp(app.installedAt) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
