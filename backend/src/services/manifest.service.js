// src/services/manifest.service.js

const fs = require("node:fs");
const path = require("node:path");
const YAML = require("yaml");
const {
  getManifestVersion,
  normalizeHighlights,
  normalizeManifestValue,
  normalizeStringArray,
} = require("../utils/normalise.util");

function readTextFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8").trim();
  } catch (error) {
    return "";
  }
}

function readJsonFile(filePath, fallback) {
  try {
    const content = readTextFile(filePath);
    if (!content) {
      return fallback;
    }

    return JSON.parse(content);
  } catch (error) {
    return fallback;
  }
}

function isRemoteUrl(value) {
  const trimmed = String(value ?? "").trim();
  return /^https?:\/\//i.test(trimmed);
}

async function readRemoteText(url) {
  const trimmed = String(url ?? "").trim();
  if (!isRemoteUrl(trimmed)) {
    return "";
  }

  try {
    const response = await fetch(trimmed, {
      headers: {
        "User-Agent": "CerberusAppStore/1.0",
        Accept: "text/plain, text/markdown, application/octet-stream;q=0.9, */*;q=0.8",
      },
    });

    if (!response.ok) {
      return "";
    }

    return (await response.text()).trim();
  } catch (error) {
    return "";
  }
}

async function readRemoteDataUrl(url) {
  const trimmed = String(url ?? "").trim();
  if (!isRemoteUrl(trimmed)) {
    return null;
  }

  try {
    const response = await fetch(trimmed, {
      headers: {
        "User-Agent": "CerberusAppStore/1.0",
        Accept: "image/*, application/octet-stream;q=0.9, */*;q=0.8",
      },
    });

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get("content-type") ?? "application/octet-stream";
    const payload = Buffer.from(await response.arrayBuffer()).toString("base64");
    return `data:${contentType};base64,${payload}`;
  } catch (error) {
    return null;
  }
}

function loadStoreMetadataFromRepositoryRoot(directoryPath) {
  const parsed = readJsonFile(path.join(directoryPath, "data.json"), {});
  return parsed && typeof parsed === "object" ? parsed : {};
}

function loadAppManifestFromFile(filePath) {
  const yamlContent = readTextFile(filePath);
  if (!yamlContent) {
    return {};
  }

  try {
    const parsed = YAML.parse(yamlContent);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    return {};
  }
}

function listAppManifestsForRepository(repositoryRoot) {
  if (!repositoryRoot || !fs.existsSync(repositoryRoot) || !fs.statSync(repositoryRoot).isDirectory()) {
    return [];
  }

  const appsDirectory = path.join(repositoryRoot, "apps");
  if (fs.existsSync(appsDirectory) && fs.statSync(appsDirectory).isDirectory()) {
    return fs
      .readdirSync(appsDirectory, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isFile() &&
          !entry.name.startsWith(".") &&
          /\.(ya?ml)$/i.test(entry.name) &&
          entry.name !== "data.yml" &&
          entry.name !== "data.yaml",
      )
      .map((entry) => ({
        name: entry.name,
        path: path.join(appsDirectory, entry.name),
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  return [];
}

async function buildAppRecord(manifestPath, storeMeta) {
  const appMeta = loadAppManifestFromFile(manifestPath);
  const manifestFileName = path.basename(manifestPath, path.extname(manifestPath));

  const manifest = normalizeManifestValue(appMeta);
  const readmeUrl = String(manifest.readme ?? manifest.readmeUrl ?? "").trim();
  let readmeText = "";

  if (isRemoteUrl(readmeUrl)) {
    readmeText = await readRemoteText(readmeUrl);
  }

  const logoUrl = isRemoteUrl(manifest.logo) ? await readRemoteDataUrl(manifest.logo) : null;
  const selectedVersion = getManifestVersion(manifest);
  const storeType = String(storeMeta?.type ?? "github").trim() || "github";
  const storeSource = String(storeMeta?.source ?? storeType).trim() || storeType;
  const storeId = String(storeMeta?.id ?? "").trim() || null;
  const storeName = String(storeMeta?.name ?? "").trim() || null;
  const manifestJson = JSON.stringify({
    ...manifest,
    readme: readmeUrl || null,
    logo: String(manifest.logo ?? "").trim() || null,
    versions: Array.isArray(manifest.versions) ? manifest.versions : [],
    deployments: Array.isArray(manifest.deployments) ? manifest.deployments : [],
  });
  const appId = String(manifest.id ?? manifestFileName).trim();
  const appName = String(manifest.name ?? manifestFileName).trim();

  return {
    id: appId,
    name: appName,
    logo: logoUrl || String(manifest.logo ?? "").trim() || null,
    description: String(manifest.description ?? "").trim(),
    category: String(manifest.category ?? "").trim() || undefined,
    featured: Boolean(manifest.featured ?? false),
    image: String(manifest.image ?? "").trim(),
    tags: normalizeStringArray(manifest.tags ?? []),
    highlights: normalizeHighlights(manifest.highlights ?? []),
    readme: readmeText || "",
    version: selectedVersion || null,
    defaultVersion: selectedVersion || null,
    storeId,
    storeName,
    storeType,
    storeSource,
    source: storeSource,
    manifest: JSON.parse(manifestJson),
    logoUrl,
    readmeText: readmeText || null,
  };
}

module.exports = {
  loadAppManifestFromFile,
  loadStoreMetadataFromRepositoryRoot,
  listAppManifestsForRepository,
  buildAppRecord,
};
