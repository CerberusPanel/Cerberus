#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  exec sudo -E bash "${SCRIPT_DIR}/scripts/install-system.sh" "$@"
fi

exec "${SCRIPT_DIR}/scripts/install-system.sh" "$@"
