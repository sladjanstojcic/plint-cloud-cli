# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`plint` is a Node.js CLI (and MCP server) that deploys static files to Bunny.net, managing them as named `project`s whose Bunny storage zone + pull zone bindings are persisted locally. Node 22+, ESM only, no TypeScript.

Entry point: `src/cli-bin.js` → `src/cli.js` (commander) → `src/commands/<name>.js`. The MCP server in `src/mcp/server.js` reuses the same `lib/` internals, so command logic must stay in `lib/` (not in `commands/`) whenever it needs to be shared.

## Commands

```bash
npm test                    # unit tests (node --test, no external deps)
npm run test:unit           # same
npm run test:integration    # loads .env, hits real Bunny API
npm run test:stress         # scripts/stress-cli.mjs — end-to-end via CLI fixtures
npm run test:manual         # scripts/manual-verify.mjs — ad-hoc post-change smoke
npm run test:cleanup        # scripts/test-cleanup.mjs — purge leftover Bunny zones
npm run test:e2e -- <ssh-host> [--node 22.23.4] [--mcp-chat]
                            # scripts/e2e/remote.sh — release build on a real Linux host vs real Bunny
npm run build               # esbuild bundle → dist/plint.cjs + dist/plint.tar.gz

# Run a single test file
node --test test/unit/commands/inspect.test.js

# Run the CLI from source without installing
node src/cli-bin.js --help
node src/cli-bin.js --json doctor
```

Local install for smoke-testing the built tarball:

```bash
npm run build
PLINT_RELEASE_URL="file://$(pwd)/dist/plint.tar.gz" sh install.sh
export PATH="$HOME/.plint/bin:$PATH"
```

## Architecture

### Command → lib split

`src/commands/*.js` handle CLI concerns only: inquirer prompts, spinners, human vs. JSON output, arg/option parsing. They delegate all real work to `src/lib/`. MCP tools in `src/mcp/tools/*.js` call the same `lib/` functions directly. Do not put Bunny API calls, state mutations, or file scanning inside `commands/`.

### Dependency injection for tests

Command and lib functions accept a `deps` object (see `src/commands/deploy.js`, `src/lib/deploy-core.js`). Tests override specific `deps` entries to stub filesystem, Bunny API, state store, prompts. Preserve this pattern when adding new flows — do not reach for module-level mocks.

### Persistent state

- `~/.plint/config.json` — the Bunny API key (written by `plint login`).
- `~/.plint/state.json` — projects, their Bunny bindings (`storage_zone_id`, `pull_zone_id`, passwords, hostnames), and reserved (destroyed) project names. Accessed via `createProjectsStore()` in `src/lib/projects/store.js` with `proper-lockfile` + `write-file-atomic`.
- `migrateState()` in that file handles the legacy `slugs` → `projects` shape — keep it until the data is known to be gone.

Destroyed project names go into `reserved_project_names` and cannot be reused. Enforced in `src/lib/projects/resolve.js`.

Bunny zone passwords are redacted in user-facing output by default. `src/lib/projects/binding.js` owns the `redactBinding(binding, { reveal })` helper used by `commands/inspect.js` (CLI `--reveal`) and `mcp/tools/project.js` (MCP `reveal: boolean`).

### Auth

`requireApiKey()` / `resolveApiKey()` in `src/lib/config.js`. Precedence: `BUNNY_API_KEY` env → `~/.plint/config.json`. Never accept the key on the CLI; never log it.

### JSON output contract

Every command that supports `--json` writes exactly one envelope to **stdout**; human progress and diagnostics go to **stderr**. Shape in `src/lib/json-output/envelope.js`:

```json
{ "ok": true,  "command": "<name>", "data": { ... }, "next_actions": [...] }
{ "ok": false, "command": "<name>", "error": { "code": "...", "message": "..." }, "fix": "...", "next_actions": [...] }
```

Error `code` must come from `ERROR_CODES` in `src/lib/error-codes.js`. When throwing, set `error.code = ERROR_CODES.SOMETHING` — the CLI wrapper in `src/cli.js` converts it to the JSON envelope. Add new codes to that frozen object before using them.

### Deploy pipeline

`deployCore()` in `src/lib/deploy-core.js`:

1. Resolve or create a Bunny storage zone + pull zone (`createProjectBinding` with retries on `storagezone.name_taken`).
2. Scan local files via `walkLocalFiles` (hard safety excludes + `.gitignore` + `.plintignore`, read in every directory and scoped to it — see `src/lib/files/ignore.js`; hard excludes can never be re-included). Skipped entries (symlinks, FIFOs/sockets/devices, unreadable files) emit warnings built by `src/lib/files/warnings.js`, which caps the warnings array at 100 with a `WARNINGS_TRUNCATED` sentinel. Root paths like `/`, `~`, `~/Desktop` are refused by `assertSafePath` in `src/lib/files/safety.js`.
3. Compute changeset via `computeChangeset` (hash-based upload/delete/unchanged).
4. Upload/delete with `p-limit` concurrency (10 uploads, 5 deletes) and transient retry (`withTransientRetry` — 408/425/429/5xx and DNS/TCP errors).
5. Purge the pull zone; purge failures are non-fatal (`cachePurge: "failed"`).
6. Caller (`commands/deploy.js`) persists via `persistDeploy` which updates `state.json` and appends to history.

Single-file deploys use `buildSingleFileEntry`; directory deploys use `walkLocalFiles`. Dry-run short-circuits before any mutation.

### CLI vs MCP deploy behavior

- CLI `plint <path>` (no `-p`) prompts for a project name interactively. Non-interactive and `--json` mode require `-p <project>`.
- CLI `plint <path> -p foo` requires the project to exist unless `--create` is passed.
- MCP `plint_deploy` always requires an explicit `project` and will only create it when `create: true`. There is no auto-generation on the MCP side. Paths must be absolute (Zod-validated).

### Build

`scripts/build-release.mjs` uses esbuild to bundle `src/cli-bin.js` into a single CJS file at `dist/plint.cjs`, writes a `dist/plint` shell wrapper, and tars both into `dist/plint.tar.gz`. `install.sh` downloads that tarball (or a local `file://` URL via `PLINT_RELEASE_URL`) into `~/.plint/bin/`.

Releases: bump `version` in `package.json`, then push a matching tag (`git tag v0.1.1 && git push origin v0.1.1`). `.github/workflows/release.yml` tests, builds and publishes `plint.tar.gz`, its `.sha256` and `install.sh` as a GitHub Release. `install.sh` defaults to `releases/latest/download/plint.tar.gz`.

## Conventions

- ESM only. Use `.js` for source, `.mjs` for standalone scripts in `scripts/`.
- Imports always include the `.js` extension.
- Prefer pure functions in `lib/` with injectable `deps`; keep side effects at the edges (`commands/`, `mcp/tools/`).
- When adding a new command: register it in `src/cli.js`, add the handler under `src/commands/`, keep shared logic in `lib/`, expose it through `src/mcp/tools/` if it should be available to agents, and add `next_actions`/`fixes` entries for new error codes in `src/lib/json-output/`.
- Project names: lowercase, digits, single hyphens, 1–30 chars, no leading/trailing `-`, no `--` (`src/lib/projects/name.js`).
