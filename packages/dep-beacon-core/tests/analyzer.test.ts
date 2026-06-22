import { describe, expect, test } from 'vitest'

import {
  analyzeDependencies,
  analyzeDependency,
  createEmptyCatalogSnapshot,
  NpmRegistryClient,
  OsvClient,
  parsePackageJsonManifest,
} from '../src/index.js'

const packument = (name: string, versions: readonly string[], latest: string): unknown => ({
  'dist-tags': {
    latest,
  },
  name,
  versions: Object.fromEntries(versions.map((version) => [version, {}])),
})

const fetchInputToUrl = (input: Parameters<typeof fetch>[0]): string => {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()

  return input.url
}

const registryFetch: typeof fetch = (input) => {
  const url = fetchInputToUrl(input)
  const packageName = decodeURIComponent(url.split('/').at(-1) ?? '')

  if (packageName === 'missing-package') {
    return Promise.resolve(new Response(JSON.stringify({ error: 'not found' }), { status: 404 }))
  }

  return Promise.resolve(new Response(JSON.stringify(packument(packageName, [
    '1.0.0',
    '1.0.1',
    '1.1.0',
    '2.0.0',
    '2.1.0',
  ], '2.1.0')), {
    headers: {
      'content-type': 'application/json',
    },
    status: 200,
  }))
}

const osvFetch: typeof fetch = (input) => {
  const url = fetchInputToUrl(input)

  if (url.endsWith('/v1/querybatch')) {
    return Promise.resolve(new Response(JSON.stringify({
      results: [{
        vulns: [{ id: 'OSV-2026-1' }],
      }],
    }), { status: 200 }))
  }

  return Promise.resolve(new Response(JSON.stringify({
    aliases: ['GHSA-demo'],
    'database_specific': {
      severity: 'HIGH',
    },
    id: 'OSV-2026-1',
  }), { status: 200 }))
}

const firstDependency = (text: string) => {
  const dependency = parsePackageJsonManifest(text).dependencies.at(0)

  if (!dependency) throw new Error('Expected test manifest to include a dependency.')

  return dependency
}

describe('dependency analysis', () => {
  test('calculates next minor, next major, latest, and outdated status', async () => {
    const dependency = firstDependency(`{
  "dependencies": {
    "demo": "^1.0.0"
  }
}`)
    const registryClient = new NpmRegistryClient({ fetch: registryFetch })
    const analysis = await analyzeDependency(dependency, { registryClient })

    expect(analysis.status).toBe('outdated')
    expect(analysis.targets).toMatchObject({
      current: '1.1.0',
      latest: '2.1.0',
      nextMajor: '2.1.0',
    })
  })

  test('marks package versions that do not exist as missing', async () => {
    const dependency = firstDependency(`{
  "dependencies": {
    "demo": "^9.0.0"
  }
}`)
    const registryClient = new NpmRegistryClient({ fetch: registryFetch })
    const analysis = await analyzeDependency(dependency, { registryClient })

    expect(analysis.status).toBe('missing')
    expect(analysis.exists).toBe(false)
  })

  test('resolves pnpm catalog references before analyzing', async () => {
    const dependency = firstDependency(`{
  "dependencies": {
    "demo": "catalog:"
  }
}`)
    const catalogs = createEmptyCatalogSnapshot()

    catalogs.default.set('demo', '^1.0.0')

    const registryClient = new NpmRegistryClient({ fetch: registryFetch })
    const analysis = await analyzeDependency(dependency, {
      catalogSnapshot: catalogs,
      registryClient,
    })

    expect(analysis.displaySpec).toBe('catalog: (^1.0.0)')
    expect(analysis.targets.current).toBe('1.1.0')
  })

  test('uses OSV severity to upgrade status to vulnerable', async () => {
    const dependency = firstDependency(`{
  "dependencies": {
    "demo": "^1.0.0"
  }
}`)
    const registryClient = new NpmRegistryClient({ fetch: registryFetch })
    const [analysis] = await analyzeDependencies([dependency], {
      osvClient: new OsvClient({ fetch: osvFetch }),
      registryClient,
      vulnerabilities: true,
    })

    expect(analysis?.status).toBe('vulnerable')
    expect(analysis?.vulnerability?.severity).toBe('high')
  })
})
