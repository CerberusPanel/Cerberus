<script setup lang="ts">
  import { computed, ref } from 'vue'
  import Sidebar from '../components/Sidebar.vue'
  import TopBar from '../components/TopBar.vue'

  const sidebarToggle = ref(false)

  const contentPaddingClass = computed(() => (sidebarToggle.value ? 'lg:pl-[90px]' : 'lg:pl-[290px]'))
</script>

<template>
  <div class="min-h-screen bg-gray-50 text-gray-700 dark:bg-gray-950 dark:text-gray-400 duration-300 ease-linear">
    <div class="min-h-screen">
      <Sidebar :sidebar-toggle="sidebarToggle" @close="sidebarToggle = false" />

      <div class="flex min-w-0 flex-1 flex-col" :class="contentPaddingClass">
        <TopBar :sidebar-toggle="sidebarToggle" @toggle-sidebar="sidebarToggle = !sidebarToggle" />

        <main class="flex-1 overflow-y-auto px-3 py-3 sm:px-5 sm:py-5 lg:px-6">
          <div class="mx-auto max-w-[1600px]">
            <router-view />
          </div>
        </main>
      </div>
    </div>
  </div>
</template>
