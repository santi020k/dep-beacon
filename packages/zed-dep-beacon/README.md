# Dep Beacon for Zed

Dep Beacon brings npm dependency intelligence to Zed through the Language Server Protocol. It reuses `@santi020k/dep-beacon-core` and supports:

- `package.json`, `pnpm-workspace.yaml`, and `pnpm-workspace.yml` manifests.
- Dependency status CodeLens.
- Diagnostics for outdated, invalid, missing, and vulnerable packages.
- Quick-fix code actions for patch, minor, major, and latest updates.
- Links from dependency names to npm.
- pnpm default and named catalog resolution.
- npm registry metadata and optional OSV.dev vulnerability checks.

Zed does not currently expose APIs equivalent to VS Code inline decorations or install-on-save, so those features remain specific to `vscode-dep-beacon`.

## Development

```sh
pnpm --filter @santi020k/dep-beacon-core build
pnpm --filter @santi020k/zed-dep-beacon build
pnpm --filter @santi020k/zed-dep-beacon typecheck
pnpm --filter @santi020k/zed-dep-beacon test
pnpm --filter @santi020k/zed-dep-beacon validate:extension
```

The Zed adapter is in `src/lib.rs`; the bundled Node language server is written to `dist/server.cjs`.

## Install as a development extension

1. Install Rust with `rustup` (Zed requires the rustup toolchain for dev extensions).
2. Build this package.
3. Make `dep-beacon-lsp` available in the environment used to launch Zed, or publish this package to npm so the adapter can install it automatically.
4. Run `zed: install dev extension` and select `packages/zed-dep-beacon`.

For local server debugging before the npm package is published, expose the built executable through a temporary bin directory and launch Zed from the same shell:

```sh
mkdir -p /tmp/dep-beacon-zed-bin
ln -sf "$PWD/packages/zed-dep-beacon/dist/server.cjs" /tmp/dep-beacon-zed-bin/dep-beacon-lsp
PATH="/tmp/dep-beacon-zed-bin:$PATH" zed examples/sample-workspace
```

The adapter checks `PATH` before attempting to download the published npm package.

## Settings

Configure the server under Zed's `lsp.dep-beacon.settings` key:

```json
{
  "lsp": {
    "dep-beacon": {
      "settings": {
        "checkVulnerabilities": true,
        "includePrerelease": false,
        "registryUrl": "https://registry.npmjs.org"
      }
    }
  }
}
```

`checkVulnerabilities` defaults to `true`, `includePrerelease` defaults to `false`, and `registryUrl` defaults to the public npm registry.

## Publishing

The package is published to npm for the Zed adapter to download. Publishing the editor adapter itself requires a PR to `zed-industries/extensions` with this repository as a submodule and `path = "packages/zed-dep-beacon"`.

The same Zed registry environment used by `santi020k-theme` can be reused:

- Secret `ZED_EXTENSIONS_TOKEN`
- Variable `ZED_EXTENSIONS_FORK`
- Optional variable `ZED_EXTENSIONS_HEAD`
