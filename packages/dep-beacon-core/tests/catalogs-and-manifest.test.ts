import { describe, expect, test } from 'vitest'

import {
  collectCatalogSnapshot,
  createEmptyCatalogSnapshot,
  isSupportedManifestPath,
  mergeCatalogSnapshots,
  parseManifest,
  resolveCatalogSpec,
} from '../src/index.js'

describe('catalog snapshots and manifest routing', () => {
  test('merges default and named catalog entries with later snapshots winning', () => {
    const first = createEmptyCatalogSnapshot()
    const second = createEmptyCatalogSnapshot()

    first.default.set('react', '^18.0.0')
    first.named.set('ui', new Map([
      ['@scope/button', '^1.0.0'],
      ['@scope/card', '^1.0.0'],
    ]))

    second.default.set('react', '^19.0.0')
    second.named.set('ui', new Map([['@scope/button', '^2.0.0']]))
    second.named.set('tools', new Map([['typescript', '^6.0.0']]))

    const merged = mergeCatalogSnapshots(first, second)

    expect(merged.default.get('react')).toBe('^19.0.0')
    expect(merged.named.get('ui')?.get('@scope/button')).toBe('^2.0.0')
    expect(merged.named.get('ui')?.get('@scope/card')).toBe('^1.0.0')
    expect(merged.named.get('tools')?.get('typescript')).toBe('^6.0.0')
  })

  test('resolves default and named catalog references', () => {
    const snapshot = createEmptyCatalogSnapshot()

    snapshot.default.set('astro', '^7.0.0')
    snapshot.named.set('react19', new Map([['react', '^19.0.0']]))

    expect(resolveCatalogSpec(snapshot, 'astro', 'catalog:')).toBe('^7.0.0')
    expect(resolveCatalogSpec(snapshot, 'react', 'catalog:react19')).toBe('^19.0.0')
    expect(resolveCatalogSpec(snapshot, 'react', 'catalog:missing')).toBeUndefined()
    expect(resolveCatalogSpec(snapshot, 'react', 'catalog:@bad')).toBeUndefined()
    expect(resolveCatalogSpec(undefined, 'react', 'catalog:')).toBeUndefined()
  })

  test('recognizes and routes supported manifest file names', () => {
    expect(isSupportedManifestPath('/repo/package.json')).toBe(true)
    expect(isSupportedManifestPath('/repo/pnpm-workspace.yaml')).toBe(true)
    expect(isSupportedManifestPath('/repo/pnpm-workspace.yml')).toBe(true)
    expect(isSupportedManifestPath('/repo/packages/demo.json')).toBe(false)

    expect(parseManifest('/repo/package.json', '{"dependencies":{"demo":"^1.0.0"}}').source).toBe('package-json')
    expect(parseManifest('/repo/pnpm-workspace.yml', 'catalog:\n  demo: ^1.0.0\n').source).toBe('pnpm-workspace')

    const unsupported = parseManifest('/repo/README.md', '')

    expect(unsupported.dependencies).toEqual([])
    expect(unsupported.errors[0]?.message).toBe('README.md is not a supported Dep Beacon manifest.')
  })

  test('collects catalog snapshots from multiple parsed manifests', () => {
    const workspace = parseManifest('/repo/pnpm-workspace.yaml', `
catalog:
  astro: ^7.0.0
catalogs:
  react19:
    react: ^19.0.0
`)
    const workspaceOverride = parseManifest('/repo/other/pnpm-workspace.yaml', `
catalog:
  astro: ^8.0.0
`)

    const snapshot = collectCatalogSnapshot([workspace, workspaceOverride])

    expect(snapshot.default.get('astro')).toBe('^8.0.0')
    expect(snapshot.named.get('react19')?.get('react')).toBe('^19.0.0')
  })
})
