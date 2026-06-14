<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts'
import { onClickOutside, useEventListener } from '@vueuse/core'
import {
  fetchInstalledApps,
  fetchSystemStatus,
  type InstalledAppRecord,
  type MonitoringResponse,
  type SystemInfoResponse,
  type SystemStatusResponse,
} from '../services/api'

type MonitorMode = 'disk' | 'network'

type MonitorPoint = {
  time: string
  read: number
  write: number
}

type MonitorDevice = {
  name: string
  label: string
}

type RadialMetric = {
  key: string
  label: string
  value: number | null
  color: string
  tooltip: string
  footer: string
  animationKey: number
  animationDirection: 'up' | 'down'
}

const systemInfo = ref<SystemInfoResponse | null>(null)
const systemStatus = ref<SystemStatusResponse | null>(null)
const installedApps = ref<InstalledAppRecord[]>([])
const monitorMode = ref<MonitorMode>('disk')
const monitorDevice = ref('all')
const monitorDevices = ref<MonitorDevice[]>([])
const monitorHistory = ref<MonitorPoint[]>([])
const loadingMonitoring = ref(true)
const loadingOverview = ref(true)
const socketConnected = ref(false)
const monitoringSeriesState = ref<{ previous: Record<string, { read: number; write: number }> }>({
  previous: {},
})

const chartEl = ref<HTMLDivElement | null>(null)
let chart: echarts.ECharts | null = null
let socket: WebSocket | null = null
let reconnectTimer: number | undefined
let statusFallbackTimer: number | undefined
let overviewRefreshTimer: number | undefined
let isMounted = false
const lastSnapshotAt = ref(0)
const radialAnimationState = ref<Record<string, { tick: number; direction: 'up' | 'down' }>>({})
const publicIpReveal = ref(false)
const publicIpTrigger = ref<HTMLElement | null>(null)
const handleResize = () => chart?.resize()

const modeLabel = computed(() => (monitorMode.value === 'disk' ? 'Disk I/O' : 'Network I/O'))
const statusCpuBar = computed(() => systemStatus.value?.cpuUsagePercent ?? 0)
const statusCpuCoreBars = computed(() =>
  (systemStatus.value?.cpuCoreUsagePercent ?? []).map((value, index) => ({
    label: `Core ${index + 1}`,
    value,
  })),
)
const statusGpuBar = computed(() => systemStatus.value?.gpuUsagePercent)
const statusGpuVisible = computed(() => systemStatus.value?.gpuPresent ?? systemInfo.value?.gpuPresent ?? false)
const statusRamBar = computed(() => systemStatus.value?.memory.percent ?? 0)
const statusDriveBars = computed(() =>
  (systemStatus.value?.drives ?? []).map((drive) => {
    const total = drive.used + drive.available
    const value = total > 0 ? (drive.used / total) * 100 : drive.percent

    return {
      label: drive.name,
      value,
    }
  }),
)
const statusRadialMetrics = computed<RadialMetric[]>(() => {
  const metrics: RadialMetric[] = [
    {
      key: 'cpu',
      label: 'CPU',
      value: statusCpuBar.value,
      color: '#465fff',
      tooltip: cpuTooltipContent.value,
      footer: 'Utilisation',
      animationKey: radialAnimationState.value.cpu?.tick ?? 0,
      animationDirection: radialAnimationState.value.cpu?.direction ?? 'up',
    },
    {
      key: 'ram',
      label: 'RAM',
      value: statusRamBar.value,
      color: '#10b981',
      tooltip: ramTooltipContent.value,
      footer: 'Memory usage',
      animationKey: radialAnimationState.value.ram?.tick ?? 0,
      animationDirection: radialAnimationState.value.ram?.direction ?? 'up',
    },
  ]

  if (statusGpuVisible.value) {
    metrics.push({
      key: 'gpu',
      label: 'GPU',
      value: statusGpuBar.value ?? null,
      color: '#d946ef',
      tooltip: gpuTooltipContent.value,
      footer: 'Utilisation',
      animationKey: radialAnimationState.value.gpu?.tick ?? 0,
      animationDirection: radialAnimationState.value.gpu?.direction ?? 'up',
    })
  }

  metrics.push(
    ...statusDriveBars.value.map((drive) => ({
      key: `drive-${drive.label}`,
      label: drive.label,
      value: drive.value,
      color: '#f59e0b',
      tooltip: getDriveTooltip(drive),
      footer: 'Drive usage',
      animationKey: radialAnimationState.value[`drive-${drive.label}`]?.tick ?? 0,
      animationDirection: radialAnimationState.value[`drive-${drive.label}`]?.direction ?? 'up',
    })),
  )

  return metrics
})
const overviewStats = computed(() => {
  const apps = installedApps.value

  const installedCount = apps.length
  const problemCount = apps.filter((app) => isProblematicApp(app)).length
  const websiteCount = apps.filter((app) => isWebsiteApp(app)).length
  const aiModelCount = apps.filter((app) => isAiModelApp(app)).length

  return [
    {
      key: 'installed',
      label: 'Installed apps',
      value: installedCount,
      note: 'Recorded through Cerberus',
    },
    {
      key: 'problematic',
      label: 'Erroring / stalling',
      value: problemCount,
      note: 'Containers with issues',
    },
    {
      key: 'websites',
      label: 'Websites',
      value: websiteCount,
      note: 'Tagged as web apps',
    },
    {
      key: 'ai-models',
      label: 'AI models',
      value: aiModelCount,
      note: 'Tagged as AI / model apps',
    },
  ]
})

