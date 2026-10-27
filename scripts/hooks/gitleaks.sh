#!/usr/bin/env sh
# Escaneo de secretos para los hooks de git (lefthook). Sin GitHub Actions.
#
#   gitleaks.sh staged   lo que se está por commitear (pre-commit)
#   gitleaks.sh push     los commits que todavía no están en ningún remoto (pre-push)
#   gitleaks.sh history  todo el historial del repo
#
# Usa el binario local de gitleaks (brew install gitleaks); si no está, la imagen de Docker.
set -eu

modo="${1:-staged}"
raiz="$(git rev-parse --show-toplevel)"
cd "$raiz"
imagen="zricethezav/gitleaks:v8.30.1"

correr() {
  if command -v gitleaks >/dev/null 2>&1; then
    gitleaks "$@"
  elif command -v docker >/dev/null 2>&1; then
    docker run --rm -v "$raiz:/repo" -w /repo \
      -e GIT_CONFIG_COUNT=1 -e GIT_CONFIG_KEY_0=safe.directory -e GIT_CONFIG_VALUE_0=/repo \
      "$imagen" "$@"
  else
    echo "gitleaks no está instalado (brew install gitleaks) y no hay Docker: no se puede escanear." >&2
    exit 1
  fi
}

case "$modo" in
  staged)  correr git --pre-commit --staged --redact --no-banner --config .gitleaks.toml . ;;
  push)
    pendientes="$(git rev-list --count --branches --not --remotes)"
    [ "$pendientes" = "0" ] && exit 0
    correr git --redact --no-banner --config .gitleaks.toml --log-opts="--branches --not --remotes" . ;;
  history) correr git --redact --no-banner --config .gitleaks.toml . ;;
  *) echo "uso: $0 staged|push|history" >&2; exit 2 ;;
esac
