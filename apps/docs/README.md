<p align="center">
  <a href="../../README.md"><img src="../../packages/vscode-dep-beacon/resources/icon.png" alt="Dep Beacon" width="72"></a>
</p>

<p align="center"><a href="../../README.md">Dep Beacon</a></p>

<h1 align="center">Documentation</h1>

<p align="center">
  <a href="../../README.md">Project overview</a> ·
  <a href="package.json">Package manifest</a> ·
  <a href="#resources">Resources</a>
</p>

**On this page:** [Purpose](#purpose) · [Source map](#source-map) · [Build verification](#build-verification) · [Workspace commands](#workspace-commands) · [Resources](#resources)

Dependency intelligence, editor setup, and configuration in one place.

## Purpose

The Astro documentation site covers Dep Beacon's shared analysis engine and editor integrations.
Keep examples aligned with the [VS Code](../../packages/vscode-dep-beacon/README.md) and
[Zed](../../extensions/dep-beacon-lsp/README.md) guides.

## Source map

| Area | Responsibility |
| --- | --- |
| [src](src) | Pages, shared layout, and documentation content. |
| [public](public) | Static identity and generated social assets. |
| [og.config.mjs](og.config.mjs) | Social image source. |
| [og.audit.config.mjs](og.audit.config.mjs) | Built-site metadata checks. |

## Build verification

The build generates social images, compiles Astro, and audits the output. Keep version and
security examples illustrative; package intelligence comes from the engine and its providers.

## Workspace commands

Run from the repository root after its documented setup. Use the Node.js and pnpm versions
declared in the root [package.json](../../package.json).

| Task | Command |
| --- | --- |
| Start local development | `pnpm --filter @santi020k/dep-beacon-docs run dev` |
| Build or compile this workspace | `pnpm --filter @santi020k/dep-beacon-docs run build` |
| Lint this workspace | `pnpm --filter @santi020k/dep-beacon-docs run lint` |
| Check types | `pnpm --filter @santi020k/dep-beacon-docs run typecheck` |
| Run workspace diagnostics | `pnpm --filter @santi020k/dep-beacon-docs run check` |

## Resources

[Project overview](../../README.md) · [License](../../LICENSE)
