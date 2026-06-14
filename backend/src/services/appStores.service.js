// src/services/appStores.service.js

const { queryJson, runSql, sqlQuote } = require("../utils/database.util");

function normalizeBoolean(value, fallback = 0) {
  if (value === undefined || value === null) {
    return fallback
  }

  return value ? 1 : 0
}

function upsertAppStore(store) {
  const now = new Date().toISOString()
  const existing = queryJson(`SELECT id, created_at FROM app_stores WHERE id = ${sqlQuote(store.id)} LIMIT 1;`)[0] ?? null
  const createdAt = existing?.created_at ?? now

  runSql(`
    INSERT INTO app_stores (
      id, name, type, source, repo_url, branch, enabled, last_synced_at, cache_status,
      store_version, store_description, created_at, updated_at
    ) VALUES (
      ${sqlQuote(store.id)},
      ${sqlQuote(store.name)},
      ${sqlQuote(store.type)},
      ${sqlQuote(store.source ?? 'github')},
      ${sqlQuote(store.repoUrl)},
      ${sqlQuote(store.branch ?? 'main')},
      ${Number(normalizeBoolean(store.enabled, 1))},
      ${store.lastSyncedAt ? sqlQuote(store.lastSyncedAt) : 'NULL'},
      ${sqlQuote(store.cacheStatus ?? 'unknown')},
      ${store.storeVersion ? sqlQuote(store.storeVersion) : 'NULL'},
      ${store.storeDescription ? sqlQuote(store.storeDescription) : 'NULL'},
      ${sqlQuote(createdAt)},
      ${sqlQuote(now)}
    )
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      type = excluded.type,
      source = excluded.source,
      repo_url = excluded.repo_url,
      branch = excluded.branch,
      enabled = excluded.enabled,
      last_synced_at = excluded.last_synced_at,
      cache_status = excluded.cache_status,
      store_version = excluded.store_version,
      store_description = excluded.store_description,
      updated_at = excluded.updated_at;
  `)

  return getAppStore(store.id)
}

function getAppStore(storeId) {
  const rows = queryJson(`SELECT * FROM app_stores WHERE id = ${sqlQuote(storeId)} LIMIT 1;`)
  const row = rows[0] ?? null
  if (!row) {
    return null
  }

  return {
    id: row.id,
    name: row.name,
    type: row.type,
    source: row.source,
    repoUrl: row.repo_url,
    branch: row.branch,
    enabled: Boolean(row.enabled),
    lastSyncedAt: row.last_synced_at,
    cacheStatus: row.cache_status,
    storeVersion: row.store_version,
    storeDescription: row.store_description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function listAppStores() {
  return queryJson('SELECT * FROM app_stores ORDER BY updated_at DESC;').map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    source: row.source,
    repoUrl: row.repo_url,
    branch: row.branch,
    enabled: Boolean(row.enabled),
    lastSyncedAt: row.last_synced_at,
    cacheStatus: row.cache_status,
    storeVersion: row.store_version,
    storeDescription: row.store_description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
}

module.exports = {
  getAppStore,
  listAppStores,
  upsertAppStore,
}
