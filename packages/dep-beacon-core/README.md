<p align="center">
  <a href="../../README.md">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="../../docs/assets/readme/workspace-dark.svg">
      <img src="../../docs/assets/readme/workspace-light.svg" alt="Dep Beacon — Every dependency. A clearer signal." width="1200" height="220">
    </picture>
  </a>
</p>

<h1 align="center">Analysis engine</h1>

<p align="center">
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/license-MIT-13967e?style=flat-square" alt="License: MIT"></a>
  <a href="package.json"><img src="https://img.shields.io/badge/source-Package-276ccc?style=flat-square" alt="Source: Package"></a>
</p>

<p align="center">
  <a href="https://github.com/santi020k/dep-beacon/blob/main/README.md">Project overview</a> ·
  <a href="https://github.com/santi020k/dep-beacon/blob/main/packages/dep-beacon-core/package.json">Package manifest</a> ·
  <a href="https://github.com/santi020k/dep-beacon/blob/main/packages/dep-beacon-core/CHANGELOG.md">Changelog</a> ·
  <a href="#resources">Resources</a>
</p>

**On this page:** [Usage](#usage) · [Workspace commands](#workspace-commands) · [Resources](#resources)

Core analysis engine for Dep Beacon.

## Usage

```ts
import { analyzeDependency, parseManifest } from '@santi020k/dep-beacon-core'
```

The package parses npm ecosystem manifests, resolves pnpm workspace catalog entries, calculates next minor, next major, and latest update targets, and can enrich results with OSV.dev vulnerability data.

Shared `OsvClient` instances coalesce concurrent lookups and cache successful query results,
including empty results, for 15 minutes. Advisory details expire with the same cache so a
long-running editor session can discover new or revised advisories. Set `cacheTtlMs` when
constructing the client to use another interval; `0` disables reuse between calls. Failed
batch requests are retried on the next lookup. The optional `now` function supports
deterministic cache testing.

## Workspace commands

Run from the repository root after its documented setup. Use the Node.js and pnpm versions
declared in the root [package.json](https://github.com/santi020k/dep-beacon/blob/main/package.json).

| Task                            | Command                                                  |
| ------------------------------- | -------------------------------------------------------- |
| Start local development         | `pnpm --filter @santi020k/dep-beacon-core run dev`       |
| Build or compile this workspace | `pnpm --filter @santi020k/dep-beacon-core run build`     |
| Lint this workspace             | `pnpm --filter @santi020k/dep-beacon-core run lint`      |
| Check types                     | `pnpm --filter @santi020k/dep-beacon-core run typecheck` |
| Run workspace tests             | `pnpm --filter @santi020k/dep-beacon-core run test`      |

## Resources

[Project overview](https://github.com/santi020k/dep-beacon/blob/main/README.md) · [License](https://github.com/santi020k/dep-beacon/blob/main/LICENSE)
