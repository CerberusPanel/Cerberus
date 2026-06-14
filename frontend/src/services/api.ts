import axios from 'axios'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api',
  timeout: 10000,
  withCredentials: true,
})

export type ApiDebugResponse = {
  debugCode: string
  error: string
  message: string
  details?: string
}

export type BackendHealthResponse = {
  name: string
  status: string
  message: string
}

type ApiDebuggableError = {
  debugCode?: string
  response?: {
    status?: number
    statusText?: string
    data?: ApiDebugResponse
  }
}

type AuthPublicKeyResponse = {
  publicKey: string
}

let authPublicKeyPromise: Promise<CryptoKey> | null = null

function pemToArrayBuffer(pem: string) {
  const base64 = pem
    .replace(/-----BEGIN PUBLIC KEY-----/g, '')
    .replace(/-----END PUBLIC KEY-----/g, '')
    .replace(/\s+/g, '')

  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let index = 0; index < binaryString.length; index += 1) {
    bytes[index] = binaryString.charCodeAt(index)
  }
  return bytes.buffer
}

async function getAuthPublicKey() {
  if (authPublicKeyPromise) {
    return authPublicKeyPromise
  }

  authPublicKeyPromise = (async () => {
    try {
      const { data } = await api.get<AuthPublicKeyResponse>('/auth/login', {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
        },
      })

      const publicKeyData = pemToArrayBuffer(data.publicKey)
      return globalThis.crypto.subtle.importKey(
        'spki',
        publicKeyData,
        {
          name: 'RSA-OAEP',
          hash: 'SHA-256',
        },
        false,
        ['encrypt'],
      )
    } catch (error) {
      authPublicKeyPromise = null
      throw error
    }
  })()

  return authPublicKeyPromise
}

async function encryptLoginPassword(password: string) {
  if (!globalThis.crypto?.subtle) {
    return null
  }

  const publicKey = await getAuthPublicKey()
  const payload = new TextEncoder().encode(password)
  const encryptedBytes = await globalThis.crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, payload)
  const binary = String.fromCharCode(...new Uint8Array(encryptedBytes))
  return btoa(binary)
}

function buildDebugCode(requestUrl: string, status?: number, code?: string) {
  const normalizedUrl = requestUrl.includes('/auth/login')
    ? 'AUTH_LOGIN'
    : requestUrl.includes('/auth/logout')
      ? 'AUTH_LOGOUT'
      : requestUrl.includes('/auth/me')
        ? 'AUTH_SESSION'
        : 'API'

  if (code) {
    return code
  }

  if (typeof status === 'number') {
    return `${normalizedUrl}_${status}`
  }

  return `${normalizedUrl}_NO_RESPONSE`
}

function getDebugMessage(status?: number, requestUrl = '') {
  if (requestUrl.includes('/auth/login')) {
    if (status === 401) return 'Login failed'
    if (status === 400) return 'Login payload was invalid'
    if (typeof status === 'number') return 'Login request failed'
    return 'Login request did not receive a response'
  }

  if (requestUrl.includes('/auth/me')) {
    if (status === 401) return 'Session is not authorised'
    if (typeof status === 'number') return 'Session request failed'
    return 'Session request did not receive a response'
  }

  if (requestUrl.includes('/auth/logout')) {
    if (typeof status === 'number') return 'Logout request failed'
    return 'Logout request did not receive a response'
  }

  if (typeof status === 'number') {
    return 'Request failed'
  }

  return 'Request did not receive a response'
}

