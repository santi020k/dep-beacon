# @santi020k/dep-beacon-core

Core analysis engine for Dep Beacon.

```ts
import { analyzeDependency, parseManifest } from '@santi020k/dep-beacon-core'
```

The package parses npm ecosystem manifests, resolves pnpm workspace catalog entries, calculates next minor, next major, and latest update targets, and can enrich results with OSV.dev vulnerability data.
