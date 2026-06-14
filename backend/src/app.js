const express = require("express");
const cors = require("cors");
const fs = require("node:fs");
const path = require("node:path");
const { WebSocketServer } = require("ws");

const { noCacheMiddleware } = require("./middleware/noCacheMiddleware");
const { requireAuth } = require("./middleware/authMiddleware");
const { bootstrapApp } = require("./bootstrap");
const { initSchema } = require("./services/storage.service");

const healthRoutes = require("./routes/health.routes");
const authRoutes = require("./routes/auth.routes");
const usersRoutes = require("./routes/users.routes");
const dockerRoutes = require("./routes/docker.routes");
const appsRoutes = require("./routes/apps.routes");
const systemRoutes = require("./routes/system.routes");

const { createWebSocketHandler } = require("./services/websocket.service");
const { ensureOfficialStore } = require("./services/store-sync.service")

const PORT = Number(process.env.PORT ?? 3000);
const PUBLIC_DIR = path.join(__dirname, "../public");
const PUBLIC_INDEX = path.join(PUBLIC_DIR, "index.html");

void (async () => {
  initSchema();
  bootstrapApp();

  await ensureOfficialStore();

  const app = express();

  app.use(cors({
    credentials: true,
    origin: true,
  }));
  app.use(express.json());

  if (fs.existsSync(PUBLIC_DIR)) {
    app.use(express.static(PUBLIC_DIR));
    app.get(/^\/(?!api\/|ws$).*/, (req, res, next) => {
      if (req.method !== "GET" || !fs.existsSync(PUBLIC_INDEX)) {
        return next();
      }

      return res.sendFile(PUBLIC_INDEX);
    });
  }

  app.use(noCacheMiddleware);
  app.use(requireAuth);

  app.use("/api/health", healthRoutes);
  app.use("/api/auth", authRoutes);
  app.use("/api/users", usersRoutes);
  app.use("/api/docker", dockerRoutes);
  app.use("/api/apps", appsRoutes);
  app.use("/api/system", systemRoutes);

  app.use((error, req, res, next) => {
    const status = Number(error?.status ?? 500);
    const debugCode = String(error?.code ?? error?.debugCode ?? (status >= 500 ? "SERVER_ERROR" : "REQUEST_ERROR"));
    const message = String(error?.message ?? "Unexpected server error");

    return res.status(status).json({
      debugCode,
      error: message,
      message,
    });
  });

  const server = app.listen(PORT, () => {
    console.log(`Cerberus running on port ${PORT}`);
  });

  const wss = new WebSocketServer({ server, path: "/ws" });
  createWebSocketHandler(wss);
})().catch((error) => {
  console.error("Cerberus failed to start", error);
  process.exitCode = 1;
});
