const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const DATA_DIR = path.resolve(__dirname, '../../data')
const DB_PATH = path.join(DATA_DIR, 'cerberus.db')
const DB_SECRET_PATH = path.join(DATA_DIR, 'db-secret.key')
const LEGACY_INSTALLED_APPS_PATH = path.join(DATA_DIR, 'installed-apps.json')

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

function getEncryptionSecret() {
  ensureDataDir()

  const envSecret = String(process.env.DB_ENCRYPTION_KEY ?? '').trim()
  if (envSecret) {
    return crypto.createHash('sha256').update(envSecret).digest()
  }

  try {
    const existingSecret = fs.readFileSync(DB_SECRET_PATH, 'utf8').trim()
    if (existingSecret) {
      return crypto.createHash('sha256').update(existingSecret).digest()
    }
  } catch (error) {
    // Generate a fresh secret below.
  }

  const freshSecret = crypto.randomBytes(32).toString('hex')
  fs.writeFileSync(DB_SECRET_PATH, `${freshSecret}\n`)
  return crypto.createHash('sha256').update(freshSecret).digest()
}

const encryptionKey = getEncryptionSecret()

function sqlQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

function runSql(sql) {
  ensureDataDir()
  execFileSync('sqlite3', [DB_PATH, sql], { stdio: ['ignore', 'pipe', 'pipe'] })
}

function queryJson(sql) {
  ensureDataDir()
  const stdout = execFileSync('sqlite3', ['-json', DB_PATH, sql], { encoding: 'utf8' })
  const trimmed = stdout.trim()
  if (!trimmed) {
    return []
  }

  return JSON.parse(trimmed)
}

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
  `)
}

function encryptJson(value) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv)
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8')
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()

  return [iv.toString('base64url'), ciphertext.toString('base64url'), tag.toString('base64url')].join('.')
}

function decryptJson(payload) {
  const [ivPart, ciphertextPart, tagPart] = String(payload ?? '').split('.')
  if (!ivPart || !ciphertextPart || !tagPart) {
    return null
  }

  const iv = Buffer.from(ivPart, 'base64url')
  const ciphertext = Buffer.from(ciphertextPart, 'base64url')
  const tag = Buffer.from(tagPart, 'base64url')

  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, iv)
  decipher.setAuthTag(tag)
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')

  return JSON.parse(plaintext)
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex')
}

function createPasswordRecord(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  return {
    salt,
    hash: hashPassword(password, salt),
  }
}

function verifyPassword(password, salt, expectedHash) {
  const computedHash = hashPassword(password, salt)
  const computedBuffer = Buffer.from(computedHash, 'hex')
  const expectedBuffer = Buffer.from(expectedHash, 'hex')

  return (
    computedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(computedBuffer, expectedBuffer)
  )
}

function upsertUser({ username, password, displayName, role = 'user' }) {
  const now = new Date().toISOString()
  const existing = getUserRow(username)
  const { salt, hash } = createPasswordRecord(password)
  const profile = encryptJson({
    username,
    displayName,
    role,
  })

  const sql = existing
    ? `
      UPDATE users
      SET password_salt = ${sqlQuote(salt)},
          password_hash = ${sqlQuote(hash)},
          role = ${sqlQuote(role)},
          profile_ciphertext = ${sqlQuote(profile)},
          updated_at = ${sqlQuote(now)}
      WHERE username = ${sqlQuote(username)};
    `
    : `
      INSERT INTO users (username, password_salt, password_hash, role, profile_ciphertext, created_at, updated_at)
      VALUES (${sqlQuote(username)}, ${sqlQuote(salt)}, ${sqlQuote(hash)}, ${sqlQuote(role)}, ${sqlQuote(profile)}, ${sqlQuote(now)}, ${sqlQuote(now)});
    `

  runSql(sql)
  return getUserByUsername(username)
}

function getUserRow(username) {
  const rows = queryJson(`SELECT * FROM users WHERE username = ${sqlQuote(username)} LIMIT 1;`)
  return rows[0] ?? null
}

function getUserByUsername(username) {
  const row = getUserRow(username)
  if (!row) {
    return null
  }

  const profile = decryptJson(row.profile_ciphertext) ?? {}
  return {
    username: row.username,
    displayName: profile.displayName ?? row.username,
    role: profile.role ?? row.role ?? 'user',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function authenticateUser(username, password) {
  const row = getUserRow(username)
  if (!row) {
    return null
  }

  if (!verifyPassword(password, row.password_salt, row.password_hash)) {
    return null
  }

  return getUserByUsername(username)
}

function listUsers() {
  return queryJson('SELECT username FROM users ORDER BY created_at ASC;')
    .map((row) => getUserByUsername(row.username))
    .filter(Boolean)
}

function getMasterUser() {
  const rows = queryJson(
    "SELECT username FROM users WHERE role = 'master' ORDER BY created_at ASC LIMIT 1;",
  )
  return rows[0] ? getUserByUsername(rows[0].username) : null
}

function upsertInstalledApp(record) {
  const installedAt = record.installedAt ?? new Date().toISOString()
  const source = record.source ?? 'panel'
  const storedRecord = {
    id: record.id,
    name: record.name,
    image: record.image,
    description: record.description,
    icon: record.icon,
    accent: record.accent,
    highlights: Array.isArray(record.highlights) ? record.highlights : [],
    version: record.version ?? null,
    storeId: record.storeId ?? null,
    storeName: record.storeName ?? null,
    storeType: record.storeType ?? null,
    source,
    installedAt,
  }

  const sql = `
    INSERT INTO app_installs (app_id, record_ciphertext, installed_at, source)
    VALUES (${sqlQuote(record.id)}, ${sqlQuote(encryptJson(storedRecord))}, ${sqlQuote(installedAt)}, ${sqlQuote(source)})
    ON CONFLICT(app_id) DO UPDATE SET
      record_ciphertext = excluded.record_ciphertext,
      installed_at = excluded.installed_at,
      source = excluded.source;
  `

  runSql(sql)
  return storedRecord
}

function getInstalledAppRecords() {
  return queryJson('SELECT app_id, record_ciphertext, installed_at, source FROM app_installs ORDER BY installed_at DESC;')
    .map((row) => {
      const record = decryptJson(row.record_ciphertext)
      if (!record) {
        return null
      }

      return {
        ...record,
        source: row.source,
        installedAt: row.installed_at,
      }
    })
    .filter(Boolean)
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

function ensureMasterUser({ username, password, displayName }) {
  const existingMaster = getMasterUser()
  if (existingMaster) {
    return existingMaster
  }

  const existingAccount = getUserRow(username)
  if (existingAccount) {
    return null
  }

  upsertUser({
    username,
    password,
    displayName,
    role: 'master',
  })
}

initSchema()
maybeMigrateLegacyInstalledApps()

module.exports = {
  authenticateUser,
  ensureMasterUser,
  getUserByUsername,
  getMasterUser,
  getInstalledAppRecords,
  listUsers,
  upsertInstalledApp,
  upsertUser,
}
