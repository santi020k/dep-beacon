# Dep Beacon for Zed

This directory contains the thin Rust/WASM adapter that connects Zed to `@santi020k/dep-beacon-lsp`. The language server provides dependency status CodeLens, diagnostics, npm links, update quick fixes, pnpm catalog awareness, and OSV vulnerability signals.

The Node language-server source and npm package are maintained separately in [`packages/dep-beacon-lsp`](../../packages/dep-beacon-lsp).

## Development

From the repository root, build and validate the language server:

```sh
pnpm --filter @santi020k/dep-beacon-core build
pnpm --filter @santi020k/dep-beacon-lsp build
pnpm --filter @santi020k/dep-beacon-lsp typecheck
pnpm --filter @santi020k/dep-beacon-lsp test
pnpm --filter @santi020k/dep-beacon-lsp validate:extension
```

Compile the adapter directly with:

```sh
cargo check \
  --manifest-path extensions/zed-dep-beacon/Cargo.toml \
  --target wasm32-wasip1
```

## Install as a development extension

1. Install Rust with `rustup` and add the `wasm32-wasip1` target.
2. Build `@santi020k/dep-beacon-lsp`.
3. Make `dep-beacon-lsp` available in the environment used to launch Zed.
4. Run `zed: install dev extension` and select `extensions/zed-dep-beacon`.

Before the npm package is published, expose the local build on `PATH`:

```sh
mkdir -p /tmp/dep-beacon-zed-bin
ln -sf "$PWD/packages/dep-beacon-lsp/dist/server.cjs" /tmp/dep-beacon-zed-bin/dep-beacon-lsp
PATH="/tmp/dep-beacon-zed-bin:$PATH" zed examples/sample-workspace
```

The adapter checks `PATH` before attempting to download `@santi020k/dep-beacon-lsp`.

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

The npm language server is published as `@santi020k/dep-beacon-lsp`. The Zed registry points its Dep Beacon entry at `extensions/zed-dep-beacon` in this repository.

The same registry environment used by `santi020k-theme` can be reused:

- Secret `ZED_EXTENSIONS_TOKEN`
- Variable `ZED_EXTENSIONS_FORK`
- Optional variable `ZED_EXTENSIONS_HEAD`

## License

MIT
