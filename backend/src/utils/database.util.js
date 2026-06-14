// src/utils/database.util.js

const { execFileSync } = require("child_process");
const path = require('path')
const fs = require('fs')

const DATA_DIR = path.resolve(__dirname, '../../data')
const DB_PATH = path.join(DATA_DIR, 'cerberus.db')

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

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

module.exports = {
  queryJson,
  runSql,
  sqlQuote,
}