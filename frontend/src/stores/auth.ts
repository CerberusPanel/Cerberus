import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  AUTH_TOKEN_KEY,
  AUTH_USER_KEY,
  fetchCurrentAuthSession,
  loginWithAccount,
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

function readStoredUser() {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const raw = localStorage.getItem(AUTH_USER_KEY)
    return raw ? (JSON.parse(raw) as AuthUser) : null
  } catch (error) {
    return null
  }
}

function applySession(session: AuthLoginResponse) {
  if (typeof window === 'undefined') {
    return
  }

  localStorage.setItem(AUTH_TOKEN_KEY, session.token)
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(session.user))
}

function clearSession() {
  if (typeof window === 'undefined') {
    return
  }

  localStorage.removeItem(AUTH_TOKEN_KEY)
  localStorage.removeItem(AUTH_USER_KEY)
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string>(typeof window === 'undefined' ? '' : localStorage.getItem(AUTH_TOKEN_KEY) ?? '')
  const user = ref<AuthUser | null>(readStoredUser())
  const expiresAt = ref<number | null>(null)

  const isAuthenticated = computed(() => Boolean(token.value))
  const displayName = computed(() => user.value?.displayName ?? user.value?.username ?? 'Guest')

  function syncFromStorage() {
    if (typeof window === 'undefined') {
      return
    }

    token.value = localStorage.getItem(AUTH_TOKEN_KEY) ?? ''
    user.value = readStoredUser()
  }

  function setSession(session: AuthLoginResponse) {
    token.value = session.token
    user.value = session.user
    expiresAt.value = session.expiresAt
    applySession(session)
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
        window.addEventListener('storage', syncFromStorage)
        window.addEventListener('cerberus-auth-invalid', () => {
          token.value = ''
          user.value = null
          expiresAt.value = null
        })
      }

      syncFromStorage()

      if (!token.value) {
        bootstrapState.ready = true
        return
      }

      try {
        const session = await fetchCurrentAuthSession()
        setSession(session)
      } catch (error) {
        logout()
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

    if (!token.value) {
      return false
    }

    if (user.value) {
      return true
    }

    try {
      const session = await fetchCurrentAuthSession()
      setSession(session)
      return true
    } catch (error) {
      logout()
      return false
    }
  }

  async function login(username: string, password: string) {
    const session = await loginWithAccount(username, password)
    setSession(session)
    return session
  }

  function logout() {
    clearSession()
    token.value = ''
    user.value = null
    expiresAt.value = null
  }

  return {
    token,
    user,
    expiresAt,
    isAuthenticated,
    displayName,
    ready: computed(() => bootstrapState.ready),
    bootstrap,
    ensureSession,
    login,
    logout,
    syncFromStorage,
  }
})
