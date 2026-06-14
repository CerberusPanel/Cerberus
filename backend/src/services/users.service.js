// src/services/users.service.js

const { decryptJson, encryptJson } = require("../utils/crypto.util");
const { queryJson, runSql, sqlQuote } = require("../utils/database.util");
const { createPasswordRecord, verifyPassword } = require("../utils/password.util");

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
  // Check if username row exists
  const row = getUserRow(username)
  if (!row) {
    return null
  }
  // Verify user password.
  if (!verifyPassword(password, row.password_salt, row.password_hash)) {
    return null
  }
  // 
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

function ensureMasterUser({ username, password, displayName }) {
  const existingMaster = getMasterUser()
  if (existingMaster) {
    return existingMaster
  }

  const existingAccount = getUserRow(username)
  if (existingAccount) {
    return null
  }

  return upsertUser({
    username,
    password,
    displayName,
    role: 'master',
  })
}

module.exports = {
  authenticateUser,
  getMasterUser,
  ensureMasterUser,
  getUserByUsername,
  listUsers,
  upsertUser,
}
