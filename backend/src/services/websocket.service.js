// src/services/websocket.service.js

const { collectDashboardSnapshot } = require("./monitoring.service");

const connectedSockets = new Set();
let socketBroadcastInFlight = false;
let socketBroadcastTimer = null;

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

function createWebSocketHandler(wss) {
  wss.on("connection", (socket) => {
    connectedSockets.add(socket);
    socket.monitorMode = "disk";

    socket.on("message", (message) => {
      try {
        const payload = JSON.parse(message.toString());

        if (payload.type === "set-monitor-mode") {
          socket.monitorMode = payload.mode === "network" ? "network" : "disk";
        }
      } catch {
        // Ignore malformed messages.
      }
    });

    socket.on("close", () => {
      connectedSockets.delete(socket);
      maybeStopDashboardBroadcastLoop();
    });

    ensureDashboardBroadcastLoop();
    void collectDashboardSnapshot(true).then((snapshot) => {
      void sendDashboardSnapshot(socket, snapshot);
    });
  });
}

module.exports = {
  createWebSocketHandler
}
