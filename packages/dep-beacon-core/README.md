# @santi020k/dep-beacon-core

Core analysis engine for Dep Beacon.

```ts
import { analyzeDependency, parseManifest } from '@santi020k/dep-beacon-core'
```

The package parses npm ecosystem manifests, resolves pnpm workspace catalog entries, calculates next minor, next major, and latest update targets, and can enrich results with OSV.dev vulnerability data.

Shared `OsvClient` instances coalesce concurrent lookups and cache successful query results,
including empty results, for 15 minutes. Advisory details expire with the same cache so a
long-running editor session can discover new or revised advisories. Set `cacheTtlMs` when
constructing the client to use another interval; `0` disables reuse between calls. Failed
batch requests are retried on the next lookup. The optional `now` function supports
deterministic cache testing.
