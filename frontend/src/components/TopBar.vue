<script setup lang="ts">
import { computed, ref } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { useRouter } from 'vue-router'
import { useTheme } from '../composables/useTheme'
import { useAuthStore } from '../stores/auth'
import { useAppStore } from '../stores/app'
import { fontAwesomeIcons } from '../lib/fontawesome'

const props = defineProps<{
  sidebarToggle: boolean
}>()

const emit = defineEmits<{
  (event: 'toggle-sidebar'): void
}>()

const { theme, setTheme } = useTheme()
const auth = useAuthStore()
const app = useAppStore()
const router = useRouter()
const notificationsOpen = ref(false)
const profileOpen = ref(false)
const themeOpen = ref(false)
const themeMenuRef = ref<HTMLElement | null>(null)
const notificationsMenuRef = ref<HTMLElement | null>(null)
const profileMenuRef = ref<HTMLElement | null>(null)

const themeLabel = computed(() => {
  if (theme.value === 'dark') return 'Dark'
  if (theme.value === 'light') return 'Light'
  return 'System'
})
const userLabel = computed(() => auth.displayName)
const userInitials = computed(() => {
  const value = userLabel.value.trim()
  if (!value) return 'U'
  return value
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2)
})

async function logout() {
  profileOpen.value = false
  auth.logout()
  await router.push('/login')
}

function setSelectedTheme(value: 'light' | 'dark' | 'system') {
  setTheme(value)
  themeOpen.value = false
}

onClickOutside(themeMenuRef, () => {
  themeOpen.value = false
})

onClickOutside(notificationsMenuRef, () => {
  notificationsOpen.value = false
})

onClickOutside(profileMenuRef, () => {
  profileOpen.value = false
})
</script>

