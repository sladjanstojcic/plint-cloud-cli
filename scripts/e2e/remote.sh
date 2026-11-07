#!/usr/bin/env bash
# Real end-to-end test of a release build on a remote Linux host over SSH.
#
#   scripts/e2e/remote.sh <ssh-host> [--node <version>] [--mcp-chat]
#
# Builds the release tarball, copies it plus the source tree and these scripts to
# ~/plint-e2e on the host, and runs:
#   - unit tests from source and install.sh into an isolated HOME,
#   - e2e.sh: about 110 checks of the installed binary against the real Bunny API
#     (deploys, CDN content, ignore rules, redaction, concurrency, MCP over stdio,
#     destroy), with every result re-checked through bunny-check.mjs,
#   - with --mcp-chat: a 7-turn plain-language conversation with a child `claude -p`
#     session whose only tools are the plint MCP server (needs `claude` logged in there).
# --node <version> downloads that official Node build (SHA-256 verified) into the work dir;
# without it the host's own `node` is used. The work dir, including the API key, is
# deleted on exit. Every Bunny zone the run creates is destroyed by the run itself.
#
# Needs BUNNY_API_KEY in the environment or in .env. This uses real Bunny resources.
set -euo pipefail

HOST="${1:?usage: remote.sh <ssh-host> [--node <version>] [--mcp-chat]}"; shift
NODE_VERSION=""; MCP_CHAT=0
while [ $# -gt 0 ]; do
  case "$1" in
    --node) NODE_VERSION="$2"; shift 2 ;;
    --mcp-chat) MCP_CHAT=1; shift ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
if [ -z "${BUNNY_API_KEY:-}" ] && [ -f .env ]; then
  BUNNY_API_KEY="$(node --env-file=.env -e 'process.stdout.write(process.env.BUNNY_API_KEY ?? "")')"
fi
[ -n "${BUNNY_API_KEY:-}" ] || { echo "BUNNY_API_KEY is not set (env or .env)" >&2; exit 1; }

BUILD="$(mktemp -d)"
cleanup() { rm -rf "$BUILD"; ssh "$HOST" 'rm -rf ~/plint-e2e' || true; }
trap cleanup EXIT

PLINT_DIST_DIR="$BUILD/dist" node scripts/build-release.mjs
ssh "$HOST" 'rm -rf ~/plint-e2e && mkdir -p ~/plint-e2e/e2e ~/plint-e2e/src && chmod 700 ~/plint-e2e'
rsync -a --exclude node_modules --exclude .env --exclude dist --exclude .git ./ "$HOST:plint-e2e/src/"
scp -q "$BUILD/dist/plint.tar.gz" install.sh "$HOST:plint-e2e/"
scp -q scripts/e2e/*.sh scripts/e2e/*.mjs "$HOST:plint-e2e/e2e/"
# Key goes over stdin into a mode-600 file, never on a command line.
printf '{ "apiKey": "%s" }\n' "$BUNNY_API_KEY" |
  ssh "$HOST" 'umask 077; cat > ~/plint-e2e/key.json; chmod +x ~/plint-e2e/e2e/*.sh'

NODE_BIN=""
if [ -n "$NODE_VERSION" ]; then
  ssh "$HOST" "set -e; cd ~/plint-e2e; f=node-v$NODE_VERSION-linux-x64.tar.xz
    curl -fsSLO https://nodejs.org/dist/v$NODE_VERSION/\$f
    curl -fsSL https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt | grep \" \$f\$\" | sha256sum -c - >/dev/null
    tar -xJf \$f && rm \$f"
  NODE_BIN="\$HOME/plint-e2e/node-v$NODE_VERSION-linux-x64/bin"
fi

LABEL="node${NODE_VERSION:-host}"
STATUS=0
ssh "$HOST" "~/plint-e2e/e2e/run.sh $LABEL $NODE_BIN" || STATUS=1
if [ "$MCP_CHAT" = 1 ]; then
  ssh "$HOST" "${NODE_BIN:+PATH=$NODE_BIN:\$PATH }~/plint-e2e/e2e/mcp-chat.sh" || STATUS=1
fi
exit "$STATUS"
