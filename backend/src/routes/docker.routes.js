// src/routes/docker.routes.js

const express = require("express");
const router = express.Router();
const Docker = require("dockerode");
const { withTimeout } = require("../utils/timeout.util");

const docker = new Docker();

// Get all docker containers
router.get("/containers", async (req, res) => {
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

module.exports = router;
