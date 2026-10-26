# Zed registry publishing

The Zed workflow prepares a registry branch and a comparison link. It does not
publish npm packages or create upstream PRs or comments. The matching language
server must already exist on npm, and the released source must pass validation.

## Branch ancestry and token permissions

A registry fork can lag behind upstream while also containing owner changes.
Starting a new publishing branch directly from current upstream can inherit
changes to `.github/workflows`, which a classic token without `workflow` scope
cannot push. Increasing token scope is unnecessary for a registry-only update.

The workflow examines the fork's existing remote refs, finds their shared upstream
ancestors, and selects the closest ancestor whose workflow files match a fork ref.
The new branch starts from that upstream ancestor, excluding unrelated fork-owner
commits and newer upstream workflows. Only the extension registry entry, its
submodule pointer, and any required submodule registration change are staged.
The resulting PR diff against upstream contains the extension update; it does not
roll back newer upstream files. The upstream merge retains changes outside that diff.

Pushes are not forced. A retry reuses an existing branch only if its complete tree
matches the requested update. Any different existing branch or missing compatible
ancestor stops preparation for maintainer review, preserving existing work.
No token value is written into a remote URL or printed by the workflow.

## Human submission

Review the comparison link in the successful workflow summary. The registry's
[AI policy](https://github.com/zed-industries/extensions/blob/main/AI_POLICY.md)
requires a human in the loop and a PR description and maintainer replies written
in the contributor's own words. A human must open the upstream PR and complete
any required contributor agreement. Upstream checks and maintainer acceptance
remain necessary before the new version reaches the Zed registry.

## Recovering LSP 1.1.3

The October 26 failure occurred after validation, when GitHub rejected an inherited
workflow-file change. Core 1.4.0 and LSP 1.1.3 are already published; do not republish
them, move their tags, or resume the historical 1.1.2 release.

After this fix is reviewed and merged with release approval, run the Zed workflow
with `source_sha=3b91e2f968706bf9aff0bc046f6c93d6c7c42e29`. Review its prepared
branch and have the human submit the registry PR. This fix PR itself authorizes
neither merging nor dispatching publication.

`ZED_EXTENSIONS_TOKEN` is a write-only GitHub Actions secret. Its name and update
time do not prove which named account token it contains or that token's expiry.
An account token expiry notice alone must not be treated as this workflow's expiry.
Do not rotate, reveal, or expand credentials to diagnose that mapping. If the
configured token later fails authentication, its owner must explicitly approve
any replacement and enter the replacement through the existing secret settings.
