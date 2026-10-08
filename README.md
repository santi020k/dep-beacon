<p align="center">
  <img src="packages/vscode-dep-beacon/resources/icon.svg" alt="Dep Beacon" width="88">
</p>

<h1 align="center">Dep Beacon</h1>

<p align="center">Dependency intelligence where you edit your manifests.</p>

Dep Beacon is a dependency intelligence engine for npm projects with integrations for VS Code and Zed. It brings version status, safe update targets, pnpm workspace catalog awareness, and OSV vulnerability warnings directly into manifests.

[Documentation](https://beacon.santi020k.com) ·
[VS Code](https://marketplace.visualstudio.com/items?itemName=santi020k.vscode-dep-beacon) ·
[Open VSX](https://open-vsx.org/extension/santi020k/vscode-dep-beacon) ·
[npm packages](#packages) ·
[Releases](https://github.com/santi020k/dep-beacon/releases) ·
[Issues](https://github.com/santi020k/dep-beacon/issues)

<p align="center">
  <a href="https://github.com/santi020k/dep-beacon/actions/workflows/ci.yml"><img src="https://github.com/santi020k/dep-beacon/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/santi020k/dep-beacon/actions/workflows/codeql.yml"><img src="https://github.com/santi020k/dep-beacon/actions/workflows/codeql.yml/badge.svg" alt="CodeQL"></a>
  <a href="https://www.npmjs.com/package/@santi020k/dep-beacon-core"><img src="https://img.shields.io/npm/v/@santi020k/dep-beacon-core.svg?label=core" alt="npm core"></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=santi020k.vscode-dep-beacon"><img src="https://badgen.net/vs-marketplace/v/santi020k.vscode-dep-beacon?label=VS%20Marketplace" alt="VS Marketplace"></a>
  <a href="https://open-vsx.org/extension/santi020k/vscode-dep-beacon"><img src="https://img.shields.io/open-vsx/v/santi020k/vscode-dep-beacon" alt="Open VSX"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="license"></a>
</p>

**Explore:** [Packages](#packages) · [Quick Start](#quick-start) · [Use in Zed](#use-in-zed) · [Commits](#commits) · [Local Extension Debugging](#local-extension-debugging) · [Status Colors](#status-colors)

## Packages

| Package or surface | Purpose | Distribution |
| --- | --- | --- |
| [`@santi020k/dep-beacon-core`](packages/dep-beacon-core) | Manifest analysis, npm metadata, semver ranges, and OSV advisories | [npm](https://www.npmjs.com/package/@santi020k/dep-beacon-core) |
| [`vscode-dep-beacon`](packages/vscode-dep-beacon) | CodeLens, status decorations, diagnostics, update commands, sorting, caching, and install-on-save workflows | [VS Marketplace](https://marketplace.visualstudio.com/items?itemName=santi020k.vscode-dep-beacon) · [Open VSX](https://open-vsx.org/extension/santi020k/vscode-dep-beacon) |
| [`@santi020k/dep-beacon-lsp`](packages/dep-beacon-lsp) | Language server for dependency diagnostics, hovers, npm links, and update actions | [npm](https://www.npmjs.com/package/@santi020k/dep-beacon-lsp) |
| [`extensions/dep-beacon`](extensions/dep-beacon) | Thin Rust/WASM adapter for Zed | Zed registry source |
| [`apps/docs`](apps/docs) | Guides, configuration, and product documentation | [Documentation](https://beacon.santi020k.com) |

## Quick Start

For VS Code, install **Dep Beacon** from the linked Marketplace or Open VSX listing,
then open a project’s `package.json`. The extension adds dependency status and
update actions to the manifest. Use the Zed instructions below for its language-server integration.

To develop this repository locally:

```sh
pnpm install
pnpm run build
pnpm run typecheck
pnpm run test
pnpm run lint
```

## Use in Zed

The zero-configuration Zed workflow requires Dep Beacon `0.0.3` or newer. Install the extension, then open `package.json`, `pnpm-workspace.yaml`, or `pnpm-workspace.yml`.

- Outdated dependencies appear as warnings.
- Security findings appear as warnings or errors based on severity.
- Click Zed's error and warning indicator or run `diagnostics: deploy` to review actionable dependencies from open manifests.
- Place the cursor on an actionable dependency and use `cmd-.` on macOS or `ctrl-.` on Linux and Windows for patch, minor, major, latest, or bulk updates.
- Hover a dependency for its resolved range, npm `latest` tag, available targets, and vulnerability details.

No Zed settings are required. Optional inlay hints can add compact status beside every dependency. See the [Zed extension guide](https://beacon.santi020k.com/docs/zed-extension) for the complete workflow and pnpm catalog behavior.

To package the extension locally:

```sh
pnpm run package:extension
```

To run the same local gate used before publishing:

```sh
pnpm run validate
```

## Commits

Run `pnpm commit` after staging the intended changes. Commitprompt applies its
included Conventional Commit rules, collects the message interactively,
validates it, previews it, and asks before creating the commit.

Automation can discover the same rules with
`pnpm exec commitprompt types --json`,
`pnpm exec commitprompt scopes --json`, and
`pnpm exec commitprompt instructions --json`. It can then format structured
fields or validate an exact message without opening the questionnaire. The
`commit-msg` hook validates every Git commit through Commitprompt, including
messages generated by the included VS Code and Zed workspace instructions.

## Local Extension Debugging

Open the repo in VS Code and use Run and Debug:

- `Dep Beacon: Extension (Build Once)` builds the core and extension, then opens `examples/sample-workspace`.
- `Dep Beacon: Extension (Watch)` is for active development after starting the `vscode-dep-beacon: dev` task.
- `Dep Beacon: Extension (Current Workspace)` opens the repo itself in the Extension Host.

Local launch configurations mirror Dep Beacon output to `.vscode/dep-beacon-extension-host.log`.
If the Extension Development Host reports `The window terminated unexpectedly (reason: 'killed', code: '15')`, that means it received `SIGTERM`; check this log file first, then VS Code's `Developer: Open Logs Folder` command for the Extension Host logs.

The sample workspace includes `package.json` and `pnpm-workspace.yaml` entries for regular dependencies, catalogs, overrides, and package extensions.

## Environment

Copy `.env.example` to `.env` for local release or deploy commands. Use these names for local envs and GitHub secrets or variables:

- `GH_TOKEN` locally for GitHub API access. Do not create a custom `GITHUB_TOKEN` secret; GitHub Actions provides its runtime token automatically.
- `NPM_TOKEN`
- `VSCE_PAT`
- `OVSX_PAT`
- `ZED_EXTENSIONS_TOKEN` for pushing a Zed registry update branch
- `ZED_EXTENSIONS_FORK`, for example `santi020k/extensions`
- optional `ZED_EXTENSIONS_HEAD`; defaults to the repository owner
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

## Find your next step

| Resource | Use it for |
| --- | --- |
| [`@santi020k/dep-beacon-core`](packages/dep-beacon-core/README.md) | Focused installation and usage reference. |
| [`@santi020k/dep-beacon-lsp`](packages/dep-beacon-lsp/README.md) | Focused installation and usage reference. |

## License

MIT. See [LICENSE](LICENSE).
