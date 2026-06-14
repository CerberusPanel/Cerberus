// src/services/github.service.js

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function cloneRepositoryToTemp(repoUrl, branch) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cerberus-appstore-"));
  try {
    execFileSync(
      "git",
      ["clone", "--depth", "1", "--single-branch", "--branch", branch, repoUrl, tempRoot],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    return tempRoot;
  } catch (error) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    throw error;
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

    const contentType = response.headers.get("content-type") ?? guessMimeType(trimmed);
    const payload = Buffer.from(await response.arrayBuffer()).toString("base64");
    return `data:${contentType};base64,${payload}`;
  } catch (error) {
    return null;
  }
}

function guessMimeType(filePath) {
  const lower = String(filePath ?? "").toLowerCase();

  if (lower.endsWith(".png")) {
    return "image/png";
  }

  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  if (lower.endsWith(".svg")) {
    return "image/svg+xml";
  }

  if (lower.endsWith(".webp")) {
    return "image/webp";
  }

  return "application/octet-stream";
}

module.exports = {
  cloneRepositoryToTemp,
  isRemoteUrl,
  readRemoteDataUrl,
  readRemoteText,
};
