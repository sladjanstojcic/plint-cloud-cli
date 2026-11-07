# plint CLI Guide

`plint` deploys local static content to Bunny.net and manages it as a named `project`.

## Core model

- `path`: local file or directory you want to deploy
- `project`: the persistent name you use to manage a deployment later
- Bunny zone/CDN details: internal implementation details stored in local state

The important rule is simple:

- deploy starts from a local `path`
- management starts from a `project`

## Authentication

Auth precedence:

1. `BUNNY_API_KEY`
2. `~/.plint/config.json`

Store a key interactively:

```bash
plint login
```

## Estimate and dry-run

Estimate scans local files without Bunny auth:

```bash
plint estimate ./site
plint estimate ./site --json
```

Estimate reports deployable file count, total bytes, largest files, warnings, and a rough Bunny storage estimate. CDN bandwidth is not estimated because it depends on traffic.

Dry-run previews deploy changes without creating Bunny resources, uploading files, deleting files, purging CDN cache, or writing local history:

```bash
plint ./site -p docs --dry-run --json
plint ./site -p docs --create --dry-run --json
plint deploy ./site -p docs --dry-run --json
```

In non-interactive or JSON mode, dry-run requires `-p/--project`. Add `--create`
when previewing a new named project.

## Ignore rules

plint scans local files in this order:

1. Hard safety excludes (always applied, never re-includable):
   `.git/`, `node_modules/`, `.DS_Store`, `.env`, `.env.*`, `*.pem`, `*.key`
2. Current hidden-file skip (any path segment starting with `.`)
3. User ignore files (applied after safety excludes):
   - `.gitignore`
   - `.plintignore`

   These are read in the deployed folder and in every subfolder. A file in a subfolder
   applies to paths below it, like git. One difference from git: a `!pattern` in a
   subfolder cannot re-include something a parent folder's ignore file excluded.

Files and folders whose names contain `?`, `\`, `"`, `<` or `>` are skipped with a
`SKIPPED_UNSUPPORTED_NAME` warning, because Bunny Storage cannot store those names
(it truncates at `?`, turns `\` into a folder separator and drops the others).

`.plintignore` may exclude additional files or directories. It cannot re-include anything caught by the hard safety excludes. Files that match the secret-like patterns still show up in `estimate` and dry-run warnings so you can see why they were skipped.

## Deploy summary

Every real deploy prints:

- project name and creation status
- public URL
- local path
- upload, delete, and unchanged counts plus total deployable bytes
- CDN cache purge status
- any scan warnings (symlinks, secret-like files)

The same fields are available in the JSON `data` object.

## Deploy commands

Create a new project interactively:

```bash
plint ./site
```

Create or update a specific project:

```bash
plint ./site -p docs
```

Create a specific project non-interactively:

```bash
plint --json ./site -p docs --create
```

Deploy a single file:

```bash
plint ./report.pdf -p reports --create
```

Important deploy rules:

- `plint <path>` creates a new project interactively
- `plint <path> -p <project>` updates an existing project
- `plint --json <path>` fails with `PROJECT_REQUIRED`
- `plint --json <path> -p <project>` fails with `PROJECT_NOT_FOUND` if the project does not exist
- `--create` only matters when `-p/--project` is present
- destroyed project names are reserved and cannot be reused
- `deploy` takes exactly one path; to publish several separate files, deploy each one to the same project
- a directory deploy makes the project mirror that directory: remote files that are not in it are deleted, including files added earlier by single-file deploys
- a single-file deploy only adds or replaces that one file at the project root and never deletes anything; an unchanged file is not re-uploaded

## Management commands

All management commands require `-p/--project`.

List projects:

```bash
plint list
plint list --json
```

Inspect one project:

```bash
plint inspect -p docs
plint inspect -p docs --json
```

Read project history:

```bash
plint history -p docs
plint history -p docs --json
```

List current remote files:

```bash
plint files -p docs
plint files -p docs --json
```

Purge CDN cache:

```bash
plint purge -p docs
plint purge -p docs --json
```

Print or open the public URL:

```bash
plint url -p docs
plint url -p docs --json
plint open -p docs
```

Destroy a project:

```bash
plint destroy -p docs
plint destroy -p docs --json
```

## Diagnostics

Doctor checks auth, Bunny reachability, state readability, and stale project count:

```bash
plint doctor
plint doctor --json
```

Repair finds local projects whose Bunny zones are gone:

```bash
plint repair --prune-stale --dry-run
plint repair --prune-stale --json
```

## JSON output

When `--json` is used, output goes to stdout in a standard envelope.

Success:

```json
{
  "ok": true,
  "command": "deploy",
  "data": {}
}
```

Error:

```json
{
  "ok": false,
  "command": "deploy",
  "error": {
    "code": "PROJECT_NOT_FOUND",
    "message": "Project 'docs' does not exist."
  }
}
```

## Common error codes

- `AUTH_MISSING`: no Bunny API key available
- `PATH_NOT_FOUND`: local path does not exist
- `PROJECT_INVALID`: project name format is invalid
- `PROJECT_NOT_FOUND`: named project does not exist
- `PROJECT_EXISTS`: unnamed create flow picked an already existing project
- `PROJECT_NAME_RESERVED`: project name was used before and destroyed
- `DIRECTORY_EMPTY`: directory contains no deployable files
- `INVALID_USAGE`: required command usage was missing

## Project name rules

Project names must:

- use lowercase letters, numbers, and single hyphens only
- be 1 to 30 characters
- not start or end with `-`
- not contain `--`

Examples:

- valid: `docs`
- valid: `client-a`
- valid: `report-2026`
- invalid: `MyDocs`
- invalid: `docs--site`
- invalid: `-docs`
