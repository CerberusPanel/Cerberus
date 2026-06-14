import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  fetchCurrentAuthSession,
  loginWithAccount,
  logoutFromAccount,
  type AuthLoginResponse,
  type AuthUser,
} from '../services/api'

type AuthBootstrapState = {
  ready: boolean
  initialized: boolean
}

const bootstrapState: AuthBootstrapState = {
  ready: false,
  initialized: false,
}
let bootstrapPromise: Promise<void> | null = null

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null)
  const expiresAt = ref<number | null>(null)

  const isAuthenticated = computed(() => Boolean(user.value))
  const displayName = computed(() => user.value?.displayName ?? user.value?.username ?? 'Guest')

  function setSession(session: AuthLoginResponse) {
    user.value = session.user
    expiresAt.value = session.expiresAt
  }

  async function bootstrap() {
    if (bootstrapPromise) {
      return bootstrapPromise
    }

    bootstrapPromise = (async () => {
      if (bootstrapState.initialized) {
        return
      }

      bootstrapState.initialized = true

      if (typeof window !== 'undefined') {
        window.addEventListener('cerberus-auth-invalid', clearSession)
      }

      try {
        const session = await fetchCurrentAuthSession()
        setSession(session)
      } catch (error) {
        clearSession()
      } finally {
        bootstrapState.ready = true
      }
    })()

    return bootstrapPromise.finally(() => {
      bootstrapPromise = null
    })
  }

  async function ensureSession() {
    await bootstrap()

    if (user.value) {
      return true
    }

    try {
      const session = await fetchCurrentAuthSession()
      setSession(session)
      return true
    } catch (error) {
      clearSession()
      return false
    }
  }

  async function login(username: string, password: string) {
    // Login the user
    const session = await loginWithAccount(username, password)
    // Create a user session
    setSession(session)
    // Return user session code
    return session
  }

  function clearSession() {
    user.value = null
    expiresAt.value = null
  }

  async function logout() {
    try {
      await logoutFromAccount()
    } finally {
      clearSession()
    }
  }

  return {
    user,
    expiresAt,
    isAuthenticated,
    displayName,
    ready: computed(() => bootstrapState.ready),
    bootstrap,
    ensureSession,
    login,
    logout,
  }
})
