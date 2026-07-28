# Dep Beacon Language Server

`@santi020k/dep-beacon-lsp` provides dependency intelligence over the Language Server Protocol. It powers the Dep Beacon extension for Zed and reuses `@santi020k/dep-beacon-core` for manifest analysis, npm metadata, pnpm workspace catalogs, and OSV vulnerability checks.

## Features

- `package.json`, `pnpm-workspace.yaml`, and `pnpm-workspace.yml` support.
- Compact dependency status inlay hints and CodeLens.
- Actionable project diagnostics for updates and security issues.
- Quick fixes for patch, minor, major, and latest updates.
- Bulk actions for compatible updates and latest versions.
- npm document links.
- Default and named pnpm catalog resolution.
- Optional OSV.dev vulnerability checks.

## Usage

The package exposes the `dep-beacon-lsp` executable. LSP clients should launch it over standard input and output:

```sh
dep-beacon-lsp --stdio
```

Zed users do not need to install this package manually. The Zed adapter installs it through Zed's managed npm APIs when no `dep-beacon-lsp` executable is available on `PATH`.

## Development

From the repository root:

```sh
pnpm --filter @santi020k/dep-beacon-core build
pnpm --filter @santi020k/dep-beacon-lsp build
pnpm --filter @santi020k/dep-beacon-lsp typecheck
pnpm --filter @santi020k/dep-beacon-lsp test
pnpm --filter @santi020k/dep-beacon-lsp validate:extension
```

The TypeScript server is implemented in `src/server.ts` and bundled to `dist/server.cjs` for publication.

## Related extension

The Rust/WASM Zed adapter is maintained separately in [`extensions/zed-dep-beacon`](../../extensions/zed-dep-beacon).

## License

MIT
