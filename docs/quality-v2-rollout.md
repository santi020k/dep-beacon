# Quality v2 rollout

Target: `release/v1.5.0`, following published 1.4.0. Changesets produces the
version and changelog through the existing reviewed release workflow.

Quality 2.0.0 is pinned to the published immutable installer and shared actions.
The parallel impact job records a committed-source shadow plan and exercises
real CLI fixtures. Core changes select the LSP, VS Code, Zed and documentation
consumers. Shared inputs, unknown files and missing history broaden selection.
Release and manual runs retain full validation; plans do not execute jobs.

CI persists Turbo task caches through the shared setup action, keyed by its
runtime, platform, lockfile and task identity. Documentation builds remain
uncached because generated presentation content may depend on external data.
Browser checks consume the preceding successful documentation build instead of
building it twice. Standalone `test:docs` still builds before testing.
Fresh dependency audit and OSV/security qualification remain outside cached
results. CI and the aggregate reject failed, cancelled or skipped selected jobs.
No credentials, release review, marketplace publishing or Zed delivery gates
are removed. Deployment remains separately built and verified; artifact
promotion can follow after hosted measurements qualify its trust boundary.

Before publication, run the full canonical validation and observe hosted
full/affected runs. Local checks do not prove provider delivery. Roll back this
pipeline revision through a reviewed commit while retaining full validation;
never move published package tags. Do not activate broader selective release
execution solely because a shadow plan succeeded.

Persisted Turbo task hashes include `QUALITY_TASK_RUNTIME`, captured after setup
from the actual Node and pnpm versions, platform, and architecture. This prevents
a broad cache restore from reusing outputs after a runtime patch changes, even
when the declared Node selector remains unchanged. Local runs without that
variable use a separate task identity.

## Release security qualification

The release refreshes Astro to 7.4.12 and limits vulnerable glob 9–14,
minimatch 7–11, and qs consumers to 14.0.6, 11.0.9 and 6.17.1. Import-x 4
consumers use 4.18.1, which supports the new matcher APIs. The original reviewed
MSAL backport and its audit digest guard remain unchanged. No new audit
exception is introduced. Root/docs development requires Node 22.23.4; published
library, LSP and extension engine floors remain unchanged.

[Glob migration notes](https://github.com/isaacs/node-glob/blob/main/changelog.md),
[minimatch migration notes](https://github.com/isaacs/minimatch/blob/main/changelog.md),
[import-x release notes](https://github.com/un-ts/eslint-plugin-import-x/blob/master/CHANGELOG.md)
and [qs changes](https://github.com/ljharb/qs/blob/main/CHANGELOG.md) describe the
matching and query changes. Actual Markdown-toolchain glob, shared ESLint import
rules and extension-publisher query dependencies have behavioral regressions in
`check:dependency-security`. Remove the scoped overrides when upstream versions
accept the fixed ranges; retain these consumer checks.

The scoped `@astrojs/astro2tsx` 0.1.1 package extension supplies its missing
`@emnapi/runtime` 1.11.3 dependency, matching its core dependency. This prevents
an incompatible runtime 2 beta from the bundler satisfying a transitive peer and
crashing Astro Check. Remove the extension when upstream declares the matching
runtime. Other runtime consumers keep their own dependency versions.

Shared root TypeScript configurations, ESLint configuration and spelling
dictionary are explicit Turbo global inputs. Changing them invalidates affected
workspace task hashes even when package source files are untouched.
`test:ci` verifies this with the installed Turbo binary in an isolated copy and
confirms unrelated root README edits leave task hashes unchanged.
