// src/bootstrap/index.js

const fs = require("fs");
const { getMasterUser, ensureMasterUser } = require("../services/users.service");

const DATA_DIR = process.env.DATA_DIR ?? "data";
const MASTER_USERNAME = process.env.MASTER_USERNAME ?? "admin";
const MASTER_PASSWORD = process.env.MASTER_PASSWORD ?? "change-me";
const MASTER_DISPLAY_NAME = process.env.MASTER_DISPLAY_NAME ?? "Master Admin";

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function bootstrapMasterUser() {
  const masterAccountBeforeBootstrap = getMasterUser();

  const bootstrapMasterUser = ensureMasterUser({
    username: MASTER_USERNAME,
    password: MASTER_PASSWORD,
    displayName: MASTER_DISPLAY_NAME,
  });

  if (masterAccountBeforeBootstrap) {
    console.log("Master account already exists; environment bootstrap ignored.");
  } else if (bootstrapMasterUser) {
    console.log(`Master account bootstrapped from environment for ${MASTER_USERNAME}.`);
  } else {
    console.log(
      `Master bootstrap skipped because ${MASTER_USERNAME} already exists as a non-master account.`
    );
  }
}

function bootstrapApp() {
  ensureDataDir();
  bootstrapMasterUser();
}

module.exports = {
  bootstrapApp,
};
