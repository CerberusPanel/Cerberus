const storage = {};

module.exports = storage;

storage.initSchema = require("./services/storage.service").initSchema;

const users = require("./services/users.service");
const installedApps = require("./services/installedApps.service");
const appStores = require("./services/appStores.service");
const appCatalog = require("./services/appCatalog.service");

Object.assign(storage, users, installedApps, appStores, appCatalog);
