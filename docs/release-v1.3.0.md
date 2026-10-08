# Dep Beacon 1.3 release preparation

The local integration target is `release/v1.3.0`, based on current `main`.
Core and VS Code move from 1.2.1 to 1.3.0; the language server and Zed adapter
move from 1.1.1 to 1.1.2. Changesets generates the package changelogs and versions.

The release integrates the existing Lumen feature work, uncommitted social previews,
ESLint refresh, Zed registry identifier fix, manual Infisical connection workflow,
and dependency/action maintenance branches. The dependency merge retains the newer
validated catalog instead of restoring removed packages or older versions. The pending
release-workflow setup change is included while its source worktree remains untouched.

## Design contract

Dep Beacon keeps its blue, teal, and four status colors, with darker light-theme
status tokens where accessibility checks found insufficient contrast. The website
and theme project's sculpted direction supplies the shared 72rem alignment, raised
identity tab, restrained surfaces, open numbered rows, and clear typography.
The system font stack remains. The refined connected-node beacon retains its four signal colors and is shared by the
favicon, brand lettering, package icon, and editor toolbar. The navbar separates primary
navigation from source/theme controls and routes installation to both editor guides.
A Lumen tabbed showcase presents authentic VS Code and Zed sample-workspace captures
over a decorative AI-generated backdrop. The editor UI is not AI-generated; asset
provenance and the generation prompt live in `assets/brand/README.md`.

Lumen 4 owns buttons, breadcrumbs, the mobile Sheet, theme controls, code tabs,
and one-time reveals. Astro owns route transitions. Reduced motion disables decorative
movement; native navigation, semantic content, and visible keyboard focus remain usable.
The seven documentation chapters retain their product workflows and correct invalid
catalog YAML, setting defaults, inline code, and OSV privacy explanations.

## Dependency and security decisions

- The complete dependency audit was reduced from 63 advisories to zero, without GHSA ignores.
- Lumen 4, Astro 7.3.7, the current owned ESLint packages, Vitest 5, VSCE 4, and
  Playwright 1.64 are installed through the pnpm 11 catalog and lockfile.
- Unused MDX integration, Husky configuration, generated hero previews, and obsolete
  dependency exceptions were removed. Quality now owns hooks; README documents setup.
- TypeScript 6 supplies the API consumed by Astro and ESLint. The separately named
  TypeScript 7 alias supplies the `tsc` executable; these are different required roles.
- lint-staged 16.4 preserves the repository's Node 22.19 development floor. Its 17.x
  line requires Node 22.22.1 and would violate that declared compatibility.
- VS Code types stay on the latest compatible 1.85 patch line, matching the declared
  editor minimum. Newer API types fail VSCE's packaging check against that minimum;
  the supported editor range remains unchanged. See the
  [VS Code compatibility contract](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#visual-studio-code-compatibility).
- Open VSX's VSCE override uses version 4's existing `createVSIX` export, removing its
  older vulnerable packaging dependency tree. Local packaging verifies this boundary.
- Shared OSV query/detail caches expire after 15 minutes. Failed query batches retry
  on the next lookup. LSP analysis must match the captured document version before it
  can publish diagnostics or return edits, including changes during debounce.
- Workspace catalog edits immediately invalidate dependent package analyses. Queued
  editor requests await the current analysis, including YAML workspace refreshes, and
  catalog update actions use the current workspace ranges.
- Zed's direct Rust API remains at the latest stable 0.7.0. An OSV query of all 86
  registry packages in its lockfile returned no known advisories.

The latest `eslint-plugin-jsx-a11y` package still declares ESLint 9 as its highest
peer while the owned config requires ESLint 10. Accessibility lint remains enabled;
this upstream metadata mismatch is reported rather than hidden by an override.
The same tooling stack pulls deprecated `glob` 11.1.0 through its NestJS lint plugin;
the audited lockfile has no known advisory for that package. Its deprecation notice
remains visible, with no new exception suppressing it.
Lumen also emits a roughly 506 KiB optional phone-input chunk. No documentation page
uses phone input; the shared public runtime loads that controller only when needed.
The Vite chunk-size advisory remains visible; no limit is raised to hide it.

## Validation

Run `pnpm install --frozen-lockfile`, `pnpm run validate`, `pnpm run test:docs`,
`pnpm run check:release`, and `pnpm audit`. The browser suite covers every route in
both themes at 320, 375, 768, and 1440 pixels, plus keyboard navigation, focus return,
theme continuity after page swaps, and code-tab preferences in Chromium and WebKit.
The test preview stays in the foreground so Playwright owns its startup and shutdown,
including when Astro detects an agent environment. Set `DEP_BEACON_DOCS_TEST_PORT`
to an available port when another local task already owns the default 4398.

Independent review corrections include stale editor ranges, queued requests during
debounce, immediate catalog invalidation, release-check ordering after the build,
and reproducible Quality hook setup. Protocol regressions cover package manifests
and both supported workspace YAML extensions.

Temporary before/after screenshots and the 28-case documentation accessibility sweep
live outside Git in `/tmp/dep-beacon-redesign`. All seven chapters passed the rendered
desktop/mobile, light/dark axe sweep without violations, page errors, or overflow.

## Publication and recovery

The integrated Zed registry fix changes the adapter ID and source directory to
`dep-beacon-lsp`. For a local development installation, reinstall the extension from
`extensions/dep-beacon-lsp` and remove the old development entry. The display name
remains Dep Beacon; the npm package and `lsp.dep-beacon` settings key are unchanged.

This task prepares local integration. Publishing packages, updating editor registries,
deploying documentation, pushing branches, and opening or merging the release PR are
separate external actions. After authorization, open `release/v1.3.0` into `main`.
CI validates the versioned release, package artifacts, and documentation interactions
before the existing GitHub workflows orchestrate publication from the merged commit.

No database or production-data migration is involved. Before publication, revert the
relevant focused commits if needed. After publication, preserve the published tags
and issue a new patch version through the same workflow; do not overwrite artifacts.
For a documentation-only regression, revert the affected source and let the normal
validated deployment workflow rebuild it.
