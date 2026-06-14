// src/services/docker.service.js

const Docker = require("dockerode");

const { withTimeout } = require("../utils/timeout.util");

const docker = new Docker();

async function readDockerContainers() {
  try {
    return await withTimeout(docker.listContainers({ all: true }), []);
  } catch (error) {
    return [];
  }
}

module.exports = {
  readDockerContainers
}
