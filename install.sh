#!/bin/sh
set -eu

INSTALL_DIR="${HOME}/.plint/bin"
RELEASE_URL="${PLINT_RELEASE_URL:-https://github.com/sladjanstojcic/plint-cloud-cli/releases/latest/download/plint.tar.gz}"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 22+ is required. Install it from https://nodejs.org/ or use nvm."
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "Node.js 22+ is required. Current version: $(node -v)"
  exit 1
fi

mkdir -p "$INSTALL_DIR"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

curl -fsSL "$RELEASE_URL" | tar -xz -C "$TMP_DIR"
install "$TMP_DIR/plint" "$INSTALL_DIR/plint"
install "$TMP_DIR/plint.cjs" "$INSTALL_DIR/plint.cjs"

case "${SHELL:-}" in
  */zsh) PROFILE="$HOME/.zshrc" ;;
  */bash) PROFILE="$HOME/.bashrc" ;;
  *) PROFILE="$HOME/.profile" ;;
esac

PATH_LINE="export PATH=\"$INSTALL_DIR:\$PATH\""

if ! grep -Fqx "$PATH_LINE" "$PROFILE" 2>/dev/null; then
  printf '\n%s\n' "$PATH_LINE" >> "$PROFILE"
  echo "Added $INSTALL_DIR to PATH in $PROFILE"
fi

echo "plint installed to $INSTALL_DIR/plint"
echo "Run: plint --help"