function formatBytes(value: number) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  let scaled = Math.abs(value)
  let unitIndex = 0

  while (scaled >= 1024 && unitIndex < units.length - 1) {
    scaled /= 1024
    unitIndex += 1
  }

  const formatted = scaled < 10 && unitIndex > 0 ? scaled.toFixed(2) : scaled.toFixed(1)
  return `${value < 0 ? '-' : ''}${formatted} ${units[unitIndex]}`
}

function formatStorageBytes(value: number) {
  if (value < 1000) return `${value.toFixed(0)} B`
  if (value < 1000 ** 2) return `${(value / 1000).toFixed(1)} KB`
  if (value < 1000 ** 3) return `${(value / 1000 ** 2).toFixed(1)} MB`
  if (value < 1000 ** 4) return `${(value / 1000 ** 3).toFixed(1)} GB`
  return `${(value / 1000 ** 4).toFixed(1)} TB`
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim().toLowerCase()
}

function normalizePercent(value: number | null | undefined) {
  return Math.max(0, Math.min(100, Number(value ?? 0)))
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return 'N/A'
  }

  return `${normalizePercent(value).toFixed(2)}%`
}

const RADIAL_RADIUS = 44
const RADIAL_CIRCUMFERENCE = 2 * Math.PI * RADIAL_RADIUS

function collectRadialValues(status: SystemStatusResponse | null | undefined) {
  const values: Record<string, number | null> = {
    cpu: status?.cpuUsagePercent ?? null,
    ram: status?.memory.percent ?? null,
    gpu: status?.gpuPresent ? status?.gpuUsagePercent ?? null : null,
  }

  for (const drive of status?.drives ?? []) {
    const total = drive.used + drive.available
    values[`drive-${drive.name}`] = total > 0 ? (drive.used / total) * 100 : drive.percent
  }

  return values
}

function updateRadialAnimations(
  previousStatus: SystemStatusResponse | null | undefined,
  nextStatus: SystemStatusResponse | null | undefined,
) {
  const previousValues = collectRadialValues(previousStatus)
  const nextValues = collectRadialValues(nextStatus)
  const nextState: Record<string, { tick: number; direction: 'up' | 'down' }> = {
    ...radialAnimationState.value,
  }

  for (const [key, nextValue] of Object.entries(nextValues)) {
    const previousValue = previousValues[key]

    if (nextValue === null || previousValue === null || nextValue === previousValue) {
      continue
    }

    const direction = nextValue > previousValue ? 'up' : 'down'
    nextState[key] = {
      tick: (nextState[key]?.tick ?? 0) + 1,
      direction,
    }
  }

  radialAnimationState.value = nextState
}

