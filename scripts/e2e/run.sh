#!/usr/bin/env bash
# run.sh <label> [node-bin-dir]: unit tests from source + install tarball + e2e, isolated HOME.
# Runs on the test host; scripts/e2e/remote.sh sets up $PLINT_E2E_ROOT for it.
set -u
R="${PLINT_E2E_ROOT:-$HOME/plint-e2e}"; L="$1"; [ -n "${2:-}" ] && export PATH="$2:$PATH"
W="$R/w-$L"; rm -rf "$W"; mkdir -p "$W/home/.plint"; cp "$R/key.json" "$W/home/.plint/config.json"; chmod 600 "$W/home/.plint/config.json"
echo "######## $L on $(hostname): node $(node -v)"
echo "== install.sh"; HOME="$W/home" SHELL=/bin/bash PLINT_RELEASE_URL="file://$R/plint.tar.gz" sh "$R/install.sh" || { echo "install failed"; exit 1; }
echo "== unit tests (source)"; cp -r "$R/src" "$W/src"
UNIT=0; (cd "$W/src" && npm ci --no-audit --no-fund >/dev/null 2>&1 && HOME="$W/home" npm test >"$W/unit.log" 2>&1) || UNIT=1
grep -E "^(ℹ|#) (tests|pass|fail) " "$W/unit.log" || tail -20 "$W/unit.log"
echo "== e2e"; E2E=0; "$R/e2e/e2e.sh" "$W" || E2E=1
[ "$UNIT" = 0 ] && [ "$E2E" = 0 ]
