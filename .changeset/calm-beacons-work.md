---
"@santi020k/dep-beacon-core": patch
"@santi020k/dep-beacon-lsp": patch
"vscode-dep-beacon": patch
---

Improve large-workspace dependency analysis by limiting concurrent npm registry requests, treating temporary registry failures as unavailable instead of invalid dependencies, and automatically retrying those failures in Zed. Also discover nested pnpm workspace manifests, correctly parse pnpm override selectors, and ensure Zed runs its managed server version instead of a stale global binary.