<template>
  <header
    class="sticky top-0 z-20 flex w-full border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"
  >
    <div class="flex w-full items-center justify-between gap-2 px-3 py-3 sm:gap-4 lg:px-6 lg:py-4">
      <div
        class="flex min-w-0 flex-1 items-center justify-between gap-2 border-b border-gray-200 dark:border-gray-800 lg:justify-normal lg:border-b-0"
      >
        <button
          class="z-99999 flex h-10 w-10 items-center justify-center rounded-lg border-gray-200 text-gray-500 lg:h-11 lg:w-11 lg:border dark:text-gray-400"
          :class="props.sidebarToggle ? 'lg:bg-transparent dark:lg:bg-transparent bg-gray-100 dark:bg-gray-800' : ''"
          type="button"
          @click.stop="emit('toggle-sidebar')"
        >
          <FontAwesomeIcon v-if="!props.sidebarToggle" :icon="fontAwesomeIcons.bars" />
          <FontAwesomeIcon v-else :icon="fontAwesomeIcons.xmark" />
        </button>

        <RouterLink to="/dashboard" class="lg:hidden flex items-center gap-2">
          <img class="h-8 block dark:hidden" src="/images/icon-light.svg" alt="Cerberus" />
          <img class="h-8 hidden dark:block" src="/images/icon-dark.svg" alt="Cerberus" />
        </RouterLink>

        <div class="hidden lg:block">
          <form>
            <div class="relative">
              <span class="absolute top-1/2 left-4 -translate-y-1/2">
                <FontAwesomeIcon :icon="fontAwesomeIcons.magnifyingGlass" class="text-gray-500 dark:text-gray-400" />
              </span>
              <input
                id="search-input"
                type="text"
                placeholder="Search or type command..."
                class="dark:bg-dark-900 shadow-theme-xs focus:border-brand-300 focus:ring-brand-500/10 dark:focus:border-brand-800 h-11 w-full rounded-lg border border-gray-200 bg-transparent py-2.5 pr-14 pl-12 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-hidden xl:w-[430px] dark:border-gray-800 dark:bg-gray-900 dark:bg-white/[0.03] dark:text-white/90 dark:placeholder:text-white/30"
              />
              <button
                id="search-button"
                class="absolute top-1/2 right-2.5 inline-flex -translate-y-1/2 items-center gap-0.5 rounded-lg border border-gray-200 bg-gray-50 px-[7px] py-[4.5px] text-xs -tracking-[0.2px] text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400"
                type="button"
              >
                <span>⌘</span>
                <span>K</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      <div class="shadow-theme-md ml-auto flex items-center justify-end gap-2 px-0 py-0 lg:gap-4 lg:shadow-none">
        <div class="flex items-center gap-2 2xsm:gap-3">
          <div class="hidden items-center gap-3 text-xs text-gray-400 lg:flex">
            <span
              class="rounded-full px-3 py-1"
              :class="app.isBackendOffline ? 'bg-error-50 text-error-500 dark:bg-error-500/10' : 'bg-green-500/10 text-green-500 dark:text-green-400'"
            >
              {{ app.isBackendOffline ? 'Backend down' : 'Online' }}
            </span>
          </div>

          <div ref="themeMenuRef" class="relative">
            <button
              class="hover:text-dark-900 relative flex h-11 items-center gap-2 rounded-full border border-gray-200 bg-white px-4 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
              type="button"
              @click="themeOpen = !themeOpen"
            >
              <FontAwesomeIcon v-if="theme === 'light'" :icon="fontAwesomeIcons.sun" />
              <FontAwesomeIcon v-else-if="theme === 'dark'" :icon="fontAwesomeIcons.moon" />
              <FontAwesomeIcon v-else :icon="fontAwesomeIcons.display" />
              <span class="hidden sm:block text-sm font-medium">{{ themeLabel }}</span>
            </button>

            <div
              v-if="themeOpen"
              class="shadow-theme-lg absolute right-0 mt-[17px] flex w-[180px] flex-col rounded-2xl border border-gray-200 bg-white p-2 dark:border-gray-800 dark:bg-gray-900"
            >
              <button
                class="flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                type="button"
                @click="setSelectedTheme('light')"
              >
                <FontAwesomeIcon :icon="fontAwesomeIcons.sun" />
                Light
              </button>
              <button
                class="flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                type="button"
                @click="setSelectedTheme('dark')"
              >
                <FontAwesomeIcon :icon="fontAwesomeIcons.moon" />
                Dark
              </button>
              <button
                class="flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                type="button"
                @click="setSelectedTheme('system')"
              >
                <FontAwesomeIcon :icon="fontAwesomeIcons.display" />
                System
              </button>
            </div>
          </div>

          <div ref="notificationsMenuRef" class="relative">
            <button
              class="hover:text-dark-900 relative flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
              type="button"
              @click="notificationsOpen = !notificationsOpen"
            >
              <span class="absolute top-0.5 right-0 z-1 h-2 w-2 rounded-full bg-orange-400">
                <span class="absolute -z-1 inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75"></span>
              </span>
              <FontAwesomeIcon :icon="fontAwesomeIcons.bell" />
            </button>

            <div
              v-if="notificationsOpen"
              class="shadow-theme-lg absolute right-0 mt-[17px] w-[260px] rounded-2xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900"
            >
              <div class="text-theme-sm block font-medium text-gray-700 dark:text-gray-400">
                Notifications
              </div>
              <p class="text-theme-xs mt-0.5 block text-gray-500 dark:text-gray-400">
                Nothing urgent yet.
              </p>
            </div>
          </div>

          <div ref="profileMenuRef" class="relative">
            <button
              class="text-theme-sm flex items-center gap-3 rounded-full border border-gray-200 bg-white px-3 py-2 font-medium text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400"
              type="button"
              @click="profileOpen = !profileOpen"
            >
              <span class="flex h-7 w-7 items-center justify-center rounded-full bg-brand-500 text-xs font-semibold text-white">
                {{ userInitials }}
              </span>
              <span class="hidden sm:block">{{ userLabel }}</span>
              <FontAwesomeIcon :icon="fontAwesomeIcons.chevronDown" />
            </button>

            <div
              v-if="profileOpen"
              class="shadow-theme-lg absolute right-0 mt-[17px] flex w-[260px] flex-col rounded-2xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900"
            >
              <div class="text-theme-sm block font-medium text-gray-700 dark:text-gray-400">
                Cerberus Admin
              </div>
              <p class="text-theme-xs mt-0.5 block text-gray-500 dark:text-gray-400">
                Cerberus account
              </p>
              <button
                class="mt-3 inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
              type="button"
              @click="logout"
            >
              <FontAwesomeIcon :icon="fontAwesomeIcons.arrowRightFromBracket" />
              Sign out
            </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </header>
</template>
