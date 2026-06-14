#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/CerberusPanel/Cerberus.git"
REPO_BRANCH="Release"
TMP_DIR="$(mktemp -d)"
BOLD='\033[1m'
DIM='\033[2m'

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'

NC='\033[0m'

cleanup() {
	rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

REPO_DIR="${TMP_DIR}/cerberus"
INSTALL_DIR_DEFAULT="/opt/cerberus"
DATA_DIR_DEFAULT="/var/lib/cerberus/data"
ENV_DIR="/etc/cerberus"
ENV_FILE="${ENV_DIR}/cerberus.env"
SERVICE_FILE="/etc/systemd/system/cerberus.service"
CLI_TARGET="/usr/local/bin/cerberus"
SERVICE_USER="cerberus"
SERVICE_GROUP="cerberus"
APP_PORT_DEFAULT="4000"
EXISTING_INSTALL_DETECTED="false"

load_previous_install_defaults() {
	if [[ -r "${ENV_FILE}" ]]; then
		# shellcheck disable=SC1090
		source "${ENV_FILE}"
		EXISTING_INSTALL_DETECTED="true"
	fi

	INSTALL_DIR_DEFAULT="${INSTALL_DIR:-${INSTALL_DIR_DEFAULT}}"
	DATA_DIR_DEFAULT="${DATA_DIR:-${DATA_DIR_DEFAULT}}"
	MASTER_USERNAME_DEFAULT="${MASTER_USERNAME:-admin}"
	MASTER_PASSWORD_DEFAULT="${MASTER_PASSWORD:-}"
	MASTER_DISPLAY_NAME_DEFAULT="${MASTER_DISPLAY_NAME:-Master Admin}"
}


prompt_value() {
	local prompt_title="$1"
	local prompt_desc="$2"
	local prompt_default="${3:-}"
	local value=""

	{
		echo
		echo -e "${BOLD}${CYAN}=== ${prompt_title} ===${NC}"
		echo -e "${DIM}${prompt_desc}${NC}"
	} >/dev/tty

	read -r -p "[${prompt_default}]: " value </dev/tty

	printf '%s\n' "${value:-$prompt_default}"
}

prompt_secret() {
	local prompt_title="$1"
	local prompt_desc="$2"
	local prompt_default="${3:-}"
	local value=""

	while true; do
		{
			echo
			echo -e "${BOLD}${CYAN}=== ${prompt_title} ===${NC}"
			echo -e "${DIM}${prompt_desc}${NC}"
			if [[ -n "${prompt_default}" ]]; then
				echo -e "${DIM}(Press Enter to keep the current value.)${NC}"
			fi
		} >/dev/tty

		read -r -s -p "> " value </dev/tty
		echo >/dev/tty

		if [[ -n "${value}" ]]; then
			printf '%s\n' "${value}"
			return
		fi

		if [[ -n "${prompt_default}" ]]; then
			printf '%s\n' "${prompt_default}"
			return
		fi

		echo "Value cannot be empty." >/dev/tty
	done
}

quote_env_value() {
	local value="$1"
	value="${value//\\/\\\\}"
	value="${value//\"/\\\"}"
	printf '"%s"' "${value}"
}

ensure_root() {
	if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
		error "Run this installer as root or via sudo."
		exit 1
	fi
}

ensure_linux() {
	if [[ "$(uname -s)" != "Linux" ]]; then
		error "This installer only supports Linux."
		exit 1
	fi
}

ensure_package_manager() {
	if ! command -v apt-get >/dev/null 2>&1; then
		error "This installer currently supports Debian/Ubuntu style systems with apt-get."
		exit 1
	fi
}

install_prerequisites() {
	export DEBIAN_FRONTEND=noninteractive
	apt-get update
	apt-get install -y ca-certificates curl git sqlite3 rsync build-essential
}

install_node_if_needed() {
	local node_major="0"

	if command -v node >/dev/null 2>&1; then
		node_major="$(node -p 'parseInt(process.versions.node.split(".")[0], 10)' 2>/dev/null || echo 0)"
	fi

	if [[ "${node_major}" -ge 22 ]]; then
		success "    Node found: ${node_major}"
		return
	fi

	info "Installing Node.js 22 from NodeSource..."
	curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
	apt-get install -y nodejs
}

clone_repository() {
	git clone --depth 1 --branch "${REPO_BRANCH}" "${REPO_URL}" "${REPO_DIR}"
}

build_and_install_app() {
	local install_dir="$1"

	mkdir -p "${install_dir}"
	rsync -a --delete \
		--exclude '.DS_Store' \
		--exclude 'node_modules' \
		--exclude 'backend/data' \
		"${REPO_DIR}/" "${install_dir}/"

	cd "${install_dir}/backend"
	npm ci --omit=dev

	cd "${install_dir}/frontend"
	npm ci
	npm run build

	rm -rf "${install_dir}/backend/public"
	mkdir -p "${install_dir}/backend/public"
	cp -a "${install_dir}/frontend/dist/." "${install_dir}/backend/public/"
}

install_cli() {
	install -m 0755 "${REPO_DIR}/scripts/cerberus" "${CLI_TARGET}"
}

create_service_user() {
	if ! getent group "${SERVICE_GROUP}" >/dev/null 2>&1; then
		groupadd --system "${SERVICE_GROUP}"
	fi

	if ! id -u "${SERVICE_USER}" >/dev/null 2>&1; then
		useradd \
		--system \
		--create-home \
		--home-dir /var/lib/cerberus \
		--gid "${SERVICE_GROUP}" \
		--shell /usr/sbin/nologin \
		"${SERVICE_USER}"
	fi

	if getent group docker >/dev/null 2>&1; then
		usermod -aG docker "${SERVICE_USER}"
	fi
}

write_env_file() {
	local install_dir="$1"
	local master_username="$2"
	local master_password="$3"
	local master_display_name="$4"

	mkdir -p "${ENV_DIR}"
	cat > "${ENV_FILE}" <<EOF
PORT=${APP_PORT_DEFAULT}
INSTALL_DIR=$(quote_env_value "${install_dir}")
DATA_DIR=$(quote_env_value "${DATA_DIR_DEFAULT}")
AUTH_TOKEN_TTL_SECONDS=28800
MASTER_USERNAME=$(quote_env_value "${master_username}")
MASTER_PASSWORD=$(quote_env_value "${master_password}")
MASTER_DISPLAY_NAME=$(quote_env_value "${master_display_name}")
APP_STORE_REPOSITORY_URL=$(quote_env_value "https://github.com/CerberusPanel/AppStore")
APP_STORE_REPOSITORY_BRANCH=$(quote_env_value "Development")
HOST_OS_RELEASE_PATH=$(quote_env_value "/etc/os-release")
EOF
	chmod 600 "${ENV_FILE}"
}

write_service_file() {
	local install_dir="$1"
	local node_path
	node_path="$(command -v node)"

	cat > "${SERVICE_FILE}" <<EOF
[Unit]
Description=Cerberus Panel
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_GROUP}
WorkingDirectory=${install_dir}/backend
EnvironmentFile=-${ENV_FILE}
ExecStart=${node_path} ${install_dir}/backend/src/app.js
Restart=on-failure
RestartSec=5
UMask=0027

[Install]
WantedBy=multi-user.target
EOF
}

