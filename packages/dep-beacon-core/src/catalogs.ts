import type { CatalogSnapshot } from './types.js'

export const createEmptyCatalogSnapshot = (): CatalogSnapshot => ({
  default: new Map(),
  named: new Map(),
})

export const mergeCatalogSnapshots = (...snapshots: readonly CatalogSnapshot[]): CatalogSnapshot => {
  const merged = createEmptyCatalogSnapshot()

  for (const snapshot of snapshots) {
    for (const [packageName, spec] of snapshot.default) {
      merged.default.set(packageName, spec)
    }

    for (const [catalogName, entries] of snapshot.named) {
      const target = merged.named.get(catalogName) ?? new Map<string, string>()

      for (const [packageName, spec] of entries) {
        target.set(packageName, spec)
      }

      merged.named.set(catalogName, target)
    }
  }

  return merged
}

export const resolveCatalogSpec = (
  snapshot: CatalogSnapshot | undefined,
  packageName: string,
  spec: string,
): string | undefined => {
  if (!snapshot) return undefined

  if (spec === 'catalog:') {
    return snapshot.default.get(packageName)
  }

  const catalogMatch = /^catalog:(?<catalogName>[a-z0-9_-]+)$/iu.exec(spec)
  const catalogName = catalogMatch?.groups?.catalogName

  if (!catalogName) return undefined

  return snapshot.named.get(catalogName)?.get(packageName)
}
