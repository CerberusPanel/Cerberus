// src/services/systeminfo.service.js

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const { withTimeout } = require("../utils/timeout.util");

const execFileAsync = promisify(execFile);
const CPU_CORES = os.cpus().length;
const HOST_OS_RELEASE_PATHS = [
  "/host/etc/os-release",
  "/etc/os-release",
  "/usr/lib/os-release",
];
const PUBLIC_IP_TTL_MS = 10 * 60 * 1000;

let cachedPublicIp = null;
let cachedPublicIpResolvedAt = 0;
let cachedPublicIpPromise = null;

function parseOsRelease(content) {
  return content
    .split("\n")
    .reduce((accumulator, line) => {
      const separatorIndex = line.indexOf("=");
      if (separatorIndex === -1) {
        return accumulator;
      }

      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim().replace(/^"(.*)"$/, "$1");
      accumulator[key] = value;
      return accumulator;
    }, {});
}

function getDistroName() {
  const override = String(process.env.HOST_OS_NAME_OVERRIDE ?? "").trim();
  if (override) {
    return override;
  }

  for (const filePath of HOST_OS_RELEASE_PATHS) {
    try {
      const content = fs.readFileSync(filePath, "utf8");
      const releaseInfo = parseOsRelease(content);

      return (
        releaseInfo.PRETTY_NAME ||
        releaseInfo.NAME ||
        releaseInfo.DISTRIB_DESCRIPTION ||
        releaseInfo.ID ||
        `${os.type()} ${os.release()}`
      );
    } catch (error) {
      // Try the next host path before falling back to the kernel string.
    }
  }

  return `${os.type()} ${os.release()}`;
}

async function getArchitecture() {
  try {
    const archResult = await withTimeout(execFileAsync("uname", ["-m"]), null, 500);
    const value = archResult?.stdout?.trim();
    return value || os.arch();
  } catch (error) {
    return os.arch();
  }
}

function readTextFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8").trim();
  } catch (error) {
    return "";
  }
}

function getDeviceManufacturer() {
  return (
    readTextFile("/sys/devices/virtual/dmi/id/sys_vendor") ||
    readTextFile("/sys/devices/virtual/dmi/id/board_vendor") ||
    "Unavailable"
  );
}

function getDeviceModel() {
  return (
    readTextFile("/sys/devices/virtual/dmi/id/product_name") ||
    readTextFile("/sys/devices/virtual/dmi/id/product_version") ||
    "Unavailable"
  );
}

function getCpuModel() {
  return os.cpus()?.[0]?.model ?? "Unavailable";
}

function getGpuVendorLabel(vendorId) {
  const vendorMap = {
    "0x10de": "NVIDIA",
    "0x1002": "AMD",
    "0x8086": "Intel",
  };

  return vendorMap[vendorId?.toLowerCase()] ?? "GPU";
}

function getGpuInfoFromSysfs() {
  try {
    const drmEntries = fs
      .readdirSync("/sys/class/drm", { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^card\d+$/.test(entry.name))
      .map((entry) => `/sys/class/drm/${entry.name}`)
      .map((cardPath) => {
        const vendorId = readTextFile(path.join(cardPath, "device/vendor"));
        const deviceId = readTextFile(path.join(cardPath, "device/device"));
        const driver = readTextFile(path.join(cardPath, "device/uevent"))
          .split("\n")
          .find((line) => line.startsWith("DRIVER="))
          ?.split("=")[1];

        return { vendorId, deviceId, driver };
      })
      .filter((entry) => entry.vendorId || entry.deviceId || entry.driver);

    if (!drmEntries.length) {
      return { present: false, model: null };
    }

    const primary = drmEntries.find((entry) => entry.driver !== "vgem") ?? drmEntries[0];
    const vendorLabel = getGpuVendorLabel(primary.vendorId);
    const model = primary.deviceId
      ? `${vendorLabel} (${primary.vendorId ?? "unknown"}:${primary.deviceId})`
      : vendorLabel;

    return {
      present: true,
      model,
    };
  } catch (error) {
    return { present: false, model: null };
  }
}

function hasGpuDevice() {
  return getGpuInfoFromSysfs().present;
}

async function getGpuModel() {
  const sysfsInfo = getGpuInfoFromSysfs();

  if (!sysfsInfo.present) {
    return null;
  }

  try {
    const gpuResult = await withTimeout(
      execFileAsync("nvidia-smi", ["--query-gpu=name", "--format=csv,noheader"]),
      null,
      1200,
    );

    const model = gpuResult?.stdout?.trim().split("\n").filter(Boolean)[0];
    return model || sysfsInfo.model;
  } catch (error) {
    return sysfsInfo.model;
  }
}

async function getSystemInfo() {
  const hostname = os.hostname();
  const gpuInfo = getGpuInfoFromSysfs();
  const localIp =
    Object.values(os.networkInterfaces())
      .flat()
      .find((entry) => entry && !entry.internal && entry.family === "IPv4")?.address ?? "Unavailable";
  const publicIp = await getPublicIp();

  return {
    hostname,
    os: getDistroName(),
    kernel: os.release(),
    architecture: await getArchitecture(),
    manufacturer: getDeviceManufacturer(),
    model: getDeviceModel(),
    cpu: getCpuModel(),
    gpu: await getGpuModel(),
    gpuPresent: gpuInfo.present,
    cores: CPU_CORES,
    memory: {
      total: os.totalmem(),
      percent: totalMemoryPercent(),
    },
    localIp,
    publicIp,
    upSince: new Date(Date.now() - os.uptime() * 1000).toISOString(),
    uptimeSeconds: os.uptime(),
  };
}
function totalMemoryPercent() {
  const total = os.totalmem();
  const used = total - os.freemem();
  return total === 0 ? 0 : Number(((used / total) * 100).toFixed(1));
}

async function getPublicIp() {
  if (cachedPublicIp && Date.now() - cachedPublicIpResolvedAt < PUBLIC_IP_TTL_MS) {
    return cachedPublicIp;
  }

  if (cachedPublicIpPromise) {
    return cachedPublicIpPromise;
  }

  cachedPublicIpPromise = (async () => {
  try {
    const { stdout } = await execFileAsync("sh", [
      "-lc",
      "curl -fsS https://api.ipify.org || curl -fsS https://ifconfig.me || true",
    ]);

    const value = stdout.trim();
    cachedPublicIp = value || null;
    cachedPublicIpResolvedAt = Date.now();
    return cachedPublicIp;
  } catch (error) {
    cachedPublicIp = null;
    cachedPublicIpResolvedAt = Date.now();
    return null;
  } finally {
    cachedPublicIpPromise = null;
  }
  })();

  return cachedPublicIpPromise;
}

module.exports = {
  getSystemInfo
}