function radialRingStyle(value: number | null | undefined, color: string) {
  const normalized = normalizePercent(value)
  const dashOffset = RADIAL_CIRCUMFERENCE - (normalized / 100) * RADIAL_CIRCUMFERENCE

  return {
    stroke: color,
    strokeDasharray: `${RADIAL_CIRCUMFERENCE} ${RADIAL_CIRCUMFERENCE}`,
    strokeDashoffset: `${dashOffset}`,
  }
}

function getDriveTooltip(drive: { label: string; value: number }) {
  const source = systemStatus.value?.drives?.find((entry) => entry.name === drive.label)

  if (!source) {
    return drive.label
  }

  const mountpoints = source.mountpoints.length ? source.mountpoints.join(', ') : 'Unmapped'
  return [
    `Drive: ${source.name}`,
    `Size: ${formatStorageBytes(source.size)}`,
    `Used: ${formatStorageBytes(source.used)}`,
    `Free: ${formatStorageBytes(source.available)}`,
    `Usage: ${formatPercent(source.percent)}`,
    `System mount point: ${mountpoints}`,
  ].join('\n')
}

function isProblematicApp(app: InstalledAppRecord) {
  const statusText = normalizeText(app.container?.State) + ' ' + normalizeText(app.container?.Status)
  return /(exited|dead|restarting|unhealthy|paused|removing|created)/.test(statusText)
}

function isWebsiteApp(app: InstalledAppRecord) {
  const tokens = [app.category, ...(app.tags ?? []), app.name, app.description]
    .map(normalizeText)
    .join(' ')

  return /(website|web app|webapp|web|site|frontend|landing)/.test(tokens)
}

function isAiModelApp(app: InstalledAppRecord) {
  const tokens = [app.category, ...(app.tags ?? []), app.name, app.description]
    .map(normalizeText)
    .join(' ')

  return /(ai|llm|model|machine learning|ml|artificial intelligence)/.test(tokens)
}

const cpuTooltipContent = computed(() => {
  const info = systemInfo.value
  const lines = [
    `Manufacturer: ${info?.manufacturer ?? '—'}`,
    `Model: ${info?.model ?? '—'}`,
    `CPU: ${info?.cpu ?? '—'}`,
    `Cores: ${info?.cores ?? '—'}`,
  ]

  if (statusCpuCoreBars.value.length) {
    lines.push('', ...statusCpuCoreBars.value.map((core) => `${core.label}: ${formatPercent(core.value)}`))
  }

  return lines.join('\n')
})

onClickOutside(publicIpTrigger, () => {
  publicIpReveal.value = false
})

useEventListener(window, 'scroll', () => {
  publicIpReveal.value = false
}, { passive: true })

function togglePublicIpReveal() {
  if (!systemInfo.value?.publicIp) {
    return
  }

  publicIpReveal.value = !publicIpReveal.value
}

function revealPublicIp() {
  if (systemInfo.value?.publicIp) {
    publicIpReveal.value = true
  }
}

function hidePublicIp() {
  publicIpReveal.value = false
}

const ramTooltipContent = computed(() => {
  const memory = systemStatus.value?.memory

  if (!memory) {
    return 'Memory unavailable'
  }

  return [
    `Used: ${formatBytes(memory.used)}`,
    `Total: ${formatBytes(memory.total)}`,
    `Usage: ${formatPercent(memory.percent)}`,
  ].join('\n')
})

const gpuTooltipContent = computed(() => {
  if (!statusGpuVisible.value) {
    return ''
  }

  const gpu = systemInfo.value?.gpu ?? 'GPU detected'
  return `Model: ${gpu}\nUsage: ${statusGpuBar.value === null ? 'N/A' : formatPercent(statusGpuBar.value)}`
})

