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

To run the same local gate used before publishing:

```sh
pnpm run validate
```

## Local Extension Debugging

Open the repo in VS Code and use Run and Debug:

- `Dep Beacon: Extension (Build Once)` builds the core and extension, then opens `examples/sample-workspace`.
- `Dep Beacon: Extension (Watch)` is for active development after starting the `vscode-dep-beacon: dev` task.
- `Dep Beacon: Extension (Current Workspace)` opens the repo itself in the Extension Host.

Local launch configurations mirror Dep Beacon output to `.vscode/dep-beacon-extension-host.log`.
If the Extension Development Host reports `The window terminated unexpectedly (reason: 'killed', code: '15')`, that means it received `SIGTERM`; check this log file first, then VS Code's `Developer: Open Logs Folder` command for the Extension Host logs.

The sample workspace includes `package.json` and `pnpm-workspace.yaml` entries for regular dependencies, catalogs, overrides, and package extensions.

## Environment

Copy `.env.example` to `.env` for local release or deploy commands. GitHub Actions expects:

- `NPM_TOKEN`
- `VSCE_PAT`
- `OVSX_PAT`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- optional `CLOUDFLARE_PAGES_PROJECT_NAME`
- optional `TURBO_TOKEN` and `TURBO_TEAM`

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
