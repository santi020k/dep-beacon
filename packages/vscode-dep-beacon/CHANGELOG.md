# Dep Beacon

## 1.1.1

### Patch Changes

- [#9](https://github.com/santi020k/dep-beacon/pull/9) [`9403961`](https://github.com/santi020k/dep-beacon/commit/9403961a34eaeafa1027b0251f9b1697616748c3) Thanks [@santi020k](https://github.com/santi020k)! - Improve large-workspace dependency analysis by limiting concurrent npm registry requests, treating temporary registry failures as unavailable instead of invalid dependencies, and automatically retrying those failures in Zed. Also discover nested pnpm workspace manifests, correctly parse pnpm override selectors, and ensure Zed runs its managed server version instead of a stale global binary.

- Updated dependencies [[`9403961`](https://github.com/santi020k/dep-beacon/commit/9403961a34eaeafa1027b0251f9b1697616748c3)]:
  - @santi020k/dep-beacon-core@1.1.1

## 1.1.0

### Minor Changes

- [`8d80d3f`](https://github.com/santi020k/dep-beacon/commit/8d80d3f6a1563e3f5b532a2428fdd6c936dfecf2) Thanks [@santi020k](https://github.com/santi020k)! - Launch Dep Beacon for Zed 1.0.0 with dependency hover details and catalog-aware quick fixes for individual, compatible, and latest dependency updates. Preserve valid JSON when applying Zed updates, refresh catalog-backed analysis after workspace changes, scope catalog edits to the owning workspace, and allow Zed users to hide update warnings without disabling hover details or update actions.

### Patch Changes

- Updated dependencies []:
  - @santi020k/dep-beacon-core@1.1.0

## 1.0.1

### Patch Changes

- [`971471c`](https://github.com/santi020k/dep-beacon/commit/971471ccfea10d9ab17b5ad1bcc8ee440ab0dac3) Thanks [@santi020k](https://github.com/santi020k)! - Release the dist-tag version handling and catalog loading race fixes.

- Updated dependencies [[`971471c`](https://github.com/santi020k/dep-beacon/commit/971471ccfea10d9ab17b5ad1bcc8ee440ab0dac3)]:
  - @santi020k/dep-beacon-core@1.0.1

## 1.0.0

### Major Changes

- [`3de4494`](https://github.com/santi020k/dep-beacon/commit/3de4494e78654920f0dfe7d95b4f25c0eb53821b) Thanks [@santi020k](https://github.com/santi020k)! - Initial Dep Beacon release with npm manifest CodeLens, pnpm workspace catalog support, OSV security checks, docs, and VS Code packaging.

### Patch Changes

- Updated dependencies [[`3de4494`](https://github.com/santi020k/dep-beacon/commit/3de4494e78654920f0dfe7d95b4f25c0eb53821b)]:
  - @santi020k/dep-beacon-core@1.0.0
