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
├── install.sh      One-line installer entrypoint
├── scripts/        Host install implementation
└── STATUS.md       Current feature progress
```

## Requirements

- Debian or Ubuntu Linux
- `systemd`
- `sudo`
- Internet access during installation
- Docker installed on the host if you want the Docker/container features to show live data

## Install

Run the installer from the repository root:

```bash
curl -fsSL https://raw.githubusercontent.com/CerberusPanel/Cerberus/refs/heads/Release/install.sh | sudo bash
```

The installer prompts for:

- Install directory
- Master username
- Master password
- Master display name

After installation, open:

```text
http://localhost:4000
```

The service is managed by systemd:

```bash
systemctl status cerberus
```

The management CLI is available as:

```bash
cerberus start
cerberus stop
cerberus status
cerberus reboot
cerberus restart
cerberus update
cerberus uninstall
```

`cerberus reboot` is an alias for restart. `cerberus update` pulls the latest code into the installed checkout, rebuilds the frontend, and restarts the service.

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
| `PORT` | `3000` | Backend API port. The installer sets this to `4000` for the system service. |
| `DATA_DIR` | `data` | Directory used for the SQLite database and auth secrets. |
| `MASTER_USERNAME` | `admin` in installer | Initial master account username. |
| `MASTER_PASSWORD` | `change-me` in installer | Initial master account password. |
| `MASTER_DISPLAY_NAME` | `Master Admin` in installer | Initial master account display name. |
| `AUTH_TOKEN_TTL_SECONDS` | `28800` | Session lifetime in seconds. |
| `APP_STORE_REPOSITORY_URL` | Official Cerberus app store in installer | Default app store repository. |
| `APP_STORE_REPOSITORY_BRANCH` | `Development` in installer | Default app store branch. |
| `HOST_OS_RELEASE_PATH` | unset | Optional path to host OS release metadata. |
| `AUTH_COOKIE_SECURE` | unset | Force secure cookies when running behind HTTPS. |

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
