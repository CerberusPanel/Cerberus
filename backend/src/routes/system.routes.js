// src/routes/system.routes.js

const express = require("express");
const router = express.Router();
const { getSystemInfo } = require("../services/systemInfo.service");
const {
  collectDashboardSnapshot,
  readDiskStats,
  readNetworkStats,
} = require("../services/monitoring.service");

// Uninstall an app
router.get("/info", async (req, res) => {
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
// Get current system status and resource usage
router.get("/status", async (req, res) => {
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
// Get detailed monitoring data for charts and graphs
router.get("/monitoring", (req, res) => {
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

module.exports = router
