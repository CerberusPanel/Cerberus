// src/services/monitoring.service.js

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const { getSystemInfo } = require("./systemInfo.service");
const { readDockerContainers } = require("./docker.service");
const { withTimeout } = require("../utils/timeout.util");

const execFileAsync = promisify(execFile);
const CPU_CORES = os.cpus().length;
const DASHBOARD_SNAPSHOT_TTL_MS = 750;

let previousCpuSnapshot = null;
let cachedDashboardSnapshot = null;
let cachedDashboardSnapshotAt = 0;

function hasGpuDevice() {
  try {
    return fs
      .readdirSync("/sys/class/drm", { withFileTypes: true })
      .some((entry) => entry.isDirectory() && /^card\d+$/.test(entry.name));
  } catch (error) {
    return false;
  }
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
    readDockerContainers(),
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

module.exports = {
  collectDashboardSnapshot,
  readDiskStats,
  readNetworkStats,
};
