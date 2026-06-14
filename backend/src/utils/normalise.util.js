// src/utils/normalise.util.js

function normalizeAppReference(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/@sha256:[a-f0-9]+$/i, "");
}

function normalizeContainerName(value) {
  return String(value ?? "")
    .trim()
    .replace(/^\//, "")
    .toLowerCase();
}

function normalizeStoreId(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function normalizeRepoUrl(repoUrl) {
  const raw = String(repoUrl ?? '').trim()
  if (!raw) {
    return null
  }

  try {
    const url = new URL(raw)
    if (!['github.com', 'www.github.com'].includes(url.hostname.toLowerCase())) {
      return null
    }

    const segments = url.pathname.split('/').filter(Boolean)
    if (segments.length < 2) {
      return null
    }

    const owner = segments[0]
    const repo = segments[1].replace(/\.git$/i, '')
    return {
      owner,
      repo,
      webUrl: `https://github.com/${owner}/${repo}`,
      cloneUrl: `https://github.com/${owner}/${repo}.git`,
      id: normalizeStoreId(`${owner}-${repo}`),
    }
  } catch (error) {
    return null
  }
}

function normalizeHighlights(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((entry) => String(entry ?? '').trim())
    .filter(Boolean)
    .slice(0, 6)
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((entry) => String(entry ?? '').trim())
    .filter(Boolean)
    .slice(0, 8)
}

function normalizeManifestValue(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeManifestValue(entry))
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, normalizeManifestValue(nestedValue)]),
    )
  }

  return value
}

function getManifestVersion(manifest) {
  const deploymentVersion = manifest?.deployments?.[0]?.version
  if (deploymentVersion !== undefined && deploymentVersion !== null && String(deploymentVersion).trim()) {
    return String(deploymentVersion).trim()
  }

  if (Array.isArray(manifest?.versions) && manifest.versions.length > 0) {
    const firstVersion = manifest.versions[0]
    if (firstVersion && typeof firstVersion === 'object') {
      const tag = String(firstVersion.tag ?? '').trim()
      if (tag) {
        return tag
      }
    }

    const fallbackVersion = String(firstVersion ?? '').trim()
    if (fallbackVersion) {
      return fallbackVersion
    }
  }

  return null
}

module.exports = {
  getManifestVersion,
  normalizeAppReference,
  normalizeContainerName,
  normalizeHighlights,
  normalizeManifestValue,
  normalizeRepoUrl,
  normalizeStoreId,
  normalizeStringArray,
}
