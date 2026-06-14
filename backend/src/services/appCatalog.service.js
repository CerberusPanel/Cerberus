// src/services/appCatalog.service.js

const { queryJson, runSql, sqlQuote } = require("../utils/database.util");

function deleteCatalogAppsForStore(storeId) {
  runSql(`DELETE FROM app_catalog_apps WHERE store_id = ${sqlQuote(storeId)};`)
}

function upsertCatalogApps(apps) {
  if (!Array.isArray(apps) || !apps.length) {
    return []
  }

  const now = new Date().toISOString()
  for (const app of apps) {
    runSql(`
      INSERT INTO app_catalog_apps (
        app_id, store_id, store_name, store_type, name, image, description, icon, accent,
        highlights_json, tags_json, version, default_version, category, featured,
        logo_data_url, readme_text, manifest_json, source, created_at, updated_at
      ) VALUES (
        ${sqlQuote(app.id)},
        ${sqlQuote(app.storeId)},
        ${sqlQuote(app.storeName)},
        ${sqlQuote(app.storeType)},
        ${sqlQuote(app.name)},
        ${sqlQuote(app.image)},
        ${sqlQuote(app.description ?? '')},
        ${sqlQuote(app.icon ?? 'boxes')},
        ${sqlQuote(app.accent ?? 'from-brand-500 to-brand-600')},
        ${sqlQuote(JSON.stringify(Array.isArray(app.highlights) ? app.highlights : []))},
        ${sqlQuote(JSON.stringify(Array.isArray(app.tags) ? app.tags : []))},
        ${app.version ? sqlQuote(app.version) : 'NULL'},
        ${app.defaultVersion ? sqlQuote(app.defaultVersion) : 'NULL'},
        ${app.category ? sqlQuote(app.category) : 'NULL'},
        ${Number(normalizeBoolean(app.featured, 0))},
        ${app.logoUrl ? sqlQuote(app.logoUrl) : 'NULL'},
        ${app.readmeText ? sqlQuote(app.readmeText) : 'NULL'},
        ${sqlQuote(JSON.stringify(app.manifest ?? {}))},
        ${sqlQuote(app.source ?? 'github')},
        ${sqlQuote(now)},
        ${sqlQuote(now)}
      )
      ON CONFLICT(app_id) DO UPDATE SET
        store_id = excluded.store_id,
        store_name = excluded.store_name,
        store_type = excluded.store_type,
        name = excluded.name,
        image = excluded.image,
        description = excluded.description,
        icon = excluded.icon,
        accent = excluded.accent,
        highlights_json = excluded.highlights_json,
        tags_json = excluded.tags_json,
        version = excluded.version,
        default_version = excluded.default_version,
        category = excluded.category,
        featured = excluded.featured,
        logo_data_url = excluded.logo_data_url,
        readme_text = excluded.readme_text,
        manifest_json = excluded.manifest_json,
        source = excluded.source,
        updated_at = excluded.updated_at;
    `)
  }

  return apps
}

function rowToCatalogApp(row, { includeReadme = false } = {}) {
  if (!row) {
    return null
  }

  let readme = undefined
  if (includeReadme && row.readme_text) {
    readme = row.readme_text
  }

  let manifest = {}
  try {
    manifest = JSON.parse(row.manifest_json ?? '{}')
  } catch (error) {
    manifest = {}
  }

  const deployments = Array.isArray(manifest.deployments) ? manifest.deployments : []
  const primaryDeployment = deployments[0] ?? null
  const normalizedLinks = manifest.links && typeof manifest.links === 'object' && !Array.isArray(manifest.links)
    ? Object.fromEntries(
        Object.entries(manifest.links)
          .map(([label, url]) => [String(label), String(url)])
          .filter(([label, url]) => Boolean(label) && Boolean(url)),
      )
    : Array.isArray(manifest.links)
      ? Object.fromEntries(
          manifest.links
            .map((entry) => {
              if (!entry || typeof entry !== 'object') {
                return null
              }

              const [label, url] = Object.entries(entry)[0] ?? []
              if (!label || !url) {
                return null
              }

              return [String(label), String(url)]
            })
            .filter(Boolean),
        )
      : {}

  const normalizedVersions = Array.isArray(manifest.versions)
    ? manifest.versions
        .map((entry) => {
          if (!entry || typeof entry !== 'object') {
            const tag = String(entry ?? '').trim()
            return tag ? { tag, label: tag } : null
          }

          const tag = String(entry.tag ?? '').trim()
          if (!tag) {
            return null
          }

          return {
            tag,
            label: String(entry.label ?? '').trim() || tag,
          }
        })
        .filter(Boolean)
    : []

  const normalizedEnvironment = Array.isArray(primaryDeployment?.environment)
    ? primaryDeployment.environment.map((entry) => ({
        name: String(entry?.name ?? '').trim(),
        value: String(entry?.value ?? '').trim(),
        label: String(entry?.label ?? '').trim() || undefined,
      })).filter((entry) => entry.name)
    : null

  return {
    id: row.app_id,
    name: row.name,
    image: row.image,
    description: row.description,
    icon: row.icon,
    accent: row.accent,
    highlights: JSON.parse(row.highlights_json ?? '[]'),
    tags: JSON.parse(row.tags_json ?? '[]'),
    version: row.version,
    defaultVersion: row.default_version,
    category: row.category ?? undefined,
    featured: Boolean(row.featured),
    logoUrl: row.logo_data_url ?? null,
    source: row.source,
    storeId: row.store_id,
    storeName: row.store_name,
    storeType: row.store_type,
    readme: row.readme_text ?? readme,
    manifest,
    versions: normalizedVersions,
    links: normalizedLinks,
    environment: normalizedEnvironment,
    ports: Array.isArray(primaryDeployment?.ports) ? primaryDeployment.ports : [],
    volumes: Array.isArray(primaryDeployment?.volumes) ? primaryDeployment.volumes : [],
    sourceUrl: null,
    readmeUrl: manifest.readme ?? null,
  }
}

function listCatalogApps() {
  return queryJson('SELECT * FROM app_catalog_apps ORDER BY featured DESC, store_name ASC, name ASC;')
    .map((row) => rowToCatalogApp(row, { includeReadme: false }))
    .filter(Boolean)
}

function getCatalogApp(appId) {
  const rows = queryJson(`SELECT * FROM app_catalog_apps WHERE app_id = ${sqlQuote(appId)} LIMIT 1;`)
  return rows[0] ? rowToCatalogApp(rows[0], { includeReadme: true }) : null
}

function normalizeBoolean(value, fallback = 0) {
  if (value === undefined || value === null) {
    return fallback
  }

  return value ? 1 : 0
}

module.exports = {
  deleteCatalogAppsForStore,
  getCatalogApp,
  listCatalogApps,
  rowToCatalogApp,
  upsertCatalogApps,
}