function normalizeApiError(error: unknown) {
  const typedError = error as ApiDebuggableError & { config?: { url?: string } }
  const requestUrl = String(typedError?.config?.url ?? '')
  const status = typedError?.response?.status
  const debugCode = buildDebugCode(requestUrl, status, typedError?.debugCode)
  const message = getDebugMessage(status, requestUrl)

  if (!typedError.response) {
    typedError.response = {
      status: status ?? 502,
      statusText: message,
      data: {
        debugCode,
        error: message,
        message,
        details: 'No response received from the upstream server.',
      },
    }
  } else if (!typedError.response.data || typeof typedError.response.data !== 'object') {
    typedError.response.data = {
      debugCode,
      error: message,
      message,
      details: 'The server returned an empty or non-JSON error payload.',
    }
  } else if (!typedError.response.data.debugCode) {
    typedError.response.data = {
      ...typedError.response.data,
      debugCode,
      error: typedError.response.data.error || message,
      message: typedError.response.data.message || message,
    }
  }

  typedError.debugCode = debugCode
  return typedError
}

api.interceptors.request.use((config) => {
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status
    const requestUrl = String(error?.config?.url ?? '')
    const isLoginRequest = requestUrl.includes('/auth/login')

    if (status === 401 && !isLoginRequest && typeof window !== 'undefined') {
      window.dispatchEvent(new Event('cerberus-auth-invalid'))

      if (window.location.hash !== '#/login') {
        window.location.hash = '#/login'
      }
    }

    return Promise.reject(normalizeApiError(error))
  },
)

export type SystemInfoResponse = {
  hostname: string
  os: string
  kernel: string
  architecture: string
  manufacturer: string
  model: string
  cpu: string
  gpu: string | null
  gpuPresent: boolean
  cores: number
  memory: {
    total: number
    percent: number
  }
  localIp: string
  publicIp: string | null
  upSince: string
  uptimeSeconds: number
}

export type SystemStatusResponse = {
  cpuUsagePercent: number
  cpuLoadPercent: number
  cpuCoreUsagePercent: number[]
  gpuUsagePercent: number | null
  gpuPresent: boolean
  memory: {
    total: number
    used: number
    percent: number
  }
  drives: Array<{
    name: string
    size: number
    used: number
    available: number
    percent: number
    mountpoints: string[]
  }>
  containerCount: number
  cpuCount: number
  system: SystemInfoResponse
}

export type MonitoringResponse = {
  mode: 'disk' | 'network'
  items: Array<{
    name: string
    rxBytes?: number
    txBytes?: number
    sectorsRead?: number
    sectorsWritten?: number
    readsCompleted?: number
    writesCompleted?: number
  }>
  timestamp: number
}

export type DockerContainerResponse = {
  Id: string
  Names: string[]
  Image: string
  ImageID: string
  Command: string
  Created: number
  Ports: Array<{
    IP?: string
    PrivatePort: number
    PublicPort?: number
    Type: 'tcp' | 'udp'
  }>
  State: string
  Status: string
  Labels: Record<string, string>
}

export type AppCatalogItem = {
  id: string
  name: string
  logo?: string | null
  description: string
  category?: string
  featured?: boolean
  image: string
  tags: string[]
  highlights: string[]
  readme: string
  versions?: Array<{
    tag: string
    label?: string
  }>
  links?: Record<string, string> | null
  deployments?: Array<{
    version: string
    container_name: string
    image: string
    restart?:string | 'no' | 'always' | 'unless-stopped' | 'on-failure'
    ports?: Array<{
      host: number
      container: number
      label?: string
      editable: boolean | true
      required: boolean | false
    }>
    volumes?: Array<{
      host: string
      container: string
      label?: string
      editable: boolean | true
      required: boolean | false
    }>
    environment?: Array<{
      name: string
      value: string
      label?: string
      editable: boolean | true
      required: boolean | false
    }>
  }>
}

export type InstalledAppRecord = AppCatalogItem & {
  source: string
  storeName?: string | null
  installedAt: string
  version?: string | null
  container: DockerContainerResponse | null
}

export type AppStoreRecord = {
  id: string
  name: string
  type: 'filesystem' | 'github'
  source: 'filesystem' | 'github'
  repoUrl?: string
  branch?: string
  enabled?: boolean
  lastSyncedAt?: string | null
  cacheStatus?: string
  appCount?: number
  ready?: boolean
  storeVersion?: string | null
  storeDescription?: string | null
  createdAt?: string
  updatedAt?: string
}

