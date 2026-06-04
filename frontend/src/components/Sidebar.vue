<script setup lang="ts">
import { computed, ref } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { useRoute, useRouter } from 'vue-router'
import {
  Boxes,
  LayoutDashboard,
  PackageSearch,
  Settings,
  ChevronRight,
  ServerCog,
} from 'lucide-vue-next'

const props = defineProps<{
  sidebarToggle: boolean
}>()

const emit = defineEmits<{
  (event: 'close'): void
}>()

const sidebarRef = ref<HTMLElement | null>(null)
const route = useRoute()
const router = useRouter()

const items: Array<{
  label: string
  path: string
  icon: typeof LayoutDashboard
  hasChildren?: boolean
}> = [
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { label: 'App Store', path: '/apps',  icon: PackageSearch },
  { label: 'Containers', path: '/containers', icon: Boxes },
  { label: 'Settings', path: '/settings', icon: Settings },
]

onClickOutside(sidebarRef, () => {
  if (props.sidebarToggle && window.innerWidth < 1024) {
    emit('close')
  }
})

const isActive = (path: string) => route.path === path

const sidebarClass = computed(() =>
  props.sidebarToggle ? 'translate-x-0 lg:w-[90px]' : '-translate-x-full',
)

function go(path: string) {
  router.push(path)
  if (window.innerWidth < 1024) {
    emit('close')
  }
}
</script>

<template>
  <aside
    ref="sidebarRef"
    :class="sidebarClass"
    class="sidebar fixed left-0 top-0 z-9999 flex h-screen w-[290px] flex-col overflow-y-hidden border-r border-gray-200 bg-white px-5 duration-300 ease-linear dark:border-gray-800 dark:bg-black lg:translate-x-0"
  >
    <div
      :class="props.sidebarToggle ? 'justify-center' : 'justify-between'"
      class="sidebar-header flex items-center gap-2 pb-7 pt-8"
    >
      <RouterLink to="/dashboard">
        <span class="logo" :class="props.sidebarToggle ? 'hidden' : ''">
          <img class="dark:hidden" src="/images/logo/logo.svg" alt="Cerberus" />
          <img class="hidden dark:block" src="/images/logo/logo-dark.svg" alt="Cerberus" />
        </span>
        <img
          class="logo-icon"
          :class="props.sidebarToggle ? 'lg:block' : 'hidden'"
          src="/images/logo/logo-icon.svg"
          alt="Cerberus"
        />
      </RouterLink>
    </div>

    <div class="no-scrollbar flex flex-col overflow-y-auto duration-300 ease-linear">
      <nav>
        <div>
          <h3 class="mb-4 text-xs uppercase leading-[20px] text-gray-400">
            <span class="menu-group-title" :class="props.sidebarToggle ? 'lg:hidden' : ''">MENU</span>
            <ServerCog
              :size="24"
              :class="props.sidebarToggle ? 'lg:block hidden' : 'hidden'"
              class="menu-group-icon mx-auto"
            />
          </h3>

          <ul class="mb-6 flex flex-col gap-4">
            <li v-for="item in items" :key="item.path">
              <button
                type="button"
                class="menu-item group w-full"
                :class="isActive(item.path) ? 'menu-item-active' : 'menu-item-inactive'"
                @click="go(item.path)"
              >
                <component
                  :is="item.icon"
                  :size="24"
                  :class="isActive(item.path) ? 'menu-item-icon-active' : 'menu-item-icon-inactive'"
                />
                <span class="menu-item-text" :class="props.sidebarToggle ? 'lg:hidden' : ''">
                  {{ item.label }}
                </span>
                <ChevronRight
                  v-if="item.hasChildren"
                  :size="20"
                  class="menu-item-arrow"
                  :class="[isActive(item.path) ? 'menu-item-arrow-active' : 'menu-item-arrow-inactive', props.sidebarToggle ? 'lg:hidden' : '']"
                />
              </button>
            </li>
          </ul>
        </div>
      </nav>
    </div>
  </aside>
</template>