function loadChart() {
  if (!chartEl.value) return
  if (!chart) {
    chart = echarts.init(chartEl.value)
  }

  chart.setOption({
    tooltip: { trigger: 'axis' },
    legend: { textStyle: { color: '#475467' } },
    grid: { left: 16, right: 16, top: 40, bottom: 16, containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: monitorHistory.value.map((entry) => entry.time),
      axisLine: { lineStyle: { color: '#e4e7ec' } },
      axisLabel: { color: '#667085' },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        color: '#667085',
        formatter: (value: number) => formatBytes(value),
      },
      splitLine: { lineStyle: { color: '#f2f4f7' } },
    },
    series: [
      {
        name: 'Read',
        type: 'line',
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 3, color: '#465fff' },
        areaStyle: { color: 'rgba(70, 95, 255, 0.12)' },
        data: monitorHistory.value.map((entry) => entry.read),
      },
      {
        name: 'Write',
        type: 'line',
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 3, color: '#f79009' },
        areaStyle: { color: 'rgba(247, 144, 9, 0.10)' },
        data: monitorHistory.value.map((entry) => entry.write),
      },
    ],
  })
}

function selectDevice(key: string) {
  monitorDevice.value = key
  monitorHistory.value = []
  monitoringSeriesState.value.previous = {}
  loadChart()
}

function getSocketUrl() {
  return (
    import.meta.env.VITE_WS_URL ??
    `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`
  )
}

function calculateDeltas(snapshot: MonitoringResponse) {
  const devices = snapshot.items.map((item) => ({
    key: item.name,
    label: item.name,
    read:
      snapshot.mode === 'disk'
        ? Number(item.sectorsRead ?? 0) * 512
        : Number(item.rxBytes ?? 0),
    write:
      snapshot.mode === 'disk'
        ? Number(item.sectorsWritten ?? 0) * 512
        : Number(item.txBytes ?? 0),
  }))

  const source = devices.filter((device) => monitorDevice.value === 'all' || device.key === monitorDevice.value)

  const aggregate = source.reduce(
    (accumulator, device) => ({
      read: accumulator.read + device.read,
      write: accumulator.write + device.write,
    }),
    { read: 0, write: 0 },
  )

  const currentKey = monitorDevice.value
  const previous = monitoringSeriesState.value.previous[currentKey]
  const nextPoint = previous
    ? {
        time: new Date(snapshot.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        read: Math.max(0, aggregate.read - previous.read),
        write: Math.max(0, aggregate.write - previous.write),
      }
    : {
        time: new Date(snapshot.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        read: 0,
        write: 0,
      }

  monitoringSeriesState.value.previous[currentKey] = aggregate
  monitorHistory.value = [...monitorHistory.value.slice(-29), nextPoint]
}

async function loadOverviewApps() {
  loadingOverview.value = true
  try {
    installedApps.value = await fetchInstalledApps()
  } catch (error) {
    installedApps.value = []
  } finally {
    loadingOverview.value = false
  }
}

function applySnapshot(payload: {
  systemInfo: SystemInfoResponse
  systemStatus: SystemStatusResponse
  monitoring: MonitoringResponse
}) {
  lastSnapshotAt.value = Date.now()
  updateRadialAnimations(systemStatus.value, payload.systemStatus)
  systemInfo.value = payload.systemInfo
  systemStatus.value = payload.systemStatus
  monitorDevices.value = [
    { name: 'all', label: 'All' },
    ...payload.monitoring.items.map((item) => ({ name: item.name, label: item.name })),
  ]
  calculateDeltas(payload.monitoring)
  loadChart()
  loadingMonitoring.value = false
}

function connectSocket() {
  if (!isMounted) return
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return
  }

  socket = new WebSocket(getSocketUrl())

  socket.onopen = () => {
    socketConnected.value = true
    loadingMonitoring.value = true
    socket?.send(
      JSON.stringify({
        type: 'set-monitor-mode',
        mode: monitorMode.value,
      }),
    )
  }

  socket.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data as string) as
        | {
            type: 'dashboard-snapshot'
            systemInfo: SystemInfoResponse
            systemStatus: SystemStatusResponse
            monitoring: MonitoringResponse
          }
        | {
            type: 'dashboard-error'
            message: string
          }

      if (payload.type === 'dashboard-snapshot') {
        applySnapshot(payload)
      }
    } catch (error) {
      // ignore malformed frames and keep the last good snapshot
    }
  }

  socket.onclose = () => {
    socketConnected.value = false
    socket = null

    if (!isMounted) return

    if (reconnectTimer) {
      window.clearTimeout(reconnectTimer)
    }

    reconnectTimer = window.setTimeout(() => {
      connectSocket()
    }, 2000)
  }

  socket.onerror = () => {
    socketConnected.value = false
  }
}

