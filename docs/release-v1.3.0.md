# Dep Beacon 1.3 release preparation

The local integration target is `release/v1.3.0`, based on current `main`.
Core and VS Code move from 1.2.1 to 1.3.0; the language server and Zed adapter
move from 1.1.1 to 1.1.2. Changesets generates the package changelogs and versions.

## Design contract

Dep Beacon keeps its blue, teal, and four status colors, with darker light-theme
status tokens where accessibility checks found insufficient contrast. The website
and theme project's sculpted direction supplies the shared 72rem alignment, raised
identity tab, restrained surfaces, open numbered rows, and clear typography.
The existing system font stack and real VS Code sample-workspace screenshot remain.

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
- Open VSX's VSCE override uses version 4's existing `createVSIX` export, removing its
  older vulnerable packaging dependency tree. Local packaging verifies this boundary.
- Shared OSV query/detail caches expire after 15 minutes. Failed query batches retry
  on the next lookup. LSP analysis must match the captured document version before it
  can publish diagnostics or return edits, including changes during debounce.

The latest `eslint-plugin-jsx-a11y` package still declares ESLint 9 as its highest
peer while the owned config requires ESLint 10. Accessibility lint remains enabled;
this upstream metadata mismatch is reported rather than hidden by an override.
Lumen also emits a roughly 506 KiB optional phone-input chunk. No documentation page
uses phone input; the shared public runtime loads that controller only when needed.
The Vite chunk-size advisory remains visible; no limit is raised to hide it.

## Validation

Run `pnpm install --frozen-lockfile`, `pnpm run validate`, `pnpm run test:docs`,
`pnpm run check:release`, and `pnpm audit`. The browser suite covers every route in
both themes at 320, 375, 768, and 1440 pixels, plus keyboard navigation, focus return,
theme continuity after page swaps, and code-tab preferences in Chromium and WebKit.

Temporary before/after screenshots and the 28-case documentation accessibility sweep
live outside Git in `/tmp/dep-beacon-redesign`. All seven chapters passed the rendered
desktop/mobile, light/dark axe sweep without violations, page errors, or overflow.

## Publication and recovery

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
