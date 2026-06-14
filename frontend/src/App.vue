<script setup lang="ts">
  import { useAppStore } from './stores/app'

  const app = useAppStore()
</script>

<template>
  <router-view />

  <div
    v-if="app.isBackendOffline"
    class="fixed inset-0 z-[99999] flex items-center justify-center bg-gray-950/70 px-4 backdrop-blur-sm"
    role="alert"
    aria-live="assertive"
  >
    <div class="w-full max-w-md rounded-2xl border border-error-500/30 bg-white p-6 text-center shadow-theme-lg dark:bg-gray-900">
      <div class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-error-50 text-error-500 dark:bg-error-500/10">
        !
      </div>
      <h1 class="text-xl font-semibold text-gray-900 dark:text-white">
        Backend is down
      </h1>
      <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
        The Cerberus backend is offline and will need to be restarted.
      </p>
      <p class="mt-4 text-xs text-gray-500 dark:text-gray-500">
        This page will keep checking automatically.
      </p>
    </div>
  </div>
</template>
