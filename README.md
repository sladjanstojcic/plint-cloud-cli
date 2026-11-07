# plint

`plint` deploys static files to Bunny.net and exposes a small command surface that works for both humans and Codex.

User-facing docs:

- [CLI Guide](./docs/cli.md)
- [MCP Guide](./docs/mcp.md)

## Commands

- `plint <path>`: interactively deploy a directory or file into a new project
- `plint deploy <path>`: explicit deploy command equivalent to `plint <path>`
- `plint <path> -p <project>`: deploy into an existing project
- `plint <path> -p <project> --create`: create the named project in non-interactive flows and deploy into it
- `plint <path> -p <project> --dry-run`: preview deploy changes without mutating Bunny or local state
- `plint estimate <path>`: estimate deploy size, warnings, and rough Bunny storage cost
- `plint login`: save the Bunny account API key
- `plint list`: list local projects with Bunny details
- `plint inspect -p <project>`: show details for one project
- `plint history -p <project>`: show project deployment history
- `plint files -p <project>`: list files in the current project deployment
- `plint purge -p <project>`: purge the CDN cache for a project
- `plint url -p <project>`: print the public URL for a project
- `plint open -p <project>`: open the project URL in your browser
- `plint destroy -p <project>`: delete a project and its Bunny resources
- `plint doctor`: diagnose auth, state, and Bunny reachability
- `plint repair`: find and optionally prune stale local projects
- `plint mcp`: run the local MCP stdio server

## Install

Requires Node.js 22+.

```bash
curl -fsSL https://plint.cloud/install.sh | sh
```

This installs the latest [GitHub Release](https://github.com/sladjanstojcic/plint-cloud-cli/releases) into `~/.plint/bin`.

## MCP install

```bash
npx add-mcp "plint mcp"
```

## Auth

Auth precedence:

1. `BUNNY_API_KEY`
2. `~/.plint/config.json`

Never pass the Bunny API key on the command line during normal use.

## JSON policy

Use `--json` for machine-readable output.

- JSON goes to stdout
- diagnostics and progress go to stderr
- success shape:

```json
{
  "ok": true,
  "command": "list",
  "data": {}
}
```

- error shape:

```json
{
  "ok": false,
  "command": "doctor",
  "error": {
    "code": "AUTH_MISSING",
    "message": "No API key found. Run `plint login` or set BUNNY_API_KEY."
  }
}
```

## Local install flow

Build and install locally:

```bash
npm run build
PLINT_RELEASE_URL="file://$(pwd)/dist/plint.tar.gz" sh install.sh
export PATH="$HOME/.plint/bin:$PATH"
```

After installation, smoke test from another directory:

```bash
export PATH="$HOME/.plint/bin:$PATH"
command -v plint
plint --help
plint --json doctor
```

## License

MIT. See [LICENSE](./LICENSE).
