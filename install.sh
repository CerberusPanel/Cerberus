#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/CerberusPanel/Cerberus.git"
REPO_BRANCH="Release"
TMP_DIR="$(mktemp -d)"

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

print_logo {
	echo
	echo "                                                                    @@@@@@@@@@@@@@@@@@                                                                     "
	echo "                                                              @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@                                                               "
	echo "                                                          @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@                                                           "
	echo "                                                       @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@                                                        "
	echo "                                                    @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@                                                     "
	echo "                                                  @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@                                                   "
	echo "                                                @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@                                                 "
	echo "                                              @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@                                               "
	echo "                                            @@@@@@@@@@@@@@@@@@@@@@  @@@@@@@@@@@@@@@@@@  @@@@@@@@@@@@@@@@@@@@@@                                             "
	echo "                                           @@@@@@@@@@@@@@@@@@@@@@     @@@@@@@@@@@@@@     @@@@@@@@@@@@@@@@@@@@@@                                            "
	echo "                                         @@@@@@@@@@@@@@@@@@@@@@@       @@@@@@@@@@@@       @@@@@@@@@@@@@@@@@@@@@@@                                          "
	echo "                                        @@@@@@@@@@@@@@@@@@@@@@@         @@@@@@@@@@         @@@@@@@@@@@@@@@@@@@@@@@                                         "
	echo "                                       @@@@@@@@@@@@@@@@@@@@@@@           @@@@@@@@           @@@@@@@@@@@@@@@@@@@@@@@                                        "
	echo "                                      @@@@@@@@@@@@@@@@@@  @@@@           @@@@@@@@           @@@@  @@@@@@@@@@@@@@@@@@                                       "
	echo "                                     @@@@@@@@@@@@@@@@@    @@@       @@@@@@@@@@@@@@@@@@       @@@    @@@@@@@@@@@@@@@@@                                      "
	echo "                                     @@@@@@@@@@@@@@@      @@@    @@@@@@            @@@@@@    @@@      @@@@@@@@@@@@@@@                                      "
	echo "                                    @@@@@@@@@@@@@@@       @@@ @@@@@                    @@@@@ @@@       @@@@@@@@@@@@@@@                                     "
	echo "                                   @@@@@@@@@@@@@@         @@@@@@                          @@@@@@         @@@@@@@@@@@@@@                                    "
	echo "                                   @@@@@@@@@@@@@          @@@@                              @@@@          @@@@@@@@@@@@@                                    "
	echo "                                  @@@@@@@@@@@@@           @@@                                @@@           @@@@@@@@@@@@@                                   "
	echo "                                  @@@@@@@@@@@@            @@@                                @@@            @@@@@@@@@@@@                                   "
	echo "                                  @@@@@@@@@@@@      @@     @@     @@@@@            @@@@@     @@     @@      @@@@@@@@@@@@                                   "
	echo "                                  @@@@@@@@@@@@    @@@      @@@      @@@@@@      @@@@@@      @@@      @@@    @@@@@@@@@@@@                                   "
	echo "                                  @@@@@@@@@@@@@  @@@@      @@@        @@@        @@@        @@@      @@@@  @@@@@@@@@@@@@                                   "
	echo "                                  @@@@@@@@@@@@@  @@@@@      @@@                            @@@      @@@@@  @@@@@@@@@@@@@                                   "
	echo "                                  @@@@@@@@@@@@@             @@@                            @@@             @@@@@@@@@@@@@                                   "
	echo "                                  @@@@@@@@@@@@               @@@                          @@@               @@@@@@@@@@@@                                   "
	echo "                                  @@@@@@@@@@@                 @@@                        @@@                 @@@@@@@@@@@                                   "
	echo "                                   @@@@@@@@@@                  @@                        @@                  @@@@@@@@@@                                    "
	echo "                                   @@@@@@@@@            @@@    @@@        @@@@@@        @@@    @@@            @@@@@@@@@                                    "
	echo "                                    @@@@@@@           @@@@@@@@   @@@     @@@@@@@@     @@@@  @@@@@@@@           @@@@@@@                                     "
	echo "                                    @@@@@@@@@@      @@@@@@@@@@@  @@@@    @@@@@@@@    @@@@  @@@@@@@@@@@      @@@@@@@@@@                                     "
	echo "                                     @@@@@@@@@@@  @@@@@@@@@@@@@@   @@@@ @@@@@@@@@@ @@@@   @@@@@@@@@@@@@@  @@@@@@@@@@@                                      "
	echo "                                      @@@@@@@@@@@@@@@@@@@@@@@@@@@   @@@@@@@@@@@@@@@@@@    @@@@@@@@@@@@@@@@@@@@@@@@@@                                       "
	echo "                                       @@@@@@@@@@@@@@@@@@@@@@@@@@     @@@@@@@@@@@@@@     @@@@@@@@@@@@@@@@@@@@@@@@@@                                        "
	echo "                                        @@@@@@@@@@@@@@@@@@@@@@@@@       @@@@@@@@@@       @@@@@@@@@@@@@@@@@@@@@@@@@@                                        "
	echo "                                         @@@@@@@@@@@@@@@@@@@@@@@@                         @@@@@@@@@@@@@@@@@@@@@@@                                          "
	echo "                                          @@@@@@@@@@@@@@@@@@@@@@                          @@@@@@@@@@@@@@@@@@@@@@                                           "
	echo "                                            @@@@@@@@@@@@@@@@@@@                            @@@@@@@@@@@@@@@@@@@                                             "
	echo "                                              @@@@@@@@@@@@@@@                                @@@@@@@@@@@@@@@                                               "
	echo "                                                @@@@@@@@@@                                      @@@@@@@@@@                                                 "
	echo
	echo "                                                            bbbbbbbb                                                                                       "
	echo "        CCCCCCCCCCCCC                                       b::::::b                                                                                       "
	echo "     CCC::::::::::::C                                       b::::::b                                                                                       "
	echo "   CC:::::::::::::::C                                       b::::::b                                                                                       "
	echo "  C:::::CCCCCCCC::::C                                        b:::::b                                                                                       "
	echo " C:::::C       CCCCCC    eeeeeeeeeeee    rrrrr   rrrrrrrrr   b:::::bbbbbbbbb        eeeeeeeeeeee    rrrrr   rrrrrrrrr   uuuuuu    uuuuuu      ssssssssss   "
	echo "C:::::C                ee::::::::::::ee  r::::rrr:::::::::r  b::::::::::::::bb    ee::::::::::::ee  r::::rrr:::::::::r  u::::u    u::::u    ss::::::::::s  "
	echo "C:::::C               e::::::eeeee:::::eer:::::::::::::::::r b::::::::::::::::b  e::::::eeeee:::::eer:::::::::::::::::r u::::u    u::::u  ss:::::::::::::s "
	echo "C:::::C              e::::::e     e:::::err::::::rrrrr::::::rb:::::bbbbb:::::::be::::::e     e:::::err::::::rrrrr::::::ru::::u    u::::u  s::::::ssss:::::s"
	echo "C:::::C              e:::::::eeeee::::::e r:::::r     r:::::rb:::::b    b::::::be:::::::eeeee::::::e r:::::r     r:::::ru::::u    u::::u   s:::::s  ssssss "
	echo "C:::::C              e:::::::::::::::::e  r:::::r     rrrrrrrb:::::b     b:::::be:::::::::::::::::e  r:::::r     rrrrrrru::::u    u::::u     s::::::s      "
	echo "C:::::C              e::::::eeeeeeeeeee   r:::::r            b:::::b     b:::::be::::::eeeeeeeeeee   r:::::r            u::::u    u::::u        s::::::s   "
	echo " C:::::C       CCCCCCe:::::::e            r:::::r            b:::::b     b:::::be:::::::e            r:::::r            u:::::uuuu:::::u  ssssss   s:::::s "
	echo "  C:::::CCCCCCCC::::Ce::::::::e           r:::::r            b:::::bbbbbb::::::be::::::::e           r:::::r            u:::::::::::::::uus:::::ssss::::::s"
	echo "   CC:::::::::::::::C e::::::::eeeeeeee   r:::::r            b::::::::::::::::b  e::::::::eeeeeeee   r:::::r             u:::::::::::::::us::::::::::::::s "
	echo "     CCC::::::::::::C  ee:::::::::::::e   r:::::r            b:::::::::::::::b    ee:::::::::::::e   r:::::r              uu::::::::uu:::u s:::::::::::ss  "
	echo "        CCCCCCCCCCCCC    eeeeeeeeeeeeee   rrrrrrr            bbbbbbbbbbbbbbbb       eeeeeeeeeeeeee   rrrrrrr                uuuuuuuu  uuuu  sssssssssss    "
	echo
}

