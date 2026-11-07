# plint MCP Guide

`plint mcp` runs a local MCP server so an AI client can deploy and manage static sites for you.

This guide is written for real usage, not just schema reference.

## What MCP users actually do

Most people will not manually think in tool names like `plint_deploy` or hand-write JSON.

They will:

1. add `plint mcp` to an MCP-capable client
2. ask the agent for what they want in normal language
3. let the client call the tools behind the scenes

Typical requests look like:

- “Deploy `/Users/me/site/dist` to project `docs`.”
- “Create project `marketing-site` from `/tmp/build`.”
- “Show me the files in project `docs`.”
- “Purge the CDN for `docs`.”
- “Destroy project `docs`.”
- “What plint projects do I have?”

## Install the MCP server

Start it directly:

```bash
plint mcp
```

Example install:

```bash
npx add-mcp "plint mcp"
```

After your MCP client picks it up, it will discover these tools automatically:

- `plint_estimate`
- `plint_deploy`
- `plint_list`
- `plint_inspect`
- `plint_history`
- `plint_files`
- `plint_purge`
- `plint_destroy`
- `plint_doctor`
- `plint_repair`

## Core model

plint MCP uses the same model as the CLI:

- `path`: absolute local file or directory to deploy
- `project`: persistent project name used for later management

Important MCP rule:

- MCP deploy does not auto-generate a project name
- if the project does not exist, the client must send `create: true`

## What to ask the agent

Good natural-language examples:

- “Deploy `/Users/me/site/dist` to project `docs`, creating it if needed.”
- “Update project `docs` from `/Users/me/site/dist`.”
- “List my plint projects.”
- “Inspect project `docs`.”
- “Show deployment history for `docs`.”
- “List remote files in project `docs`.”
- “Purge project `docs`.”
- “Destroy project `docs`.”
- “Run plint doctor.”
- “Find stale plint projects and show me what would be pruned.”
- “Estimate the deploy size and rough storage cost for `/Users/me/site/dist`.”
- “Dry-run deploying `/Users/me/site/dist` to project `docs`.”

## Claude artifact example

If Claude produced an artifact that you exported as a local folder or file, you can deploy it the same way as any other static content.

Example prompts:

- “Deploy my Claude artifact export at `/Users/me/Downloads/claude-artifact-export` to project `artifact-demo`, creating it if needed.”
- “Deploy the HTML file `/Users/me/Downloads/claude-artifact.html` to project `artifact-demo`, creating it if needed.”

Practical note:

- if the artifact is a folder, point plint at the folder
- if the artifact is a single HTML file, point plint at that file
- MCP deploy paths should be absolute

## How the main tools behave

### `plint_deploy`

Use when you want to deploy a file or directory into a project.

Behavior:

- creates a project only when `create: true`
- updates an existing project when `create` is omitted or `false`
- returns `PROJECT_NOT_FOUND` if the project is missing and `create` is not set

### `plint_list`

Lists local plint projects only.

It does not surface unrelated remote Bunny zones.

### `plint_inspect`

Shows one project, including:

- current URL
- last deploy timestamp
- derived status
- Bunny binding details

### `plint_history`

Shows deployment and management history for one project.

### `plint_files`

Lists the current remote files stored for one project.

### `plint_purge`

Purges the project CDN cache.

### `plint_destroy`

Deletes the project and its Bunny resources.

Destroyed names are reserved and cannot be reused.

### `plint_doctor`

Returns diagnostic checks for:

- auth availability
- Bunny reachability
- state readability
- stale project count

### `plint_repair`

Finds stale local projects and optionally prunes them.

## Troubleshooting

Common MCP errors:

- `AUTH_MISSING`: no Bunny API key is available to the MCP server
- `PROJECT_INVALID`: bad project name format
- `PROJECT_NOT_FOUND`: target project does not exist
- `PROJECT_NAME_RESERVED`: project name was used before and then destroyed
- `PATH_NOT_FOUND`: local deploy path does not exist
- `DIRECTORY_EMPTY`: deploy directory had no deployable files
- `PROJECT_STALE`: local state points to missing or unusable Bunny resources

If MCP deploy fails unexpectedly:

1. run `plint_doctor`
2. confirm the deploy path is absolute
3. confirm the project exists or send `create: true`
4. check whether the project name is reserved

## Reference

This section is for integrators, debugging, and direct tool calls.

### `plint_estimate`

Input:

```json
{
  "path": "/absolute/path/to/site"
}
```

Success `structuredContent` includes deployable file count, bytes, largest files, warnings, and rough storage cost estimate.

### `plint_deploy`

Input:

```json
{
  "path": "/absolute/path/to/site",
  "project": "docs",
  "create": true,
  "dry_run": false
}
```

`dry_run: true` previews what would change without creating Bunny resources, uploading files, deleting files, purging the CDN cache, or writing local history. New-project dry-runs with `create: true` do not require Bunny auth. Existing-project dry-runs use the stored zone password to list remote files.

Success `structuredContent`:

```json
{
  "project": "docs",
  "url": "https://example.b-cdn.net/",
  "zone_id": "123",
  "cdn_id": "456",
  "file_count": 12,
  "bytes": 1048576,
  "uploaded": 3,
  "deleted": 0,
  "unchanged": 9,
  "created": true
}
```

### `plint_list`

Output:

```json
{
  "projects": [
    {
      "project": "docs",
      "zone_id": "123",
      "cdn_id": "456",
      "url": "https://example.b-cdn.net/",
      "last_deploy_at": "2026-04-18T08:00:00Z"
    }
  ]
}
```

### `plint_inspect`

Input:

```json
{
  "project": "docs"
}
```

### `plint_history`

Input:

```json
{
  "project": "docs",
  "limit": 20
}
```

### `plint_files`

Input:

```json
{
  "project": "docs"
}
```

### `plint_purge`

Input:

```json
{
  "project": "docs"
}
```

### `plint_destroy`

Input:

```json
{
  "project": "docs"
}
```

### `plint_doctor`

Input:

```json
{}
```

### `plint_repair`

Input:

```json
{
  "dry_run": true,
  "prune_stale": true
}
```
