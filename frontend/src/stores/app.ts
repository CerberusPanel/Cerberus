import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { fetchBackendHealth } from '../services/api'

const HEARTBEAT_INTERVAL_MS = 5000

let heartbeatTimer: number | null = null
let heartbeatPromise: Promise<void> | null = null

export const useAppStore = defineStore('app', () => {
  const backendStatus = ref<'unknown' | 'online' | 'offline'>('unknown')
  const lastBackendCheckAt = ref<number | null>(null)

  const isBackendOffline = computed(() => backendStatus.value === 'offline')
  const isBackendOnline = computed(() => backendStatus.value === 'online')

  async function checkBackendHealth() {
    if (heartbeatPromise) {
      return heartbeatPromise
    }

    heartbeatPromise = (async () => {
      try {
        await fetchBackendHealth()
        backendStatus.value = 'online'
      } catch (error) {
        backendStatus.value = 'offline'
      } finally {
        lastBackendCheckAt.value = Date.now()
      }
    })()

    return heartbeatPromise.finally(() => {
      heartbeatPromise = null
    })
  }

  function startHeartbeat() {
    if (heartbeatTimer !== null) {
      return
    }

    void checkBackendHealth()
    heartbeatTimer = window.setInterval(() => {
      void checkBackendHealth()
    }, HEARTBEAT_INTERVAL_MS)
  }

  function stopHeartbeat() {
    if (heartbeatTimer === null) {
      return
    }

    window.clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }

  return {
    backendStatus,
    lastBackendCheckAt,
    isBackendOffline,
    isBackendOnline,
    checkBackendHealth,
    startHeartbeat,
    stopHeartbeat,
  }
})