prompt_value() {
	local prompt_text="$1"
	local default_value="$2"
	local value=""

	read -r -p "${prompt_text} [${default_value}]: " value
	printf '%s\n' "${value:-$default_value}"
}

prompt_secret() {
	local prompt_text="$1"
	local value=""

	while true; do
		read -r -s -p "${prompt_text}: " value
		printf '\n'
		if [[ -n "${value}" ]]; then
			printf '%s\n' "${value}"
			return
		fi

		echo "Value cannot be empty."
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
		echo "Run this installer as root or via sudo."
		exit 1
	fi
}

ensure_linux() {
	if [[ "$(uname -s)" != "Linux" ]]; then
		echo "This installer only supports Linux."
		exit 1
	fi
}

ensure_package_manager() {
	if ! command -v apt-get >/dev/null 2>&1; then
		echo "This installer currently supports Debian/Ubuntu style systems with apt-get."
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
		echo "    Node found: ${node_major}"
		return
	fi

	echo "Installing Node.js 22 from NodeSource..."
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

main() {
	ensure_root
	ensure_linux
	ensure_package_manager
	clear;

	print_logo
	echo "===== Cerberus Panel installer ====="
	echo ""

	local install_dir master_username master_password master_display_name
	install_dir="$(prompt_value "Install directory" "${INSTALL_DIR_DEFAULT}")"
	master_username="$(prompt_value "Master username" "admin")"
	master_password="$(prompt_secret "Master password")"
	master_display_name="$(prompt_value "Master display name" "Master Admin")"

	echo "Cloning repo"
	clone_repository
	echo "Installing Prerequisits"
	install_prerequisites
	echo "Checking if node is present"
	install_node_if_needed

	if command -v npm >/dev/null 2>&1; then
		npm config set fund false >/dev/null 2>&1 || true
		npm config set update-notifier false >/dev/null 2>&1 || true
	fi

	echo "Creating service"
	create_service_user

	mkdir -p "${DATA_DIR_DEFAULT}"
	chown -R "${SERVICE_USER}:${SERVICE_GROUP}" /var/lib/cerberus

	echo "Building the app"
	build_and_install_app "${install_dir}"
	chown -R "${SERVICE_USER}:${SERVICE_GROUP}" "${install_dir}"
	echo "Writing environment vars"
	write_env_file "${install_dir}" "${master_username}" "${master_password}" "${master_display_name}"
	echo ""Writing service file
	write_service_file "${install_dir}"

	echo "Installing CLI"
	install_cli

	systemctl daemon-reload
	systemctl enable --now cerberus.service

	echo
	echo "Cerberus Panel installed."
	echo "Open: http://localhost:${APP_PORT_DEFAULT}"
	echo "Service: systemctl status cerberus"
}

main "$@"