async function refreshStatusFallback() {
  if (socketConnected.value && Date.now() - lastSnapshotAt.value < 2500) {
    return
  }

  try {
    const status = await fetchSystemStatus()
    updateRadialAnimations(systemStatus.value, status)
    systemStatus.value = status
  } catch (error) {
    // Keep the last good snapshot if the fallback refresh fails.
  }
}

watch(monitorMode, async () => {
  monitorDevice.value = 'all'
  monitorHistory.value = []
  monitoringSeriesState.value.previous = {}

  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(
      JSON.stringify({
        type: 'set-monitor-mode',
        mode: monitorMode.value,
      }),
    )
  }
})

onMounted(async () => {
  isMounted = true
  connectSocket()
  await loadOverviewApps()
  window.addEventListener('resize', handleResize)
  statusFallbackTimer = window.setInterval(() => {
    void refreshStatusFallback()
  }, 1000)
  overviewRefreshTimer = window.setInterval(() => {
    void loadOverviewApps()
  }, 15000)
})

onBeforeUnmount(() => {
  isMounted = false
  if (reconnectTimer) {
    window.clearTimeout(reconnectTimer)
  }
  if (statusFallbackTimer) {
    window.clearInterval(statusFallbackTimer)
  }
  if (overviewRefreshTimer) {
    window.clearInterval(overviewRefreshTimer)
  }
  socket?.close()
  window.removeEventListener('resize', handleResize)
  chart?.dispose()
})
</script>

