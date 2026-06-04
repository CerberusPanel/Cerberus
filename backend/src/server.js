const express = require("express");
const cors = require("cors");
const Docker = require("dockerode");
const os = require("os");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");
const { promisify } = require("util");
const { WebSocketServer } = require("ws");
const appRegistry = require("./appRegistry");
const storage = require("./storage");

const app = express();
const docker = new Docker({ socketPath: "/var/run/docker.sock" });
const execFileAsync = promisify(execFile);
let previousCpuSnapshot = null;
const connectedSockets = new Set();
let socketBroadcastTimer = null;
let socketBroadcastInFlight = false;
let cachedPublicIp = null;
let cachedPublicIpResolvedAt = 0;
let cachedPublicIpPromise = null;
let cachedDashboardSnapshot = null;
let cachedDashboardSnapshotAt = 0;
const PUBLIC_IP_TTL_MS = 5 * 60 * 1000;
const DASHBOARD_SNAPSHOT_TTL_MS = 900;
const CPU_CORES = os.cpus().length;
const DATA_DIR = path.resolve(__dirname, "../../data");
const AUTH_SECRET_PATH = path.join(DATA_DIR, "auth-secret.txt");
const AUTH_TOKEN_TTL_MS = Number(process.env.AUTH_TOKEN_TTL_SECONDS ?? 28800) * 1000;
const MASTER_USERNAME = String(process.env.MASTER_USERNAME ?? "admin").trim() || "admin";
const MASTER_PASSWORD = String(process.env.MASTER_PASSWORD ?? "change-me");
const MASTER_DISPLAY_NAME = String(process.env.MASTER_DISPLAY_NAME ?? "Master Admin");
const HOST_OS_RELEASE_PATHS = [
  process.env.HOST_OS_RELEASE_PATH,
  "/host/etc/os-release",
  "/host/usr/lib/os-release",
].filter(Boolean);

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readInstalledAppRecords() {
  return storage.getInstalledAppRecords();
}

function writeInstalledAppRecords(records) {
  for (const record of records) {
    storage.upsertInstalledApp(record);
  }
}

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

function getAuthSecret() {
  ensureDataDir();

  try {
    const secret = fs.readFileSync(AUTH_SECRET_PATH, "utf8").trim();
    if (secret) {
      return secret;
    }
  } catch (error) {
    // Generate a fresh secret below.
  }

  const secret = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(AUTH_SECRET_PATH, `${secret}\n`);
  return secret;
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signAuthPayload(payload) {
  const serializedPayload = JSON.stringify(payload);
  const secret = getAuthSecret();
  const signature = crypto.createHmac("sha256", secret).update(serializedPayload).digest("base64url");
  return `${base64UrlEncode(serializedPayload)}.${signature}`;
}

function verifyAuthToken(token) {
  if (!token || typeof token !== "string") {
    return null;
  }

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    return null;
  }

  try {
    const serializedPayload = base64UrlDecode(encodedPayload);
    const expectedSignature = crypto
      .createHmac("sha256", getAuthSecret())
      .update(serializedPayload)
      .digest("base64url");

    const provided = Buffer.from(signature);
    const expected = Buffer.from(expectedSignature);
    if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
      return null;
    }

    const payload = JSON.parse(serializedPayload);
    if (!payload?.username || !Number.isFinite(payload?.exp) || payload.exp < Date.now()) {
      return null;
    }

    return payload;
  } catch (error) {
    return null;
  }
}

