import axios from 'axios'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api',
  timeout: 10000,
})

export const AUTH_TOKEN_KEY = 'cerberus.auth.token'
export const AUTH_USER_KEY = 'cerberus.auth.user'

function getStoredAuthToken() {
  if (typeof window === 'undefined') {
    return ''
  }

  return localStorage.getItem(AUTH_TOKEN_KEY) ?? ''
}

api.interceptors.request.use((config) => {
  const token = getStoredAuthToken()

  if (token) {
    config.headers = config.headers ?? {}
    ;(config.headers as Record<string, string>)['Authorization'] = `Bearer ${token}`
  }

  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status
    const requestUrl = String(error?.config?.url ?? '')
    const isLoginRequest = requestUrl.includes('/auth/login')

    if (status === 401 && !isLoginRequest && typeof window !== 'undefined') {
      localStorage.removeItem(AUTH_TOKEN_KEY)
      localStorage.removeItem(AUTH_USER_KEY)
      window.dispatchEvent(new Event('cerberus-auth-invalid'))

      if (window.location.hash !== '#/login') {
        window.location.hash = '#/login'
      }
    }

    return Promise.reject(error)
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
  image: string
  description: string
  icon: string
  accent: string
  highlights: string[]
  version?: string
  defaultVersion?: string
  category?: string
  featured?: boolean
  source?: string
  storeId?: string
  storeName?: string
  storeType?: string
  readme?: string
}

export type InstalledAppRecord = AppCatalogItem & {
  source: string
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
  rootPath?: string
  appCount?: number
  ready?: boolean
}

export type AuthUser = {
  username: string
  displayName: string
  role: string
}

export type AuthLoginResponse = {
  token: string
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
  name: string
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
  const { data } = await api.post<AuthLoginResponse>('/auth/login', { username, password }, {
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