<template>
  <div class="grid grid-cols-1 gap-6 xl:grid-cols-3">
    <div class="space-y-6 xl:col-span-2">
      <section class="rounded-2xl border border-gray-200 bg-white p-4 md:p-6 dark:border-gray-800 dark:bg-white/[0.03]">
        <div class="flex items-start justify-between">
          <div>
            <h3 class="text-lg font-semibold text-gray-800 dark:text-white/90">Overview</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400">
              Live snapshot of installed apps and app-store metadata.
            </p>
          </div>
        </div>
        <div class="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div
            v-for="stat in overviewStats"
            :key="stat.key"
            class="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.03]"
          >
            <div class="text-theme-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {{ stat.label }}
            </div>
            <div class="mt-3 text-3xl font-semibold text-gray-800 dark:text-white/90">
              {{ loadingOverview ? '—' : stat.value }}
            </div>
            <div class="mt-2 text-theme-xs text-gray-400 dark:text-gray-500">
              {{ stat.note }}
            </div>
          </div>
        </div>
      </section>

      <section class="rounded-2xl border border-gray-200 bg-white p-4 md:p-6 dark:border-gray-800 dark:bg-white/[0.03]">
        <div class="flex items-start justify-between">
          <div>
            <h3 class="text-lg font-semibold text-gray-800 dark:text-white/90">Status</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400">Auto-scanned every second.</p>
          </div>
        </div>
        <div class="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <el-tooltip
            v-for="metric in statusRadialMetrics"
            :key="metric.key"
            placement="top"
            effect="dark"
          >
            <template #content>
              <div class="whitespace-pre-line text-xs leading-5">{{ metric.tooltip }}</div>
            </template>
            <div class="rounded-xl border border-gray-100 p-4 dark:border-gray-800">
              <div class="flex items-center justify-between gap-4">
                <div class="text-theme-sm font-medium text-gray-700 dark:text-gray-300">{{ metric.label }}</div>
                <div class="text-theme-xs text-gray-500 dark:text-gray-400">{{ formatPercent(metric.value) }}</div>
              </div>
              <div class="mt-5 flex justify-center">
                <div class="relative h-32 w-32">
                  <svg class="h-32 w-32 -rotate-90" viewBox="0 0 100 100" aria-hidden="true">
                    <circle
                      cx="50"
                      cy="50"
                      r="44"
                      fill="none"
                      stroke="rgba(148, 163, 184, 0.22)"
                      stroke-width="8"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="44"
                      fill="none"
                      stroke-width="8"
                      stroke-linecap="round"
                      class="transition-[stroke-dashoffset] duration-200 ease-out"
                      :style="radialRingStyle(metric.value, metric.color)"
                    />
                  </svg>
                  <div class="absolute inset-0 flex items-center justify-center">
                    <div class="flex h-[74%] w-[74%] items-center justify-center rounded-full bg-white text-center dark:bg-gray-900">
                      <div class="flex flex-col items-center justify-center">
                        <div
                          class="radial-number-wrap text-lg font-semibold text-gray-800 dark:text-white/90"
                          :key="`${metric.key}-${metric.animationKey}`"
                          :class="metric.animationDirection === 'up' ? 'radial-number-up' : 'radial-number-down'"
                        >
                          {{ formatPercent(metric.value) }}
                        </div>
                        <div class="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                          {{ metric.footer }}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </el-tooltip>
          <div v-if="!statusRadialMetrics.length" class="text-theme-sm text-gray-400 dark:text-gray-500">
            No status data available.
          </div>
        </div>
    </section>

      <section class="rounded-2xl border border-gray-200 bg-white p-4 md:p-6 dark:border-gray-800 dark:bg-white/[0.03]">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 class="text-lg font-semibold text-gray-800 dark:text-white/90">Monitoring</h3>
          </div>

          <div class="flex flex-wrap items-center gap-3">
            <el-select v-model="monitorMode" class="min-w-[180px]" placeholder="Select mode">
              <el-option label="Disk I/O" value="disk" />
              <el-option label="Network I/O" value="network" />
            </el-select>

            <el-select v-model="monitorDevice" class="min-w-[220px]" placeholder="Select device" @change="selectDevice">
              <el-option
                v-for="device in monitorDevices"
                :key="device.name"
                :label="device.label"
                :value="device.name"
              />
            </el-select>
          </div>
        </div>

        <div class="mt-6 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
          <span class="rounded-full bg-brand-50 px-3 py-1 text-brand-500 dark:bg-brand-500/10 dark:text-brand-400">{{ modeLabel }}</span>
          <span>Device: {{ monitorDevice === 'all' ? 'All' : monitorDevice }}</span>
          <span v-if="loadingMonitoring">Loading…</span>
        </div>

        <div ref="chartEl" class="mt-4 h-[360px] w-full" />

        <div class="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div class="rounded-xl bg-gray-50 p-4 text-center dark:bg-white/[0.03]">
            <div class="text-theme-xs text-gray-500 dark:text-gray-400">Latest Read</div>
            <div class="mt-1 text-theme-sm font-semibold text-gray-800 dark:text-white/90">
              {{ monitorHistory.length ? `${formatBytes(monitorHistory.at(-1)?.read ?? 0)}/s` : '—' }}
            </div>
          </div>
          <div class="rounded-xl bg-gray-50 p-4 text-center dark:bg-white/[0.03]">
            <div class="text-theme-xs text-gray-500 dark:text-gray-400">Latest Write</div>
            <div class="mt-1 text-theme-sm font-semibold text-gray-800 dark:text-white/90">
              {{ monitorHistory.length ? `${formatBytes(monitorHistory.at(-1)?.write ?? 0)}/s` : '—' }}
            </div>
          </div>
        </div>
      </section>
    </div>

    <section class="rounded-2xl border border-gray-200 bg-white p-4 md:p-6 dark:border-gray-800 dark:bg-white/[0.03] xl:sticky xl:top-6 xl:self-start">
      <div class="flex items-start justify-between">
        <div>
          <h3 class="text-lg font-semibold text-gray-800 dark:text-white/90">System Information</h3>
          <p class="text-sm text-gray-500 dark:text-gray-400">Updated from the backend every second.</p>
        </div>
      </div>
      <div class="mt-6 grid gap-3">
        <div class="flex items-center justify-between border-b border-gray-100 py-2 dark:border-gray-800">
          <span class="text-theme-sm text-gray-500 dark:text-gray-400">Hostname</span>
          <span class="text-theme-sm font-medium text-gray-800 dark:text-white/90">{{ systemInfo?.hostname ?? '—' }}</span>
        </div>
        <div class="flex items-center justify-between border-b border-gray-100 py-2 dark:border-gray-800">
          <span class="text-theme-sm text-gray-500 dark:text-gray-400">OS</span>
          <span class="text-theme-sm font-medium text-gray-800 dark:text-white/90">{{ systemInfo?.os ?? '—' }}</span>
        </div>
        <div class="flex items-center justify-between border-b border-gray-100 py-2 dark:border-gray-800">
          <span class="text-theme-sm text-gray-500 dark:text-gray-400">Kernel</span>
          <span class="text-theme-sm font-medium text-gray-800 dark:text-white/90">{{ systemInfo?.kernel ?? '—' }}</span>
        </div>
        <div class="flex items-center justify-between border-b border-gray-100 py-2 dark:border-gray-800">
          <span class="text-theme-sm text-gray-500 dark:text-gray-400">Architecture</span>
          <span class="text-theme-sm font-medium text-gray-800 dark:text-white/90">{{ systemInfo?.architecture ?? '—' }}</span>
        </div>
        <div class="flex items-center justify-between border-b border-gray-100 py-2 dark:border-gray-800">
          <span class="text-theme-sm text-gray-500 dark:text-gray-400">Manufacturer</span>
          <span class="text-theme-sm font-medium text-gray-800 dark:text-white/90">{{ systemInfo?.manufacturer ?? '—' }}</span>
        </div>
        <div class="flex items-center justify-between border-b border-gray-100 py-2 dark:border-gray-800">
          <span class="text-theme-sm text-gray-500 dark:text-gray-400">Model</span>
          <span class="text-theme-sm font-medium text-gray-800 dark:text-white/90">{{ systemInfo?.model ?? '—' }}</span>
        </div>
        <div class="flex items-center justify-between border-b border-gray-100 py-2 dark:border-gray-800">
          <span class="text-theme-sm text-gray-500 dark:text-gray-400">CPU</span>
          <span class="text-theme-sm font-medium text-gray-800 dark:text-white/90">{{ systemInfo?.cpu ?? '—' }}</span>
        </div>
        <div class="flex items-center justify-between border-b border-gray-100 py-2 dark:border-gray-800">
          <span class="text-theme-sm text-gray-500 dark:text-gray-400">Local IP</span>
          <span class="text-theme-sm font-medium text-gray-800 dark:text-white/90">
            {{ systemInfo?.localIp ?? '—' }}
          </span>
        </div>
        <div class="flex items-center justify-between border-b border-gray-100 py-2 dark:border-gray-800">
          <span class="text-theme-sm text-gray-500 dark:text-gray-400">Public IP</span>
          <button
            ref="publicIpTrigger"
            type="button"
            class="text-theme-sm font-medium text-gray-800 transition duration-150 ease-out focus:outline-none dark:text-white/90"
            :class="systemInfo?.publicIp ? [publicIpReveal ? 'blur-none' : 'blur-sm', 'cursor-pointer select-none'] : ''"
            @click="togglePublicIpReveal"
            @mouseenter="revealPublicIp"
            @mouseleave="hidePublicIp"
            @focus="revealPublicIp"
            @blur="hidePublicIp"
          >
            {{ systemInfo?.publicIp ?? 'Unavailable' }}
          </button>
        </div>
        <div v-if="systemInfo?.gpuPresent" class="flex items-center justify-between py-2">
          <span class="text-theme-sm text-gray-500 dark:text-gray-400">GPU / Cores</span>
          <span class="text-theme-sm font-medium text-gray-800 dark:text-white/90">
            {{ systemInfo?.gpu ?? 'GPU detected' }} · {{ systemInfo?.cores ?? '—' }}
          </span>
        </div>
        <div v-else class="flex items-center justify-between py-2">
          <span class="text-theme-sm text-gray-500 dark:text-gray-400">Cores</span>
          <span class="text-theme-sm font-medium text-gray-800 dark:text-white/90">
            {{ systemInfo?.cores ?? '—' }}
          </span>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.dashboard-masonry {
  column-count: 1;
  column-gap: 24px;
}

.masonry-card {
  display: inline-block;
  width: 100%;
  margin: 0 0 24px;
  break-inside: avoid;
}

@media (min-width: 1280px) {
  .dashboard-masonry {
    column-count: 2;
  }
}
</style>