function getTokenFromRequest(req) {
  const header = req.headers.authorization ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

function getSystemUserProfile(username) {
  return storage.getUserByUsername(username) ?? {
    username,
    displayName: username,
    role: "user",
    createdAt: null,
    updatedAt: null,
  };
}

async function authenticateSystemAccount(username, password) {
  if (username === MASTER_USERNAME && password === MASTER_PASSWORD) {
    return getSystemUserProfile(MASTER_USERNAME);
  }

  const user = storage.authenticateUser(username, password);
  if (!user) {
    const invalidError = new Error("Invalid credentials");
    invalidError.code = "INVALID_CREDENTIALS";
    throw invalidError;
  }

  return user;
}

function createAuthToken(user) {
  const issuedAt = Date.now();
  const payload = {
    username: user.username,
    displayName: user.displayName,
    role: user.role ?? "user",
    issuedAt,
    exp: issuedAt + AUTH_TOKEN_TTL_MS,
  };

  return {
    token: signAuthPayload(payload),
    payload,
  };
}

function requireAuth(req, res, next) {
  if (req.path === "/api/health" || req.path === "/api/auth/login") {
    return next();
  }

  const token = getTokenFromRequest(req);
  const payload = verifyAuthToken(token);

  if (!payload) {
    return res.status(401).json({
      error: "Authentication required",
    });
  }

  req.auth = payload;
  return next();
}

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

function withTimeout(promise, fallback, timeoutMs = 1500) {
  let timeoutId;

  return Promise.race([
    Promise.resolve(promise)
      .then((value) => ({ state: "fulfilled", value }))
      .catch(() => ({ state: "rejected" })),
    new Promise((resolve) => {
      timeoutId = setTimeout(() => resolve({ state: "timeout" }), timeoutMs);
    }),
  ])
    .then((result) => {
      if (result.state === "fulfilled") {
        return result.value;
      }

      return fallback;
    })
    .finally(() => {
      clearTimeout(timeoutId);
    });
}

app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
  }
  next();
});
app.use(requireAuth);

const masterAccountBeforeBootstrap = storage.getMasterUser();
const bootstrapMasterUser = storage.ensureMasterUser({
  username: MASTER_USERNAME,
  password: MASTER_PASSWORD,
  displayName: MASTER_DISPLAY_NAME,
});

if (masterAccountBeforeBootstrap || !bootstrapMasterUser) {
  console.log("Master account already exists; environment bootstrap ignored.");
}

app.get("/api/health", (req, res) => {
  res.json({
    name: "Cerberus",
    status: "online",
    message: "Cerberus backend is running",
  });
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const username = String(req.body?.username ?? "").trim();
    const password = String(req.body?.password ?? "");

    if (!username || !password) {
      return res.status(400).json({
        error: "Username and password are required",
      });
    }

    const user = await authenticateSystemAccount(username, password);
    const { token, payload } = createAuthToken(user);

    return res.json({
      token,
      user,
      expiresAt: payload.exp,
    });
  } catch (error) {
    return res.status(401).json({
      error: "Invalid credentials",
    });
  }
});

app.get("/api/auth/me", (req, res) => {
  const token = getTokenFromRequest(req);
  const payload = verifyAuthToken(token);

  if (!payload) {
    return res.status(401).json({
      error: "Authentication required",
    });
  }

  return res.json({
    token: token,
    user: getSystemUserProfile(payload.username),
    expiresAt: payload.exp,
  });
});

app.get("/api/users", (req, res) => {
  if (req.auth?.role !== "master") {
    return res.status(403).json({
      error: "Master account required",
    });
  }

  return res.json(storage.listUsers());
});

app.post("/api/users", (req, res) => {
  if (req.auth?.role !== "master") {
    return res.status(403).json({
      error: "Master account required",
    });
  }

  try {
    const username = String(req.body?.username ?? "").trim();
    const displayName = String(req.body?.displayName ?? username).trim() || username;
    const password = String(req.body?.password ?? "");

    if (!username || !password) {
      return res.status(400).json({
        error: "Username and password are required",
      });
    }

    const user = storage.upsertUser({
      username,
      displayName,
      password,
      role: "user",
    });

    return res.status(201).json(user);
  } catch (error) {
    return res.status(500).json({
      error: "Unable to create user",
      details: error.message,
    });
  }
});

app.get("/api/docker/containers", async (req, res) => {
  try {
    const containers = await withTimeout(docker.listContainers({ all: true }), []);
    res.json(containers);
  } catch (error) {
    res.status(500).json({
      error: "Unable to access Docker",
      details: error.message,
    });
  }
});

app.get("/api/apps/catalog", (req, res) => {
  res.json(appRegistry.listCatalogApps());
});

