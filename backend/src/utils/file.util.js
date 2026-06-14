// src/utils/file.util.js
const fs = require("fs");
const fs = require("fs");
const path = require("node:path");
const YAML = require("yaml");

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

function guessMimeType(filePath) {
  const lower = String(filePath ?? '').toLowerCase()

  if (lower.endsWith('.png')) {
    return 'image/png'
  }

  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
    return 'image/jpeg'
  }

  if (lower.endsWith('.svg')) {
    return 'image/svg+xml'
  }

  if (lower.endsWith('.webp')) {
    return 'image/webp'
  }

  return 'application/octet-stream'
}
