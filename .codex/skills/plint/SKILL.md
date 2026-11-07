# plint

Use `plint` to manage Bunny-hosted static sites from any repo.

Start with:

```bash
command -v plint
plint --json doctor
```

Auth:

- `BUNNY_API_KEY`
- `~/.plint/config.json`

Common safe path:

```bash
plint --json list
plint --json resolve <name-or-url>
plint --json api get /storagezone/<id>
```

Write path:

```bash
plint .
plint --json .
plint purge
plint destroy
```

Rules:

- Prefer `--json` for machine-readable reads.
- Use `plint doctor` first when auth or project state is unclear.
- Use `plint resolve` before broad repeated searches.
- `plint api get` is read-only in this pass.
- Do not run `purge` or `destroy` without explicit user approval.

Examples:

```bash
plint --json doctor
plint --json resolve https://example.b-cdn.net
plint --json api get /storagezone
```