info() {
	echo -e "${BLUE}[INFO]${NC} $*"
}

success() {
	echo -e "${GREEN}[ OK ]${NC} $*"
}

warn() {
	echo -e "${YELLOW}[WARN]${NC} $*"
}

error() {
	echo -e "${RED}[FAIL]${NC} $*"
}


main() {
	ensure_root
	ensure_linux
	ensure_package_manager
	load_previous_install_defaults
	clear;

	if [[ "${EXISTING_INSTALL_DETECTED}" == "true" ]]; then
		info "Existing installation detected. Previous values will be used as defaults."
	fi

	cat <<'EOF'

                      @@@@@@@@@@@@@@@@
                  @@@@@@@@@@@@@@@@@@@@@@@@
               @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
             @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
           @@@@@@@@@@@@@ @@@@@@@@@@ @@@@@@@@@@@@@
          @@@@@@@@@@@@@    @@@@@@    @@@@@@@@@@@@@
         @@@@@@@@@@@@@     @@@@@@     @@@@@@@@@@@@@
        @@@@@@@@@@ @@     @@@@@@@@     @@ @@@@@@@@@@
       @@@@@@@@@   @@ @@@          @@@ @@   @@@@@@@@@
       @@@@@@@     @@@                @@@     @@@@@@@
      @@@@@@@      @@                  @@      @@@@@@@
      @@@@@@    @   @   @@        @@   @   @    @@@@@@
      @@@@@@@  @@   @     @@    @@     @   @@  @@@@@@@
      @@@@@@@  @@    @                @    @@  @@@@@@@
      @@@@@@@        @@              @@         @@@@@@
      @@@@@@          @@     @@     @@          @@@@@@
       @@@@      @@@@  @@   @@@@   @@  @@@@      @@@@
       @@@@@@  @@@@@@@@ @@ @@@@@@ @@ @@@@@@@@  @@@@@@
        @@@@@@@@@@@@@@@   @@@@@@@@   @@@@@@@@@@@@@@@
         @@@@@@@@@@@@@@      @@      @@@@@@@@@@@@@@
           @@@@@@@@@@@                @@@@@@@@@@@
             @@@@@@@@                  @@@@@@@@

  ,-----.              ,--.
 '  .--./ ,---. ,--.--.|  |-.  ,---. ,--.--.,--.,--. ,---.
 |  |    | .-. :|  .--'| .-. '| .-. :|  .--'|  ||  |(  .-'
 '  '--'\\   --.|  |   | `-' |\   --.|  |   '  ''  '.-'  `)
  `-----' `----'`--'    `---'  `----'`--'    `----' `----'

===== Cerberus Panel installer =====

EOF

	local install_dir master_username master_password master_display_name

	install_dir="$(prompt_value "Install directory" "Where should Cerberus be installed?" "${INSTALL_DIR_DEFAULT}")"
	master_username="$(prompt_value "Master username" "Choose the admin username for logging into Cerberus." "${MASTER_USERNAME_DEFAULT}")"
	master_password="$(prompt_secret "Master password" "Choose the admin password for logging into Cerberus." "${MASTER_PASSWORD_DEFAULT}")"
	master_display_name="$(prompt_value "Master display name" "Display name shown for the main admin account." "${MASTER_DISPLAY_NAME_DEFAULT}")"

	info "Installing prerequisites"
	install_prerequisites
	info "Cloning repo"
	clone_repository
	info "Checking if node is present"
	install_node_if_needed

	if command -v npm >/dev/null 2>&1; then
		npm config set fund false >/dev/null 2>&1 || true
		npm config set update-notifier false >/dev/null 2>&1 || true
	fi

	info "Creating service"
	create_service_user

	mkdir -p "${DATA_DIR_DEFAULT}"
	chown -R "${SERVICE_USER}:${SERVICE_GROUP}" /var/lib/cerberus

	info "Building the app"
	build_and_install_app "${install_dir}"
	chown -R "${SERVICE_USER}:${SERVICE_GROUP}" "${install_dir}"
	info "Writing environment vars"
	write_env_file "${install_dir}" "${master_username}" "${master_password}" "${master_display_name}"
	info "Writing service file"
	write_service_file "${install_dir}"

	info "Installing CLI"
	install_cli

	systemctl daemon-reload
	systemctl enable --now cerberus.service

	echo
	success "Cerberus Panel installed."
	info "Open: http://localhost:${APP_PORT_DEFAULT}"
	info "Service: systemctl status cerberus"
}

main "$@"
