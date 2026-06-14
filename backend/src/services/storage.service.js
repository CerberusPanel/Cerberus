// src/services/storage.service.js

const { runSql } = require("../utils/database.util");

function initSchema() {
  runSql(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      profile_ciphertext TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_installs (
      app_id TEXT PRIMARY KEY,
      record_ciphertext TEXT NOT NULL,
      installed_at TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'panel'
    );
    CREATE TABLE IF NOT EXISTS app_stores (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'github',
      repo_url TEXT NOT NULL,
      branch TEXT NOT NULL DEFAULT 'main',
      enabled INTEGER NOT NULL DEFAULT 1,
      last_synced_at TEXT,
      cache_status TEXT NOT NULL DEFAULT 'unknown',
      store_version TEXT,
      store_description TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_catalog_apps (
      app_id TEXT PRIMARY KEY,
      store_id TEXT NOT NULL,
      store_name TEXT NOT NULL,
      store_type TEXT NOT NULL,
      name TEXT NOT NULL,
      image TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      icon TEXT NOT NULL DEFAULT 'boxes',
      accent TEXT NOT NULL DEFAULT 'from-brand-500 to-brand-600',
      highlights_json TEXT NOT NULL DEFAULT '[]',
      tags_json TEXT NOT NULL DEFAULT '[]',
      version TEXT,
      default_version TEXT,
      category TEXT,
      featured INTEGER NOT NULL DEFAULT 0,
      logo_data_url TEXT,
      readme_text TEXT,
      manifest_json TEXT NOT NULL DEFAULT '{}',
      source TEXT NOT NULL DEFAULT 'github',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (store_id) REFERENCES app_stores(id) ON DELETE CASCADE
    );
  `)

  try {
    runSql('ALTER TABLE app_catalog_apps ADD COLUMN readme_text TEXT;')
  } catch (error) {
    // Column already exists or the database is newer than the current schema.
  }

  try {
    runSql("ALTER TABLE app_catalog_apps ADD COLUMN icon TEXT NOT NULL DEFAULT 'boxes';")
  } catch (error) {
    // Column already exists or the database is newer than the current schema.
  }

  try {
    runSql("ALTER TABLE app_catalog_apps ADD COLUMN accent TEXT NOT NULL DEFAULT 'from-brand-500 to-brand-600';")
  } catch (error) {
    // Column already exists or the database is newer than the current schema.
  }

  try {
    runSql('ALTER TABLE app_catalog_apps ADD COLUMN manifest_json TEXT NOT NULL DEFAULT "{}";')
  } catch (error) {
    // Column already exists or the database is newer than the current schema.
  }
}

function maybeMigrateLegacyInstalledApps() {
  let existingCount = 0
  try {
    existingCount = queryJson('SELECT COUNT(*) AS count FROM app_installs;')[0]?.count ?? 0
  } catch (error) {
    return
  }
  if (existingCount > 0) {
    return
  }

  try {
    const content = fs.readFileSync(LEGACY_INSTALLED_APPS_PATH, 'utf8')
    const legacyRecords = JSON.parse(content)
    if (!Array.isArray(legacyRecords)) {
      return
    }

    for (const record of legacyRecords) {
      if (!record?.id || !record?.name || !record?.image) {
        continue
      }

      upsertInstalledApp(record)
    }
  } catch (error) {
    // Legacy file is optional.
  }
}

module.exports = {
  initSchema,
}
