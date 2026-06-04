const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const OFFICIAL_REPOSITORY_ROOT = resolveOfficialRepositoryRoot()
const APP_STORE_SOURCES_FILE = path.resolve(__dirname, '../../data/app-stores.json')
const LEGACY_APP_STORE_SOURCES_FILE = path.resolve(__dirname, '../../apps/local/apps.json')
const EXTERNAL_STORE_CACHE_ROOT = path.resolve(__dirname, '../../data/app-stores')

function resolveOfficialRepositoryRoot() {
  const configuredRoot = String(process.env.APP_STORE_REPOSITORY_PATH ?? '').trim()
  if (configuredRoot) {
    return path.resolve(configuredRoot)
  }

  const siblingRepoRoot = path.resolve(__dirname, '../../../Cerberus-App-Store')
  if (fs.existsSync(siblingRepoRoot)) {
    return siblingRepoRoot
  }

  return null
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
}

function readTextFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8').trim()
  } catch (error) {
    return ''
  }
}

function readJsonFile(filePath, fallback) {
  try {
    const content = readTextFile(filePath)
    if (!content) {
      return fallback
    }

    return JSON.parse(content)
  } catch (error) {
    return fallback
  }
}

function writeJsonFile(filePath, value) {
  ensureDir(path.dirname(filePath))
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function parseScalar(value) {
  const trimmed = String(value ?? '').trim()

  if (!trimmed) {
    return ''
  }

  if (trimmed === 'true') {
    return true
  }

  if (trimmed === 'false') {
    return false
  }

  if (trimmed === 'null' || trimmed === '~') {
    return null
  }

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed)
  }

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }

  return trimmed
}

function parseSimpleYaml(content) {
  const result = {}
  let currentArrayKey = null

  for (const rawLine of String(content ?? '').replace(/\r\n/g, '\n').split('\n')) {
    const line = rawLine.trimEnd()
    const trimmed = line.trim()

    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    const arrayMatch = line.match(/^\s*-\s+(.*)$/)
    if (arrayMatch && currentArrayKey) {
      if (!Array.isArray(result[currentArrayKey])) {
        result[currentArrayKey] = []
      }

      result[currentArrayKey].push(parseScalar(arrayMatch[1]))
      continue
    }

    const pairMatch = line.match(/^\s*([A-Za-z0-9_.-]+):(?:\s*(.*))?$/)
    if (!pairMatch) {
      continue
    }

    const key = pairMatch[1]
    const rawValue = pairMatch[2] ?? ''
    currentArrayKey = rawValue === '' ? key : null

    if (rawValue === '') {
      result[key] = []
      continue
    }

    result[key] = parseScalar(rawValue)
  }

  return result
}

