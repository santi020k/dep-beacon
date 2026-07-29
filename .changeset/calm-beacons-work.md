---
"@santi020k/dep-beacon-core": patch
"@santi020k/dep-beacon-lsp": patch
"vscode-dep-beacon": patch
---

Improve large-workspace dependency analysis by limiting concurrent npm registry requests, treating temporary registry failures as unavailable instead of invalid dependencies, discovering nested pnpm workspace manifests in Zed, correctly parsing pnpm override selectors, and ensuring Zed runs its managed server version instead of a stale global binary.
