# Dep Beacon

Dep Beacon is a VS Code extension and dependency intelligence engine for npm projects. It brings version status, safe update targets, pnpm workspace catalog awareness, and OSV vulnerability warnings directly into manifests.

## Packages

- `@santi020k/dep-beacon-core` analyzes package manifests, npm registry metadata, semver ranges, and OSV advisories.
- `vscode-dep-beacon` adds CodeLens, inline status decorations, diagnostics, update commands, sorting, cache control, and install-on-save workflows to VS Code.
- `@santi020k/dep-beacon-docs` is the Astro documentation site.

## Quick Start

```sh
pnpm install
pnpm run build
pnpm run typecheck
pnpm run test
pnpm run lint
```

To package the extension locally:

```sh
pnpm run package:extension
```

## What It Tracks

- `package.json` dependency sections, peer dependencies, optional dependencies, npm `overrides`, Yarn `resolutions`, and pnpm `pnpm.overrides`.
- `pnpm-workspace.yaml` `catalog`, named `catalogs`, `overrides`, and `packageExtensions`.
- npm registry latest, next minor, next major, and prerelease-aware updates.
- OSV.dev vulnerability results for npm packages.

## Status Colors

- Green: the declared range already accepts the latest stable version.
- Yellow: a newer version exists.
- Orange: low or moderate vulnerabilities are present.
- Red: the package/version is invalid, missing from npm, or has high or critical vulnerabilities.
