<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const username = ref('')
const password = ref('')
const submitting = ref(false)

const redirectTarget = computed(() => {
  const target = route.query.redirect
  return typeof target === 'string' && target.length > 0 ? target : '/dashboard'
})

async function submitLogin() {
  // Check the username and password has been inputted and recorded.
  if (!username.value || !password.value || submitting.value) {
    return
  }

  // Mark as submitting
  submitting.value = true
  try {
    // Try to login
    await auth.login(username.value, password.value)
    // Show welcome message
    ElMessage.success(`Welcome, ${auth.displayName}`)
    // Redirect to dashboard
    await router.replace(redirectTarget.value)
  } catch (error) {
    const debugCode = typeof error === 'object' && error && 'debugCode' in error
      ? String((error as { debugCode?: string }).debugCode ?? '')
      : ''
    ElMessage.error(debugCode ? `Login failed (${debugCode})` : 'That account could not be authenticated.')
  } finally {
    submitting.value = false
  }
}

</script>

<template>
  <div class="w-full max-w-md">
    <div class="mb-6 text-center">
      <img class="mx-auto h-10 block dark:hidden" src="/images/logo-light.svg" alt="Cerberus" />
      <img class="mx-auto h-10 hidden dark:block" src="/images/logo-dark.svg" alt="Cerberus" />
      <h1 class="mt-4 text-2xl font-semibold">Sign in</h1>
      <p class="mt-2 text-sm">
        Log in with your Cerberus account to continue.
      </p>
    </div>

    <form class="space-y-4" @submit.prevent="submitLogin">
      <div>
        <label class="mb-2 block text-sm font-medium" for="username">
          Username
        </label>
        <input
          id="username"
          v-model="username"
          autocomplete="username"
          class="shadow-theme-xs h-11 w-full rounded-lg border px-4 text-sm outline-none transition focus:border-brand-300 focus:ring-4 focus:ring-brand-500/10 --- border-gray-200 bg-white text-black placeholder:text-gray-400 --- dark:border-gray-800 dark:bg-white/[0.03] dark:text-white/90 dark:placeholder:text-white/30"
          placeholder="your username"
          type="text"
        />
      </div>

      <div>
        <label class="mb-2 block text-sm font-medium" for="password">
          Password
        </label>
        <input
          id="password"
          v-model="password"
          autocomplete="current-password"
          class="shadow-theme-xs h-11 w-full rounded-lg border px-4 text-sm outline-none transition focus:border-brand-300 focus:ring-4 focus:ring-brand-500/10 --- border-gray-200 bg-white text-black placeholder:text-gray-400 --- dark:border-gray-800 dark:bg-white/[0.03] dark:text-white/90 dark:placeholder:text-white/30"
          placeholder="your password"
          type="password"
        />
      </div>

      <button
        class="inline-flex h-11 w-full items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-400/70"
        :disabled="submitting || !username || !password"
        type="submit"
      >
        {{ submitting ? 'Signing in…' : 'Sign in' }}
      </button>
    </form>

    <p class="mt-5 text-center text-xs">
      Accounts are stored in Cerberus and protected in the database.
    </p>
  </div>
</template>
