# Cerberus Panel

Cerberus Panel is a self-hosted server management dashboard for monitoring your machine and managing Docker-based apps from a clean web interface.

It is designed for homelabs, personal servers, and small self-hosted environments where you want a simple way to see system health, browse app catalogs, and track installed services.

## Features

- System overview for CPU, RAM, disks, network, uptime, local IP, public IP, and GPU status where available.
- Live status updates and monitoring charts.
- Docker container visibility for apps recorded through Cerberus.
- App browser for official and linked app stores.
- README rendering for app catalog entries.
- GitHub app store syncing.
- Local account authentication with session cookies.
- Light and dark mode UI.

## Project Structure

```text
.
├── backend/        Express API, auth, Docker/system integrations, app store sync
├── frontend/       Vue 3 + Vite dashboard
├── Dockerfile      Production-style combined image
├── docker-compose.yml
└── STATUS.md       Current feature progress
```

## Requirements

- Node.js 22+
- npm
- Docker
- Access to `/var/run/docker.sock` if you want Docker/container features

## Quick Start With Docker Compose

Create optional environment overrides:

```bash
export MASTER_USERNAME=admin
export MASTER_PASSWORD=change-me
export MASTER_DISPLAY_NAME="Master Admin"
```

Start the development stack:

```bash
docker compose up --build
```

Open:

```text
http://localhost:5173
```

For access from another device on your network, use your server IP:

```text
http://<server-ip>:5173
```

## Build A Single Docker Image

From the repository root:

```bash
docker build -t ryvor/cerberus-panel .
```

Run it with access to Docker:

```bash
docker run --rm -p 3000:3000 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e MASTER_USERNAME=admin \
  -e MASTER_PASSWORD=change-me \
  -e MASTER_DISPLAY_NAME="Master Admin" \
  ryvor/cerberus-panel
```

Open:

```text
http://localhost:3000
```

## Local Development

Run the backend:

```bash
cd backend
npm install
npm run start
```

Run the frontend in another terminal:

```bash
cd frontend
npm install
npm run dev
```

The frontend dev server listens on all network interfaces, so it can be opened from another device on the same network:

```text
http://<server-ip>:5173
```

## Environment Variables

### Backend

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | Backend API and production frontend port. |
| `MASTER_USERNAME` | `admin` in compose | Initial master account username. |
| `MASTER_PASSWORD` | `change-me` in compose | Initial master account password. |
| `MASTER_DISPLAY_NAME` | `Master Admin` in compose | Initial master account display name. |
| `AUTH_TOKEN_TTL_SECONDS` | `28800` | Session lifetime in seconds. |
| `APP_STORE_REPOSITORY_URL` | Official Cerberus app store in compose | Default app store repository. |
| `APP_STORE_REPOSITORY_BRANCH` | `Development` in compose | Default app store branch. |
| `HOST_OS_RELEASE_PATH` | unset | Optional path to host OS release metadata. |

### Frontend

| Variable | Default | Description |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `/api` | API base URL used by Axios. |
| `VITE_WS_URL` | `/ws` | WebSocket endpoint path. |
| `VITE_API_PROXY_TARGET` | `http://localhost:3000` | Vite dev proxy target for API requests. |
| `VITE_WS_PROXY_TARGET` | `ws://localhost:3000` | Vite dev proxy target for WebSocket requests. |

## Authentication Notes

Cerberus uses local user accounts and session cookies. Passwords are encrypted in browsers that support WebCrypto on secure origins. For local-network HTTP access, Cerberus falls back to a plain login payload over the local connection, so use HTTPS or a trusted network if you need stronger transport protection.

## Current Status

See `STATUS.md` for the current feature checklist.

At the moment, app browsing and store syncing are available, while full app installation/editing/removal workflows are still being developed.
