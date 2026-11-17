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