export type AuthUser = {
  username: string
  displayName: string
  role: string
}

export type AuthLoginResponse = {
  user: AuthUser
  expiresAt: number
}

export type UserRecord = AuthUser & {
  createdAt: string
  updatedAt: string
}

export async function fetchSystemInfo() {
  const { data } = await api.get<SystemInfoResponse>('/system/info', {
    params: { _: Date.now() },
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
    },
  })
  return data
}

export async function fetchBackendHealth() {
  const { data } = await api.get<BackendHealthResponse>('/health', {
    params: { _: Date.now() },
    timeout: 3000,
    validateStatus: () => true,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
    },
  })
  return data
}

export async function fetchSystemStatus() {
  const { data } = await api.get<SystemStatusResponse>('/system/status', {
    params: { _: Date.now() },
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
    },
  })
  return data
}

export async function fetchMonitoring(mode: 'disk' | 'network') {
  const { data } = await api.get<MonitoringResponse>('/system/monitoring', {
    params: { mode, _: Date.now() },
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
    },
  })
  return data
}

export async function fetchDockerContainers() {
  const { data } = await api.get<DockerContainerResponse[]>('/docker/containers', {
    params: { _: Date.now() },
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
    },
  })
  return data
}

export async function fetchAppCatalog() {
  const { data } = await api.get<AppCatalogItem[]>('/apps/catalog', {
    params: { _: Date.now() },
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
    },
  })
  return data
}

export async function fetchAppCatalogItem(appId: string) {
  const { data } = await api.get<AppCatalogItem>(`/apps/catalog/${encodeURIComponent(appId)}`, {
    params: { _: Date.now() },
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
    },
  })
  return data
}

export async function fetchInstalledApps() {
  const { data } = await api.get<InstalledAppRecord[]>('/apps/installed', {
    params: { _: Date.now() },
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
    },
  })
  return data
}

export async function fetchAppStores() {
  const { data } = await api.get<AppStoreRecord[]>('/apps/stores', {
    params: { _: Date.now() },
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
    },
  })
  return data
}

export async function addAppStore(payload: {
  repoUrl: string
  branch?: string
}) {
  const { data } = await api.post<AppStoreRecord>('/apps/stores', payload, {
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
    },
  })
  return data
}

export async function syncAppStore(storeId: string) {
  const { data } = await api.post<AppStoreRecord>(`/apps/stores/${encodeURIComponent(storeId)}/sync`, {}, {
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
    },
  })
  return data
}

export async function syncAllAppStores() {
  const { data } = await api.post<AppStoreRecord[]>('/apps/stores/sync-all', {}, {
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
    },
  })
  return data
}

export async function installApp(appId: string) {
  const { data } = await api.post<InstalledAppRecord>('/apps/install', { appId }, {
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
    },
  })
  return data
}

export async function loginWithAccount(username: string, password: string) {
  // Encrypt the password
  const encryptedPassword = await encryptLoginPassword(password)
  const loginPayload = encryptedPassword
    ? { username, encryptedPassword }
    : { username, password }
  // send the username and encrypted password to the API endpoint
  const { data } = await api.post<AuthLoginResponse>('/auth/login', loginPayload, {
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
    },
  })
  // Return the response
  return data
}

export async function logoutFromAccount() {
  const { data } = await api.post<{ ok: boolean }>('/auth/logout', {}, {
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
    },
  })
  return data
}

export async function fetchCurrentAuthSession() {
  const { data } = await api.get<AuthLoginResponse>('/auth/me', {
    params: { _: Date.now() },
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
    },
  })
  return data
}

export async function fetchUsers() {
  const { data } = await api.get<UserRecord[]>('/users', {
    params: { _: Date.now() },
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
    },
  })
  return data
}

export async function createUser(payload: {
  username: string
  displayName: string
  password: string
}) {
  const { data } = await api.post<UserRecord>('/users', payload, {
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
    },
  })
  return data
}
