# MSAL authorization-code security backport

The live audit reports [GHSA-xcx6-jx8p-x3h5](https://github.com/advisories/GHSA-xcx6-jx8p-x3h5)
for `@azure/msal-node` 6.0.1, reached through Azure Identity in the documentation
and extension publishing toolchains. The patched upstream release is 7.1.0.
On 2026-10-25, the latest Azure Identity 4.14.0 still requires MSAL `^6.0.0`.
Forcing a new authentication-library major would bypass its compatibility range.

The pinned pnpm patch applies the security changes from Microsoft's commit
[`f550958586475dbfeb1cd44be14a2d653728850e`](https://github.com/AzureAD/microsoft-authentication-library-for-js/commit/f550958586475dbfeb1cd44be14a2d653728850e)
to 6.0.1. It rejects instance-aware confidential-client configuration and query
parameters, strips response-controlled routing metadata, and retains the request's
code/nonce and response state. Public-client behavior is unchanged.

The two upstream TypeScript source changes apply directly. Runtime additions in
both the ES module and CommonJS exports were generated from those source changes
with the repository's installed TypeScript transpiler. The package version remains
6.0.1; the patch is recorded in `pnpm-workspace.yaml` and the frozen lockfile.
No credentials, network providers, or application authentication policy changed.

## Verification and audit behavior

`pnpm run check:dependency-security` checks both module formats. It covers rejected
instance-aware input, removal of malicious routing metadata, trusted request code
and nonce, missing response payload, state mismatch, ordinary URL generation, and
a mocked token exchange that contacts only the configured endpoint. The ten-case
suite fails six cases on the original package and passes all ten on the backport;
the four compatibility cases pass in both versions.

`pnpm run check:audit` runs the backport regressions and verifies the patch's SHA-256
before evaluating the live audit. Only this advisory on exactly MSAL 6.0.1 is
reported as backported. Every other moderate-or-higher finding still fails;
malformed, incomplete, or inconsistent audit responses fail too. The original
`pnpm audit --audit-level moderate` still reports the version-based upstream
warning. The warning is printed by the guarded check rather than hidden in an
ignore list. CI and affected validation both exercise the security tests.

## Removal and recovery

Remove the patch, digest guard, and special advisory classification together once
Azure Identity supports a fixed MSAL release. Update the lockfile, retain the
behavior regressions, and require the raw audit plus complete release validation
to pass. Never accept a different vulnerable version through the existing guard.
If the patch causes a regression before release, keep the release unmerged while
correcting it. After publication, use the normal GitHub release workflow for a new
patch version; do not remove the fix or alter an existing version tag.
