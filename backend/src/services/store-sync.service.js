// src/services/store-sync.service.js

const fs = require("node:fs");
const storage = require("../storage");
const { cloneRepositoryToTemp } = require("./github.service");
const { buildAppRecord, listAppManifestsForRepository, loadStoreMetadataFromRepositoryRoot } = require("./manifest.service");
const { normalizeRepoUrl, normalizeStoreId } = require("../utils/normalise.util");

async function syncGitHubStore(store) {
  const normalized = normalizeRepoUrl(store.repoUrl)
  if (!normalized) {
    throw new Error('Only GitHub repository URLs are supported')
  }

  const branch = String(store.branch ?? 'main').trim() || 'main'
  const storeId = normalizeStoreId(store.id || normalized.id)
  const tempRoot = cloneRepositoryToTemp(normalized.webUrl, branch)
  const repoMetadata = loadStoreMetadataFromRepositoryRoot(tempRoot)

  const storeRecord = storage.upsertAppStore({
    id: storeId,
    name: String(repoMetadata.name ?? store.name ?? normalized.repo).trim() || normalized.repo,
    type: store.type ?? 'github',
    source: store.source ?? 'github',
    repoUrl: normalized.webUrl,
    branch,
    enabled: store.enabled !== false,
    lastSyncedAt: new Date().toISOString(),
    cacheStatus: 'syncing',
    storeVersion: String(repoMetadata.version ?? '').trim() || null,
    storeDescription: String(repoMetadata.description ?? '').trim() || null,
  })

  try {
    const appManifests = listAppManifestsForRepository(tempRoot)

    const apps = []
    for (const entry of appManifests) {
      const appRecord = await buildAppRecord(entry.path, {
        id: storeRecord.id,
        name: storeRecord.name,
        type: storeRecord.type,
        source: storeRecord.source,
        repoUrl: storeRecord.repoUrl,
        branch: storeRecord.branch,
      })

      if (appRecord) {
        apps.push(appRecord)
      }
    }

    storage.deleteCatalogAppsForStore(storeRecord.id)
    storage.upsertCatalogApps(apps)

    const updatedStore = storage.upsertAppStore({
      ...storeRecord,
      lastSyncedAt: new Date().toISOString(),
      cacheStatus: 'ready',
    })

    return {
      ...updatedStore,
      appCount: apps.length,
      ready: Boolean(apps.length),
    }
  } catch (error) {
    storage.upsertAppStore({
      ...storeRecord,
      lastSyncedAt: storeRecord.lastSyncedAt,
      cacheStatus: 'error',
    })
    throw error
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
}

async function upsertGitHubStore(payload) {
  const normalized = normalizeRepoUrl(payload.repoUrl)
  if (!normalized) {
    throw new Error('Provide a GitHub repository URL, for example https://github.com/owner/repo')
  }

  const store = storage.upsertAppStore({
    id: normalizeStoreId(payload.id || normalized.id),
    name: String(payload.name ?? normalized.repo).trim() || normalized.repo,
    type: 'github',
    source: 'github',
    repoUrl: normalized.webUrl,
    branch: String(payload.branch ?? 'main').trim() || 'main',
    enabled: payload.enabled !== false,
    lastSyncedAt: null,
    cacheStatus: 'not-synced',
    storeVersion: null,
    storeDescription: null,
  })

  return syncGitHubStore(store)
}

async function syncStore(storeId) {
  const store = storage.getAppStore(normalizeStoreId(storeId))
  if (!store) {
    throw new Error('Store not found')
  }

  if (!store.repoUrl) {
    throw new Error('Store is missing a repository URL')
  }

  return syncGitHubStore(store)
}

async function syncAllStores() {
  const stores = storage.listAppStores().filter((store) => store.enabled)
  const syncedStores = []

  for (const store of stores) {
    syncedStores.push(await syncStore(store.id))
  }

  return syncedStores
}

async function ensureOfficialStore() {
  const repoUrl = String(process.env.APP_STORE_REPOSITORY_URL ?? "https://github.com/CerberusPanel/AppStore").trim()
  if (!repoUrl) {
    return
  }

  const existingStore = storage.getAppStore('official')
  const existingAppCount = storage.listCatalogApps().filter((app) => app.storeId === 'official').length
  if (existingStore && existingAppCount > 0) {
    return
  }

  try {
    await upsertGitHubStore({
      id: 'official',
      name: 'Official App Store',
      repoUrl,
      branch: String(process.env.APP_STORE_REPOSITORY_BRANCH ?? 'Development').trim() || 'Development',
      enabled: true,
    })
  } catch (error) {
    storage.upsertAppStore({
      id: 'official',
      name: 'Official App Store',
      type: 'github',
      source: 'github',
      repoUrl,
      branch: String(process.env.APP_STORE_REPOSITORY_BRANCH ?? 'Development').trim() || 'Development',
      enabled: true,
      lastSyncedAt: existingStore?.lastSyncedAt ?? null,
      cacheStatus: 'error',
      storeVersion: existingStore?.storeVersion ?? null,
      storeDescription: existingStore?.storeDescription ?? null,
    })
  }
}

function listStores() {
  return storage.listAppStores()
    .map((store) => {
      const appCount = storage.listCatalogApps().filter((app) => app.storeId === store.id).length

      return {
        ...store,
        appCount,
        ready: Boolean(appCount),
      }
    })
    .sort((left, right) => String(left.name ?? '').localeCompare(String(right.name ?? '')))
}

function listCatalogApps() {
  return storage.listCatalogApps()
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
  return storage.getCatalogApp(String(appId ?? '').trim())
}

module.exports = {
  ensureOfficialStore,
  listCatalogApps,
  getCatalogApp,
  listStores,
  upsertGitHubStore,
  syncStore,
  syncAllStores,
}
