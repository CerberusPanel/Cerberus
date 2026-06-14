// src/routes/apps.routes.js

const { listCatalogApps, getCatalogApp, listStores, upsertGitHubStore, syncStore, syncAllStores } = require("../services/store-sync.service")
const { getInstalledAppSnapshot, matchInstalledAppToContainer, upsertInstalledApp } = require("../services/installedApps.service");
const { readDockerContainers } = require("../services/docker.service");
const express = require("express");
const router = express.Router();

// Get all available apps
router.get("/catalog", (req, res) => {
  res.json(listCatalogApps());
});

// Get details for a specific app
router.get("/catalog/:appId", (req, res) => {
  const appId = String(req.params.appId ?? "").trim();
  const appEntry = getCatalogApp(appId);

  if (!appEntry) {
    return res.status(404).json({
      error: "App not found",
    });
  }

  return res.json(appEntry);
});

// Get all installed apps
router.get("/installed", async (req, res) => {
  try {
    const [recordsResult, containersResult] = await Promise.allSettled([
      Promise.resolve(getInstalledAppSnapshot()),
      readDockerContainers(),
    ]);

    const records = recordsResult.status === "fulfilled" ? recordsResult.value : [];
    const containers = containersResult.status === "fulfilled" ? containersResult.value : [];

    const installedApps = records.map((record) => {
      const container = matchInstalledAppToContainer(record, containers);

      return {
        ...record,
        container,
      };
    });

    res.json(installedApps);
  } catch (error) {
    console.error("Installed apps endpoint failed:", error);
    res.json([]);
  }
});

// Install an app from the catalog
router.post("/install", (req, res) => {
  try {
    const requestedId = String(req.body?.appId ?? "").trim();
    const catalogEntry = getCatalogApp(requestedId);

    if (!catalogEntry) {
      return res.status(404).json({
        error: "App not found",
      });
    }

    const existingRecord = getInstalledAppSnapshot().find((record) => record.id === catalogEntry.id);
    const nextRecord = upsertInstalledApp({
      id: catalogEntry.id,
      name: catalogEntry.name,
      image: catalogEntry.image,
      description: catalogEntry.description,
      highlights: catalogEntry.highlights,
      version: catalogEntry.version ?? catalogEntry.defaultVersion ?? null,
      storeId: catalogEntry.storeId ?? null,
      storeName: catalogEntry.storeName ?? null,
      storeType: catalogEntry.storeType ?? null,
      source: "panel",
      installedAt: existingRecord?.installedAt ?? new Date().toISOString(),
    });

    res.status(existingRecord ? 200 : 201).json({
      ...nextRecord,
      container: null,
    });
  } catch (error) {
    res.status(500).json({
      error: "Unable to record app install",
      details: error.message,
    });
  }
});

// Get all registered app stores
router.get("/stores", (req, res) => {
  return res.json(listStores());
});

// Add or update an app store
router.post("/stores", async (req, res) => {
  if (req.auth?.role !== "master") {
    return res.status(403).json({
      error: "Only the master account can add app stores",
    });
  }

  try {
    const store = await upsertGitHubStore({
      name: String(req.body?.name ?? '').trim(),
      repoUrl: String(req.body?.repoUrl ?? '').trim(),
      branch: String(req.body?.branch ?? 'main').trim() || 'main',
    });

    return res.status(201).json(store);
  } catch (error) {
    return res.status(400).json({
      error: "Unable to add app store",
      details: error.message,
    });
  }
});

// Sync a specific app store
router.post("/stores/:storeId/sync", async (req, res) => {
  if (req.auth?.role !== "master") {
    return res.status(403).json({
      error: "Only the master account can sync app stores",
    });
  }

  try {
    const syncedStore = await syncStore(req.params.storeId);
    return res.json(syncedStore);
  } catch (error) {
    return res.status(400).json({
      error: "Unable to sync app store",
      details: error.message,
    });
  }
});

// Sync all app stores
router.post("/stores/sync-all", async (req, res) => {
  if (req.auth?.role !== "master") {
    return res.status(403).json({
      error: "Only the master account can sync app stores",
    });
  }

  try {
    const syncedStores = await syncAllStores();
    return res.json(syncedStores);
  } catch (error) {
    return res.status(400).json({
      error: "Unable to sync app stores",
      details: error.message,
    });
  }
});

module.exports = router;