function normalizeStoreId(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function normalizeRepoUrl(repoUrl) {
  const raw = String(repoUrl ?? '').trim()
  if (!raw) {
    return null
  }

  try {
    const url = new URL(raw)
    if (!['github.com', 'www.github.com'].includes(url.hostname.toLowerCase())) {
      return null
    }

    const segments = url.pathname.split('/').filter(Boolean)
    if (segments.length < 2) {
      return null
    }

    const owner = segments[0]
    const repo = segments[1].replace(/\.git$/i, '')
    return {
      owner,
      repo,
      cloneUrl: `https://github.com/${owner}/${repo}.git`,
      webUrl: `https://github.com/${owner}/${repo}`,
      id: normalizeStoreId(`${owner}-${repo}`),
    }
  } catch (error) {
    return null
  }
}

function getExternalStoreCachePath(storeId) {
  return path.join(EXTERNAL_STORE_CACHE_ROOT, storeId)
}

function listDirectoryEntries(directoryPath) {
  try {
    return fs
      .readdirSync(directoryPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => ({
        name: entry.name,
        path: path.join(directoryPath, entry.name),
      }))
      .sort((left, right) => left.name.localeCompare(right.name))
  } catch (error) {
    return []
  }
}

function loadAppStoreSources() {
  const newSources = readJsonFile(APP_STORE_SOURCES_FILE, null)
  const legacySources = readJsonFile(LEGACY_APP_STORE_SOURCES_FILE, [])
  const sources = Array.isArray(newSources) ? newSources : legacySources

  return Array.isArray(sources)
    ? sources
        .map((store) => ({
          id: normalizeStoreId(store.id ?? store.name ?? store.repoUrl),
          name: String(store.name ?? store.id ?? 'GitHub Store').trim(),
          type: 'github',
          source: 'github',
          repoUrl: String(store.repoUrl ?? '').trim(),
          branch: String(store.branch ?? 'main').trim() || 'main',
          enabled: store.enabled !== false,
          lastSyncedAt: store.lastSyncedAt ?? null,
          cacheStatus: store.cacheStatus ?? 'unknown',
        }))
        .filter((store) => store.id && store.repoUrl)
    : []
}

function saveAppStoreSources(stores) {
  writeJsonFile(APP_STORE_SOURCES_FILE, stores)
}

function loadMetadataFromDirectory(directoryPath) {
  const yamlPath = path.join(directoryPath, 'data.yml')
  const yamlAltPath = path.join(directoryPath, 'data.yaml')
  const jsonPath = path.join(directoryPath, 'data.json')

  if (fs.existsSync(jsonPath)) {
    const parsed = readJsonFile(jsonPath, {})
    return parsed && typeof parsed === 'object' ? parsed : {}
  }

  const yamlContent = fs.existsSync(yamlPath)
    ? readTextFile(yamlPath)
    : fs.existsSync(yamlAltPath)
      ? readTextFile(yamlAltPath)
      : ''

  if (!yamlContent) {
    return {}
  }

  const parsed = parseSimpleYaml(yamlContent)
  return parsed && typeof parsed === 'object' ? parsed : {}
}

function loadReadmeFromDirectory(directoryPath) {
  const candidates = ['README.md', 'readme.md', 'README', 'readme']
  for (const candidate of candidates) {
    const readmePath = path.join(directoryPath, candidate)
    if (fs.existsSync(readmePath)) {
      const content = readTextFile(readmePath)
      if (content) {
        return content
      }
    }
  }

  return ''
}

function normalizeHighlights(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((entry) => String(entry ?? '').trim())
    .filter(Boolean)
    .slice(0, 6)
}

function compareVersionLabels(left, right) {
  const leftSegments = String(left ?? '')
    .split(/[^0-9a-zA-Z]+/)
    .filter(Boolean)
  const rightSegments = String(right ?? '')
    .split(/[^0-9a-zA-Z]+/)
    .filter(Boolean)
  const length = Math.max(leftSegments.length, rightSegments.length)

  for (let index = 0; index < length; index += 1) {
    const leftPart = leftSegments[index] ?? ''
    const rightPart = rightSegments[index] ?? ''

    const leftNumber = Number(leftPart)
    const rightNumber = Number(rightPart)
    const leftIsNumber = Number.isFinite(leftNumber) && String(leftNumber) === leftPart
    const rightIsNumber = Number.isFinite(rightNumber) && String(rightNumber) === rightPart

    if (leftIsNumber && rightIsNumber && leftNumber !== rightNumber) {
      return rightNumber - leftNumber
    }

    if (leftPart !== rightPart) {
      return rightPart.localeCompare(leftPart)
    }
  }

  return 0
}

function listAppDirectoriesForRepository(repositoryRoot) {
  if (!repositoryRoot || !fs.existsSync(repositoryRoot) || !fs.statSync(repositoryRoot).isDirectory()) {
    return []
  }

  const appsDirectory = path.join(repositoryRoot, 'apps')
  if (fs.existsSync(appsDirectory) && fs.statSync(appsDirectory).isDirectory()) {
    return listDirectoryEntries(appsDirectory)
  }

  const metadataFiles = [
    path.join(repositoryRoot, 'data.yml'),
    path.join(repositoryRoot, 'data.yaml'),
    path.join(repositoryRoot, 'data.json'),
  ]

  if (metadataFiles.some((candidate) => fs.existsSync(candidate))) {
    return [{ name: path.basename(repositoryRoot), path: repositoryRoot }]
  }

  return []
}

function listVersionDirectories(appDirectory) {
  return listDirectoryEntries(appDirectory).filter((entry) => {
    const metadataFiles = [
      path.join(entry.path, 'data.yml'),
      path.join(entry.path, 'data.yaml'),
      path.join(entry.path, 'data.json'),
    ]

    return metadataFiles.some((candidate) => fs.existsSync(candidate))
  })
}

function pickVersionDirectory(versionDirectories, requestedVersion) {
  if (!versionDirectories.length) {
    return null
  }

  const normalizedRequestedVersion = String(requestedVersion ?? '').trim()
  if (normalizedRequestedVersion) {
    const requestedMatch = versionDirectories.find(
      (entry) => entry.name === normalizedRequestedVersion,
    )
    if (requestedMatch) {
      return requestedMatch
    }
  }

  return [...versionDirectories].sort((left, right) => compareVersionLabels(left.name, right.name))[0]
}

function buildAppEntry(appDirectory, storeMeta) {
  try {
    const appMeta = loadMetadataFromDirectory(appDirectory)
    const versionDirectories = listVersionDirectories(appDirectory)
    const selectedVersionDirectory = pickVersionDirectory(
      versionDirectories,
      appMeta.defaultVersion ?? appMeta.version ?? '',
    )
    const versionMeta = selectedVersionDirectory
      ? loadMetadataFromDirectory(selectedVersionDirectory.path)
      : {}

    const readme =
      loadReadmeFromDirectory(selectedVersionDirectory?.path) ||
      loadReadmeFromDirectory(appDirectory)

    const appId = String(appMeta.id ?? path.basename(appDirectory)).trim()
    const appName = String(appMeta.name ?? path.basename(appDirectory)).trim()
    const appVersion = String(versionMeta.version ?? appMeta.version ?? selectedVersionDirectory?.name ?? '').trim()
    const defaultVersion = String(
      appMeta.defaultVersion ?? versionMeta.defaultVersion ?? selectedVersionDirectory?.name ?? '',
    ).trim()
    const storeType = String(storeMeta?.type ?? 'filesystem').trim() || 'filesystem'
    const storeSource = String(storeMeta?.source ?? storeType).trim() || storeType

    return {
      id: appId,
      name: appName,
      image: String(versionMeta.image ?? appMeta.image ?? '').trim(),
      description: String(versionMeta.description ?? appMeta.description ?? '').trim(),
      icon: String(versionMeta.icon ?? appMeta.icon ?? 'boxes').trim() || 'boxes',
      accent: String(versionMeta.accent ?? appMeta.accent ?? 'from-brand-500 to-brand-600').trim() ||
        'from-brand-500 to-brand-600',
      highlights: normalizeHighlights(versionMeta.highlights ?? appMeta.highlights ?? []),
      version: appVersion || null,
      defaultVersion: defaultVersion || null,
      category: String(versionMeta.category ?? appMeta.category ?? '').trim() || undefined,
      featured: Boolean(versionMeta.featured ?? appMeta.featured ?? false),
      source: storeSource,
      storeId: storeMeta?.id ?? null,
      storeName: storeMeta?.name ?? null,
      storeType: storeType,
      readme,
    }
  } catch (error) {
    return null
  }
}

function listAppEntriesFromRepository(repositoryRoot, storeMeta = null) {
  const appDirectories = listAppDirectoriesForRepository(repositoryRoot)
  return appDirectories
    .map((appDirectory) =>
      buildAppEntry(appDirectory.path, storeMeta ?? {
        id: path.basename(repositoryRoot),
        name: path.basename(repositoryRoot),
        type: 'filesystem',
        source: 'filesystem',
      }),
    )
    .filter(Boolean)
}

function getOfficialStoreDescriptor() {
  if (!OFFICIAL_REPOSITORY_ROOT) {
    return null
  }

  return {
    id: 'official',
    name: 'Official App Store',
    type: 'repository',
    source: 'official',
    rootPath: OFFICIAL_REPOSITORY_ROOT,
    repoUrl: null,
    branch: null,
    cacheStatus: 'ready',
    lastSyncedAt: null,
  }
}

function getExternalStoreDescriptor(store) {
  return {
    id: store.id,
    name: store.name,
    type: 'github',
    source: 'github',
    repoUrl: store.repoUrl,
    branch: store.branch ?? 'main',
    rootPath: getExternalStoreCachePath(store.id),
    cacheStatus: store.cacheStatus ?? 'unknown',
    lastSyncedAt: store.lastSyncedAt ?? null,
  }
}

function listStores() {
  return loadAppStoreSources()
    .filter((store) => store.enabled)
    .map((store) => {
      const rootPath = getExternalStoreCachePath(store.id)
      const appCount = listAppEntriesFromRepository(rootPath, getExternalStoreDescriptor(store)).length

      return {
        ...getExternalStoreDescriptor(store),
        appCount,
        ready: Boolean(appCount),
      }
    })
}

function listCatalogApps() {
  const sources = []
  const officialStore = getOfficialStoreDescriptor()

  if (officialStore) {
    sources.push(officialStore)
  }

  for (const store of loadAppStoreSources()) {
    if (!store.enabled) {
      continue
    }

    sources.push(getExternalStoreDescriptor(store))
  }

  return sources
    .flatMap((store) => listAppEntriesFromRepository(store.rootPath, store))
    .filter(Boolean)
    .sort((left, right) => {
      if (left.featured !== right.featured) {
        return left.featured ? -1 : 1
      }

      if (left.storeName !== right.storeName) {
        return String(left.storeName ?? '').localeCompare(String(right.storeName ?? ''))
      }

      return left.name.localeCompare(right.name)
    })
}

function getCatalogApp(appId) {
  const normalizedId = String(appId ?? '').trim()
  if (!normalizedId) {
    return null
  }

  return listCatalogApps().find((entry) => entry.id === normalizedId) ?? null
}

function syncGitHubStore(store) {
  const normalized = normalizeRepoUrl(store.repoUrl)
  if (!normalized) {
    throw new Error('Only GitHub repository URLs are supported')
  }

  const storeId = normalizeStoreId(store.id || normalized.id)
  const targetDir = getExternalStoreCachePath(storeId)
  ensureDir(EXTERNAL_STORE_CACHE_ROOT)

  if (fs.existsSync(path.join(targetDir, '.git'))) {
    try {
      execFileSync('git', ['-C', targetDir, 'fetch', '--all', '--prune'], { stdio: ['ignore', 'pipe', 'pipe'] })
      execFileSync('git', ['-C', targetDir, 'checkout', store.branch ?? 'main'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      execFileSync('git', ['-C', targetDir, 'pull', '--ff-only', 'origin', store.branch ?? 'main'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      fs.rmSync(targetDir, { recursive: true, force: true })
      execFileSync(
        'git',
        ['clone', '--depth', '1', '--branch', store.branch ?? 'main', normalized.cloneUrl, targetDir],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      )
    }
  } else {
    fs.rmSync(targetDir, { recursive: true, force: true })
    execFileSync(
      'git',
      ['clone', '--depth', '1', '--branch', store.branch ?? 'main', normalized.cloneUrl, targetDir],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
  }

  const appCount = listAppEntriesFromRepository(targetDir, {
    id: storeId,
    name: String(store.name ?? normalized.repo).trim() || normalized.repo,
    type: 'github',
    source: 'github',
    repoUrl: normalized.webUrl,
    branch: store.branch ?? 'main',
  }).length

  return {
    id: storeId,
    name: String(store.name ?? normalized.repo).trim() || normalized.repo,
    type: 'github',
    source: 'github',
    repoUrl: normalized.webUrl,
    branch: store.branch ?? 'main',
    enabled: store.enabled !== false,
    lastSyncedAt: new Date().toISOString(),
    cacheStatus: 'ready',
    appCount,
    ready: Boolean(appCount),
  }
}

function upsertGitHubStore(payload) {
  const normalized = normalizeRepoUrl(payload.repoUrl)
  if (!normalized) {
    throw new Error('Provide a GitHub repository URL, for example https://github.com/owner/repo')
  }

  const stores = loadAppStoreSources()
  const nextStore = {
    id: normalizeStoreId(payload.id || normalized.id),
    name: String(payload.name ?? normalized.repo).trim() || normalized.repo,
    type: 'github',
    source: 'github',
    repoUrl: normalized.webUrl,
    branch: String(payload.branch ?? 'main').trim() || 'main',
    enabled: payload.enabled !== false,
    lastSyncedAt: null,
    cacheStatus: 'not-synced',
  }

  const existingIndex = stores.findIndex(
    (store) => store.id === nextStore.id || store.repoUrl === nextStore.repoUrl,
  )

  if (existingIndex >= 0) {
    stores[existingIndex] = { ...stores[existingIndex], ...nextStore }
  } else {
    stores.push(nextStore)
  }

  saveAppStoreSources(stores)
  const syncedStore = syncGitHubStore(nextStore)
  const refreshedStores = loadAppStoreSources().map((entry) =>
    entry.id === syncedStore.id ? { ...entry, ...syncedStore } : entry,
  )
  saveAppStoreSources(refreshedStores)
  return syncedStore
}

function syncStore(storeId) {
  const store = loadAppStoreSources().find((entry) => entry.id === normalizeStoreId(storeId))
  if (!store) {
    throw new Error('Store not found')
  }

  const syncedStore = syncGitHubStore(store)
  const stores = loadAppStoreSources().map((entry) =>
    entry.id === store.id ? { ...entry, ...syncedStore } : entry,
  )
  saveAppStoreSources(stores)
  return syncedStore
}

module.exports = {
  getCatalogApp,
  listCatalogApps,
  listStores,
  syncStore,
  upsertGitHubStore,
}
