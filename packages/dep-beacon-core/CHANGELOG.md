# @santi020k/dep-beacon-core

## 1.3.0

### Minor Changes

- Refresh the dependency toolchain and documentation for the 1.3 release. The documentation
  adopts Lumen 4, keeps Dep Beacon's blue and teal identity, and adds accessible navigation,
  code examples, and optional page motion. Remove unused build dependencies and generated
  preview assets while preserving the public dependency-analysis APIs.

### Patch Changes

- Declare public npm access and provenance for the core package.

- Keep Zed responsive in dependency-heavy workspaces by debouncing manifest edits, sharing in-flight analyses, and caching registry and vulnerability lookups across requests.

## 1.2.1

### Patch Changes

- [#15](https://github.com/santi020k/dep-beacon/pull/15) [`ab88a3b`](https://github.com/santi020k/dep-beacon/commit/ab88a3b9527602b40fcb456de18dd0e973ce1a4c) Thanks [@santi020k](https://github.com/santi020k)! - Normalize OSV base URLs in linear time to prevent pathological input from causing excessive regular-expression backtracking.

## 1.2.0

### Minor Changes

- [#9](https://github.com/santi020k/dep-beacon/pull/9) [`9403961`](https://github.com/santi020k/dep-beacon/commit/9403961a34eaeafa1027b0251f9b1697616748c3) Thanks [@santi020k](https://github.com/santi020k)! - Improve large-workspace dependency analysis by limiting concurrent npm registry requests, treating temporary registry failures as unavailable instead of invalid dependencies, and automatically retrying those failures in Zed. Also discover nested pnpm workspace manifests, correctly parse pnpm override selectors, and ensure Zed runs its managed server version instead of a stale global binary.

## 1.1.1

### Patch Changes

- [#9](https://github.com/santi020k/dep-beacon/pull/9) [`9403961`](https://github.com/santi020k/dep-beacon/commit/9403961a34eaeafa1027b0251f9b1697616748c3) Thanks [@santi020k](https://github.com/santi020k)! - Improve large-workspace dependency analysis by limiting concurrent npm registry requests, treating temporary registry failures as unavailable instead of invalid dependencies, and automatically retrying those failures in Zed. Also discover nested pnpm workspace manifests, correctly parse pnpm override selectors, and ensure Zed runs its managed server version instead of a stale global binary.

## 1.1.0

## 1.0.1

### Patch Changes

- [`971471c`](https://github.com/santi020k/dep-beacon/commit/971471ccfea10d9ab17b5ad1bcc8ee440ab0dac3) Thanks [@santi020k](https://github.com/santi020k)! - Release the dist-tag version handling and catalog loading race fixes.

## 1.0.0

### Major Changes

- [`3de4494`](https://github.com/santi020k/dep-beacon/commit/3de4494e78654920f0dfe7d95b4f25c0eb53821b) Thanks [@santi020k](https://github.com/santi020k)! - Initial Dep Beacon release with npm manifest CodeLens, pnpm workspace catalog support, OSV security checks, docs, and VS Code packaging.
