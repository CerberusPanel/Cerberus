// src/services/installedApps.service.js

const storage = require("../storage");
const { decryptJson, encryptJson } = require("../utils/crypto.util");
const { queryJson, runSql, sqlQuote } = require("../utils/database.util");
const { normalizeAppReference, normalizeContainerName } = require("../utils/normalise.util");

function readInstalledAppRecords() {
  return storage.getInstalledAppRecords();
}

function writeInstalledAppRecords(records) {
  for (const record of records) {
    storage.upsertInstalledApp(record);
  }
}

function getContainerPrimaryName(container) {
  return normalizeContainerName(container?.Names?.[0] ?? container?.Name ?? container?.Id ?? "");
}

function getInstalledAppSnapshot() {
  return readInstalledAppRecords()
    .filter((record) => record && record.id && record.name && record.image)
    .sort((left, right) => new Date(right.installedAt ?? 0).getTime() - new Date(left.installedAt ?? 0).getTime());
}

function matchInstalledAppToContainer(record, containers) {
  return (
    containers.find((container) => {
      const labelMatch = container.Labels?.["cerberus.appId"] === record.id;
      const imageMatch = normalizeAppReference(container.Image) === normalizeAppReference(record.image);
      const nameMatch = getContainerPrimaryName(container) === normalizeContainerName(record.name);

      return labelMatch || imageMatch || nameMatch;
    }) ?? null
  );
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

module.exports = {
  upsertInstalledApp,
  getInstalledAppSnapshot,
  matchInstalledAppToContainer,
  getInstalledAppRecords,
  readInstalledAppRecords,
}
