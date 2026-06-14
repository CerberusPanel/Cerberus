<script setup lang="ts">
import { computed, ref } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { useRoute, useRouter } from 'vue-router'
import { fontAwesomeIcons } from '../lib/fontawesome'

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
  icon: keyof typeof fontAwesomeIcons
  hasChildren?: boolean
}> = [
  { label: 'Dashboard', path: '/dashboard', icon: 'house' },
  { label: 'App Store', path: '/apps',  icon: 'store' },
  { label: 'Containers', path: '/containers', icon: 'boxesStacked' },
  { label: 'Settings', path: '/settings', icon: 'gear' },
]

onClickOutside(sidebarRef, () => {
  if (props.sidebarToggle && window.innerWidth < 1024) {
    emit('close')
  }
})

const isActive = (path: string) => route.path === path

const sidebarClass = computed(() =>
  props.sidebarToggle ? 'translate-x-0 lg:w-[90px]' : 'translate-x-full',
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
    class="sidebar fixed left-0 top-0 z-9999 flex h-screen w-[290px] flex-col overflow-y-hidden border-r border-slate-800 bg-slate-800 px-5 text-slate-100 shadow-2xl shadow-slate-950/30 duration-300 ease-linear dark:border-slate-800 dark:bg-slate-950 lg:translate-x-0"
  >
    <div
      :class="props.sidebarToggle ? 'justify-center' : 'justify-between'"
      class="sidebar-header flex items-center gap-2 pb-7 pt-8"
    >
      <RouterLink to="/dashboard">
          <span class="logo transition-opacity duration-300" :class="props.sidebarToggle ? 'hidden' : ''">
            <img src="/images/logo-light.svg" class="block dark:hidden" alt="Cerberus" />
            <img src="/images/logo-dark.svg" class="hidden dark:block" alt="Cerberus" />
          </span>
        <span
          :class="props.sidebarToggle ? 'lg:flex scale-110' : 'hidden'"
          class="logo-icon origin-center transform transition-transform duration-300"
        >
          <img src="/images/icon-light.svg" class="block dark:hidden" alt="Cerberus" />
          <img src="/images/icon-dark.svg" class="hidden dark:block" alt="Cerberus" />
        </span>
      </RouterLink>
    </div>

    <div class="no-scrollbar flex flex-col overflow-y-auto duration-300 ease-linear">
      <nav>
        <div>
          <ul class="mb-6 flex flex-col gap-4">
            <li v-for="item in items" :key="item.path">
              <button
                type="button"
                class="menu-item group w-full"
                :class="isActive(item.path) ? 'menu-item-active' : 'menu-item-inactive'"
                @click="go(item.path)"
              >
                <FontAwesomeIcon
                  :icon="fontAwesomeIcons[item.icon]"
                  :class="{
                    'menu-item-icon-active': isActive(item.path),
                    'menu-item-icon-inactive': !isActive(item.path),
                    'text-xl': props.sidebarToggle
                  }"
                />
                <span class="menu-item-text" :class="props.sidebarToggle ? 'lg:hidden' : ''">
                  {{ item.label }}
                </span>
                <FontAwesomeIcon
                  v-if="item.hasChildren"
                  class="menu-item-arrow"
                  :icon="fontAwesomeIcons.chevronRight"
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
