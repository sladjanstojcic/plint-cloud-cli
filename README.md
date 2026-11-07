<div align="center">

# plint

**Static hosting on Bunny.net, in one command.**

Point it at a folder, get a URL. Works the same for people at a terminal and for AI agents over MCP.

[![Release](https://img.shields.io/github/v/release/sladjanstojcic/plint-cloud-cli?style=flat-square)](https://github.com/sladjanstojcic/plint-cloud-cli/releases)
[![Node](https://img.shields.io/badge/node-%E2%89%A522-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![MCP](https://img.shields.io/badge/MCP-server-6E56CF?style=flat-square)](./docs/mcp.md)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](./LICENSE)

<sub>An open-source personal project. Not affiliated with Bunny.net — see the [disclaimer](#disclaimer).</sub>

[Website](https://plint.cloud) · [CLI guide](./docs/cli.md) · [MCP guide](./docs/mcp.md) · [Releases](https://github.com/sladjanstojcic/plint-cloud-cli/releases)

</div>

---

```console
$ plint ./dist -p docs --create
✔ Upload complete
Deployed docs (created)
https://<pull-zone>.b-cdn.net
Path: /Users/me/site/dist
42 uploaded, 0 deleted, 0 unchanged · 1834221 bytes · cache purged
```

`plint` creates a Bunny storage zone and pull zone for your project, uploads only the files that changed, deletes the ones you removed, and purges the CDN cache. It remembers each project by name, so the next deploy is just `plint ./dist -p docs`.

## Why plint

- **Incremental deploys.** Files are compared by hash. Unchanged files are skipped and removed files are deleted.
- **Hard to leak secrets.** `.git/`, `node_modules/`, `.env*`, `*.pem` and `*.key` are never uploaded, and no ignore file can re-include them. Hidden files are skipped too. `.gitignore` and `.plintignore` (in any folder) are respected on top of that.
- **Safe previews.** `plint estimate` shows size, warnings and a rough storage cost with no auth. `--dry-run` shows the full changeset without touching Bunny or local state.
- **Built for scripts and agents.** Every command takes `--json` and writes exactly one envelope to stdout; progress goes to stderr. Errors carry stable codes and a suggested fix.
- **Agent-native.** `plint mcp` runs a local MCP server with the same tools the CLI uses.
- **Resilient.** Concurrent uploads with retries on 408/425/429/5xx and network errors. A failed cache purge never fails the deploy.

## Install

Requires **Node.js 22+**.

```bash
curl -fsSL https://plint.cloud/install.sh | sh
```

This installs the latest [GitHub Release](https://github.com/sladjanstojcic/plint-cloud-cli/releases) into `~/.plint/bin`.

## Quick start

```bash
# 1. Save your Bunny API key (or set BUNNY_API_KEY)
plint login

# 2. Check that everything is reachable
plint doctor

# 3. See what would be deployed
plint estimate ./dist

# 4. Deploy (prompts for a project name)
plint ./dist

# 5. Redeploy later by name
plint ./dist -p docs
```

## Commands

### Deploy

| Command | What it does |
| --- | --- |
| `plint <path>` | Deploy a directory or file into a new project (interactive) |
| `plint deploy <path>` | Same as `plint <path>` |
| `plint <path> -p <project>` | Deploy into an existing project |
| `plint <path> -p <project> --create` | Create the project if needed, then deploy (for scripts and CI) |
| `plint <path> -p <project> --dry-run` | Preview the changeset without changing anything |
| `plint estimate <path>` | Size, warnings and rough Bunny storage cost |

### Manage

| Command | What it does |
| --- | --- |
| `plint list` | List local projects with Bunny details |
| `plint inspect -p <project>` | Show one project (add `--reveal` for zone passwords) |
| `plint history -p <project>` | Deployment history |
| `plint files -p <project>` | Files in the current deployment |
| `plint url -p <project>` | Print the public URL |
| `plint open -p <project>` | Open the public URL in your browser |
| `plint purge -p <project>` | Purge the CDN cache |
| `plint destroy -p <project>` | Delete the project and its Bunny resources |

### System

| Command | What it does |
| --- | --- |
| `plint login` | Save your Bunny API key |
| `plint doctor` | Diagnose auth, state and Bunny reachability |
| `plint repair` | Find and optionally prune stale local projects |
| `plint api get <path>` | Read-only Bunny management API access |
| `plint mcp` | Run the MCP stdio server |

Destroyed project names are reserved and cannot be reused. See the [CLI guide](./docs/cli.md) for the full details.

## Use it from an AI agent

```bash
npx add-mcp "plint mcp"
```

Then just ask:

> “Deploy `/Users/me/site/dist` to project `docs`.”
> “Purge the CDN for `docs`.”
> “What plint projects do I have?”

Your client discovers these tools automatically:

`plint_estimate` · `plint_deploy` · `plint_list` · `plint_inspect` · `plint_history` · `plint_files` · `plint_purge` · `plint_destroy` · `plint_doctor` · `plint_repair`

Over MCP, deploys always need an explicit `project` and an absolute path, and a new project is created only with `create: true`. More in the [MCP guide](./docs/mcp.md).

## JSON output

Add `--json` to any command. You get exactly one envelope on stdout:

```json
{ "ok": true, "command": "list", "data": { }, "next_actions": [] }
```

```json
{
  "ok": false,
  "command": "doctor",
  "error": {
    "code": "AUTH_MISSING",
    "message": "No API key found. Run `plint login` or set BUNNY_API_KEY."
  },
  "fix": "...",
  "next_actions": []
}
```

Non-interactive and `--json` deploys require `-p <project>`.

## Auth

plint looks for your Bunny API key in this order:

1. `BUNNY_API_KEY` environment variable
2. `~/.plint/config.json` (written by `plint login`)

The key is never accepted as a command-line argument and never logged. Project state lives in `~/.plint/state.json`.

## Development

```bash
npm install
npm test                   # unit tests
npm run test:integration   # real Bunny API (needs .env)
npm run build              # bundle to dist/plint.tar.gz
node src/cli-bin.js --help # run from source
```

Install a local build:

```bash
npm run build
PLINT_RELEASE_URL="file://$(pwd)/dist/plint.tar.gz" sh install.sh
export PATH="$HOME/.plint/bin:$PATH"
plint --json doctor
```

## Disclaimer

plint is an independent, open-source personal project. It is not affiliated with, endorsed by, or sponsored by Bunny.net. "Bunny.net" is used only to describe the service plint works with. You need your own Bunny.net account, and you pay Bunny.net directly for any storage and bandwidth you use.

## License

MIT. See [LICENSE](./LICENSE).
