# Affected CI validation

Ordinary pull requests use the installed Turbo dependency graph to check changed
workspaces and their dependents. Inspect `pnpm run ci:plan --base <commit>` before
running `pnpm run ci:check --base <commit>`. Git comparison includes committed,
staged, unstaged, untracked, deleted, and both sides of renamed paths.

Release branches, pushes, manual runs, missing or invalid history, manifests,
shared configuration, unknown paths, and invalid dependency graphs retain the
complete `pnpm run validate` gate. Shared extension resources and the documentation
preview image copied into the extension also force full validation. Use
`pnpm run ci:check --full` to explicitly select the complete gate.

Affected runs preserve repository lint, root TypeScript checks, spelling, Knip,
asset generation, core prerequisite builds, selector tests, and security-backport
regressions. Selected packages run build, types, lint, and coverage through Turbo;
the extension is packaged when selected. Documentation browser tests run when docs
are selected. The live audit and Rust adapter check remain mandatory in CI.
Pre-push, compatibility, and release validation retain their existing full gates.

## Benchmark

Measured on 2026-10-25 on macOS ARM64 with pnpm 11.1.2. The source base was
`883f17dfd0ec697ba16aeae6eb11e2eae2d93c47`, with the rollout copied into temporary
Git snapshot `e4d8a88ef780e9b6156d0010524cee50be3cbc59`.

| Scenario | Cache | Full checks | Affected checks | Reduction |
| --- | --- | --- | --- | --- |
| Documentation page | Cold Turbo | 18.46 s | 11.80 s | 36.1% |
| Documentation page | Warm Turbo | 7.03 s | 5.55 s | 21.0% |
| Core source and its consumers | Cold Turbo | 19.10 s | 10.66 s | 44.2% |
| Core source and its consumers | Warm Turbo | 7.35 s | 6.92 s | 5.9% |
| Shared Turbo configuration | Cold Turbo | 19.38 s | 19.06 s | Full fallback |
| Shared Turbo configuration | Warm Turbo | 7.04 s | 7.24 s | Full fallback |

Timings include plan creation and code checks. Dependency installation is excluded;
the guarded live audit (0.86 s) and browser suite (11.71 s) were measured separately.
Each mode and scenario used an independent local Turbo cache with remote caching
disabled. Compiler and lint caches were prewarmed equally; cold means an empty
Turbo cache. Execution order alternated, with one cold run and the median of two
warm runs. Small warm differences are sensitive to local timing noise. These are
local measurements, not promises about hosted runner or network performance.

To reproduce, copy tracked source into a temporary checkout, install the frozen
lockfile, run the full gate once, and commit generated metadata in that fixture.
The existing OG generator includes checkout-dependent metadata, so normalization
is needed before comparison. Separately append a comment to
`apps/docs/src/pages/index.astro` and `packages/dep-beacon-core/src/index.ts`, or
whitespace to `turbo.json`. Assert docs selects only docs, core selects core plus
LSP and VS Code, and shared configuration selects full validation. Alternate
`ci:check --full` and `ci:check --base <baseline>` using `TURBO_CACHE=local:rw`
and separate `TURBO_CACHE_DIR` directories. Check the executed plan each time and
restore a clean fixture between scenarios. A separate affected preflight also
passed without build products.

## Release and recovery

The rollout targets core and VS Code v1.4.0; Changesets also updates the LSP's
internal dependency and synchronizes the Zed adapter version. No public API
migration is required. Compatible transitive security updates and the tested
[MSAL security backport](security-msal-backport.md) accompany the rollout.

To revert selection, run `ci:check --full` unconditionally and enable documentation
browser tests. Keep the dependency fixes and guarded audit. Use a new patch release
through the existing GitHub workflow for any published correction; never replace
an existing release tag.