app.get("/api/apps/catalog/:appId", (req, res) => {
  const appId = String(req.params.appId ?? "").trim();
  const appEntry = appRegistry.getCatalogApp(appId);

  if (!appEntry) {
    return res.status(404).json({
      error: "App not found",
    });
  }

  return res.json(appEntry);
});

app.get("/api/apps/stores", (req, res) => {
  return res.json(appRegistry.listStores());
});

app.post("/api/apps/stores", (req, res) => {
  if (req.auth?.role !== "master") {
    return res.status(403).json({
      error: "Only the master account can add app stores",
    });
  }

  try {
    const store = appRegistry.upsertGitHubStore({
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

app.post("/api/apps/stores/:storeId/sync", (req, res) => {
  if (req.auth?.role !== "master") {
    return res.status(403).json({
      error: "Only the master account can sync app stores",
    });
  }

  try {
    const syncedStore = appRegistry.syncStore(req.params.storeId);
    return res.json(syncedStore);
  } catch (error) {
    return res.status(400).json({
      error: "Unable to sync app store",
      details: error.message,
    });
  }
});

app.get("/api/apps/installed", async (req, res) => {
  try {
    const [records, containers] = await Promise.all([
      Promise.resolve(getInstalledAppSnapshot()),
      getContainerInventory(),
    ]);

    const installedApps = records.map((record) => {
      const container = matchInstalledAppToContainer(record, containers);

      return {
        ...record,
        container,
      };
    });

    res.json(installedApps);
  } catch (error) {
    res.status(500).json({
      error: "Unable to read installed apps",
      details: error.message,
    });
  }
});

app.post("/api/apps/install", (req, res) => {
  try {
    const requestedId = String(req.body?.appId ?? "").trim();
    const catalogEntry = appRegistry.getCatalogApp(requestedId);

    if (!catalogEntry) {
      return res.status(404).json({
        error: "App not found",
      });
    }

    const existingRecord = getInstalledAppSnapshot().find((record) => record.id === catalogEntry.id);
    const nextRecord = storage.upsertInstalledApp({
      id: catalogEntry.id,
      name: catalogEntry.name,
      image: catalogEntry.image,
      description: catalogEntry.description,
      icon: catalogEntry.icon,
      accent: catalogEntry.accent,
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

async function getSystemInfo() {
  const hostname = os.hostname();
  const gpuInfo = getGpuInfoFromSysfs();
  const localIp =
    Object.values(os.networkInterfaces())
      .flat()
      .find((entry) => entry && !entry.internal && entry.family === "IPv4")?.address ?? "Unavailable";

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

function getCpuUsageSnapshot() {
  const cpus = os.cpus();
  const currentSnapshot = cpus.map((cpu) => {
    const times = cpu.times;
    const user = Number(times.user ?? 0);
    const nice = Number(times.nice ?? 0);
    const sys = Number(times.sys ?? 0);
    const irq = Number(times.irq ?? 0);
    const idleTime = Number(times.idle ?? 0);
    const iowait = Number(times.iowait ?? 0);
    const idle = idleTime + iowait;
    const total = user + nice + sys + irq + idleTime + iowait;

    return { idle, total };
  });

  if (!previousCpuSnapshot) {
    previousCpuSnapshot = currentSnapshot;
    return {
      overall: 0,
      cores: cpus.map(() => 0),
    };
  }

  let idleDiff = 0;
  let totalDiff = 0;
  const cores = currentSnapshot.map((snapshot, index) => {
    const previous = previousCpuSnapshot[index];

    if (!previous) {
      return 0;
    }

    const coreIdleDiff = snapshot.idle - previous.idle;
    const coreTotalDiff = snapshot.total - previous.total;
    if (!Number.isFinite(coreIdleDiff) || !Number.isFinite(coreTotalDiff)) {
      return 0;
    }
    idleDiff += coreIdleDiff;
    totalDiff += coreTotalDiff;
    return coreTotalDiff === 0 ? 0 : Number(((1 - coreIdleDiff / coreTotalDiff) * 100).toFixed(1));
  });

  previousCpuSnapshot = currentSnapshot;
  if (!Number.isFinite(idleDiff) || !Number.isFinite(totalDiff)) {
    return {
      overall: 0,
      cores: cpus.map(() => 0),
    };
  }
  return {
    overall: totalDiff === 0 ? 0 : Number(((1 - idleDiff / totalDiff) * 100).toFixed(1)),
    cores,
  };
}

function getMemoryUsage() {
  const total = os.totalmem();
  const used = total - os.freemem();

  return {
    total,
    used,
    percent: total === 0 ? 0 : Number(((used / total) * 100).toFixed(1)),
  };
}

async function getGpuUsagePercent() {
  if (!hasGpuDevice()) {
    return null;
  }

  try {
    const gpuResult = await withTimeout(
      execFileAsync("nvidia-smi", [
        "--query-gpu=utilization.gpu",
        "--format=csv,noheader,nounits",
      ]),
      null,
      1200,
    );

    if (!gpuResult?.stdout) {
      return null;
    }

    const values = gpuResult.stdout
      .trim()
      .split("\n")
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isFinite(value));

    if (!values.length) {
      return null;
    }

    return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1));
  } catch (error) {
    return null;
  }
}

function collectMountedMountpoints(node) {
  const mountpoints = [];

  if (node.mountpoint) {
    mountpoints.push(node.mountpoint);
  }

  for (const child of node.children ?? []) {
    mountpoints.push(...collectMountedMountpoints(child));
  }

  return mountpoints;
}

function readMountTable() {
  try {
    const content = fs.readFileSync("/proc/mounts", "utf8");
    return content
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [source, mountpoint] = line.split(/\s+/);
        return { source, mountpoint };
      });
  } catch (error) {
    return [];
  }
}

async function getDriveUsage() {
  try {
    const [mounts, dfResult, blockEntries] = await Promise.all([
      Promise.resolve(readMountTable()),
      execFileAsync("df", ["-B1", "-P"]),
      fs.promises.readdir("/sys/block"),
    ]);

    const dfLines = dfResult.stdout.trim().split("\n").slice(1);
    const dfUsageByMountpoint = new Map(
      dfLines
        .map((line) => line.trim().split(/\s+/))
        .filter((parts) => parts.length >= 6)
        .map((parts) => {
          const [filesystem, size, used, available, percent, mountpoint] = parts;
          return [
            mountpoint,
            {
              filesystem,
              size: Number(size),
              used: Number(used),
              available: Number(available),
              percent: Number(percent.replace("%", "")),
              mountpoint,
            },
          ];
        }),
    );

    const mountpointsBySource = new Map();
    for (const mount of mounts) {
      if (!mount.source.startsWith("/dev/")) {
        continue;
      }

      const current = mountpointsBySource.get(mount.source) ?? [];
      current.push(mount.mountpoint);
      mountpointsBySource.set(mount.source, current);
    }

    return blockEntries
      .filter((entry) => {
        if (entry.startsWith("loop") || entry.startsWith("ram") || entry.startsWith("zram")) {
          return false;
        }

        return !entry.startsWith("dm-") && !entry.startsWith("md");
      })
      .map((diskName) => {
        const diskPath = path.join("/sys/block", diskName);
        const statPath = path.join(diskPath, "size");
        const sizeSectors = Number(fs.readFileSync(statPath, "utf8").trim() || "0");
        const sizeBytes = sizeSectors > 0 ? sizeSectors * 512 : 0;

        const partitionEntries = fs.readdirSync(diskPath, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name)
          .filter((entry) => fs.existsSync(path.join(diskPath, entry, "partition")));

        const sourceDevices = [`/dev/${diskName}`, ...partitionEntries.map((partition) => `/dev/${partition}`)];
        const mountpoints = sourceDevices.flatMap((source) => mountpointsBySource.get(source) ?? []);
        const uniqueMountpoints = [...new Set(mountpoints)];
        const mountedUsage = uniqueMountpoints
          .map((mountpoint) => dfUsageByMountpoint.get(mountpoint))
          .filter(Boolean);

        const primaryUsage =
          mountedUsage.find((entry) => entry.mountpoint === "/") ??
          mountedUsage.slice().sort((left, right) => right.size - left.size)[0] ??
          null;
        const primaryMountpoint =
          primaryUsage?.mountpoint && !primaryUsage.mountpoint.startsWith("/app/")
            ? primaryUsage.mountpoint
            : "/";

        const size = primaryUsage?.size ?? sizeBytes;
        const used = primaryUsage?.used ?? 0;
        const available = primaryUsage?.available ?? Math.max(0, size - used);
        const percent = size > 0 ? Number(((used / size) * 100).toFixed(1)) : 0;

        return {
          name: diskName,
          size,
          used,
          available,
          percent,
          mountpoints: [primaryMountpoint],
        };
      });
  } catch (error) {
    return [];
  }
}

function readNetworkStats() {
  try {
    const content = fs.readFileSync("/proc/net/dev", "utf8");
    return content
      .split("\n")
      .slice(2)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [namePart, dataPart] = line.split(":");
        const values = dataPart.trim().split(/\s+/).map((value) => Number(value));
        return {
          name: namePart.trim(),
          rxBytes: values[0] ?? 0,
          rxPackets: values[1] ?? 0,
          txBytes: values[8] ?? 0,
          txPackets: values[9] ?? 0,
        };
      });
  } catch (error) {
    return [];
  }
}

function readDiskStats() {
  try {
    const content = fs.readFileSync("/proc/diskstats", "utf8");
    return content
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [
          major,
          minor,
          name,
          readsCompleted,
          readsMerged,
          sectorsRead,
          readTimeMs,
          writesCompleted,
          writesMerged,
          sectorsWritten,
          writeTimeMs,
        ] = line.split(/\s+/);

        return {
          name,
          major: Number(major),
          minor: Number(minor),
          readsCompleted: Number(readsCompleted),
          readsMerged: Number(readsMerged),
          sectorsRead: Number(sectorsRead),
          readTimeMs: Number(readTimeMs),
          writesCompleted: Number(writesCompleted),
          writesMerged: Number(writesMerged),
          sectorsWritten: Number(sectorsWritten),
          writeTimeMs: Number(writeTimeMs),
        };
      })
      .filter((entry) => entry.name && !entry.name.startsWith("loop") && !entry.name.startsWith("ram"));
  } catch (error) {
    return [];
  }
}

async function buildDashboardSnapshot() {
  const snapshotTimestamp = Date.now();
  const [system, containers, drives, gpuUsagePercent, diskItems, networkItems] = await Promise.all([
    getSystemInfo(),
    withTimeout(docker.listContainers({ all: true }), []),
    withTimeout(getDriveUsage(), []),
    getGpuUsagePercent(),
    Promise.resolve(readDiskStats()),
    Promise.resolve(readNetworkStats()),
  ]);
  const cpuUsage = getCpuUsageSnapshot();

  const status = {
    cpuUsagePercent: cpuUsage.overall,
    cpuLoadPercent: cpuUsage.overall,
    cpuCoreUsagePercent: cpuUsage.cores,
    gpuUsagePercent: gpuUsagePercent ?? null,
    gpuPresent: system.gpuPresent,
    memory: getMemoryUsage(),
    drives,
    containerCount: containers.length,
    cpuCount: CPU_CORES,
    system,
  };

  return {
    system,
    status,
    monitoring: {
      disk: {
        mode: "disk",
        items: diskItems,
        timestamp: snapshotTimestamp,
      },
      network: {
        mode: "network",
        items: networkItems,
        timestamp: snapshotTimestamp,
      },
    },
  };
}

async function collectDashboardSnapshot(forceFresh = false) {
  if (!forceFresh && cachedDashboardSnapshot && Date.now() - cachedDashboardSnapshotAt < DASHBOARD_SNAPSHOT_TTL_MS) {
    return cachedDashboardSnapshot;
  }

  const snapshot = await buildDashboardSnapshot();
  cachedDashboardSnapshot = snapshot;
  cachedDashboardSnapshotAt = Date.now();
  return snapshot;
}

async function sendDashboardSnapshot(socket, snapshot) {
  if (socket.readyState !== 1) {
    return;
  }

  const monitoring = socket.monitorMode === "network" ? snapshot.monitoring.network : snapshot.monitoring.disk;
  socket.send(
    JSON.stringify({
      type: "dashboard-snapshot",
      systemInfo: snapshot.system,
      systemStatus: snapshot.status,
      monitoring,
    }),
  );
}

async function broadcastDashboardSnapshot() {
  if (socketBroadcastInFlight || connectedSockets.size === 0) {
    return;
  }

  socketBroadcastInFlight = true;

  try {
    const snapshot = await collectDashboardSnapshot();

    for (const socket of connectedSockets) {
      await sendDashboardSnapshot(socket, snapshot);
    }
  } catch (error) {
    for (const socket of connectedSockets) {
      if (socket.readyState === 1) {
        socket.send(
          JSON.stringify({
            type: "dashboard-error",
            message: "Unable to refresh live dashboard data",
          }),
        );
      }
    }
  } finally {
    socketBroadcastInFlight = false;
  }
}

function ensureDashboardBroadcastLoop() {
  if (socketBroadcastTimer) {
    return;
  }

  socketBroadcastTimer = setInterval(() => {
    void broadcastDashboardSnapshot();
  }, 1000);
  socketBroadcastTimer.ref?.();
}

function maybeStopDashboardBroadcastLoop() {
  if (connectedSockets.size > 0 || !socketBroadcastTimer) {
    return;
  }

  clearInterval(socketBroadcastTimer);
  socketBroadcastTimer = null;
}

app.get("/api/system/info", async (req, res) => {
  try {
    const info = await getSystemInfo();
    res.json(info);
  } catch (error) {
    res.status(500).json({
      error: "Unable to read system information",
      details: error.message,
    });
  }
});

app.get("/api/system/status", async (req, res) => {
  try {
    const snapshot = await collectDashboardSnapshot();
    res.json(snapshot.status);
  } catch (error) {
    res.status(500).json({
      error: "Unable to read system status",
      details: error.message,
    });
  }
});

app.get("/api/system/monitoring", (req, res) => {
  try {
    const mode = req.query.mode === "disk" ? "disk" : "network";
    const entries =
      mode === "disk" ? readDiskStats() : readNetworkStats();

    res.json({
      mode,
      items: entries,
      timestamp: Date.now(),
    });
  } catch (error) {
    res.status(500).json({
      error: "Unable to read monitoring data",
      details: error.message,
    });
  }
});

app.use(express.static("public"));

const PORT = Number(process.env.PORT ?? 3000);
const server = app.listen(PORT, () => {
  console.log(`Cerberus running on port ${PORT}`);
});
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (socket, req) => {
  try {
    const requestUrl = new URL(req.url ?? "/ws", "http://localhost");
    const token = requestUrl.searchParams.get("token");
    if (!verifyAuthToken(token)) {
      socket.close(4401, "Unauthorized");
      return;
    }
  } catch (error) {
    socket.close(4401, "Unauthorized");
    return;
  }

  socket.monitorMode = "disk";
  connectedSockets.add(socket);
  ensureDashboardBroadcastLoop();

  void collectDashboardSnapshot().then((snapshot) => sendDashboardSnapshot(socket, snapshot));

  socket.on("message", (message) => {
    try {
      const payload = JSON.parse(message.toString());

      if (payload.type === "set-monitor-mode" && (payload.mode === "disk" || payload.mode === "network")) {
        socket.monitorMode = payload.mode;
        void collectDashboardSnapshot(true).then((snapshot) => sendDashboardSnapshot(socket, snapshot));
      }
    } catch (error) {
      socket.send(
        JSON.stringify({
          type: "dashboard-error",
          message: "Invalid websocket message",
        }),
      );
    }
  });

  socket.on("close", () => {
    connectedSockets.delete(socket);
    maybeStopDashboardBroadcastLoop();
  });

  socket.on("error", () => {
    connectedSockets.delete(socket);
    maybeStopDashboardBroadcastLoop();
  });
});

server.on("error", (error) => {
  console.error("Cerberus failed to start", error);
  process.exitCode = 1;
});

server.ref?.();

const keepAlive = setInterval(() => {
  server.getConnections(() => {});
}, 60_000);
keepAlive.ref();

function shutdown() {
  clearInterval(keepAlive);
  wss.close();
  server.close(() => {
    process.exit(0);
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
